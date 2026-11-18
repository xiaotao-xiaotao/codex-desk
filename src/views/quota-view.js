/**
 * 悬浮额度球只展示当前主额度窗口；账户页的额度详情由多账户额度卡负责。
 */
export function createQuotaView({ t, getLocale, formatQuotaWindow, getAlertLevel }) {
  const orb = document.querySelector("#quota-orb");
  const orbValue = document.querySelector("#orb-value");
  const orbLabel = document.querySelector("#orb-label");
  const orbReset = document.querySelector("#orb-reset");
  let resetAt = null;
  let resetFailed = false;

  function renderHighlightedNumbers(element, text) {
    if (element.textContent === text) return;
    const parts = text.split(/(\p{Nd}+(?:[.,]\p{Nd}+)*)/u);
    element.replaceChildren(...parts.map((part, index) => {
      if (index % 2 === 0) return part;
      const number = document.createElement("span");
      number.className = "orb-number";
      number.textContent = part;
      return number;
    }));
  }

  function renderReset() {
    orbReset.hidden = !resetFailed && resetAt === null;
    if (orbReset.hidden) {
      orbReset.textContent = "";
      orbReset.title = "";
      return;
    }
    let text;
    if (resetFailed) {
      text = t("orbResetUnknown");
    } else {
      const remainingMs = resetAt * 1_000 - Date.now();
      if (remainingMs <= 0) {
        text = t("orbResetNow");
      } else if (remainingMs < 60_000) {
        text = t("orbResetSoon");
      } else {
        const minutes = Math.ceil(remainingMs / 60_000);
        const value = new Intl.NumberFormat(getLocale(), { style: "unit", unit: "minute", unitDisplay: "short" }).format(minutes);
        text = t("orbResetIn", { value });
      }
    }
    renderHighlightedNumbers(orbReset, text);
    orbReset.title = text;
  }

  function roundedPercent(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
      ? Math.round(value) : null;
  }

  function render(quota = {}) {
    const primary = quota.windows?.[0];
    const timestamp = Number(primary?.resetsAt);
    resetAt = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
    resetFailed = false;
    renderReset();
    const remaining = roundedPercent(primary?.remainingPercent);
    const alertLevel = getAlertLevel(primary?.usedPercent);
    if (alertLevel) orb.dataset.alertLevel = String(alertLevel);
    else delete orb.dataset.alertLevel;
    orbValue.textContent = remaining === null ? "--" : `${remaining}%`;
    renderHighlightedNumbers(orbLabel, primary ? formatQuotaWindow(primary.durationMinutes, { compact: true }) : t("remaining"));
    orb.style.setProperty("--quota-progress", `${remaining === null ? 0 : remaining}%`);
    orb.classList.toggle("is-unavailable", remaining === null);
    orbValue.title = remaining === null ? t("quotaDataUnavailable") : "";
  }

  function showReadFailure(showOrbWarning) {
    if (!showOrbWarning) return;
    resetAt = null;
    resetFailed = true;
    renderReset();
    orbValue.textContent = "!";
    orbLabel.textContent = t("unknown");
    orb.classList.add("is-unavailable");
    delete orb.dataset.alertLevel;
    orb.style.setProperty("--quota-progress", "0%");
  }

  return { render, renderReset, showReadFailure };
}
