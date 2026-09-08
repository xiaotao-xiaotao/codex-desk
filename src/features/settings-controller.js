import { readStoredJson, writeStoredValue } from "../utils/browser-storage.js";

const SETTINGS_STORAGE_KEY = "codex-desk-settings";
const DEFAULT_REFRESH_INTERVAL_SECONDS = 60;
const REFRESH_INTERVAL_OPTIONS = new Set([30, 60, 120, 300]);

function normalizeSettings(value) {
  const refreshIntervalSeconds = Number(value?.refreshIntervalSeconds);
  return {
    cliPath: typeof value?.cliPath === "string" ? value.cliPath.trim() : "",
    refreshIntervalSeconds: REFRESH_INTERVAL_OPTIONS.has(refreshIntervalSeconds)
      ? refreshIntervalSeconds
      : DEFAULT_REFRESH_INTERVAL_SECONDS,
  };
}

/**
 * 设置控制器只负责本机偏好与原生 CLI 配置同步；弹窗渲染留在 view 中。
 * CLI 路径先由原生层校验，成功后才持久化，避免下次启动被无效路径卡住。
 */
export function createSettingsController({ invoke, onSettingsChanged }) {
  let settings = normalizeSettings(readStoredJson(SETTINGS_STORAGE_KEY, {}));

  async function initialize() {
    if (!settings.cliPath) return null;
    return invoke("configure_cli_path", { cliPath: settings.cliPath });
  }

  async function save(nextSettings) {
    const normalized = normalizeSettings(nextSettings);
    const cliVersion = await invoke("configure_cli_path", { cliPath: normalized.cliPath });
    settings = normalized;
    writeStoredValue(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    onSettingsChanged?.({ ...settings });
    return cliVersion;
  }

  return {
    initialize,
    save,
    getSettings: () => ({ ...settings }),
    getRefreshIntervalMs: () => settings.refreshIntervalSeconds * 1_000,
  };
}
