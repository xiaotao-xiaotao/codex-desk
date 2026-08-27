/**
 * 额度重置时间是 Unix 秒，会话更新时间可能是秒或毫秒。
 * 在此统一归一化，避免各个视图自行判断时间单位和语言区域。
 */
export function createDateFormatters({ getLocale, t }) {
  const format = (date) => new Intl.DateTimeFormat(getLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  const formatResetTime = (timestamp) => {
    if (!timestamp) return t("resetUnknown");
    const date = new Date(Number(timestamp) * 1_000);
    return Number.isNaN(date.getTime()) ? t("resetUnknown") : t("resetTime", { value: format(date) });
  };

  const formatResetAt = (timestamp) => {
    if (!timestamp) return t("resetUnknown");
    const date = new Date(Number(timestamp) * 1_000);
    return Number.isNaN(date.getTime()) ? t("resetUnknown") : format(date);
  };

  const formatResetCountdown = (timestamp) => {
    if (!timestamp) return t("resetUnknown");
    const resetsAt = Number(timestamp) * 1_000;
    if (!Number.isFinite(resetsAt)) return t("resetUnknown");

    const minutes = Math.max(1, Math.ceil((resetsAt - Date.now()) / 60_000));
    const relative = new Intl.RelativeTimeFormat(getLocale(), { numeric: "always" });
    const countdown = minutes < 60
      ? relative.format(minutes, "minute")
      : minutes < 1_440
        ? relative.format(Math.ceil(minutes / 60), "hour")
        : relative.format(Math.ceil(minutes / 1_440), "day");
    return t("resetCountdown", { value: countdown });
  };

  const formatUpdated = (value) => {
    if (!value) return t("updatedUnknown");
    const timestamp = typeof value === "number" && value < 1_000_000_000_000 ? value * 1_000 : value;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? t("updatedUnknown") : format(date);
  };

  /**
   * 原生层只返回窗口持续分钟数，具体文案由前端根据当前语言生成。
   * 这避免服务数据夹带某一种界面语言，切换语言后可立即重新渲染。
   */
  const formatQuotaWindow = (durationMinutes) => {
    const minutes = Number(durationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return t("quotaWindow");
    if (minutes % 1_440 === 0) return t("quotaWindowDays", { count: minutes / 1_440 });
    if (minutes % 60 === 0) return t("quotaWindowHours", { count: minutes / 60 });
    return t("quotaWindowMinutes", { count: minutes });
  };

  return { formatQuotaWindow, formatResetAt, formatResetCountdown, formatResetTime, formatUpdated };
}
