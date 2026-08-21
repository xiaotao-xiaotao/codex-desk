/**
 * WebView 的 localStorage 在隐私模式或受限环境中可能抛错。
 * 将这一差异收口，业务模块只关心“是否有有效的已保存值”。
 */
export function readStoredEnum(key, allowedValues, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return allowedValues.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 持久化失败不应影响当前窗口的交互，因此由调用方继续保留内存状态。
 */
export function writeStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 无持久化权限时静默降级为“仅本次会话有效”。
  }
}
