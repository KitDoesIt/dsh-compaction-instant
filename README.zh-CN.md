# dsh-compaction-instant

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 打造的**即时、近无损上下文压缩**引擎——是 `@deepseek-ai/dsh-compaction-basic` 的**直接替换品（drop-in replacement）**，用 [lllyasviel/VCC](https://github.com/lllyasviel/VCC) 的确定性对话编译思路取代 LLM 摘要。

压缩在**毫秒级内**把较旧的历史内容处理完毕，**零模型调用**，只保留**原始 token**——没有改写、没有幻觉、没有摘要成本。所有被裁掉的内容仍可通过指向持久会话日志的 `(seq N)` 指针完整取回。

## 示例

一个包含用户请求、助手文本 + 工具调用及其结果（region）编译后变成：

```
[user]
please fix the bug
[assistant]
on it
* read "a.js" (seq 2 -> result 3)
[user]
next question
```

每个工具调用只占**一行**：白名单工具（`toolArgTools`）渲染关键参数，其余只渲染名称（`* job_kill (seq 9 -> result 10)`），`hideTools` 里的行完全不出现。工具结果从不占据条目——`-> result N` 指针让它们只需一次 `recall(type:"result")` 即可取回。较长的用户/助手文本按预算截断并标注 `...(truncated from seq N)`；每一处省略都指明仍然保存完整内容的持久事件。

## Recall：无损回读层

本包还附带闭环近无损的另一半——**同会话回读**（供模型与人类使用）。由于会话日志只追加（append-only），编译器省略过的每一个 token 都仍可取回：

| 入口 | 模块 | 作用 |
|---|---|---|
| `recall` **工具**（模型侧） | `dsh-compaction-instant/tool` | 类型化恢复：`type:"seq"` 配合 `(seq N)`/`(seqs A-B)` 标记，`type:"result"` 配合 `result N` 指针，`type:"checkpoint"` 配合 `[checkpoint N]` 序号——把原始内容逐字恢复到当前工具结果中 |
| `search` **工具**（模型侧，grep） | `dsh-compaction-instant/tool` | 对整个持久日志做关键词/正则搜索——包括被压缩省略的内容——返回带 `(seq N)` 指针的匹配事件，可直接交给 `recall` |
| `/recall` **命令**（人类侧，grep） | `dsh-compaction-instant/command` | `/recall <关键词|正则>` 追加一条持久的 `form: "recall"` 用户消息，内含匹配事件及 seq 指针，让下一轮模型可见 |
| 共享核心 | `dsh-compaction-instant/recall` + `dsh-compaction-instant/search` | seq 解析（`12`、`3-7`、`seq 12` / `seqs 3-7`）、日志展开、预算、投影；正则编译与命中渲染 |

Recall 保留**一切**：文本、推理、原始工具调用参数、嵌套工具结果内容；纯日志事件渲染为带标签的数据转储；缺失的 seq 会明确报告；`maxRecallTokens` 预算（默认 **16000**）超限时以来源标记截断并统计跳过数量；搜索限制展示命中数（`maxSearchHits`，默认 **50**）。两个插件是独立行，可挂载在**任意**压缩后端旁边——它们只读取持久日志。

每个检查点还在开头嵌入一段简短的 **RECALL 指南**，告诉模型如何用 `recall` / `search` 恢复被省略的内容。当更早的检查点在容量压力下被省略时，绝不会无声消失：它会留下一行 `[checkpoint N]`（N 为压缩序号，1 = 最旧），可用 `recall(type:"checkpoint", id:"N")` 完整恢复。

## 配置

所有字段均可选；默认值如下。

| 键 | 默认 | 含义 |
|---|---|---|
| `thresholdRatio` | `0.5` | 触发自动压缩的上下文窗口占用比例 |
| `retainRatio` | `0.05` | 表面尾部逐字保留的窗口比例 |
| `retainTokens` | — | 精确尾部预算；与 `retainRatio` 互斥 |
| `manualRetainRatio` | `0.05` | 手动 `/compact` 逐字保留的已测表面比例（保证最近的对话不会被编译掉） |
| `manualRetainTokens` | — | 精确手动尾部预算；与 `manualRetainRatio` 互斥 |
| `auto` | `true` | 注册 `agent/pre-step` 压力与 `agent/request-error` 溢出恢复 |
| `maxTokens` | `8192` | 单个编译检查点总预算下限（密度感知 token） |
| `checkpointScale` | `0.1` | 有效预算为 `max(maxTokens, 被压缩掉的 token 数 × checkpointScale)`，封顶于 `checkpointCap`——大片段不会把每条条目压成碎片 |
| `checkpointCap` | `32768` | 缩放后检查点预算的绝对上限 |
| `textTokens` | `512` | 每条助手文本块预算 |
| `userTextTokens` | `1024` | 每条用户文本块预算 |
| `toolCallTokens` | `128` | 每个工具调用单行预算（永不缩放——见省略规则） |
| `toolResultExcerptTokens` | `256` | 为兼容而接受；**无效**——工具结果不再占据条目 |
| `includeReasoning` | `false` | 在检查点中保留推理块 |
| `stripNoiseXml` | `true` | 从用户文本剥离配置的噪声包裹 |
| `noisePatterns` | 见 compiler | 噪声 XML 正则来源，以 `s` 标志应用 |
| `toolKeyFields` | 内置 | 额外的工具名 → 参数字段映射（用于单行渲染） |
| `toolArgTools` | 见 compiler | 白名单：其关键参数渲染在单行里（`read`/`write`/`edit`/`glob`/`grep`/`bash`/`shell`/`web_search`/`skill`/`subagent`/…）；其余工具只渲染名称 |
| `hideTools` | — | 完全从检查点中剔除的记账工具 |
| `modelPolicies` | — | 按 provider/model 覆盖 `thresholdRatio`/`retain*`（basic 兼容结构） |
| `compactionRetries` / `maxOverflowRetries` | `1` / `1` | 重试预算，语义与 basic 相同 |
| `summarizationProvider` / `summarizationModel` | — | 为配置兼容而接受；**无效**——本后端从不调用模型 |

工具与命令插件各自接受 `{ maxRecallTokens?: 16000, maxSearchHits?: 50 }` 配置。

> **Cordis 配置坑：** 插件行的配置要经过 schemastery schema，其 `~standard` 适配器会为**每个缺失的数组键注入 `[]`**（`toolArgTools`、`hideTools`、`noisePatterns`、`toolKeyFields`、`modelPolicies`）。解析器把空列表视为*未设置*并回退到默认值——所以缺失 `toolArgTools` 会保留内置白名单（千万不要用 `toolArgTools: []` 来禁用它；空即默认）。`debug: true` 会把每次编译的诊断写入配置的 `debugLogPath`（默认 `$DSH_HOME/compaction-debug.log`）。

预算双重强制执行——按 token 数与 `预算 × 4` 的字符上限——所以病态的长串（base64 大块、压缩后的文件）无法绕过。工具调用**永远是一行**：它们永不缩放，上限循环只压缩对话文本预算（各自下限 **32 token**）。若编译后的片段仍超出（缩放后的）上限，先移除最旧的**工具行**（`[N tool/result entries elided: seqs a-b]`），然后才移除其余最旧条目（`[N earlier entries elided: seqs a-b]`）——工具调用永远不会挤掉对话。最新内容总是存活。

### 分词与多语言行为

分词器是字符类别启发式：ASCII 字母串与数字串各算一个 token，标点按字符计，空白免费，其余每个码元各算一个 token。具体来说：

| 内容 | Tokens |
|---|---|
| CJK（`你好，世界！`） | 每码点 1（共 6） |
| 西里尔 / 阿拉伯 | 每码元 1 |
| 带重音拉丁（`café`） | ASCII 串保持成组（`caf` + `é`） |
| Emoji（`😀`） | 2（代理对） |

所有截断、摘录与上限切割都发生在**码点边界**——切片永远不会留下半个代理项，因此 emoji 及其他星面字符总能完整到达模型（由 `test/multilang.test.js` 固定）。字符密度上限使用 UTF-16 长度，对星面内容而言是保守的一侧。

Harness 的 token meter（用于缩小保证与 `/compact` 报告）是另一个 `chars / 4 + 块开销` 估计器；两者刻意共存——见顶层设计说明。

## 保证

- **即时**——编译是对被压缩节点的一次确定性单趟处理；无网络、无模型、无 KV-cache 顾虑。
- **近无损**——输出只含原始 token；每处裁剪都有标记并指向持久的 `seq`；之前的检查点逐字复制。
- **契约精确的 drop-in**——与 `compaction-basic` 完全相同的接缝、事件、来源、计费（经由单例 `ctx.tokenMeter`）与失败词表，包括缩小保证（不减少表面的检查点会被拒绝）。
- **可选 pruner 兼容**——与 basic 一样消费可选的 `toolResultPruner` 服务（它帮助*保留的尾部*；编译器折叠*被压缩*的片段）。

## 安装

下面三种方法都用 Harness 自带的插件管理器安装本包（以 `dsh-compaction-instant` 发布到 npm；插件管理器在 profile 目录内运行 pnpm，使包对宿主组合与每个 agent preset 都可解析）：

```bash
dsh plugin --profile web add <spec>
```

`dsh-command-compact`（`/compact`）与后端无关，因此在每种方法下都保持不变地工作。

### 方法 1 —— 以别名直接替换内置引擎

```bash
dsh plugin --profile web add "@deepseek-ai/dsh-compaction-basic@npm:dsh-compaction-instant"
```

**dsh 目前无法选择压缩引擎**，内置 agent preset（`standard`、`code`、`cordis`）在组合中固定了包名 `@deepseek-ai/dsh-compaction-basic`。要在这些内置 preset 内使用本引擎，你需要**伪装成内置插件**：preset 行从 profile 的 `node_modules` 解析裸包名（优先级高于 Harness 安装），因此把本包安装到内置名下，就能让每个内置 preset 自动加载本引擎——不触碰任何 preset 文件，preset 升级也照常工作。

伪装在构造上就是安全的：本引擎是契约精确的 drop-in——相同的 `ctx.compaction` 接缝、**完全相同的 inject 列表**（`llm`、`tokenMeter`、`sessions`）、相同的事件协议与错误词表，且其 `Config` 接受 basic 配置面的每一个键。移除别名依赖即恢复真正的 basic。

### 方法 2 —— 直接安装 + AI 撰写 preset 副本（dsh 创作模式）

```bash
dsh plugin --profile web add dsh-compaction-instant
```

然后用 preset 创作 preset（内置的 `cordis` preset，即「创造模式」）开一个会话，让 AI 执行：

> 复制 `standard` 预设，把它的压缩引擎行换成 `dsh-compaction-instant`。

AI 会用 `agentPresets.copy('standard', '<id>')` 创建本地撰写的 preset，在副本中替换压缩行的 `name`，用 `standingKeyFor('<id>')` 做挂载校验，并可通过修改 `agent-presets` 行（`config.default: <id>`）设为默认。新 preset 会出现在 UI 选择器中；内置 preset 不受影响。

### 方法 3 —— 直接安装 + 手动配置 preset

```bash
dsh plugin --profile web add dsh-compaction-instant
mkdir -p "$DSH_HOME/.agent-presets/<id>"
# 从你想作为基础的内置 preset 复制组合与元数据
# （preset 名册列出每个 preset 的真实路径）：
cp <built-in-preset>/agent.cordis.yml "$DSH_HOME/.agent-presets/<id>/agent.cordis.yml"
# 在旁边写 preset.yml，包含 name + description
```

然后手工编辑副本的压缩组——只改一行 name，仍在同一个 isolate realm 内：

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true      # pruner 必须共享此 realm
  config:
    - id: compaction-instant
      name: dsh-compaction-instant   # 原来是 '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    # ... 保留 pruner 行
```

规则：绝不编辑内置 preset 安装；保留 isolate realm；成功的 `standingKeyFor` 挂载（或直接在 preset 上开一个会话）才是真正的校验——名册的 `broken` 标志只能捕捉解析错误。

### 共享 patch 层（所有方法通用）

recall 工具与 `/recall` 命令是宿主级行；把它们加进 profile 的 `cordis.patch.yml`（新行必须挂在 `insert` 列表下；文件热重载，无需重启）：

```yaml
- id: compaction-basic
  disabled: true                     # 宿主级替换（可选回退）
- insert:
    - id: compaction-instant
      name: dsh-compaction-instant   # 无压缩 preset（如 minimal）的宿主回退
    - id: tool-recall
      name: dsh-compaction-instant/tool
    - id: command-recall
      name: dsh-compaction-instant/command
```

| 方法 | 内置 preset 中的引擎 | 触碰 preset 文件 | 选择器中多出 preset | 设置成本 |
|---|---|---|---|---|
| **1. 别名替换** | ✅ 自动（standard/code/cordis） | 否 | 否 | 一条命令 |
| **2. AI 撰写副本** | 仅新 preset | 副本 | 是 | 一句提示 + patch |
| **3. 手动 preset** | 仅新 preset | 副本 | 是 | 手工编辑 |

> 每个上下文只能挂载一个 `ctx.compaction` 实现（接缝文档写明「每上下文加载一个实现」）；preset 挂载保留各自的 isolate realm，因此宿主与 preset 实例永不冲突。

## 开发

```bash
npm test        # node --test（编译器单元、配置校验、会话集成、引擎）
npm run check   # 对所有源码执行 node --check
```

本包依赖极少：`@deepseek-ai/schemastery` 用于 Config schema；其余都是 peer（由 Harness 提供）。`src/compiler.js` 刻意零依赖，可在没有运行中 Harness 的情况下做单元测试。

## 与 compaction-basic 的差异

- 无摘要调用 → 压缩延迟从秒级降到毫秒级；无摘要 token 开销。
- 无改写 → 事实、文件路径、命令与标识符逐字节存活；模型继续用自己的措辞。
- 确定性 → 同一片段总是编译成同一检查点。
- 之前的检查点逐字复制而非重新摘要（便宜且无损）。
- 手动 `/compact` 保留逐字的最近尾部（`manualRetainRatio`，默认为已测表面的 0.05）而非编译整个历史，因此活跃对话永远不会被压缩掉；编译出的检查点只覆盖更早的片段。
- `compaction/summary` 事件携带**编译后的条目本身**——UI 可展开的检查点行展示的就是模型所见的主体，外面包一层**自适应 Markdown 代码围栏**（围栏比任何内部 ``` 都长，因此含 markdown 的消息渲染成一个整洁的代码块），检查点开头还有一段简短 RECALL 指南，告诉模型如何用 `recall` / `search` 恢复被省略的内容。
- 权衡：对散文为主的历史，检查点的*密度*可能不如 LLM 摘要（事实被截断而非合并）。逐字尾部（自动 `retainRatio` 与手动 `manualRetainRatio`）是活跃工作的所在，其余内容都可通过 `(seq N)` 指针 + recall 取回。

MIT 许可证。
