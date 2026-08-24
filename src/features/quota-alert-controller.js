import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { readStoredEnum, readStoredJson, writeStoredValue } from "../utils/browser-storage.js";

const ALERT_SETTING_KEY = "codex-desk-quota-alerts";
const ALERT_HISTORY_KEY = "codex-desk-quota-alert-history";
const ALERT_THRESHOLDS = [100, 90, 80];
const MAX_HISTORY_ENTRIES = 18;

/**
 * 管理额度提醒的权限、本机偏好和去重记录。
 *
 * 提醒记录按「重置时间 + 阈值」存储，而不是只记录当前使用率：同一轮额度中用户
 * 可能依次跨过 80%、90%、100%，每个阈值都应最多提醒一次；重置后则允许重新提醒。
 */
export function createQuotaAlertController({ t, formatResetTime, setStatus }) {
  let enabled = readStoredEnum(ALERT_SETTING_KEY, ["enabled", "disabled"], "disabled") === "enabled";
  const storedHistory = readStoredJson(ALERT_HISTORY_KEY, []);
  let history = new Set(
    (Array.isArray(storedHistory) ? storedHistory : []).filter((key) => typeof key === "string"),
  );

  function persistHistory() {
    // 每个重置窗口至多产生三个键；限制长度可避免长期运行后 localStorage 无限制累积。
    const entries = [...history].slice(-MAX_HISTORY_ENTRIES);
    history = new Set(entries);
    writeStoredValue(ALERT_HISTORY_KEY, JSON.stringify(entries));
  }

  async function notify(quota) {
    if (!enabled) return;
    const primaryWindow = quota?.windows?.[0];
    if (!primaryWindow) return;

    const used = Math.round(Number(primaryWindow.usedPercent));
    const threshold = ALERT_THRESHOLDS.find((value) => used >= value);
    if (!threshold) return;

    const historyKey = `${primaryWindow.resetsAt ?? "unknown"}:${threshold}`;
    if (history.has(historyKey)) return;

    try {
      await sendNotification({
        title: t("quotaAlertTitle"),
        body: t("quotaAlertBody", {
          used,
          remaining: formatResetTime(primaryWindow.resetsAt),
        }),
      });
      history.add(historyKey);
      persistHistory();
    } catch (error) {
      // 系统可能在应用运行期间撤销权限；不打断主刷新流程，下一次用户操作可重新授权。
      console.warn("发送额度提醒失败", error);
    }
  }

  async function toggle() {
    if (enabled) {
      enabled = false;
      writeStoredValue(ALERT_SETTING_KEY, "disabled");
      return true;
    }

    try {
      // 只由诊断弹窗中的显式点击触发权限请求，避免启动应用即弹出系统授权框。
      const granted = await isPermissionGranted();
      const permission = granted ? "granted" : await requestPermission();
      if (permission !== "granted") {
        setStatus(t("notificationDenied"), "error");
        return false;
      }
      enabled = true;
      writeStoredValue(ALERT_SETTING_KEY, "enabled");
      return true;
    } catch (error) {
      console.error("请求通知权限失败", error);
      setStatus(t("notificationDenied"), "error");
      return false;
    }
  }

  return {
    isEnabled: () => enabled,
    notify,
    toggle,
  };
}
