/**
 * 环境诊断弹窗负责自身状态和 DOM 渲染；入口层只注入 Tauri 调用和通用的复制能力。
 * 这样既不会让 main.js 混入弹窗细节，也能在单独测试/替换诊断来源时保持界面不变。
 */
export function createDiagnosticsDialogView({ t, invoke, copyText, quotaAlerts, getLatestQuota }) {
  const openButton = document.querySelector("#diagnostics-button");
  const dialog = document.querySelector("#diagnostics-dialog");
  const closeButton = document.querySelector("#diagnostics-close");
  const results = document.querySelector("#diagnostics-results");
  const errorMessage = document.querySelector("#diagnostics-error");
  const runButton = document.querySelector("#diagnostics-run");
  const copyButton = document.querySelector("#diagnostics-copy");
  const alertsDescription = document.querySelector("#quota-alerts-description");
  const alertsToggle = document.querySelector("#quota-alerts-toggle");
  let latestDiagnostics = null;
  let checking = false;

  function render() {
    openButton.title = openButton.ariaLabel = t("openDiagnostics");
    closeButton.ariaLabel = t("closeDiagnostics");
    runButton.textContent = checking ? t("diagnosticsChecking") : t("runDiagnostics");
    runButton.disabled = checking;
    renderCopyTextButton(copyButton, { label: t("copyDiagnostics") });
    copyButton.disabled = !latestDiagnostics || checking;
    alertsDescription.textContent = quotaAlerts.isEnabled() ? t("quotaAlertsEnabled") : t("quotaAlertsDisabled");
    alertsToggle.textContent = quotaAlerts.isEnabled() ? t("disableQuotaAlerts") : t("enableQuotaAlerts");

    results.replaceChildren();
    if (checking) {
      results.textContent = t("diagnosticsChecking");
      errorMessage.hidden = true;
      return;
    }
    if (!latestDiagnostics) return;

    const rows = [
      [t("diagnosticCli"), latestDiagnostics.cliVersion ? t("diagnosticVersion", { version: latestDiagnostics.cliVersion }) : t("diagnosticUnavailable"), Boolean(latestDiagnostics.cliVersion)],
      [t("diagnosticAppServer"), latestDiagnostics.appServerReady ? t("diagnosticReady") : t("diagnosticUnavailable"), latestDiagnostics.appServerReady],
      [t("diagnosticQuota"), latestDiagnostics.quotaAvailable ? t("diagnosticReady") : t("diagnosticUnavailable"), latestDiagnostics.quotaAvailable],
    ];
    for (const [label, value, success] of rows) {
      const row = document.createElement("div");
      row.className = "diagnostic-row";
      const name = document.createElement("span");
      name.textContent = label;
      const status = document.createElement("strong");
      status.className = success ? "is-ready" : "is-unavailable";
      status.textContent = value;
      row.append(name, status);
      results.append(row);
    }
    errorMessage.hidden = !latestDiagnostics.error;
    errorMessage.textContent = latestDiagnostics.error
      ? `${latestDiagnostics.error} ${t("diagnosticAdvice")}`
      : "";
  }

  async function run() {
    if (checking) return;
    checking = true;
    render();
    try {
      latestDiagnostics = await invoke("diagnose_codex");
    } catch (error) {
      // 诊断入口本身异常时仍展示统一的三项失败结果，便于用户复制给维护者。
      latestDiagnostics = { cliVersion: null, appServerReady: false, quotaAvailable: false, error: String(error) };
    } finally {
      checking = false;
      render();
    }
  }

  function diagnosticsText() {
    if (!latestDiagnostics) return "";
    return [
      `Codex CLI: ${latestDiagnostics.cliVersion ?? t("diagnosticUnavailable")}`,
      `${t("diagnosticAppServer")}: ${latestDiagnostics.appServerReady ? t("diagnosticReady") : t("diagnosticUnavailable")}`,
      `${t("diagnosticQuota")}: ${latestDiagnostics.quotaAvailable ? t("diagnosticReady") : t("diagnosticUnavailable")}`,
      latestDiagnostics.error ?? "",
    ].filter(Boolean).join("\n");
  }

  async function copyDiagnostics() {
    try {
      await copyText(diagnosticsText());
      renderCopyTextButton(copyButton, { label: t("diagnosticsCopied"), state: "copied" });
    } catch {
      renderCopyTextButton(copyButton, { label: t("copyFailedLong"), state: "failed" });
    }
    window.setTimeout(render, 1_500);
  }

  function open() {
    if (!dialog.open) dialog.showModal();
    void run();
  }

  openButton.addEventListener("click", open);
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  runButton.addEventListener("click", run);
  copyButton.addEventListener("click", copyDiagnostics);
  alertsToggle.addEventListener("click", async () => {
    const updated = await quotaAlerts.toggle();
    // 用户在高用量时才开启提醒，也应立即收到当前阈值提示，而非必须等待下一轮自动刷新。
    if (updated && quotaAlerts.isEnabled()) await quotaAlerts.notify(getLatestQuota());
    render();
  });

  return { updateLanguage: render };
}
import { renderCopyTextButton } from "../utils/copy-icon-button.js";
