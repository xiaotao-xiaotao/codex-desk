/**
 * 额度视图只负责把已读取的数据映射为 DOM，不负责请求、刷新倒计时或窗口状态。
 * 这种分层可保证刷新来源从 Tauri 或其他数据源切换时，界面代码无需改动。
 */
export function createQuotaView({ t, formatQuotaWindow, formatResetAt, formatResetCountdown }) {
  const orb = document.querySelector("#quota-orb");
  const orbValue = document.querySelector("#orb-value");
  const orbLabel = document.querySelector("#orb-label");
  const quotaList = document.querySelector("#quota-list");
  const resetCreditsRow = document.querySelector("#reset-credits-row");
  const resetCreditsSummary = document.querySelector("#reset-credits-summary");
  const resetCreditsInfo = document.querySelector("#reset-credits-info");
  const resetCreditsTooltip = document.querySelector("#reset-credits-tooltip");

  function formatOrbWindow(durationMinutes) {
    const minutes = Number(durationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return t("quotaWindow");
    if (minutes % 1_440 === 0) return t("compactQuotaWindowDays", { count: minutes / 1_440 });
    if (minutes % 60 === 0) return t("compactQuotaWindowHours", { count: minutes / 60 });
    return t("quotaWindowMinutes", { count: minutes });
  }

  function render(quota) {
    const primary = quota.windows?.[0];
    const remaining = primary ? Math.round(primary.remainingPercent) : null;
    orbValue.textContent = remaining === null ? "--" : `${remaining}%`;
    // 悬浮球只呈现当前主额度窗口，Pro 等无短周期额度时会自然回退为 7 天窗口。
    orbLabel.textContent = primary ? formatOrbWindow(primary.durationMinutes) : t("remaining");
    orb.style.setProperty("--quota-progress", `${remaining === null ? 0 : remaining}%`);
    const resetCredits = Number(quota.resetCredits ?? 0);
    const resetCreditDetails = Array.isArray(quota.resetCreditDetails) ? quota.resetCreditDetails : [];
    resetCreditsRow.hidden = resetCredits <= 0;
    if (resetCredits > 0) {
      resetCreditsSummary.textContent = t("resetCreditsCount", { count: resetCredits });
      resetCreditsInfo.setAttribute("aria-label", t("resetCreditsDescription"));
      resetCreditsTooltip.replaceChildren();
      const description = document.createElement("span");
      description.className = "reset-credits-tooltip-description";
      description.textContent = t("resetCreditsDescription");
      resetCreditsTooltip.append(description);
      for (let index = 0; index < resetCredits; index += 1) {
        const expiresAt = resetCreditDetails[index]?.expiresAt;
        const expiryText = expiresAt
          ? t("resetCreditExpires", { value: formatResetAt(expiresAt) })
          : t("resetCreditExpiresUnknown");
        const item = document.createElement("span");
        // 每次重置都单独呈现，避免多次权益被合并成一个无法判断到期日的数字。
        item.textContent = t("resetCreditTooltipItem", {
          index: index + 1,
          title: t("resetCreditsFullReset"),
          expires: expiryText,
        });
        resetCreditsTooltip.append(item);
      }
    }
    quotaList.replaceChildren();
    for (const window of (quota.windows || [])) {
      const remainingPercent = Math.round(window.remainingPercent);
      const progress = Math.max(0, Math.min(100, window.remainingPercent));
      const item = document.createElement("article");
      item.className = "quota-card";
      const quotaState = remainingPercent <= 10 ? "critical" : remainingPercent <= 20 ? "warning" : "normal";
      item.classList.add(`is-${quotaState}`);

      // 每个额度窗口都展示名称，避免首个窗口因复用标题区而与其他卡片层级不一致。
      const name = document.createElement("h3");
      name.textContent = formatQuotaWindow(window.durationMinutes);

      const value = document.createElement("div");
      value.className = "quota-value";
      const remainingValue = document.createElement("strong");
      remainingValue.textContent = `${remainingPercent}%`;
      const remainingLabel = document.createElement("span");
      remainingLabel.textContent = t("remaining");
      const used = document.createElement("span");
      used.className = "quota-used";
      used.textContent = `（${t("usedPercent", { used: Math.round(window.usedPercent) })}）`;
      if (quotaState !== "normal") {
        const alert = document.createElement("span");
        alert.className = "quota-alert";
        alert.textContent = t(quotaState === "critical" ? "quotaCritical" : "quotaWarning");
        value.append(remainingValue, remainingLabel, used, alert);
      } else {
        value.append(remainingValue, remainingLabel, used);
      }
      const track = document.createElement("div");
      track.className = "progress-track";
      const progressBar = document.createElement("span");
      progressBar.style.width = `${progress}%`;
      track.append(progressBar);
      const resetTime = document.createElement("p");
      resetTime.className = "quota-reset-time";
      resetTime.title = formatResetAt(window.resetsAt);
      const resetCountdown = document.createElement("strong");
      resetCountdown.className = "quota-reset-countdown";
      resetCountdown.textContent = formatResetCountdown(window.resetsAt);
      const resetAt = document.createElement("span");
      resetAt.className = "quota-reset-at";
      resetAt.textContent = formatResetAt(window.resetsAt);
      resetTime.append(resetCountdown, resetAt);
      item.append(name, value, track, resetTime);
      quotaList.append(item);
    }
  }

  function showReadFailure(hasPreviousQuota) {
    if (!hasPreviousQuota) orbValue.textContent = "!";
  }

  return { render, showReadFailure };
}
