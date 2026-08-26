const CLOSE_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m7 7 10 10M17 7 7 17" />
  </svg>`;

/**
 * 统一各处关闭入口的图标、无障碍标签与提示，避免弹窗和顶部操作使用不同的关闭样式。
 */
export function renderCloseIconButton(button, { label }) {
  button.classList.add("close-icon-button");
  button.innerHTML = CLOSE_ICON;
  button.title = label;
  button.ariaLabel = label;
}
