/**
 * 悬浮额度球只展示当前主额度窗口；账户页的额度详情由多账户额度卡负责。
 */
export function createQuotaView({ t, formatQuotaWindow }) {
  const orb = document.querySelector("#quota-orb");
  const orbValue = document.querySelector("#orb-value");
  const orbLabel = document.querySelector("#orb-label");

  function formatOrbWindow(durationMinutes) {
    const minutes = Number(durationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return t("quotaWindow");
    return formatQuotaWindow(durationMinutes);
  }

  function roundedPercent(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
      ? Math.round(value) : null;
  }

  function render(quota = {}) {
    const primary = quota.windows?.[0];
    const remaining = roundedPercent(primary?.remainingPercent);
    orbValue.textContent = remaining === null ? "--" : `${remaining}%`;
    orbLabel.textContent = primary ? formatOrbWindow(primary.durationMinutes) : t("remaining");
    orb.style.setProperty("--quota-progress", `${remaining === null ? 0 : remaining}%`);
    orb.classList.toggle("is-unavailable", remaining === null);
    orbValue.title = remaining === null ? t("quotaDataUnavailable") : "";
  }

  function showReadFailure(showOrbWarning) {
    if (!showOrbWarning) return;
    orbValue.textContent = "!";
    orbLabel.textContent = t("unknown");
    orb.classList.add("is-unavailable");
    orb.style.setProperty("--quota-progress", "0%");
  }

  return { render, showReadFailure };
}
