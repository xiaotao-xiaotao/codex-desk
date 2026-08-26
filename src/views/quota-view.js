/**
 * 额度视图只负责把已读取的数据映射为 DOM，不负责请求、刷新倒计时或窗口状态。
 * 这种分层可保证刷新来源从 Tauri 或其他数据源切换时，界面代码无需改动。
 */
export function createQuotaView({ t, formatQuotaWindow, formatResetTime }) {
  const orb = document.querySelector("#quota-orb");
  const orbValue = document.querySelector("#orb-value");
  const quotaList = document.querySelector("#quota-list");
  const credits = document.querySelector("#credits");

  function render(quota) {
    const primary = quota.windows?.[0];
    const remaining = primary ? Math.round(primary.remainingPercent) : null;
    orbValue.textContent = remaining === null ? "--" : `${remaining}%`;
    orb.style.setProperty("--quota-progress", `${remaining === null ? 0 : remaining}%`);
    credits.hidden = !quota.resetCredits;
    credits.textContent = t("resetCredits", { credits: quota.resetCredits });

    quotaList.replaceChildren();
    for (const window of (quota.windows || [])) {
      const remainingPercent = Math.round(window.remainingPercent);
      const progress = Math.max(0, Math.min(100, window.remainingPercent));
      const item = document.createElement("article");
      item.className = "quota-card";

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
      value.append(remainingValue, remainingLabel, used);
      const track = document.createElement("div");
      track.className = "progress-track";
      const progressBar = document.createElement("span");
      progressBar.style.width = `${progress}%`;
      track.append(progressBar);
      const resetTime = document.createElement("p");
      resetTime.className = "quota-reset-time";
      resetTime.textContent = formatResetTime(window.resetsAt);
      item.append(name, value, track, resetTime);
      quotaList.append(item);
    }
  }

  function showReadFailure(hasPreviousQuota) {
    if (!hasPreviousQuota) orbValue.textContent = "!";
  }

  return { render, showReadFailure };
}
