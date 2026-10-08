import { renderCloseIconButton } from "../utils/close-icon-button.js";
import { displayEmail } from "../utils/email-privacy.js";

const ICONS = {
  switch: '<path d="M4 8h15l-3-3M20 16H5l3 3"/>',
  save: '<path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
  login: '<path d="M14 4h6v16h-6M3 12h12m-4-4 4 4-4 4"/>',
  edit: '<path d="m15 4 5 5M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15v5Z"/>',
  remove: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  account: '<circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
  codex: '<circle cx="12" cy="12" r="4"/><path d="M8 3h8l5 7-3 10H6L3 10z"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const SUCCESS_NOTICE_DURATION_MS = 4000;
const LOGIN_POLL_INTERVAL_MS = 1000;

/** 只接收账户摘要；所有名称/邮箱通过 textContent 渲染，凭据不进入 DOM。 */
export function createAccountSwitchView({ t, invoke, getHideEmails = () => false, onOpen, onBeforeSwitch, onAfterSwitch }) {
  const page = document.querySelector("#accounts-section");
  const navigation = document.querySelector("#nav-accounts");
  const newAccountBadge = navigation.querySelector(".accounts-new-badge");
  const trigger = document.querySelector("#account-switch-open");
  const triggers = [...document.querySelectorAll("[data-open-account-switch]")];
  let returnFocus = trigger;
  const dialog = document.createElement("dialog");
  dialog.className = "account-switch-dialog";
  dialog.id = "accounts-dialog";
  dialog.setAttribute("aria-labelledby", "accounts-editor-title");
  dialog.innerHTML = `
    <header class="accounts-header">
      <button class="close-icon-button accounts-close" type="button"></button>
    </header>
    <div class="accounts-content app-scrollable">
      <p class="accounts-intro"></p>
      <div class="accounts-feedback" role="status" hidden></div>
      <div class="accounts-list-pane">
        <div class="accounts-current"><div><span class="accounts-current-caption"></span><strong class="accounts-current-email"></strong></div><button class="accounts-button accounts-save" type="button">${icon("save")}<span></span></button></div>
        <div class="accounts-list-heading"><h3></h3><span class="accounts-count"></span><button class="accounts-row-button accounts-reload" type="button">${icon("switch")}</button></div>
        <div class="accounts-list" aria-busy="false"></div>
        <div class="accounts-storage" hidden><p></p><button class="accounts-button accounts-enable" type="button"></button></div>
      </div>
      <form class="accounts-editor" hidden>
        <button class="accounts-back" type="button">${icon("back")}<span></span></button>
        <h3 id="accounts-editor-title" class="accounts-editor-title"></h3><p class="accounts-editor-description"></p>
        <fieldset class="accounts-login-methods" hidden>
          <legend></legend>
          <label><input type="radio" name="accounts-login-method" value="browser" checked /><span data-login-method="browser"></span></label>
          <label><input type="radio" name="accounts-login-method" value="device" /><span data-login-method="device"></span></label>
        </fieldset>
        <div class="accounts-name-field">
          <label class="accounts-name-label" for="accounts-name"></label>
          <input id="accounts-name" class="accounts-name-input" maxlength="48" autocomplete="off" required />
        </div>
        <section class="accounts-login-panel" hidden aria-live="polite">
          <strong class="accounts-login-status"></strong><p class="accounts-login-detail"></p>
          <div class="accounts-device-code" hidden><span></span><div><code></code><button class="accounts-button accounts-device-copy" type="button"></button></div></div>
          <ol class="accounts-login-steps"><li></li><li></li><li></li></ol>
          <button class="accounts-button accounts-login-browser" type="button"></button>
        </section>
        <div class="accounts-target" hidden><span class="accounts-avatar"></span><div><strong></strong><span></span></div></div>
        <label class="accounts-restart" hidden><input type="checkbox" /><div><strong></strong><span></span></div></label>
        <div class="accounts-editor-actions"><button class="cancel-button accounts-cancel" type="button"></button><button class="thread-action-button thread-action-button-primary accounts-submit" type="submit"></button></div>
      </form>
    </div>
    <footer class="accounts-footer"><span></span></footer>`;
  document.body.append(dialog);
  // 列表常驻独立栏目，只有会修改凭据或账户的操作进入确认弹窗。
  page.innerHTML = `<header class="accounts-page-header"><div class="accounts-page-context"></div></header>`;
  const pageHeader = page.querySelector(".accounts-page-header");
  pageHeader.querySelector(".accounts-page-context").append(dialog.querySelector(".accounts-intro"), dialog.querySelector(".accounts-current"));
  pageHeader.querySelector(".accounts-intro").hidden = true;
  pageHeader.append(page.querySelector(".accounts-save"));
  const headerActions = document.createElement("div");
  headerActions.className = "accounts-header-actions";
  const loginButton = document.createElement("button");
  loginButton.type = "button";
  loginButton.className = "accounts-button accounts-login";
  loginButton.innerHTML = `${icon("login")}<span></span>`;
  headerActions.append(page.querySelector(".accounts-save"), loginButton);
  pageHeader.append(headerActions);
  page.append(dialog.querySelector(".accounts-feedback"), dialog.querySelector(".accounts-list-pane"), dialog.querySelector(".accounts-footer"));
  page.querySelector(".accounts-list-heading h3").after(page.querySelector(".accounts-footer"));
  const flow = document.createElement("details");
  flow.className = "accounts-flow";
  flow.setAttribute("aria-labelledby", "accounts-flow-title");
  flow.innerHTML = `
    <summary class="accounts-flow-heading"><span id="accounts-flow-title" class="accounts-flow-kicker" data-account-flow-i18n="accountsFlowKicker"></span><span class="accounts-flow-local" data-account-flow-i18n="accountsFlowLocal"></span><span class="accounts-flow-toggle disclosure-chevron" aria-hidden="true"></span></summary>
    <div class="accounts-flow-body">
    <div class="accounts-flow-scene" aria-hidden="true">
      <div class="accounts-scene-line"></div>
      <div class="accounts-scene-card accounts-scene-source">${icon("account")}<strong data-account-flow-i18n="accountsFlowSaved"></strong><small class="accounts-flow-current-label"></small></div>
      <div class="accounts-scene-hub">${icon("switch")}<small data-account-flow-i18n="accountsFlowSwitchLocal"></small></div>
      <div class="accounts-scene-card accounts-scene-target"><span class="accounts-scene-check">✓</span><strong>Codex</strong><small data-account-flow-i18n="accountsFlowSceneTarget"></small></div>
      <div class="accounts-scene-route"><div class="accounts-scene-runner"><code>auth.json</code><svg class="accounts-scene-brand" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" opacity=".22"/><path d="M12 3a9 9 0 1 1-8.6 6.3M12 7.5V12l3.5 2"/></svg></div></div>
    </div>
    <div class="accounts-scene-progress" aria-hidden="true"><span data-account-flow-i18n="accountsFlowStepOne"></span><span data-account-flow-i18n="accountsFlowStepTwo"></span><span data-account-flow-i18n="accountsFlowStepThree"></span></div>
    <ol class="accounts-flow-steps">
      <li><b aria-hidden="true">${icon("account")}</b><div><strong data-account-flow-i18n="accountsFlowSaved"></strong><small class="accounts-flow-saved-count"></small></div></li>
      <li><b aria-hidden="true">${icon("switch")}</b><div><strong>Codex Desk</strong><small data-account-flow-i18n="accountsFlowValidate"></small></div></li>
      <li><b aria-hidden="true">${icon("file")}</b><div><strong>auth.json</strong><small data-account-flow-i18n="accountsFlowAuthLocation"></small></div></li>
      <li><b aria-hidden="true">${icon("codex")}</b><div><strong>Codex</strong><small data-account-flow-i18n="accountsFlowApplyHint"></small></div></li>
    </ol>
    <details class="accounts-flow-details">
      <summary><span class="accounts-flow-privacy" data-account-flow-i18n="accountsFlowPrivacy"></span><span class="accounts-flow-details-link"><span data-account-flow-i18n="accountsFlowDetails"></span><span class="accounts-flow-chevron disclosure-chevron" aria-hidden="true"></span></span></summary>
      <div class="accounts-flow-expanded">
      <p class="accounts-flow-read">${icon("switch")}<span data-account-flow-i18n="accountsFlowRead"></span></p>
      <div class="accounts-flow-branches">
        <div><b class="accounts-flow-marker">+1</b><strong data-account-flow-i18n="accountsFlowNew"></strong><p data-account-flow-i18n="accountsFlowNewHint"></p></div>
        <div><b class="accounts-flow-marker accounts-flow-dot" aria-hidden="true"></b><strong data-account-flow-i18n="accountsFlowChanged"></strong><p data-account-flow-i18n="accountsFlowChangedHint"></p></div>
      </div>
      <p class="accounts-flow-note" data-account-flow-i18n="accountsFlowNote"></p>
      </div>
    </details>
    </div>`;
  page.querySelector(".accounts-list-heading").before(flow);
  const dialogFeedback = document.createElement("div");
  dialogFeedback.className = "accounts-feedback";
  dialogFeedback.setAttribute("role", "status");
  dialogFeedback.hidden = true;
  // 提示留在标题说明之后，避免新增错误内容占用右上角关闭按钮所在的标题区域。
  dialog.querySelector(".accounts-editor-description").after(dialogFeedback);
  const find = (selector) => dialog.querySelector(selector) ?? page.querySelector(selector);
  const listPane = find(".accounts-list-pane");
  const editor = find(".accounts-editor");
  const feedbacks = [dialogFeedback, page.querySelector(".accounts-feedback")];
  const input = find(".accounts-name-input");
  const restartCheckbox = find(".accounts-restart input");
  const list = find(".accounts-list");
  let snapshot = null;
  let action = null;
  let busy = false;
  let loading = false;
  let notice = null;
  let requestVersion = 0;
  let feedbackTimer = null;
  let checking = false;
  let loginSession = null;
  let loginTimer = null;

  function renderAccountHint() {
    const unsaved = Boolean(snapshot?.canSaveCurrent && !snapshot.accounts.some((account) => account.selected));
    const changed = Boolean(snapshot?.canSaveCurrent && snapshot.currentCredentialsChanged);
    const hint = t(unsaved ? "accountsUnsavedHint" : "accountsCredentialsChangedHint");
    newAccountBadge.hidden = !unsaved && !changed;
    newAccountBadge.classList.toggle("is-credentials-changed", changed && !unsaved);
    newAccountBadge.textContent = unsaved ? "+1" : "";
    newAccountBadge.title = hint;
    navigation.setAttribute("aria-label", unsaved || changed ? `${t("accountsTitle")}，${hint}` : t("accountsTitle"));
    navigation.title = unsaved || changed ? hint : t("accountsTitle");
    find(".accounts-current-caption").textContent = t(unsaved ? "accountsUnsavedCaption" : changed ? "accountsCredentialsChangedCaption" : "accountsCurrentCaption");
    find(".accounts-save span").textContent = t(changed ? "accountsUpdateSave" : "accountsSave");
  }

  async function checkCurrentAccount() {
    if (checking || busy || loading || dialog.open || document.hidden) return;
    checking = true;
    const version = requestVersion;
    try {
      const result = await invoke("list_saved_accounts");
      // 保存/切换与主动刷新优先，后台检查不能覆盖操作后的账户状态。
      if (version !== requestVersion || busy || loading || dialog.open) return;
      if (JSON.stringify(result) !== JSON.stringify(snapshot)) {
        snapshot = result;
        renderList();
      }
      renderAccountHint();
    } catch {
      // 文件可能正在被 CLI 替换，清除过期提示，下一轮继续检查。
      if (version === requestVersion && !busy && !loading && !dialog.open) {
        newAccountBadge.hidden = true;
        navigation.setAttribute("aria-label", t("accountsTitle"));
        navigation.title = t("accountsTitle");
      }
    } finally {
      checking = false;
    }
  }

  function setFeedback(key, values = {}, kind = "success") {
    window.clearTimeout(feedbackTimer);
    feedbackTimer = null;
    notice = key ? { key, values, kind } : null;
    feedbacks.forEach((feedback) => {
      feedback.hidden = !notice;
      feedback.dataset.kind = kind;
      feedback.textContent = notice ? t(key, values) : "";
    });
    // 常规成功提示自动收起；错误和待处理的服务状态保留，方便用户处理。
    if (notice && kind === "success" && !action) {
      feedbackTimer = window.setTimeout(() => setFeedback(null), SUCCESS_NOTICE_DURATION_MS);
    }
  }

  function setBusy(value) {
    busy = value;
    if (value) requestVersion += 1;
    dialog.setAttribute("aria-busy", String(value));
    dialog.querySelectorAll("button, input").forEach((element) => { element.disabled = value; });
    page.querySelectorAll("button").forEach((element) => { element.disabled = value; });
    if (!value) renderList();
    renderEditor();
  }

  function showEditor(kind, account = null) {
    if (busy || loading || dialog.open) return;
    action = { kind, account };
    if (kind === "login") find('[name="accounts-login-method"][value="browser"]').checked = true;
    returnFocus = document.activeElement;
    editor.hidden = false;
    setFeedback(null);
    input.value = account?.label ?? (kind === "save" ? snapshot?.accounts.find((saved) => saved.selected)?.label : null) ?? snapshot?.currentEmail?.split("@")[0] ?? "";
    restartCheckbox.checked = true;
    renderEditor();
    dialog.showModal();
    (kind === "save" || kind === "rename" || kind === "login" ? input : find(".accounts-submit")).focus();
    if (kind === "rename") input.select();
  }

  function showList() {
    action = null;
    editor.hidden = true;
    find(".accounts-device-code code").textContent = "";
    find(".accounts-device-code").hidden = true;
    listPane.hidden = false;
    renderList();
    if (dialog.open) dialog.close();
  }

  function renderEditor() {
    if (!action) return;
    const { kind, account } = action;
    editor.classList.toggle("is-login", kind === "login");
    find(".accounts-login-methods").hidden = kind !== "login" || Boolean(loginSession);
    const named = kind === "save" || kind === "rename" || (kind === "login" && !loginSession);
    find(".accounts-name-field").hidden = !named;
    input.hidden = find(".accounts-name-label").hidden = !named;
    input.required = named && kind !== "login";
    find(".accounts-name-label").textContent = t(kind === "login" ? "accountsLoginNameLabel" : "accountsNameLabel");
    input.placeholder = t(kind === "login" ? "accountsLoginNamePlaceholder" : "accountsNamePlaceholder");
    find(".accounts-target").hidden = !account;
    find(".accounts-restart").hidden = kind !== "switch";
    find(".accounts-editor-title").textContent = t(`accounts${kind[0].toUpperCase() + kind.slice(1)}Title`);
    // 常规账户操作由正文说明即可；隐藏标题仅作为弹窗的无障碍名称。
    find(".accounts-editor-title").hidden = kind !== "enable";
    find(".accounts-editor-description").textContent = t(`accounts${kind[0].toUpperCase() + kind.slice(1)}Hint`);
    if (kind === "login" && selectedLoginMethod() === "device") find(".accounts-editor-description").textContent = t("accountsLoginDeviceHint");
    if (kind === "save" && snapshot?.currentCredentialsChanged) {
      find(".accounts-editor-title").textContent = t("accountsUpdateSave");
      find(".accounts-editor-description").textContent = t("accountsCredentialsUpdateHint");
    }
    if (account) {
      find(".accounts-target strong").textContent = account.label;
      find(".accounts-target div > span").textContent = displayEmail(account.email, getHideEmails()) ?? t("accountsEmailUnknown");
      find(".accounts-target .accounts-avatar").textContent = [...account.label][0]?.toUpperCase() ?? "C";
    }
    const submit = find(".accounts-submit");
    submit.hidden = kind === "login" && Boolean(loginSession);
    find(".accounts-login-panel").hidden = kind !== "login";
    if (kind === "login") renderLogin();
    submit.textContent = t(busy ? "accountsWorking" : kind === "login" && selectedLoginMethod() === "device" ? "accountsLoginDeviceConfirm" : kind === "switch" && restartCheckbox.checked ? "accountsSwitchRestart" : `accounts${kind[0].toUpperCase() + kind.slice(1)}Confirm`);
  }

  function button(labelKey, iconName, handler, className = "") {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `accounts-row-button ${className}`;
    element.title = element.ariaLabel = t(labelKey);
    element.innerHTML = icon(iconName);
    element.addEventListener("click", handler);
    return element;
  }

  function renderList() {
    renderAccountHint();
    flow.querySelector(".accounts-flow-current-label").textContent = snapshot?.accounts.find((account) => account.selected)?.label ?? t("accountsFlowSelect");
    flow.querySelector(".accounts-flow-current-label").title = flow.querySelector(".accounts-flow-current-label").textContent;
    flow.querySelector(".accounts-flow-saved-count").textContent = t("accountsCount", { count: snapshot?.accounts.length ?? 0 });
    find(".accounts-current-email").textContent = loading ? t("accountsLoading") : displayEmail(snapshot?.currentEmail, getHideEmails()) ?? t("accountsCurrentUnknown");
    find(".accounts-save").disabled = busy || loading || !snapshot?.canSaveCurrent;
    loginButton.disabled = busy || loading || Boolean(loginSession);
    find(".accounts-reload").disabled = busy || loading;
    find(".accounts-enable").disabled = busy || loading;
    find(".accounts-count").textContent = t("accountsCount", { count: snapshot?.accounts?.length ?? 0 });
    find(".accounts-storage").hidden = !snapshot || snapshot.storageMode === "file";
    list.setAttribute("aria-busy", String(loading));
    list.replaceChildren();
    if (loading || !snapshot?.accounts?.length) {
      const empty = document.createElement("div");
      empty.className = "accounts-empty";
      empty.innerHTML = `<span class="accounts-empty-icon">${icon("switch")}</span><strong></strong><p></p>`;
      empty.querySelector("strong").textContent = t(loading ? "accountsLoading" : "accountsEmptyTitle");
      empty.querySelector("p").textContent = t(loading ? "accountsLoadingHint" : "accountsEmptyHint");
      list.append(empty);
      return;
    }
    for (const account of snapshot.accounts) {
      const row = document.createElement("article");
      row.className = `accounts-row${account.selected ? " is-selected" : ""}`;
      row.innerHTML = '<span class="accounts-avatar"></span><div class="accounts-row-info"><div><strong></strong><span class="accounts-selected-badge" hidden></span></div><span class="accounts-row-email"></span></div><div class="accounts-row-actions"></div>';
      row.querySelector(".accounts-avatar").textContent = [...account.label][0]?.toUpperCase() ?? "C";
      row.querySelector("strong").textContent = account.label;
      row.querySelector("strong").title = account.label;
      row.querySelector(".accounts-row-email").textContent = displayEmail(account.email, getHideEmails()) ?? t("accountsEmailUnknown");
      row.querySelector(".accounts-row-email").title = getHideEmails() ? "" : account.email ?? "";
      const badge = row.querySelector(".accounts-selected-badge");
      badge.hidden = !account.selected;
      badge.textContent = t("accountsSelected");
      const actions = row.querySelector(".accounts-row-actions");
      const switchButton = document.createElement("button");
      switchButton.type = "button";
      switchButton.className = "accounts-button accounts-row-switch";
      switchButton.textContent = t(account.selected ? "accountsReconnect" : "accountsSwitch");
      switchButton.disabled = busy || snapshot.storageMode !== "file";
      switchButton.addEventListener("click", () => showEditor("switch", account));
      actions.append(switchButton, button("accountsRename", "edit", () => showEditor("rename", account)), button("accountsRemove", "remove", () => showEditor("remove", account), "accounts-row-remove"));
      actions.querySelectorAll("button").forEach((b) => { if (busy) b.disabled = true; });
      list.append(row);
    }
  }

  async function refresh() {
    const version = ++requestVersion;
    loading = true; renderList();
    try {
      const result = await invoke("list_saved_accounts");
      if (version === requestVersion) snapshot = result;
    } catch (error) {
      if (version === requestVersion) { snapshot = null; setFeedback("accountsFailed", { error: String(error) }, "error"); }
    } finally {
      if (version === requestVersion) { loading = false; renderList(); }
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || !action || (action.kind === "login" && loginSession)) return;
    const { kind, account } = action;
    const label = input.value.trim();
    if ((kind === "save" || kind === "rename" || kind === "login") && ((!label && kind !== "login") || [...label].length > 48 || /[\u0000-\u001f\u007f]/.test(label))) {
      setFeedback("accountsNameInvalid", {}, "error"); input.focus(); return;
    }
    const restart = restartCheckbox.checked;
    setFeedback(null); setBusy(true);
    let changed = false;
    try {
      if (kind === "login") {
        loginSession = await invoke("start_account_login", { label, method: selectedLoginMethod() });
        scheduleLoginPoll();
      } else if (kind === "switch") {
        await onBeforeSwitch();
        const result = await invoke("switch_saved_account", { id: account.id, restart });
        changed = true;
        snapshot = result.snapshot ?? snapshot;
        showList();
        // 正常切换由账户信息变化体现，仅在服务未启动时提示异常。
        if (result.restart === "startFailed") setFeedback("accountsRestartFailed", {}, "pending");
        // 服务同步失败不能把已经完成的凭据切换报告成失败。
        try { await onAfterSwitch({ changed: true, restarted: result.restart === "restarted" }); }
        catch { setFeedback("accountsSyncFailed", {}, "pending"); }
      } else {
        const commands = { save: "save_current_account", rename: "rename_saved_account", remove: "remove_saved_account", enable: "enable_account_file_storage" };
        snapshot = await invoke(commands[kind], { ...(account ? { id: account.id } : {}), ...(kind === "save" || kind === "rename" ? { label } : {}) });
        showList(); setFeedback(kind === "remove" ? "accountsRemoved" : kind === "enable" ? "accountsFileEnabled" : "accountsSaved");
      }
    } catch (error) {
      setFeedback("accountsFailed", { error: String(error) }, "error");
      if (kind === "switch" && !changed) await onAfterSwitch({ changed: false, restarted: false });
    } finally {
      setBusy(false);
      if (action) (action.kind === "login" ? loginSession ? find(".accounts-cancel") : input : action.kind === "save" || action.kind === "rename" ? input : find(".accounts-submit")).focus();
      else find(".accounts-save").focus();
    }
  }

  function selectedLoginMethod() {
    return loginSession?.method ?? find('[name="accounts-login-method"]:checked')?.value ?? "browser";
  }

  function renderLogin() {
    const phase = loginSession?.phase ?? "ready";
    const waiting = phase === "waiting";
    const saving = phase === "saving";
    const device = selectedLoginMethod() === "device";
    const panel = find(".accounts-login-panel");
    panel.dataset.phase = phase;
    find(".accounts-login-status").textContent = t(saving ? "accountsLoginSaving" : waiting ? device ? "accountsDeviceWaiting" : "accountsLoginWaiting" : loginSession ? "accountsLoginPreparing" : device ? "accountsDeviceReady" : "accountsLoginReady");
    find(".accounts-login-detail").textContent = t(waiting ? device ? "accountsDeviceWaitingHint" : "accountsLoginWaitingHint" : "accountsLoginLocalHint");
    const codePanel = find(".accounts-device-code");
    codePanel.hidden = !device || !waiting || !loginSession?.userCode;
    codePanel.querySelector("code").textContent = codePanel.hidden ? "" : loginSession.userCode;
    codePanel.querySelector("span").textContent = t("accountsDeviceCodeLabel");
    find(".accounts-device-copy").textContent = t("copy");
    find(".accounts-device-copy").ariaLabel = t("accountsDeviceCopyLabel");
    find(".accounts-device-copy").disabled = busy;
    const steps = [device ? "accountsDeviceStepCode" : "accountsLoginStepName", "accountsLoginStepBrowser", "accountsLoginStepSave"];
    panel.querySelectorAll("li").forEach((step, index) => {
      step.textContent = t(steps[index]);
      const currentStep = saving ? 2 : waiting ? 1 : 0;
      step.classList.toggle("is-current", index === currentStep);
      step.classList.toggle("is-done", index < currentStep);
      if (index === currentStep) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
    const browser = find(".accounts-login-browser");
    browser.hidden = !waiting;
    browser.textContent = t(device ? "accountsDeviceOpen" : "accountsLoginReopen");
    browser.disabled = busy;
    find(".accounts-cancel").textContent = t(loginSession ? "accountsLoginCancel" : "accountsCancel");
  }

  function scheduleLoginPoll() {
    window.clearTimeout(loginTimer);
    if (loginSession) loginTimer = window.setTimeout(pollLogin, LOGIN_POLL_INTERVAL_MS);
  }

  async function pollLogin() {
    const sessionId = loginSession?.sessionId;
    if (!sessionId) return;
    try {
      const status = await invoke("read_account_login", { sessionId });
      if (loginSession?.sessionId !== sessionId || busy) return;
      const phaseChanged = loginSession.phase !== status.phase;
      loginSession = status;
      if (status.phase === "waiting" && status.error) setFeedback("accountsFailed", { error: status.error }, "error");
      if (["completed", "failed", "cancelled"].includes(status.phase)) {
        loginSession = null;
        if (status.phase === "completed") {
          await refresh();
          showList();
          setFeedback(status.error ? "accountsLoginCleanup" : "accountsLoginSaved", {}, status.error ? "pending" : "success");
        } else if (status.phase === "failed") {
          setFeedback("accountsFailed", { error: status.error }, "error");
        }
      }
      // 阶段不变时避免反复重绘 aria-live 与列表，减少读屏重复播报和焦点干扰。
      if (phaseChanged) renderEditor();
      if (!loginSession) renderList();
    } catch {
      if (loginSession?.sessionId === sessionId) setFeedback("accountsLoginStatusFailed", {}, "error");
    } finally {
      scheduleLoginPoll();
    }
  }

  async function closeEditor() {
    if (busy) return;
    if (loginSession) {
      const sessionId = loginSession.sessionId;
      setBusy(true);
      window.clearTimeout(loginTimer);
      try {
        await invoke("cancel_account_login", { sessionId });
        // 若取消与保存同时发生，仍以服务端结果为准，保留已完成的账户。
        const status = await invoke("read_account_login", { sessionId });
        loginSession = null;
        await refresh();
        showList();
        if (status.phase === "completed") setFeedback("accountsLoginSaved");
      } catch (error) {
        setFeedback("accountsFailed", { error: String(error) }, "error");
        scheduleLoginPoll();
      } finally { setBusy(false); }
    } else showList();
  }

  function updateLanguage() {
    flow.querySelectorAll("[data-account-flow-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.accountFlowI18n);
      if (element.classList.contains("accounts-flow-note")) element.title = element.textContent;
    });
    triggers.forEach((button) => { button.querySelector("span").textContent = t("accountsManage"); });
    find(".accounts-intro").textContent = t("accountsIntro");
    find(".accounts-current-caption").textContent = t("accountsCurrentCaption");
    find(".accounts-save span").textContent = t("accountsSave");
    loginButton.querySelector("span").textContent = t("accountsLoginTitle");
    find(".accounts-login-methods legend").textContent = t("accountsLoginMethodLabel");
    find('[data-login-method="browser"]').textContent = t("accountsLoginMethodBrowser");
    find('[data-login-method="device"]').textContent = t("accountsLoginMethodDevice");
    find(".accounts-list-heading h3").textContent = t("accountsListTitle");
    find(".accounts-reload").title = find(".accounts-reload").ariaLabel = t("refresh");
    find(".accounts-footer span").textContent = t("accountsLocalHint");
    find(".accounts-storage p").textContent = t("accountsStorageHint");
    find(".accounts-enable").textContent = t("accountsEnable");
    find(".accounts-name-label").textContent = t("accountsNameLabel");
    input.placeholder = t("accountsNamePlaceholder");
    find(".accounts-back span").textContent = t("accountsBack");
    find(".accounts-cancel").textContent = t("accountsCancel");
    find(".accounts-restart strong").textContent = t("accountsRestartLabel");
    find(".accounts-restart div > span").textContent = t("accountsRestartHint");
    renderCloseIconButton(find(".accounts-close"), { label: t("accountsClose") });
    if (notice) setFeedback(notice.key, notice.values, notice.kind);
    renderList(); renderEditor();
  }

  triggers.forEach((button) => {
    button.setAttribute("aria-controls", page.id);
    button.addEventListener("click", () => {
      onOpen();
      page.focus();
    });
  });
  find(".accounts-close").addEventListener("click", () => { void closeEditor(); });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); void closeEditor(); });
  dialog.addEventListener("close", () => {
    action = null;
    editor.hidden = true;
    const target = returnFocus?.isConnected ? returnFocus : find(".accounts-save");
    if (!target.disabled) target.focus();
  });
  find(".accounts-save").addEventListener("click", () => showEditor("save"));
  loginButton.addEventListener("click", () => {
    showEditor("login");
    input.value = "";
    input.focus();
  });
  find(".accounts-login-browser").addEventListener("click", async () => {
    if (!loginSession || busy) return;
    const browser = find(".accounts-login-browser");
    browser.disabled = true;
    try { await invoke("open_account_login_page", { sessionId: loginSession.sessionId }); setFeedback("accountsLoginOpened"); }
    catch (error) { setFeedback("accountsFailed", { error: String(error) }, "error"); }
    finally { browser.disabled = false; }
  });
  find(".accounts-login-methods").addEventListener("change", () => { setFeedback(null); renderEditor(); });
  find(".accounts-device-copy").addEventListener("click", async () => {
    if (!loginSession?.userCode || busy) return;
    const sessionId = loginSession.sessionId;
    try {
      await navigator.clipboard.writeText(loginSession.userCode);
      if (loginSession?.sessionId === sessionId) setFeedback("accountsDeviceCopied");
    } catch {
      if (loginSession?.sessionId === sessionId) setFeedback("copyFailedLong", {}, "error");
    }
  });
  find(".accounts-reload").addEventListener("click", () => { setFeedback(null); void refresh(); });
  find(".accounts-enable").addEventListener("click", () => showEditor("enable"));
  find(".accounts-cancel").addEventListener("click", () => { void closeEditor(); });
  find(".accounts-back").addEventListener("click", () => { void closeEditor(); });
  restartCheckbox.addEventListener("change", renderEditor);
  editor.addEventListener("submit", submit);
  updateLanguage();
  return { updateLanguage, checkCurrentAccount, activate: () => { if (!busy) { setFeedback(null); void refresh(); } } };
}
