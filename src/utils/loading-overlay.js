/**
 * 创建覆盖指定容器的通用状态层。
 * Loading 与错误态复用同一 DOM，避免各页面分别维护遮罩、动画和无障碍状态。
 */
export function createLoadingOverlay({ container, className = "" }) {
  const element = document.createElement("div");
  element.className = ["loading-overlay", className].filter(Boolean).join(" ");
  element.dataset.kind = "loading";
  element.setAttribute("aria-live", "polite");
  element.hidden = true;

  const spinner = document.createElement("span");
  spinner.className = "loading-overlay-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const messageElement = document.createElement("span");
  messageElement.className = "loading-overlay-message";
  element.append(spinner, messageElement);
  container.append(element);

  function show(message, { kind = "loading" } = {}) {
    element.dataset.kind = kind;
    element.setAttribute("role", kind === "error" ? "alert" : "status");
    element.setAttribute("aria-busy", String(kind === "loading"));
    messageElement.textContent = message;
    element.hidden = false;
  }

  function hide() {
    element.hidden = true;
    element.setAttribute("aria-busy", "false");
  }

  return {
    element,
    getKind: () => element.dataset.kind,
    hide,
    isVisible: () => !element.hidden,
    setMessage: (message) => { messageElement.textContent = message; },
    show,
    showError: (message) => show(message, { kind: "error" }),
  };
}
