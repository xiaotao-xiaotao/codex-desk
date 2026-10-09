import { copyText } from "../utils/clipboard.js";
import { renderCopyIconButton } from "../utils/copy-icon-button.js";

const COPY_FEEDBACK_MS = 1800;
const EXAMPLES = {
  file: 'cli_auth_credentials_store = "file"',
  http: 'model_provider = "openai_http"\n\n[model_providers.openai_http]\nname = "OpenAI HTTP only"\nwire_api = "responses"\nrequires_openai_auth = true\nsupports_websockets = false\nbase_url = "https://chatgpt.com/backend-api/codex"',
  reasoning: 'model_reasoning_effort = "medium"',
  search: 'web_search = "live"',
  verbosity: 'model_verbosity = "low"',
  notifications: '[tui]\nnotifications = true',
  permissions: 'approval_policy = "on-request"\nsandbox_mode = "workspace-write"',
  history: '[history]\npersistence = "save-all"',
};

/** 仅提供静态配置参考和摘要检测，前端不接收凭据内容，也不自动写入用户配置。 */
export function createCodexConfigView({ t, invoke, onOpenAccounts }) {
  const page = document.querySelector("#config-section");
  const text = (key) => `<span data-i18n="${key}"></span>`;
  const card = (example, title, body, note, required = false) => `<article class="config-card">
    ${title ? `<header class="config-card-heading"><h3>${text(title)}</h3>${required ? `<span class="config-required">${text("configRequired")}</span>` : ""}</header>` : ""}
    <p class="config-description">${text(body)}</p>
    <div class="config-code"><div class="config-code-toolbar"><span>TOML</span><button type="button" data-copy-config="${example}"></button></div><pre><code data-example="${example}"></code></pre></div>
    ${note ? `<p class="config-note">${text(note)}</p>` : ""}
  </article>`;
  page.innerHTML = `<header class="config-header"><p>${text("configIntro")}</p><button class="config-docs" type="button">${text("configReference")}</button></header>
    <div class="config-location"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h6l2 2h10v11H3zM3 7V4h7l2 3"/></svg><p>${text("configPath")}</p></div>
    <div class="config-controls"><div class="config-tabs" role="tablist" data-i18n-label="configTitle">
      ${[["accounts", "configAccounts"], ["connection", "configConnection"], ["preferences", "configPreferences"]].map(([id, label], index) => `<button id="config-tab-${id}" type="button" role="tab" data-config-tab="${id}" aria-controls="config-panel-${id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${text(label)}</button>`).join("")}
    </div><button class="config-mode" type="button" aria-live="polite"></button></div>
    <div id="config-panel-accounts" class="config-tab-panel" role="tabpanel" aria-labelledby="config-tab-accounts" tabindex="0">
      ${card("file", "configFileTitle", "configFileBody", "configFileNote", true)}
      <button class="config-accounts-link" type="button">${text("accountsManage")}</button>
    </div>
    <div id="config-panel-connection" class="config-tab-panel" role="tabpanel" aria-labelledby="config-tab-connection" tabindex="0" hidden>
      ${card("http", null, "configHttpBody", "configHttpNote")}
      <details class="config-field-details" open><summary>${text("configFields")}</summary><dl>
        ${[["model_provider", "configProviderHelp"], ["supports_websockets", "configSocketHelp"]].map(([key, help]) => `<div><dt><code>${key}</code></dt><dd>${text(help)}</dd></div>`).join("")}
      </dl></details>
    </div>
    <div id="config-panel-preferences" class="config-tab-panel config-preferences" role="tabpanel" aria-labelledby="config-tab-preferences" tabindex="0" hidden>
      ${card("reasoning", "configReasonTitle", "configReasonBody")}${card("search", "configSearchTitle", "configSearchBody")}${card("verbosity", "configVerbosityTitle", "configVerbosityBody")}${card("notifications", "configNotificationsTitle", "configNotificationsBody")}${card("permissions", "configPermissionTitle", "configPermissionBody")}${card("history", "configHistoryTitle", "configHistoryBody")}
    </div>
    <p class="config-merge-note">${text("configMerge")}</p><p class="config-feedback" role="status" aria-live="polite"></p>`;
  page.querySelectorAll("[data-example]").forEach(code => { code.textContent = EXAMPLES[code.dataset.example]; });
  const tabs = [...page.querySelectorAll("[data-config-tab]")];
  const feedback = page.querySelector(".config-feedback");
  const modeButton = page.querySelector(".config-mode");
  let storageMode = null;
  let checking = false;
  let checkVersion = 0;
  const copyStates = new Map();

  function renderMode() {
    const knownModes = ["file", "auto", "keyring", "unsupported"];
    const mode = knownModes.includes(storageMode) ? storageMode : null;
    modeButton.textContent = t(checking ? "configModeLoading" : mode === "file" ? "configModeFile" : mode ? "configModeOther" : "configModeUnknown", { mode });
    modeButton.classList.toggle("is-ready", mode === "file");
    modeButton.disabled = checking;
    modeButton.title = t("configCheck");
    modeButton.setAttribute("aria-label", `${modeButton.textContent} · ${t("configCheck")}`);
  }
  async function activate() {
    const version = ++checkVersion;
    checking = true;
    renderMode();
    try {
      const snapshot = await invoke("list_saved_accounts");
      if (version === checkVersion) storageMode = snapshot.storageMode;
    } catch {
      if (version === checkVersion) storageMode = null;
    } finally {
      if (version === checkVersion) { checking = false; renderMode(); }
    }
  }
  function selectTab(tab) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      page.querySelector(`#config-panel-${item.dataset.configTab}`).hidden = !selected;
    });
    feedback.textContent = "";
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[next]); tabs[next].focus();
    });
  });
  page.querySelectorAll("[data-copy-config]").forEach(button => {
    button.addEventListener("click", async () => {
      clearTimeout(copyStates.get(button)?.timer);
      button.disabled = true;
      let key = "copied";
      try { await copyText(EXAMPLES[button.dataset.copyConfig], t("clipboardDenied")); }
      catch { key = "copyFailed"; }
      renderCopyIconButton(button, { label: t(key), state: key === "copied" ? "copied" : "failed" });
      feedback.textContent = t(key);
      feedback.classList.toggle("is-error", key === "copyFailed");
      const timer = setTimeout(() => {
        copyStates.delete(button); button.disabled = false;
        renderCopyIconButton(button, { label: t("copy") });
        if (feedback.textContent === t(key)) feedback.textContent = "";
      }, COPY_FEEDBACK_MS);
      copyStates.set(button, { key, timer });
    });
  });
  page.querySelector(".config-docs").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    feedback.textContent = "";
    feedback.classList.remove("is-error");
    try { await invoke("open_codex_config_docs"); }
    catch { feedback.textContent = t("configDocsFailed"); feedback.classList.add("is-error"); }
    finally { button.disabled = false; }
  });
  page.querySelector(".config-accounts-link").addEventListener("click", onOpenAccounts);
  modeButton.addEventListener("click", activate);
  function updateLanguage() {
    page.querySelectorAll("[data-i18n]").forEach(element => { element.textContent = t(element.dataset.i18n); });
    page.querySelector(".config-tabs").setAttribute("aria-label", t("configTitle"));
    page.querySelectorAll("[data-copy-config]").forEach(button => {
      const key = copyStates.get(button)?.key;
      renderCopyIconButton(button, { label: t(key || "copy"), state: key === "copied" ? "copied" : key === "copyFailed" ? "failed" : "idle" });
    });
    feedback.textContent = "";
    renderMode();
  }
  updateLanguage();
  return { activate, updateLanguage };
}
