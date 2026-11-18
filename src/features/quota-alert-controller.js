import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { readStoredEnum, readStoredJson, writeStoredValue } from "../utils/browser-storage.js";
import { normalizeQuotaAlertThresholds } from "./settings-controller.js";

const ALERT_SETTING_KEY = "codex-desk-quota-alerts";
const ALERT_HISTORY_KEY = "codex-desk-quota-alert-history";
const MAX_HISTORY_ENTRIES = 18;

/**
 * 管理额度提醒的权限、本机偏好和去重记录。
 *
 * 提醒记录按「重置时间 + 阈值」存储，而不是只记录当前使用率：同一轮额度中用户
 * 可能依次跨过 80%、90%、100%，每个阈值都应最多提醒一次；重置后则允许重新提醒。
 */
export function createQuotaAlertController({ t, formatResetTime, setStatus, getThresholds, getAccountScope }) {
  let enabled = readStoredEnum(ALERT_SETTING_KEY, ["enabled", "disabled"], "disabled") === "enabled";
  const storedHistory = readStoredJson(ALERT_HISTORY_KEY, []);
  let history = new Set(
    (Array.isArray(storedHistory) ? storedHistory : []).filter((key) => typeof key === "string"),
  );
  const pending = new Set();
  const getNormalizedThresholds = () => normalizeQuotaAlertThresholds(getThresholds?.());

  function getAlertLevel(percentage, thresholds = getNormalizedThresholds()) {
    if (typeof percentage !== "number" || !Number.isFinite(percentage)
      || percentage < 0 || percentage > 100) return 0;
    const used = Math.round(percentage);
    return thresholds.findLastIndex((threshold) => used >= threshold) + 1;
  }

  function persistHistory() {
    // 每个重置窗口至多产生三个键；限制长度可避免长期运行后 localStorage 无限制累积。
    const entries = [...history].slice(-MAX_HISTORY_ENTRIES);
    history = new Set(entries);
    writeStoredValue(ALERT_HISTORY_KEY, JSON.stringify(entries));
  }

  async function notify(quota) {
    if (!enabled) return;
    const accountScope = getAccountScope?.();
    if (!accountScope || accountScope === "unknown") return;
    const primaryWindow = quota?.windows?.[0];
    if (!primaryWindow) return;

    const percentage = primaryWindow.usedPercent;
    const thresholds = getNormalizedThresholds();
    const threshold = thresholds[getAlertLevel(percentage, thresholds) - 1];
    if (!threshold) return;

    // 多账户共享提醒偏好，但提醒去重必须按账户隔离。
    const historyKey = `${accountScope}:${primaryWindow.resetsAt ?? "unknown"}:${threshold}`;
    if (history.has(historyKey) || pending.has(historyKey)) return;

    pending.add(historyKey);
    try {
      // 插件的 JS 发送方法不返回 IPC Promise，直接等待命令回执以免失败时也写入去重记录。
      await invoke("plugin:notification|notify", {
        options: {
          title: t("quotaAlertTitle"),
          body: t("quotaAlertBody", {
            used: Math.round(percentage),
            remaining: formatResetTime(primaryWindow.resetsAt),
          }),
        },
      });
      history.add(historyKey);
      persistHistory();
    } catch (error) {
      // 系统可能在应用运行期间撤销权限；不打断主刷新流程，下一次用户操作可重新授权。
      console.warn("发送额度提醒失败", error);
    } finally {
      pending.delete(historyKey);
    }
  }

  async function toggle() {
    if (enabled) {
      enabled = false;
      writeStoredValue(ALERT_SETTING_KEY, "disabled");
      return true;
    }

    try {
      // 只由首页提醒开关的显式点击触发权限请求，避免启动应用即弹出系统授权框。
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
    getAlertLevel,
    isEnabled: () => enabled,
    notify,
    toggle,
  };
}
