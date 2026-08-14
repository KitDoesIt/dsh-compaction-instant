/**
 * Browser half of dsh-compaction-instant: a plugin configuration card under
 * Settings → Plugins, bound to the `compaction-instant` settings namespace
 * registered by the engine's Host half (src/index.js).
 *
 * This file is served verbatim by the deployment's client-modules bundle
 * route, so it must be a self-contained lazy-CJS factory in the
 * `window.__ModuleLoader__.load` format. It registers under BOTH package
 * names: the alias name used by drop-in deployments
 * (`@deepseek-ai/dsh-compaction-basic` — web profiles alias the official
 * package to this one so bundled agent presets keep resolving) and the real
 * package name. Exactly one of the two is required by the boot graph; the
 * other registration is inert.
 *
 * No TypeScript/JSX/bundler transforms run on this file.
 */
function instantCompactionClientFactory(require) {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  var React = require("react");
  var { createSnapshotStore } = require("@deepseek-ai/dsh-client-runtime/client");

  // ── styles (injected once per page, matching the official cards' tokens) ──
  var css = [
    ".dsci_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}",
    ".dsci_card:hover{border-color:var(--dsw-alias-label-dimmed)}",
    ".dsci_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
    ".dsci_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
    ".dsci_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
    ".dsci_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
    ".dsci_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}",
    ".dsci_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
    ".dsci_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}",
    ".dsci_chevronOpen{transform:rotate(180deg)}",
    ".dsci_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",
    ".dsci_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}",
    ".dsci_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}",
    ".dsci_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}",
    ".dsci_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}",
    ".dsci_discard,.dsci_save{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}",
    ".dsci_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}",
    ".dsci_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
    ".dsci_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}",
    ".dsci_discard:disabled,.dsci_save:disabled{opacity:.4;cursor:default}",
    ".dsci_discard:focus-visible,.dsci_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
    ".dsci_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}",
    ".dsci_field+.dsci_field{border-top:1px solid var(--dsw-alias-border-l2)}",
    ".dsci_head{align-items:center;gap:8px;display:flex}",
    ".dsci_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}",
    ".dsci_badges{align-items:center;gap:8px;display:inline-flex}",
    ".dsci_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",
    ".dsci_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}",
    ".dsci_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
    ".dsci_reset:disabled{cursor:default}",
    ".dsci_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;width:100%;box-sizing:border-box}",
    ".dsci_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}",
    ".dsci_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
    ".dsci_inputInvalid{border-color:var(--dsw-alias-label-error)}",
    ".dsci_invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}",
    ".dsci_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}",
    ".dsci_toggleRow{align-items:center;gap:10px;display:flex}",
    ".dsci_toggle{accent-color:var(--dsw-alias-brand-primary);width:16px;height:16px;cursor:pointer}",
    ".dsci_toggle:disabled{cursor:default}"
  ].join("");
  var tagId = "dsh-compaction-instant/settings.css";
  if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
    var tag = document.createElement("style");
    tag.dataset.plugin = "dsh-compaction-instant";
    tag.dataset.pluginCss = tagId;
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ── locale ────────────────────────────────────────────────────────────────
  var NS = "compaction-instant";
  var zh = {
    title: "即时压缩",
    description: "VCC 式即时压缩引擎（dsh-compaction-instant）的参数。",
    checkpointScale: "检查点缩放比例",
    checkpointScaleHint: "压缩预算 = 被压缩的 token 数 × 此比例（默认 0.1）。",
    checkpointCap: "检查点预算上限",
    checkpointCapHint: "缩放后预算的绝对封顶（默认 65536）。",
    maxTokens: "单次检查点总上限",
    maxTokensHint: "一次编译检查点的总 token 上限（默认 8192）。",
    auto: "自动压缩",
    autoHint: "步骤间按上下文压力自动压缩；关闭后仅手动 /compact。",
    debug: "调试日志",
    debugHint: "向日志文件写入引擎调试行；DSH_COMPACTION_DEBUG=1 也会开启。",
    debugLogPath: "调试日志路径",
    debugLogPathHint: "留空使用 $DSH_HOME/compaction-debug.log。",
    overridden: "已覆盖",
    reset: "重置",
    invalidNumber: "必须是数字",
    save: "保存",
    saving: "保存中…",
    saveFailed: "保存失败",
    discard: "放弃",
    unsaved: "未保存",
    readOnly: "当前连接为只读，无法修改配置。",
    expand: "展开",
    collapse: "收起"
  };
  var en = {
    title: "Instant Compaction",
    description: "VCC-style instant compaction engine (dsh-compaction-instant) tuning.",
    checkpointScale: "Checkpoint scale",
    checkpointScaleHint: "Checkpoint budget = shadowed tokens × this ratio (default 0.1).",
    checkpointCap: "Checkpoint cap",
    checkpointCapHint: "Absolute ceiling of the scaled budget (default 65536).",
    maxTokens: "Max tokens per checkpoint",
    maxTokensHint: "Total compiler-token cap for one checkpoint (default 8192).",
    auto: "Automatic compaction",
    autoHint: "Compress automatically between steps by pressure; off means manual /compact only.",
    debug: "Debug log",
    debugHint: "Write engine debug lines to the log file; DSH_COMPACTION_DEBUG=1 also enables it.",
    debugLogPath: "Debug log path",
    debugLogPathHint: "Empty uses $DSH_HOME/compaction-debug.log.",
    overridden: "Overridden",
    reset: "Reset",
    invalidNumber: "Must be a number",
    save: "Save",
    saving: "Saving…",
    saveFailed: "Save failed",
    discard: "Discard",
    unsaved: "Unsaved",
    readOnly: "This connection is read-only.",
    expand: "Expand",
    collapse: "Collapse"
  };

  // ── field specs ───────────────────────────────────────────────────────────
  /** A whole-number field; empty draft clears, non-numeric drafts block save. */
  function numberField(field) {
    return {
      field,
      format: (value) => typeof value === "number" ? String(value) : "",
      parse: (text) => {
        var trimmed = text.trim();
        if (trimmed === "") return { kind: "clear" };
        var parsed = Number(trimmed);
        return Number.isFinite(parsed) ? { kind: "set", value: parsed } : void 0;
      }
    };
  }
  /** A free-text field; empty draft clears. */
  function textField(field) {
    return {
      field,
      format: (value) => typeof value === "string" ? value : "",
      parse: (text) => {
        var trimmed = text.trim();
        return trimmed === "" ? { kind: "clear" } : { kind: "set", value: trimmed };
      }
    };
  }
  /** A boolean field staged through the toggle's "true"/"false" text. */
  function booleanField(field) {
    return {
      field,
      format: (value) => value === true ? "true" : "false",
      parse: (text) => ({ kind: "set", value: text === "true" })
    };
  }

  // ── form model (official-card semantics: staged edits, one save, read-back) ──
  /**
   * Stages one card's edits over the compaction-instant settings namespace and
   * writes them on save. Mirrors the official plugin-card form contract:
   * dirty/invalid/saving/failed shell state, per-field draft text, and a save
   * that plans one write per staged field then re-reads from the Host.
   */
  var CardController = /** @class */ (function () {
    function CardController(scope, specs) {
      this.scope = scope;
      this.specs = new Map(specs.map(function (spec) { return [spec.field, spec]; }));
      this.staged = new Map();
      this.listeners = new Set();
      this.saving = false;
      this.failed = false;
      scope.subscribe(function () { this.publish(); }.bind(this));
    }
    /** Build the snapshot store the slot's `useCompactionCard` selector reads. */
    CardController.prototype.bind = function (project) {
      var store = createSnapshotStore(project());
      this.listeners.add(function () { store.set(project()); });
      return store;
    };
    CardController.prototype.publish = function () {
      for (var _i = 0, _a = Array.from(this.listeners); _i < _a.length; _i++) {
        var listener = _a[_i];
        try { listener(); } catch (_) { /* a failing projection must not kill the form */ }
      }
    };
    CardController.prototype.shell = function () {
      var snapshot = this.scope.getSnapshot();
      var plan = this.plan();
      return {
        available: snapshot.status === "ready",
        writable: snapshot.writable,
        dirty: plan.length > 0,
        invalid: plan.some(function (item) { return item.run === void 0; }),
        saving: this.saving,
        failed: this.failed
      };
    };
    CardController.prototype.field = function (field) {
      var staged = this.staged.get(field);
      var spec = this.specs.get(field);
      if (staged === void 0) {
        return {
          text: spec.format(this.sectionValue(field)),
          overridden: this.stored(field),
          invalid: false
        };
      }
      var write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
      return {
        text: staged.text,
        overridden: write != null && write.kind === "set",
        invalid: write === void 0
      };
    };
    CardController.prototype.actions = function () {
      var self = this;
      return {
        edit: function (field, text) {
          self.stage(field, { text: text, clear: false });
        },
        resetField: function (field) {
          self.stage(field, { text: self.specs.get(field).format(self.baseValue(field)), clear: true });
        },
        save: function () { self.save(); },
        discard: function () {
          if (self.staged.size === 0 && !self.failed) return;
          self.staged.clear();
          self.failed = false;
          self.publish();
        }
      };
    };
    /** Every staged edit a save would write, in staging order. */
    CardController.prototype.plan = function () {
      var plan = [];
      for (var _i = 0, _a = Array.from(this.staged.entries()); _i < _a.length; _i++) {
        var entry = _a[_i];
        var field = entry[0];
        var staged = entry[1];
        var spec = this.specs.get(field);
        if (staged.clear) {
          if (this.stored(field)) plan.push({ field: field, run: function () { return this.clear(field); }.bind(this) });
          continue;
        }
        if (staged.text === spec.format(this.sectionValue(field))) continue;
        var write = spec.parse(staged.text);
        if (write === void 0) plan.push({ field: field, run: void 0 });
        else if (write.kind === "clear") plan.push({ field: field, run: function () { return this.clear(field); }.bind(this) });
        else plan.push({ field: field, run: function (value) { return function () { return this.store(field, value); }; }.call(this, write.value) });
      }
      return plan;
    };
    CardController.prototype.stage = function (field, edit) {
      this.staged.set(field, edit);
      this.failed = false;
      this.publish();
    };
    CardController.prototype.sectionValue = function (field) {
      var value = this.scope.getSnapshot().value;
      return value == null ? void 0 : value[field];
    };
    CardController.prototype.baseValue = function (field) {
      var base = this.scope.getSnapshot().base;
      return base == null ? void 0 : base[field];
    };
    CardController.prototype.userLayer = function () {
      return this.scope.getSnapshot().user;
    };
    CardController.prototype.stored = function (field) {
      var user = this.userLayer();
      return user !== void 0 && Object.prototype.hasOwnProperty.call(user, field);
    };
    CardController.prototype.clear = function (field) {
      var self = this;
      return this.scope.unset(field).then(function () { return !self.stored(field); });
    };
    CardController.prototype.store = function (field, value) {
      var self = this;
      return this.scope.set(field, value).then(function () {
        var user = self.userLayer();
        return user !== void 0 && user[field] === value;
      });
    };
    /** Write every staged edit, then re-read what the Host accepted. */
    CardController.prototype.save = function () {
      var self = this;
      var plan = this.plan();
      var writes = [];
      for (var _i = 0; _i < plan.length; _i++) {
        var item = plan[_i];
        if (item.run !== void 0) writes.push(item.run);
      }
      if (plan.length === 0 || this.saving || writes.length !== plan.length) return;
      this.saving = true;
      this.failed = false;
      this.publish();
      var landed = true;
      var settle = Promise.resolve();
      for (var _a = 0; _a < writes.length; _a++) {
        settle = settle.then(writes[_a]).then(function (ok) { landed = ok && landed; });
      }
      settle.then(function () {
        if (landed) self.staged.clear();
        self.saving = false;
        self.failed = !landed;
        self.publish();
      });
    };
    return CardController;
  })();

  // ── components ────────────────────────────────────────────────────────────
  function ValueField(props) {
    return React.createElement(
      "div",
      { className: "dsci_field" },
      React.createElement(
        "div",
        { className: "dsci_head" },
        React.createElement("label", { className: "dsci_label", htmlFor: props.id }, props.label),
        props.overridden
          ? React.createElement(
              "span",
              { className: "dsci_badges" },
              React.createElement("span", { className: "dsci_badge" }, props.overriddenLabel),
              React.createElement("button", {
                type: "button",
                className: "dsci_reset",
                disabled: props.disabled,
                onClick: props.onReset
              }, props.resetLabel)
            )
          : null
      ),
      React.createElement("input", {
        id: props.id,
        className: props.invalid ? "dsci_input dsci_inputInvalid" : "dsci_input",
        type: "text",
        inputMode: props.numeric === true ? "numeric" : void 0,
        "aria-invalid": props.invalid ? true : void 0,
        value: props.text,
        placeholder: props.placeholder ?? "",
        disabled: props.disabled,
        onChange: function (event) { props.onEdit(event.target.value); }
      }),
      React.createElement("p", { className: props.invalid ? "dsci_invalid" : "dsci_hint" }, props.invalid ? props.invalidLabel : props.hint)
    );
  }

  function ToggleField(props) {
    return React.createElement(
      "div",
      { className: "dsci_field" },
      React.createElement(
        "div",
        { className: "dsci_head" },
        React.createElement("label", { className: "dsci_label", htmlFor: props.id }, props.label),
        props.overridden
          ? React.createElement(
              "span",
              { className: "dsci_badges" },
              React.createElement("span", { className: "dsci_badge" }, props.overriddenLabel),
              React.createElement("button", {
                type: "button",
                className: "dsci_reset",
                disabled: props.disabled,
                onClick: props.onReset
              }, props.resetLabel)
            )
          : null
      ),
      React.createElement(
        "div",
        { className: "dsci_toggleRow" },
        React.createElement("input", {
          id: props.id,
          className: "dsci_toggle",
          type: "checkbox",
          checked: props.checked,
          disabled: props.disabled,
          onChange: function (event) { props.onToggle(event.target.checked); }
        })
      ),
      React.createElement("p", { className: "dsci_hint" }, props.hint)
    );
  }

  /** Render the compaction-instant card; nothing while the namespace is unavailable. */
  function CompactionCard(props) {
    var open = React.useState(false);
    var isOpen = open[0];
    var setOpen = open[1];
    var state = props.useCompactionCard(function (snapshot) { return snapshot; });
    var t = props.t;
    if (!state.available) return null;
    var blocked = !state.dirty || state.invalid || state.saving;
    return React.createElement(
      "li",
      { className: "dsci_card" + (isOpen ? " dsci_cardOpen" : "") },
      React.createElement(
        "button",
        {
          type: "button",
          className: "dsci_header",
          "aria-expanded": isOpen,
          "aria-label": t(isOpen ? "collapse" : "expand") + ": " + t("title"),
          onClick: function () { setOpen(!isOpen); }
        },
        React.createElement(
          "span",
          { className: "dsci_headText" },
          React.createElement("span", { className: "dsci_name" }, t("title")),
          React.createElement("span", { className: "dsci_description" }, t("description"))
        ),
        state.dirty ? React.createElement("span", { className: "dsci_pending" }, t("unsaved")) : null,
        React.createElement("span", { className: "dsci_chevron" + (isOpen ? " dsci_chevronOpen" : "") }, "▾")
      ),
      isOpen
        ? React.createElement(
            "div",
            { className: "dsci_body" },
            !state.writable ? React.createElement("p", { className: "dsci_readOnly", role: "status" }, t("readOnly")) : null,
            React.createElement(ValueField, {
              id: "plugin-config-instant-scale",
              label: t("checkpointScale"),
              hint: t("checkpointScaleHint"),
              overriddenLabel: t("overridden"),
              resetLabel: t("reset"),
              invalidLabel: t("invalidNumber"),
              numeric: true,
              disabled: !state.writable,
              ...state.checkpointScale,
              onEdit: function (text) { props.edit("checkpointScale", text); },
              onReset: function () { props.resetField("checkpointScale"); }
            }),
            React.createElement(ValueField, {
              id: "plugin-config-instant-cap",
              label: t("checkpointCap"),
              hint: t("checkpointCapHint"),
              overriddenLabel: t("overridden"),
              resetLabel: t("reset"),
              invalidLabel: t("invalidNumber"),
              numeric: true,
              disabled: !state.writable,
              ...state.checkpointCap,
              onEdit: function (text) { props.edit("checkpointCap", text); },
              onReset: function () { props.resetField("checkpointCap"); }
            }),
            React.createElement(ValueField, {
              id: "plugin-config-instant-max-tokens",
              label: t("maxTokens"),
              hint: t("maxTokensHint"),
              overriddenLabel: t("overridden"),
              resetLabel: t("reset"),
              invalidLabel: t("invalidNumber"),
              numeric: true,
              disabled: !state.writable,
              ...state.maxTokens,
              onEdit: function (text) { props.edit("maxTokens", text); },
              onReset: function () { props.resetField("maxTokens"); }
            }),
            React.createElement(ToggleField, {
              id: "plugin-config-instant-auto",
              label: t("auto"),
              hint: t("autoHint"),
              overriddenLabel: t("overridden"),
              resetLabel: t("reset"),
              checked: state.auto.text === "true",
              overridden: state.auto.overridden,
              disabled: !state.writable,
              onToggle: function (checked) { props.edit("auto", checked ? "true" : "false"); },
              onReset: function () { props.resetField("auto"); }
            }),
            React.createElement(ToggleField, {
              id: "plugin-config-instant-debug",
              label: t("debug"),
              hint: t("debugHint"),
              overriddenLabel: t("overridden"),
              resetLabel: t("reset"),
              checked: state.debug.text === "true",
              overridden: state.debug.overridden,
              disabled: !state.writable,
              onToggle: function (checked) { props.edit("debug", checked ? "true" : "false"); },
              onReset: function () { props.resetField("debug"); }
            }),
            React.createElement(ValueField, {
              id: "plugin-config-instant-debug-path",
              label: t("debugLogPath"),
              hint: t("debugLogPathHint"),
              overriddenLabel: t("overridden"),
              resetLabel: t("reset"),
              invalidLabel: t("invalidNumber"),
              disabled: !state.writable,
              ...state.debugLogPath,
              onEdit: function (text) { props.edit("debugLogPath", text); },
              onReset: function () { props.resetField("debugLogPath"); }
            }),
            React.createElement(
              "div",
              { className: "dsci_footer" },
              state.failed ? React.createElement("p", { className: "dsci_failed", role: "status" }, t("saveFailed")) : null,
              React.createElement("button", {
                type: "button",
                className: "dsci_discard",
                disabled: !state.dirty || state.saving,
                onClick: props.discard
              }, t("discard")),
              React.createElement("button", {
                type: "button",
                className: "dsci_save",
                disabled: blocked,
                onClick: props.save
              }, t(state.saving ? "saving" : "save"))
            )
          )
        : null
    );
  }

  // ── plugin body ───────────────────────────────────────────────────────────
  /** Namespace of the instant-compaction settings section (Host side registers it). */
  var SETTINGS_NAMESPACE = "compaction-instant";
  /** Required services (cordis fiber inject). */
  var inject = ["slots", "locale", "connection", "remote", "settingsScope"];

  function apply(ctx) {
    var t = ctx.locale.bind(NS);
    ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, "compaction-instant: settings dictionary");
    var controller = new CardController(ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }), [
      numberField("checkpointScale"),
      numberField("checkpointCap"),
      numberField("maxTokens"),
      booleanField("auto"),
      booleanField("debug"),
      textField("debugLogPath")
    ]);
    var store = controller.bind(function () {
      var shell = controller.shell();
      return {
        ...shell,
        checkpointScale: controller.field("checkpointScale"),
        checkpointCap: controller.field("checkpointCap"),
        maxTokens: controller.field("maxTokens"),
        auto: controller.field("auto"),
        debug: controller.field("debug"),
        debugLogPath: controller.field("debugLogPath")
      };
    });
    ctx.slots.inject("settings.plugin.item", function* () {
      yield ctx.slots.register({
        name: "settings.plugin.item",
        id: "compaction-instant",
        order: 30,
        locale: NS,
        inject: function () {
          return {
            hooks: { compactionCard: store },
            ...controller.actions()
          };
        }
      }, CompactionCard);
    });
  }

  exports.apply = apply;
  exports.inject = inject;
  return module.exports;
}

window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-compaction-basic",
  factory: instantCompactionClientFactory
});
window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-compaction-instant",
  factory: instantCompactionClientFactory
});
