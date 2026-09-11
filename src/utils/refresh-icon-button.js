const REFRESH_ICON = `
  <svg class="refresh-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 16.24 7.76L13 11h7V4z" />
  </svg>`;

/**
 * 统一刷新入口的图标、无障碍标签与加载动画，业务层只负责触发刷新。
 */
export function renderRefreshIconButton(button, { label }) {
  button.classList.add("icon-button", "refresh-icon-button");
  button.innerHTML = REFRESH_ICON;
  button.title = label;
  button.ariaLabel = label;
}

export function setRefreshIconButtonLoading(button, loading) {
  button.classList.toggle("is-loading", loading);
  button.setAttribute("aria-busy", String(loading));
}
