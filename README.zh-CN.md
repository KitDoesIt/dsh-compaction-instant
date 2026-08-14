# dsh-compaction-instant

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 打造的**即时、近无损上下文压缩**引擎——**装上就能直接替换官方引擎 `@deepseek-ai/dsh-compaction-basic`**，用 [lllyasviel/VCC](https://github.com/lllyasviel/VCC) 的"对话编译"思路取代原来的 LLM 摘要。

对话太长了怎么办？普通方案是让模型把旧内容"总结"一遍（慢、花钱、还会丢细节）。本引擎不总结，而是把旧内容**重新整理成一份紧凑的存档**（后面统称"检查点"）：毫秒级完成、不调用模型、只使用原来的原文，不改写、不编造。被收进存档的内容随时可以原样找回来。

## 主要特性

- **免 LLM**——压缩过程完全不调用模型：没有摘要请求、没有推理等待、不花 token。它只是确定性的文本处理，哪怕一百万个 token 的历史也是毫秒级搞定。
- **近无损**——存档里只有原文；每处被省略的内容都有标记并注明出处（`seq` 序号），之前的存档会原封不动地保留。
- **即时**——把旧内容扫描一遍就完成；不联网、不调模型、不占 KV 缓存。
- **完全兼容的替换**——对外接口、事件、计费和报错方式都和官方引擎一致；内置预设不用改任何东西就能用（见"别名安装"）。

## 示例

一段包含用户提问、助手回答 + 工具调用及其结果的历史，压缩后长这样：

```
[user]
please fix the bug
[assistant]
on it
* read "a.js" (seq 2 -> result 3)
[user]
next question
```

每个工具调用只占**一行**：白名单里的工具（`toolArgTools`）显示关键参数，其他工具只显示名字（`* job_kill (seq 9 -> result 10)`），`hideTools` 里列的工具完全不出现。工具结果不占位置——通过 `-> result N` 指针，用一次 `recall(type:"result")` 就能取回。较长的用户/助手文本按预算截断，并在末尾标注 `...(truncated from seq N)`；每处省略都写明了完整内容存在哪个事件里。

## Recall：把丢掉的内容找回来

本包还配套了"找回"能力——**同一会话内的回读**，模型和人都能用。因为会话日志只增不改，编译器省略过的每一个字都还在，随时可取：

| 入口 | 模块 | 作用 |
|---|---|---|
| `recall` **工具**（给模型用） | `dsh-compaction-instant/tool` | 按类型恢复原文：`type:"seq"` 配合 `(seq N)`/`(seqs A-B)` 标记，`type:"result"` 配合 `result N` 指针，`type:"checkpoint"` 配合 `[checkpoint N]` 序号——把原始内容一字不差地恢复到当前工具结果里 |
| `search` **工具**（给模型用，grep） | `dsh-compaction-instant/tool` | 在整个持久日志里按关键词/正则搜索——包括被压缩掉的内容——返回带 `(seq N)` 指针的匹配事件，可直接交给 `recall` 取回 |
| `/recall` **命令**（给人用，grep） | `dsh-compaction-instant/command` | `/recall <关键词|正则>` 追加一条持久的用户消息，内含匹配事件和 seq 指针，下一轮模型就能看到 |
| 共享核心 | `dsh-compaction-instant/recall` + `dsh-compaction-instant/search` | seq 解析（`12`、`3-7`、`seq 12` / `seqs 3-7`）、日志展开、预算、字段筛选；正则编译与命中展示 |

Recall 能取回**一切**：文本、推理过程、工具调用的完整参数、嵌套的工具结果；只在日志里出现过的事件会以带标签的原始数据展示；找不到的 seq 会明确报错。`maxRecallTokens` 预算（默认 **16000**）超限时会截断并标注来源、统计跳过多少；搜索限制展示条数（`maxSearchHits`，默认 **50**）。这两个插件是独立的一行，可以挂在**任何**压缩引擎旁边——它们只读日志，不依赖本引擎。

每个检查点开头还附了一段简短的 **RECALL 使用指南**，告诉模型怎么用 `recall` / `search` 找回被省略的内容。如果更早的检查点因为空间不够被省略，它不会无声消失：会留下一行 `[checkpoint N]`（N 是压缩序号，1 = 最早），用 `recall(type:"checkpoint", id:"N")` 就能完整恢复。

## 配置

所有配置项都可选，括号里是默认值。

| 键 | 默认 | 含义 |
|---|---|---|
| `thresholdRatio` | `0.5` | 上下文用到多大比例时自动触发压缩（0.5 = 用到一半） |
| `retainRatio` | `0.05` | 对话最新的一段（按窗口比例）一字不差地保留，不压缩 |
| `retainTokens` | — | 直接指定保留多少 token；与 `retainRatio` 二选一 |
| `manualRetainRatio` | `0.05` | 手动 `/compact` 时保留当前对话的比例（保证正在聊的内容不会被收走） |
| `manualRetainTokens` | — | 手动模式直接指定保留 token 数；与 `manualRetainRatio` 二选一 |
| `auto` | `true` | 开启自动压缩：监听 `agent/pre-step` 压力事件和 `agent/request-error` 溢出恢复 |
| `maxTokens` | `8192` | 单个检查点总预算的下限（按内容密度估算的 token） |
| `checkpointScale` | `0.1` | 实际预算 = `max(maxTokens, 被压缩掉的 token 数 × checkpointScale)`，再封顶于 `checkpointCap`——内容很多时不会把每条都压成一句话 |
| `checkpointCap` | `65536` | 检查点预算的封顶值 |
| `textTokens` | `512` | 每条助手文本的预算 |
| `userTextTokens` | `1024` | 每条用户文本的预算 |
| `toolCallTokens` | `128` | 每个工具调用单行的预算（这个永远不缩放——见下面的省略规则） |
| `toolResultExcerptTokens` | `256` | 仅为兼容官方配置而接受；**不起作用**——工具结果本来就不占位置 |
| `includeReasoning` | `false` | 是否在检查点里保留推理过程 |
| `stripNoiseXml` | `true` | 是否去掉用户文本里配置的噪音标签 |
| `noisePatterns` | 见 compiler | 噪音标签的正则来源，按 `s` 模式匹配 |
| `toolKeyFields` | 内置 | 额外的"工具名 → 参数里的关键字段"映射，用于单行展示 |
| `toolArgTools` | 见 compiler | 白名单：这些工具的关键参数会显示在单行里（`read`/`write`/`edit`/`glob`/`grep`/`bash`/`shell`/`web_search`/`skill`/`subagent`/…）；其余工具只显示名字 |
| `hideTools` | — | 完全从检查点里去掉的内部管理工具 |
| `modelPolicies` | — | 按 provider/model 单独覆盖 `thresholdRatio`/`retain*`（与官方配置格式一致） |
| `compactionRetries` / `maxOverflowRetries` | `1` / `1` | 重试次数，含义和官方引擎一样 |
| `summarizationProvider` / `summarizationModel` | — | 仅为兼容官方配置而接受；**不起作用**——本引擎从不调用模型 |

recall 工具和命令插件各自接受 `{ maxRecallTokens?: 16000, maxSearchHits?: 50 }` 配置。

> **Cordis 配置坑：** 插件行的配置要经过 schemastery schema 校验，它的 `~standard` 适配器会给**每个没写的数组项注入 `[]`**（`toolArgTools`、`hideTools`、`noisePatterns`、`toolKeyFields`、`modelPolicies`）。本引擎把空数组当作"没设置"，会回退到默认值——所以不写 `toolArgTools` 就自动用内置白名单（千万别用 `toolArgTools: []` 想关掉它；空 = 默认）。`debug: true` 会把每次压缩的诊断写进 `debugLogPath` 指定的文件（默认 `$DSH_HOME/compaction-debug.log`）。

预算有两道保险：按 token 数限制，再按"预算 × 4"的字符数限制——所以再长的连续字符串（base64 大块、压缩过的文件）也绕不过去。工具调用**永远是单行**：不会缩放，预算不够时只压缩对话文本（每条最少留 **32 token**）。如果压缩结果还是超过（缩放后的）预算，先删最旧的**工具行**（`[N tool/result entries elided: seqs a-b]`），再删其余最旧的条目（`[N earlier entries elided: seqs a-b]`）——工具调用永远挤不掉对话。最新的内容总能保住。

### 浏览器设置卡片（设置 → 插件）

从 0.1.4 起，引擎在**任何装配了 settings 域**的部署（标准 web/desktop profile 都有）上暴露一个用户设置命名空间（`compaction-instant`）。可编辑子集持久化到 `settings.yaml`，**叠加在**插件行的 cordis 配置之上：

| 字段 | 含义 |
|---|---|
| `checkpointScale` | 压缩预算 = 被压缩 token 数 × 此比例 |
| `checkpointCap` | 缩放后预算的绝对封顶 |
| `maxTokens` | 一次编译检查点的总 token 上限 |
| `auto` | 注册步骤间自动压缩 |
| `debug` | 向日志文件写入引擎调试行 |
| `debugLogPath` | 调试日志路径（留空 = `$DSH_HOME/compaction-debug.log`） |

其余字段（`modelPolicies`、`toolArgTools` 等）仍只由 cordis 配置管理。设置层永远弄不坏引擎：每次设置写入都会先经过完整配置解析器的重新校验才会持久化；未暴露的配置字段保持组合层的值。没有 settings 服务时引擎行为与之前完全一致（只看组合配置）。卡片注册在客户端 bundle 上，所以只要装上这个包就会出现，无需改任何部署配置——**重启一次 `dsh web`** 让启动图拾取 `dsh.client` bundle 即可。

### 分词与多语言

分词器是简单的字符规则：连续的英文字母算一个 token，连续数字算一个，标点一个字符一个，空格免费，其他每个字符算一个。具体：

| 内容 | Tokens |
|---|---|
| 中文（`你好，世界！`） | 每个字 1（共 6） |
| 西里尔 / 阿拉伯文 | 每个字符 1 |
| 带重音拉丁文（`café`） | 英文部分成组（`caf` + `é`） |
| Emoji（`😀`） | 2（一个 emoji 占两个 UTF-16 单元） |

所有截断都发生在**字符边界**——绝不会把一个 emoji 从中间切开（有 `test/multilang.test.js` 保证）。字符数上限按 UTF-16 长度算，对 emoji 这类字符偏保守。

另外，Harness 自带的 token 计量器（用于"压缩后必须变小"的检查、`/compact` 的用量报告）用的是另一套 `字符数 / 4 + 固定开销` 的估算，两套算法故意并存——详见设计说明。

## 保证

- **即时**——把旧内容扫描一遍就完成；不联网、不调模型、不占 KV 缓存。
- **近无损**——输出里只有原文；每处省略都有标记并注明出处 `seq`；之前的检查点原封不动保留。
- **完全兼容的替换**——接口、事件、计费（走同一个 `ctx.tokenMeter`）和报错方式与官方引擎一致，包括"压缩后必须变小"的检查（如果压缩完反而没变小，会被拒绝）。
- **可选 pruner 兼容**——和官方引擎一样会使用可选的 `toolResultPruner` 服务（它负责整理*保留部分*；被压缩的旧内容由本引擎自己处理）。

## 实测压缩率（真实会话、一条不丢）

数据来自真实会话日志（本项目的开发会话），编译时**不丢弃任何一条**——每条都保留，只做条目级截断和工具调用单行化。百分比是相对原文 token 数的比例。

| 负载 | 原文 tokens | 编译后 | 保留 | 压缩 |
|---|---|---|---|---|
| 工具密集会话全量（3,181 节点：1,438 个工具调用 + 1,540 个工具结果） | 2,523,012 | 226,205 | **9.0%** | 91.0% |
| 另一个会话全量（864 节点） | 685,088 | 62,705 | **9.2%** | 90.8% |
| 同一个工具密集会话，最近 800 条消息 | 625,927 | 45,031 | **7.2%** | 92.8% |
| 纯文本（同一会话去掉全部工具行） | 160,963 | 109,945 | **68.3%** | 31.7% |

压缩主要来自哪里（不丢条目的情况下）：

- **工具结果零成本**——结果不产生条目，靠 `-> result N` 指针一个 `recall` 就能取回，这是最大的来源。
- **工具调用一行化**——每个调用压成一行（≤ 128 tokens，平均约 100）。
- **思考过程不保留**——reasoning 增量整体省略（有标记，不是悄悄丢）。
- **对话文本近乎无损**——纯文本对照组保留了 68.3%；文本上那约 1.5 倍压缩基本是剥掉 JSON 包装，外加只截断最长的几段。

预算扫描（同一个 252 万 tokens 的工具密集会话）：从 cap ≈ 22.6 万 tokens（原文的 9%，正好接近默认 `checkpointScale` 0.1，但被 64K 硬顶截断）才开始丢条目。低于这个值代价是**悬崖不是斜坡**：

| Cap | 编译后 | 保留 | 条目数 | 被丢 |
|---|---|---|---|---|
| 8,192 | 8,243 | 0.33% | 111 | 2,090 |
| 32,768 | 22,263 | 0.88% | 232 | 1,969 |
| 65,536（部署默认） | 55,737 | 2.2% | 325 | 1,876 |
| 65,536 | 55,737 | 2.2% | 325 | 1,876 |
| 131,072 | 131,047 | 5.2% | 1,142 | 1,058 |
| 226,205（一条不丢的临界值） | 226,205 | 9.0% | 2,199 | 0 |

## 安装

下面三种方法都用 Harness 自带的插件管理器安装（包发布在 npm，名字 `dsh-compaction-instant`；插件管理器会在 profile 目录里跑 pnpm，装完后宿主配置和每个 agent preset 都能找到它）：

```bash
dsh plugin --profile web add <spec>
```

`/compact` 命令（`dsh-command-compact`）和用哪个引擎无关，任何安装方式下都照常工作。

### 方法 1 —— 顶替内置引擎（别名安装）

```bash
dsh plugin --profile web add "@deepseek-ai/dsh-compaction-basic@npm:dsh-compaction-instant"
```

**dsh 目前没法让你选压缩引擎**，内置预设（`standard`、`code`、`cordis`）在配置里写死了包名 `@deepseek-ai/dsh-compaction-basic`。要让这些内置预设用上本引擎，就**顶替**内置插件：预设配置里的包名是从 profile 的 `node_modules` 解析的（优先级高于 Harness 自带的安装），所以把本包装到内置这个名字下面，所有内置预设就会自动加载本引擎——不动任何预设文件，预设以后升级也不受影响。

这样顶替是天然安全的：本引擎和官方引擎对外完全兼容——同一个 `ctx.compaction` 接口、**完全相同的依赖注入列表**（`llm`、`tokenMeter`、`sessions`）、相同的事件和报错方式，官方配置里的每一个键也都接受。把别名依赖删掉就恢复官方的引擎。

这种安装方式**不会被识别成 bundle**（Harness 会从自己的安装目录解析 `@deepseek-ai/dsh-compaction-basic` 这个名字，那里是官方包，没有 `dsh.bundle` 声明），所以没有任何自动化——需要把 recall 工具和 `/recall` 命令自己加进 profile 的 `cordis.patch.yml`（新行必须放在 `insert` 列表里；这个文件热重载，不用重启）。行名必须用**别名包名**（这种安装方式下只有它能解析）；引擎行可选，只在需要给"没有压缩配置的预设"（如 `minimal`）提供宿主兜底时才加：

```yaml
- id: compaction-basic
  disabled: true                     # 宿主层替换（可选兜底）
- insert:
    - id: compaction-instant
      name: '@deepseek-ai/dsh-compaction-basic'   # 给没有压缩配置的预设兜底
    - id: tool-recall
      name: '@deepseek-ai/dsh-compaction-basic/tool'
    - id: command-recall
      name: '@deepseek-ai/dsh-compaction-basic/command'
```

### 方法 2 —— 直接安装 + 让 AI 复制一份预设（dsh 创作模式）

```bash
dsh plugin --profile web add dsh-compaction-instant
```

然后用"预设创作"预设（内置的 `cordis` 预设，即「创造模式」）开一个会话，让 AI 执行：

> 复制 `standard` 预设，把它的压缩引擎行换成 `dsh-compaction-instant`。

AI 会用 `agentPresets.copy('standard', '<id>')` 创建一份本地预设，在副本里改掉压缩行的 `name`，用 `standingKeyFor('<id>')` 校验能不能正常挂载，还可以通过改 `agent-presets` 行（`config.default: <id>`）把它设为默认。新预设会出现在 UI 选择器里；内置预设不受影响。

从 v0.1.1 起，本包还声明了 `dsh.bundle`，所以直接安装会自动注册成 profile 的配置层：自动禁掉内置的摘要引擎行、自动插入本引擎和 recall 工具（见包内 `cordis.patch.yml`）。宿主这边不用手动配置，只需复制预设。

### 方法 3 —— 直接安装 + 手动配置预设

```bash
dsh plugin --profile web add dsh-compaction-instant
mkdir -p "$DSH_HOME/.agent-presets/<id>"
# 从你想作为基础的内置预设复制配置和元数据
# （预设列表里能看到每个预设的真实路径）：
cp <built-in-preset>/agent.cordis.yml "$DSH_HOME/.agent-presets/<id>/agent.cordis.yml"
# 在旁边写 preset.yml，包含 name + description
```

然后手工编辑副本里的压缩组——只改一行 name，仍在同一个隔离域（realm）里：

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true      # pruner 必须和引擎在同一隔离域
  config:
    - id: compaction-instant
      name: dsh-compaction-instant   # 原来是 '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    # ... 保留 pruner 行
```

规则：绝不改内置预设的安装文件；保留 isolate 隔离域；真正的检验是 `standingKeyFor` 挂载成功（或直接在预设上开一个会话）——预设列表里的 `broken` 标记只能发现解析错误。

方法 2 和 3 **不需要任何宿主配置行**：上面提到的 `dsh.bundle` 会自动注册好一切。

| 方法 | 内置预设里的引擎 | 要改预设文件吗 | 选择器里多出预设 | 安装成本 |
|---|---|---|---|---|
| **1. 别名替换** | ✅ 自动（standard/code/cordis） | 否 | 否 | 一条命令 + 手动 patch |
| **2. AI 复制副本** | 只有新预设 | 副本 | 是 | 一句提示 |
| **3. 手动预设** | 只有新预设 | 副本 | 是 | 手动编辑 |

> 每个上下文只能挂载一个 `ctx.compaction` 实现（接口文档写明"每个上下文加载一个实现"）；预设挂载各自有独立的隔离域，所以宿主和预设的实例永远不会冲突。

## 开发

```bash
npm test        # node --test（编译器单元测试、配置校验、会话集成、引擎）
npm run check   # 对所有源码做 node --check
```

本包依赖很少：`@deepseek-ai/schemastery` 用于配置校验；其余依赖都是 Harness 自己提供的。`src/compiler.js` 刻意零依赖，没有运行中的 Harness 也能单独跑单元测试。

## 和官方引擎的区别

- 不调摘要模型 → 压缩从几秒变成几毫秒；不花摘要的 token。
- 不改写 → 事实、文件路径、命令、变量名都一字不差；模型继续用自己的话接着聊。
- 确定性 → 同样的内容永远压缩出同样的检查点。
- 之前的检查点原样保留，而不是重新摘要一遍（又快又无损）。
- 手动 `/compact` 会保留最近的一小段原文（`manualRetainRatio`，默认保留当前对话的 0.05）而不是压缩全部历史，正在聊的内容永远不会被收走；只有更早的部分进检查点。
- `compaction/summary` 事件携带**压缩后的条目本身**——UI 里可展开的检查点行显示的就是模型实际看到的内容，外面包一层**能自动变长的代码框**（框线永远比内容里的 ``` 长，所以含 markdown 的消息也能整齐地显示成一个代码块），检查点开头还有一段简短的使用指南，告诉模型怎么用 `recall` / `search` 找回被省略的内容。
- 权衡：对以长对话、叙述为主的历史，检查点的信息密度可能不如 LLM 摘要（长句是截断而不是合并）。正在进行的对话有逐字保留的尾部（自动 `retainRatio` 和手动 `manualRetainRatio`）兜底，其余内容都能通过 `(seq N)` 指针 + recall 找回来。

MIT 许可证。
