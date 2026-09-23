import { Marked } from "marked";
import { renderCopyIconButton } from "./copy-icon-button.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const markdown = new Marked({
  breaks: true,
  gfm: true,
});

markdown.use({
  renderer: {
    // 会话来自本地历史，但仍不信任其中的 HTML，避免详情页发生脚本或样式注入。
    html({ text }) {
      return escapeHtml(text);
    },
  },
});

function codeLanguage(code) {
  const languageClass = [...code.classList]
    .find((className) => className.startsWith("language-"));
  return languageClass?.slice("language-".length) ?? "";
}

function localFilePathFromHref(href) {
  let decodedHref;
  try {
    decodedHref = decodeURIComponent(href);
  } catch {
    decodedHref = href;
  }
  if (/^file:\/\/\/[a-z]:\//i.test(decodedHref)) {
    decodedHref = decodedHref.slice("file:///".length).replaceAll("/", "\\");
  } else if (/^[a-z]:[\\/]/i.test(decodedHref)) {
    decodedHref = decodedHref.replaceAll("/", "\\");
  } else {
    return null;
  }
  // Codex 文件引用常在绝对路径后追加 :行号 或 :行号:列号；读取时不能把它当作文件名。
  return {
    displayPath: decodedHref,
    path: decodedHref.replace(/:(\d+)(?::\d+)?$/, ""),
  };
}

function createLocalFilePreview(path, { t, copyText }) {
  const preview = document.createElement("section");
  preview.className = "markdown-local-file-preview";
  const header = document.createElement("header");
  const title = document.createElement("code");
  title.textContent = path;
  title.title = path;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "markdown-local-file-copy";
  renderCopyIconButton(copy, { label: t("copy") });
  copy.addEventListener("click", async () => {
    const content = preview.querySelector("pre")?.textContent ?? "";
    copy.disabled = true;
    try {
      await copyText(content);
      renderCopyIconButton(copy, { label: t("copied"), state: "copied" });
    } catch {
      renderCopyIconButton(copy, { label: t("copyFailedLong"), state: "failed" });
    }
    window.setTimeout(() => {
      copy.disabled = false;
      renderCopyIconButton(copy, { label: t("copy") });
    }, 1_500);
  });
  header.append(title, copy);
  const status = document.createElement("p");
  status.className = "markdown-local-file-status";
  status.textContent = t("localFileLoading");
  preview.append(header, status);
  return preview;
}

function bindLocalFileLink(link, fileReference, options) {
  const { displayPath, path } = fileReference;
  link.classList.add("message-local-file-link");
  link.removeAttribute("href");
  link.setAttribute("role", "button");
  link.tabIndex = 0;
  link.title = `${options.t("localFilePreview")}：${displayPath}`;
  let preview = null;

  const toggle = async () => {
    if (preview) {
      preview.hidden = !preview.hidden;
      link.setAttribute("aria-expanded", String(!preview.hidden));
      return;
    }
    preview = createLocalFilePreview(displayPath, options);
    const anchorBlock = link.closest("p, li, blockquote") ?? link;
    anchorBlock.insertAdjacentElement("afterend", preview);
    link.setAttribute("aria-expanded", "true");
    try {
      const result = await options.onReadLocalFile(path);
      const code = document.createElement("code");
      code.textContent = result.content;
      const content = document.createElement("pre");
      content.append(code);
      const status = preview.querySelector(".markdown-local-file-status");
      status.replaceWith(content);
      if (result.truncated) {
        const hint = document.createElement("p");
        hint.className = "markdown-local-file-hint";
        hint.textContent = options.t("localFileTruncated", { size: result.size });
        preview.append(hint);
      }
    } catch (error) {
      const status = preview.querySelector(".markdown-local-file-status");
      status.classList.add("is-error");
      status.textContent = options.t("localFileReadFailed", { error: String(error) });
    }
  };
  link.addEventListener("click", (event) => {
    event.preventDefault();
    void toggle();
  });
  link.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void toggle();
  });
}

function enhanceLinks(container, options) {
  for (const link of container.querySelectorAll("a")) {
    const href = link.getAttribute("href") ?? "";
    const localFile = localFilePathFromHref(href);
    if (localFile && options.onReadLocalFile) {
      bindLocalFileLink(link, localFile, options);
      continue;
    }
    if (!/^(?:https?:|mailto:)/i.test(href)) {
      link.removeAttribute("href");
      continue;
    }
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
}

function secureImages(container) {
  for (const image of container.querySelectorAll("img")) {
    const source = image.getAttribute("src") ?? "";
    const isRemoteImage = /^https?:/i.test(source);
    const isEmbeddedRaster = /^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(source);
    if (!isRemoteImage && !isEmbeddedRaster) image.removeAttribute("src");
  }
}

function enhanceTables(container) {
  for (const table of [...container.querySelectorAll("table")]) {
    const wrapper = document.createElement("div");
    wrapper.className = "markdown-table-wrap";
    table.replaceWith(wrapper);
    wrapper.append(table);
  }
}

function enhanceCodeBlocks(container, { t, copyText }) {
  for (const code of [...container.querySelectorAll("pre > code")]) {
    const pre = code.parentElement;
    const block = document.createElement("div");
    block.className = "markdown-code-block";
    const toolbar = document.createElement("div");
    toolbar.className = "markdown-code-toolbar";
    const language = document.createElement("span");
    language.textContent = codeLanguage(code);
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "markdown-code-copy";
    renderCopyIconButton(copy, { label: t("copy") });
    copy.addEventListener("click", async () => {
      copy.disabled = true;
      try {
        await copyText(code.textContent ?? "");
        renderCopyIconButton(copy, { label: t("copied"), state: "copied" });
      } catch {
        renderCopyIconButton(copy, { label: t("copyFailedLong"), state: "failed" });
      }
      window.setTimeout(() => {
        copy.disabled = false;
        renderCopyIconButton(copy, { label: t("copy") });
      }, 1_500);
    });
    toolbar.append(language, copy);
    pre.replaceWith(block);
    block.append(toolbar, pre);
  }
}

/**
 * 将消息正文渲染为安全 Markdown，并补齐代码复制、链接和宽表格交互。
 */
export function renderMessageMarkdown(container, source, { t, copyText, onReadLocalFile }) {
  container.className = "message-markdown";
  container.innerHTML = markdown.parse(String(source ?? ""));
  enhanceLinks(container, { t, copyText, onReadLocalFile });
  secureImages(container);
  enhanceTables(container);
  enhanceCodeBlocks(container, { t, copyText });
}
