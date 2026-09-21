// 完整前层位于左下，后层轮廓从右上露出，与 ChatGPT 的复制图标方向一致。
const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="13" height="13" rx="2.5" /><path d="M8 8V5.5A2.5 2.5 0 0 1 10.5 3h8A2.5 2.5 0 0 1 21 5.5v8a2.5 2.5 0 0 1-2.5 2.5H16" /></svg>`;
const COPIED_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.1L19 7.5" /></svg>`;

/**
 * 所有复制入口使用一致的图标与反馈状态，文字仅作为标题和读屏标签保留。
 */
export function renderCopyIconButton(button, { label, state = "idle" }) {
  button.classList.add("copy-icon-button");
  button.classList.toggle("is-copied", state === "copied");
  button.classList.toggle("is-failed", state === "failed");
  button.innerHTML = state === "copied" ? COPIED_ICON : COPY_ICON;
  button.title = label;
  button.ariaLabel = label;
}
