/**
 * 创建覆盖指定容器的加载遮罩，统一动画和无障碍状态。
 */
export function createLoadingOverlay({ container, className = "" }) {
  const element = document.createElement("div");
  element.className = ["loading-overlay", className].filter(Boolean).join(" ");
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.hidden = true;

  const spinner = document.createElement("span");
  spinner.className = "loading-overlay-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const messageElement = document.createElement("span");
  messageElement.className = "loading-overlay-message";
  element.append(spinner, messageElement);
  container.append(element);

  function show(message) {
    element.setAttribute("aria-busy", "true");
    messageElement.textContent = message;
    element.hidden = false;
  }

  function hide() {
    element.hidden = true;
    element.setAttribute("aria-busy", "false");
  }

  return {
    hide,
    isVisible: () => !element.hidden,
    setMessage: (message) => { messageElement.textContent = message; },
    show,
  };
}
