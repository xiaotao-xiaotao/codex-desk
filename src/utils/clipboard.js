/**
 * 优先使用异步剪贴板 API；部分 WebView 未授予权限时，降级为传统复制方案。
 */
export async function copyText(text, fallbackErrorMessage) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 继续执行传统方案。
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error(fallbackErrorMessage);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isCopyableImageSource(source) {
  return /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(source)
    || /^https:\/\//i.test(source);
}

function messageHtml(text, imageSources) {
  const textHtml = text ? `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>` : "";
  const imagesHtml = imageSources
    .filter(isCopyableImageSource)
    .map((source) => `<img src="${escapeHtml(source)}" alt="">`)
    .join("");
  return `<div>${textHtml}${imagesHtml}</div>`;
}

/**
 * 会话消息通过富文本剪贴板同时提供文字和图片；文本格式仍保留给不支持富文本的目标应用。
 * WebView 或系统剪贴板不支持富文本时，含文字的消息自动降级为纯文本复制。
 */
export async function copyMessageContent({ text = "", images = [] }, fallbackErrorMessage) {
  const imageSources = images.map((image) => image?.src).filter((source) => typeof source === "string");
  if (imageSources.length === 0) return copyText(text, fallbackErrorMessage);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      const data = {
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([messageHtml(text, imageSources)], { type: "text/html" }),
      };
      // PNG 可作为原生图片格式粘贴到仅接收图片的应用；多图仍完整保留在 HTML 中。
      const firstPng = imageSources.find((source) => /^data:image\/png;base64,/i.test(source));
      if (firstPng) data["image/png"] = await (await fetch(firstPng)).blob();
      await navigator.clipboard.write([new ClipboardItem(data)]);
      return;
    } catch {
      // 保持文字复制可用；纯图片消息则明确失败，避免误报“已复制”。
    }
  }
  if (text) return copyText(text, fallbackErrorMessage);
  throw new Error(fallbackErrorMessage);
}
