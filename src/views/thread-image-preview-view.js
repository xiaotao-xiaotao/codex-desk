import { renderCloseIconButton } from "../utils/close-icon-button.js";

/**
 * 会话图片预览独立管理浮层状态、关闭入口和多语言文案，避免详情视图承担额外状态。
 */
export function createThreadImagePreviewView({ t }) {
  const preview = document.querySelector("#thread-image-preview");
  const title = document.querySelector("#thread-image-preview-title");
  const image = document.querySelector("#thread-image-preview-image");
  const closeButton = document.querySelector("#thread-image-preview-close");

  function show(sourceImage) {
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

  function updateLanguage() {
    title.textContent = t("threadImagePreview");
    renderCloseIconButton(closeButton, { label: t("closeImagePreview") });
  }

  closeButton.addEventListener("click", close);
  preview.addEventListener("click", (event) => {
    if (event.target === preview) close();
  });
  updateLanguage();
  return { show, close, isOpen, updateLanguage };
}
