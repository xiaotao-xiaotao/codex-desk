const REFRESH_ICON = `
  <svg class="refresh-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 11a8 8 0 1 0-2.3 6.7M20 4v7h-7" />
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
