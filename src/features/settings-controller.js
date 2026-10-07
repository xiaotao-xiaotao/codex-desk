import { readStoredJson, writeStoredValue } from "../utils/browser-storage.js";

const SETTINGS_STORAGE_KEY = "codex-desk-settings";
const DEFAULT_REFRESH_INTERVAL_SECONDS = 60;
const REFRESH_INTERVAL_OPTIONS = new Set([30, 60, 120, 300, 600]);
export const DEFAULT_QUOTA_ALERT_THRESHOLDS = Object.freeze([80, 90, 100]);

// 只允许预设值，避免损坏的本机设置把任意内容写入正文样式。
export const READING_SETTINGS = {
  readingFont: {
    labelKey: "settingsReadingFont", cssProperty: "--reading-font-family", defaultValue: "system",
    options: [
      { value: "system", labelKey: "settingsReadingFontSystem", cssValue: 'system-ui, "Microsoft YaHei UI", "Microsoft YaHei", sans-serif' },
      { value: "yahei", labelKey: "settingsReadingFontYahei", cssValue: '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif' },
      { value: "songti", labelKey: "settingsReadingFontSongti", cssValue: '"SimSun", "Songti SC", serif' },
      { value: "simhei", labelKey: "settingsReadingFontSimhei", cssValue: '"SimHei", "Heiti SC", system-ui, sans-serif' },
      { value: "kaiti", labelKey: "settingsReadingFontKaiti", cssValue: '"KaiTi", "Kaiti SC", serif' },
      { value: "fangsong", labelKey: "settingsReadingFontFangsong", cssValue: '"FangSong", "STFangsong", serif' },
      { value: "dengxian", labelKey: "settingsReadingFontDengxian", cssValue: '"DengXian", "Microsoft YaHei", system-ui, sans-serif' },
      { value: "pingfang", labelKey: "settingsReadingFontPingfang", cssValue: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif' },
      { value: "segoe", label: "Segoe UI", cssValue: '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif' },
      { value: "arial", label: "Arial", cssValue: 'Arial, "Microsoft YaHei", sans-serif' },
      { value: "georgia", label: "Georgia", cssValue: 'Georgia, "SimSun", "Songti SC", serif' },
      { value: "times", label: "Times New Roman", cssValue: '"Times New Roman", "SimSun", "Songti SC", serif' },
      { value: "yahei-ui", labelKey: "settingsReadingFontYaheiUI", cssValue: '"Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif' },
      { value: "nsimsun", labelKey: "settingsReadingFontNSimsun", cssValue: '"NSimSun", "SimSun", serif' },
      { value: "stsong", labelKey: "settingsReadingFontSTSong", cssValue: '"STSong", "Songti SC", "SimSun", serif' },
      { value: "stheiti", labelKey: "settingsReadingFontSTHeiti", cssValue: '"STHeiti", "Heiti SC", "SimHei", sans-serif' },
      { value: "stkaiti", labelKey: "settingsReadingFontSTKaiti", cssValue: '"STKaiti", "Kaiti SC", "KaiTi", serif' },
      { value: "stfangsong", labelKey: "settingsReadingFontSTFangsong", cssValue: '"STFangsong", "FangSong", serif' },
      { value: "stzhongsong", labelKey: "settingsReadingFontSTZhongsong", cssValue: '"STZhongsong", "SimSun", serif' },
      { value: "stxihei", labelKey: "settingsReadingFontSTXihei", cssValue: '"STXihei", "PingFang SC", "Microsoft YaHei", sans-serif' },
      { value: "noto-sans", label: "Noto Sans SC", cssValue: '"Noto Sans SC", "Microsoft YaHei", sans-serif' },
      { value: "noto-serif", label: "Noto Serif SC", cssValue: '"Noto Serif SC", "SimSun", "Songti SC", serif' },
      { value: "source-han-sans", labelKey: "settingsReadingFontSourceHanSans", cssValue: '"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif' },
      { value: "source-han-serif", labelKey: "settingsReadingFontSourceHanSerif", cssValue: '"Source Han Serif SC", "Noto Serif SC", "SimSun", serif' },
      { value: "verdana", label: "Verdana", cssValue: 'Verdana, "Microsoft YaHei", sans-serif' },
      { value: "tahoma", label: "Tahoma", cssValue: 'Tahoma, "Microsoft YaHei", sans-serif' },
      { value: "calibri", label: "Calibri", cssValue: 'Calibri, "Microsoft YaHei", sans-serif' },
      { value: "cambria", label: "Cambria", cssValue: 'Cambria, "SimSun", serif' },
      { value: "consolas", label: "Consolas", cssValue: 'Consolas, "Microsoft YaHei", monospace' },
      { value: "courier", label: "Courier New", cssValue: '"Courier New", "SimSun", monospace' },
    ],
  },
  readingFontSize: {
    labelKey: "settingsReadingFontSize", cssProperty: "--reading-font-size", defaultValue: "normal",
    // 保留原有三个字号的存储值，扩展选项后仍能恢复已保存的选择。
    options: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36].map((size) => ({
      value: ({ 13: "small", 14: "normal", 16: "large" })[size] ?? String(size),
      label: `${size}px`,
      cssValue: `${size}px`,
    })),
  },
  readingLineHeight: {
    labelKey: "settingsReadingLineHeight", cssProperty: "--reading-line-height", defaultValue: "comfortable",
    options: [
      { value: "compact", labelKey: "settingsReadingLineCompact", cssValue: "1.45" },
      { value: "comfortable", labelKey: "settingsReadingLineComfortable", cssValue: "1.65" },
      { value: "loose", labelKey: "settingsReadingLineLoose", cssValue: "1.85" },
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
    if (!settings.cliPath) return null;
    return invoke("configure_cli_path", { cliPath: settings.cliPath });
  }

  async function save(nextSettings) {
    const normalized = normalizeSettings(nextSettings);
    const cliVersion = await invoke("configure_cli_path", { cliPath: normalized.cliPath });
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
