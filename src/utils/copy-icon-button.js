const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="4" width="10" height="10" rx="2" /><rect x="5" y="10" width="10" height="10" rx="2" /></svg>`;
const COPIED_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.1L19 7.5" /></svg>`;

/**
 * 所有复制入口使用一致的图标与反馈状态，文字仅作为标题和读屏标签保留。
 */
export function renderCopyIconButton(button, { label, state = "idle" }) {
  button.classList.add("copy-icon-button");
  button.classList.remove("copy-text-button");
  button.classList.toggle("is-copied", state === "copied");
  button.classList.toggle("is-failed", state === "failed");
  button.innerHTML = state === "copied" ? COPIED_ICON : COPY_ICON;
  button.title = label;
  button.ariaLabel = label;
}

/**
 * 用于诊断等独立操作：保留文字以明确说明将复制的内容。
 */
export function renderCopyTextButton(button, { label, state = "idle" }) {
  button.classList.remove("copy-icon-button");
  button.classList.add("copy-text-button");
  button.classList.toggle("is-copied", state === "copied");
  button.classList.toggle("is-failed", state === "failed");
  button.textContent = label;
  button.title = label;
  button.ariaLabel = label;
}
