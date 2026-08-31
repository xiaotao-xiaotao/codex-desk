import { renderCloseIconButton } from "../utils/close-icon-button.js";

/**
 * 会话图片预览独立管理浮层状态、关闭入口和多语言文案，避免详情视图承担额外状态。
 */
export function createThreadImagePreviewView({ t }) {
  const preview = document.querySelector("#thread-image-preview");
  const title = document.querySelector("#thread-image-preview-title");
  const image = document.querySelector("#thread-image-preview-image");
  const closeButton = document.querySelector("#thread-image-preview-close");
  let isHandlingEscape = false;

  function show(sourceImage) {
    isHandlingEscape = false;
    image.src = sourceImage.currentSrc || sourceImage.src;
    image.alt = sourceImage.alt;
    preview.hidden = false;
    closeButton.focus();
  }

  function close() {
    preview.hidden = true;
    // 清理 data URL，避免详情中的大图继续占用 WebView 内存。
    image.removeAttribute("src");
    image.alt = "";
  }

  function isOpen() {
    return !preview.hidden;
  }

  function handlingEscape() {
    return isHandlingEscape;
  }

  function updateLanguage() {
    title.textContent = t("threadImagePreview");
    renderCloseIconButton(closeButton, { label: t("closeImagePreview") });
  }

  closeButton.addEventListener("click", close);
  preview.addEventListener("click", (event) => {
    if (event.target === preview) close();
  });
  // 从按下到松开完整吞掉 Esc，避免长按产生的重复事件继续关闭外层会话 dialog。
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || (!isOpen() && !isHandlingEscape)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!isHandlingEscape && isOpen()) close();
    isHandlingEscape = true;
  }, true);
  document.addEventListener("keyup", (event) => {
    if (event.key !== "Escape" || !isHandlingEscape) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    isHandlingEscape = false;
  }, true);
  window.addEventListener("blur", () => { isHandlingEscape = false; });
  updateLanguage();
  return { show, close, isOpen, handlingEscape, updateLanguage };
}
