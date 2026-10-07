import { readStoredEnum, writeStoredValue } from "./utils/browser-storage.js";

const THEME_STORAGE_KEY = "codex-desk-theme";
const THEME_MODES = ["light", "dark"];

export const THEME_ICONS = {
  light: '<circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.28 5.28l1.42 1.42M17.3 17.3l1.42 1.42M18.72 5.28 17.3 6.7M6.7 17.3l-1.42 1.42" />',
  dark: '<path d="M20 14.3A8.5 8.5 0 0 1 9.7 4 8.5 8.5 0 1 0 20 14.3Z" />',
};

/**
 * 主题控制器不直接操作 DOM，只维护用户选择的白天或黑夜模式。
 * 这样同一套逻辑可由 Windows WebView2 与 macOS WKWebView 复用。
 */
export function createThemeController() {
  let mode = readStoredEnum(THEME_STORAGE_KEY, THEME_MODES, "light");

  const getMode = () => mode;
  const getResolvedTheme = () => mode;
  const cycleMode = () => {
    mode = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
    writeStoredValue(THEME_STORAGE_KEY, mode);
    return mode;
  };

  return { getMode, getResolvedTheme, cycleMode };
}
