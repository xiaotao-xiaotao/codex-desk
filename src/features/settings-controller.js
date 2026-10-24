import { readStoredJson, writeStoredValue } from "../utils/browser-storage.js";

const SETTINGS_STORAGE_KEY = "codex-desk-settings";
const DEFAULT_REFRESH_INTERVAL_SECONDS = 180;
const REFRESH_INTERVAL_OPTIONS = new Set([180, 300, 600, 1_200]);
export const DEFAULT_QUOTA_ALERT_THRESHOLDS = Object.freeze([80, 90, 100]);

// 只允许预设值，避免损坏的本机设置把任意内容写入正文样式。
export const READING_SETTINGS = {
  readingFont: {
    cssProperty: "--reading-font-family", defaultValue: "system",
    options: [
      { value: "system", cssValue: 'system-ui, "Microsoft YaHei UI", "Microsoft YaHei", sans-serif' },
      { value: "yahei", cssValue: '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif' },
      { value: "songti", cssValue: '"SimSun", "Songti SC", serif' },
      { value: "simhei", cssValue: '"SimHei", "Heiti SC", system-ui, sans-serif' },
      { value: "kaiti", cssValue: '"KaiTi", "Kaiti SC", serif' },
      { value: "fangsong", cssValue: '"FangSong", "STFangsong", serif' },
      { value: "dengxian", cssValue: '"DengXian", "Microsoft YaHei", system-ui, sans-serif' },
      { value: "pingfang", cssValue: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif' },
      { value: "segoe", cssValue: '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif' },
      { value: "arial", cssValue: 'Arial, "Microsoft YaHei", sans-serif' },
      { value: "georgia", cssValue: 'Georgia, "SimSun", "Songti SC", serif' },
      { value: "times", cssValue: '"Times New Roman", "SimSun", "Songti SC", serif' },
      { value: "yahei-ui", cssValue: '"Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif' },
      { value: "nsimsun", cssValue: '"NSimSun", "SimSun", serif' },
      { value: "stsong", cssValue: '"STSong", "Songti SC", "SimSun", serif' },
      { value: "stheiti", cssValue: '"STHeiti", "Heiti SC", "SimHei", sans-serif' },
      { value: "stkaiti", cssValue: '"STKaiti", "Kaiti SC", "KaiTi", serif' },
      { value: "stfangsong", cssValue: '"STFangsong", "FangSong", serif' },
      { value: "stzhongsong", cssValue: '"STZhongsong", "SimSun", serif' },
      { value: "stxihei", cssValue: '"STXihei", "PingFang SC", "Microsoft YaHei", sans-serif' },
      { value: "noto-sans", cssValue: '"Noto Sans SC", "Microsoft YaHei", sans-serif' },
      { value: "noto-serif", cssValue: '"Noto Serif SC", "SimSun", "Songti SC", serif' },
      { value: "source-han-sans", cssValue: '"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif' },
      { value: "source-han-serif", cssValue: '"Source Han Serif SC", "Noto Serif SC", "SimSun", serif' },
      { value: "verdana", cssValue: 'Verdana, "Microsoft YaHei", sans-serif' },
      { value: "tahoma", cssValue: 'Tahoma, "Microsoft YaHei", sans-serif' },
      { value: "calibri", cssValue: 'Calibri, "Microsoft YaHei", sans-serif' },
      { value: "cambria", cssValue: 'Cambria, "SimSun", serif' },
      { value: "consolas", cssValue: 'Consolas, "Microsoft YaHei", monospace' },
      { value: "courier", cssValue: '"Courier New", "SimSun", monospace' },
    ],
  },
  readingFontSize: {
    cssProperty: "--reading-font-size", defaultValue: "normal",
    // 保留原有三个字号的存储值，扩展选项后仍能恢复已保存的选择。
    options: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36].map((size) => ({
      value: ({ 13: "small", 14: "normal", 16: "large" })[size] ?? String(size),
      cssValue: `${size}px`,
    })),
  },
  readingLineHeight: {
    cssProperty: "--reading-line-height", defaultValue: "comfortable",
    options: [
      { value: "compact", cssValue: "1.45" },
      { value: "comfortable", cssValue: "1.65" },
      { value: "loose", cssValue: "1.85" },
    ],
  },
};

export function normalizeQuotaAlertThresholds(value) {
  if (!Array.isArray(value) || value.length !== DEFAULT_QUOTA_ALERT_THRESHOLDS.length) {
    return [...DEFAULT_QUOTA_ALERT_THRESHOLDS];
  }

  const thresholds = value.map(Number);
  const isValid = thresholds.every((threshold) => Number.isInteger(threshold) && threshold >= 1 && threshold <= 100)
    && thresholds.every((threshold, index) => index === 0 || thresholds[index - 1] < threshold);
  return isValid ? thresholds : [...DEFAULT_QUOTA_ALERT_THRESHOLDS];
}

function normalizeSettings(value) {
  const refreshIntervalSeconds = Number(value?.refreshIntervalSeconds);
  return {
    hideEmails: value?.hideEmails === true,
    // 未配置有效代理模式时默认使用系统代理。
    proxyMode: ["off", "system", "custom"].includes(value?.proxyMode) ? value.proxyMode : "system",
    proxyUrl: typeof value?.proxyUrl === "string" ? value.proxyUrl.trim() : "",
    cliPath: typeof value?.cliPath === "string" ? value.cliPath.trim() : "",
    refreshIntervalSeconds: REFRESH_INTERVAL_OPTIONS.has(refreshIntervalSeconds)
      ? refreshIntervalSeconds
      : DEFAULT_REFRESH_INTERVAL_SECONDS,
    quotaAlertThresholds: normalizeQuotaAlertThresholds(value?.quotaAlertThresholds),
    ...Object.fromEntries(Object.entries(READING_SETTINGS).map(([field, config]) => [
      field,
      config.options.some((option) => option.value === value?.[field]) ? value[field] : config.defaultValue,
    ])),
  };
}

function cloneSettings(settings) {
  return {
    ...settings,
    quotaAlertThresholds: [...settings.quotaAlertThresholds],
  };
}

/**
 * 设置控制器只负责本机偏好与原生 CLI 配置同步；弹窗渲染留在 view 中。
 * CLI 路径先由原生层校验，成功后才持久化，避免下次启动被无效路径卡住。
 */
export function createSettingsController({ invoke, onSettingsChanged }) {
  let settings = normalizeSettings(readStoredJson(SETTINGS_STORAGE_KEY, {}));

  async function initialize() {
    return invoke("configure_cli_path", { cliPath: settings.cliPath, proxyMode: settings.proxyMode, proxyUrl: settings.proxyUrl });
  }

  async function save(nextSettings) {
    // 精简版设置弹窗不再编辑会话阅读偏好，保存时沿用原值，避免无关设置被重置。
    const normalized = normalizeSettings({ ...settings, ...nextSettings });
    const cliVersion = await invoke("configure_cli_path", {
      cliPath: normalized.cliPath,
      proxyMode: normalized.proxyMode,
      proxyUrl: normalized.proxyUrl,
      restartService: nextSettings.restartService === true,
    });
    settings = normalized;
    writeStoredValue(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    onSettingsChanged?.(cloneSettings(settings));
    return cliVersion;
  }

  return {
    initialize,
    save,
    getSettings: () => cloneSettings(settings),
    getRefreshIntervalMs: () => settings.refreshIntervalSeconds * 1_000,
  };
}
