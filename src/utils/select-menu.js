/**
 * 将原生 select 增强为可统一设计的选择器，同时保留原 select 作为唯一的数据源，
 * 因此原有表单提交、change 事件和业务逻辑无需改动。
 */
export function createSelectMenu(select) {
  const root = select.closest(".select-menu");
  if (!root) throw new Error("选择器需要放在 .select-menu 容器内。");

  const trigger = document.createElement("button");
  trigger.className = "select-menu-trigger";
  trigger.type = "button";
  trigger.id = `${select.id}-trigger`;
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const options = document.createElement("div");
  options.className = "select-menu-options";
  options.hidden = true;
  options.id = `${select.id}-options`;
  options.setAttribute("role", "listbox");
  trigger.setAttribute("aria-controls", options.id);

  select.classList.add("select-menu-native");
  // 焦点交给可见触发器，避免键盘用户落到不可见的原生控件上。
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  const label = [...document.querySelectorAll("label")].find((candidate) => candidate.htmlFor === select.id);
  if (label) label.htmlFor = trigger.id;
  root.append(trigger, options);

  let isOpen = false;

  function updateTrigger() {
    const selectedOption = select.selectedOptions[0];
    trigger.textContent = selectedOption?.textContent ?? "";
    trigger.disabled = select.disabled;
    trigger.setAttribute("aria-label", select.getAttribute("aria-label") ?? trigger.textContent);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    options.hidden = true;
    options.classList.remove("is-open-upward");
    options.style.maxHeight = "";
    trigger.setAttribute("aria-expanded", "false");
  }

  function selectOption(value) {
    if (select.value === value) return;
    select.value = value;
    // 通过原生 change 事件继续驱动既有趋势刷新和设置保存逻辑。
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function renderOptions() {
    const selectedValue = select.value;
    const optionButtons = [...select.options].map((option) => {
      const item = document.createElement("button");
      item.className = "select-menu-option";
      item.type = "button";
      item.role = "option";
      item.disabled = option.disabled;
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.setAttribute("aria-selected", String(option.value === selectedValue));
      item.addEventListener("click", () => {
        close();
        selectOption(option.value);
        updateTrigger();
        trigger.focus();
      });
      return item;
    });
    options.replaceChildren(...optionButtons);
  }

  function sync() {
    updateTrigger();
    renderOptions();
  }

  function positionOptions() {
    if (root.dataset.selectMenuPosition === "down") {
      options.classList.remove("is-open-upward");
      options.style.maxHeight = "";
      return;
    }
    const container = root.closest("dialog") ?? document.documentElement;
    const triggerRect = trigger.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const safeGap = 6;
    const spaceAbove = Math.max(0, triggerRect.top - containerRect.top - safeGap);
    const spaceBelow = Math.max(0, containerRect.bottom - triggerRect.bottom - safeGap);
    const openUpward = spaceAbove > spaceBelow;
    const availableHeight = openUpward ? spaceAbove : spaceBelow;

    options.classList.toggle("is-open-upward", openUpward);
    // 小窗口中选项数量可能多于对话框剩余空间，限制面板高度并交由内部滚动承接。
    options.style.maxHeight = `${availableHeight}px`;
  }

  function open() {
    if (trigger.disabled) return;
    sync();
    isOpen = true;
    options.hidden = false;
    positionOptions();
    trigger.setAttribute("aria-expanded", "true");
  }

  function moveFocus(direction) {
    const items = [...options.querySelectorAll(".select-menu-option:not(:disabled)")];
    const selectedIndex = items.findIndex((item) => item.dataset.value === select.value);
    const nextIndex = Math.max(0, Math.min(items.length - 1, selectedIndex + direction));
    items[nextIndex]?.focus();
  }

  trigger.addEventListener("click", () => (isOpen ? close() : open()));
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    open();
    moveFocus(event.key === "ArrowDown" ? 1 : -1);
  });
  options.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      trigger.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...options.querySelectorAll(".select-menu-option:not(:disabled)")];
    const activeIndex = items.indexOf(document.activeElement);
    const nextIndex = Math.max(0, Math.min(items.length - 1, activeIndex + (event.key === "ArrowDown" ? 1 : -1)));
    items[nextIndex]?.focus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) close();
  });
  window.addEventListener("resize", () => {
    if (isOpen) positionOptions();
  });
  select.addEventListener("change", sync);
  new MutationObserver(sync).observe(select, {
    attributes: true,
    attributeFilter: ["aria-label", "disabled"],
    childList: true,
    subtree: true,
  });

  sync();
  return { sync };
}
