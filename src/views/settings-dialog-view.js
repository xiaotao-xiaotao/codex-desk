import { renderCloseIconButton } from "../utils/close-icon-button.js";
import { READING_SETTINGS } from "../features/settings-controller.js";

export function createSettingsDialogView({ t, getSettings, onBrowseCli, onSave, onReadStoragePath }) {
  const openButton = document.querySelector("#settings-button");
  const dialog = document.querySelector("#settings-dialog");
  const closeButton = document.querySelector("#settings-close");
  const form = document.querySelector("#settings-form");
  const tabList = dialog.querySelector(".settings-tabs");
  const panels = [...dialog.querySelectorAll("[data-settings-category]")];
  // 面板是分类的唯一声明来源，新增分类无需同步维护导航或切页分支。
  const tabs = panels.map((panel) => {
    const tab = document.createElement("button");
    tab.id = `settings-tab-${panel.dataset.settingsCategory}`;
    tab.className = "settings-tab";
    tab.type = "button";
    tab.dataset.settingsTab = panel.dataset.settingsCategory;
    tab.dataset.settingsLabel = panel.dataset.settingsLabel;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("aria-labelledby", tab.id);
    return tab;
  });
  tabList.replaceChildren(...tabs);
  const body = dialog.querySelector(".settings-body");
  // 与样式中的窄窗口断点保持一致，键盘方向和无障碍声明随布局切换。
  const compactLayout = window.matchMedia("(max-width: 600px)");
  const cliPathInput = document.querySelector("#settings-cli-path");
  const browseButton = document.querySelector("#settings-cli-browse");
  const resetButton = document.querySelector("#settings-cli-reset");
  const refreshInterval = document.querySelector("#settings-refresh-interval");
  const emailVisibilityOptions = [...document.querySelectorAll('input[name="emailVisibility"]')];
  const thresholdInputs = [
    document.querySelector("#settings-quota-threshold-1"),
    document.querySelector("#settings-quota-threshold-2"),
    document.querySelector("#settings-quota-threshold-3"),
  ];
  const cancelButton = document.querySelector("#settings-cancel");
  const saveButton = document.querySelector("#settings-save");
  const status = document.querySelector("#settings-status");
  const storageHint = document.querySelector("#settings-storage-hint");
  let storagePath = null;
  let storageError = null;
  let readingStoragePath = false;
  const readingPreview = document.querySelector("#settings-reading-preview");
  const readingResetButton = document.querySelector("#settings-reading-reset");
  const readingControls = Object.entries(READING_SETTINGS).map(([field, config]) => ({
    field, config, select: document.querySelector(`[data-reading-setting="${field}"]`),
  }));
  let saving = false;
  let activeTab = tabs[0]?.dataset.settingsTab;
  const disabledStates = new Map();

  function selectTab(name, focus = false) {
    const selected = tabs.find((tab) => tab.dataset.settingsTab === name);
    if (!selected) return;
    activeTab = name;
    tabs.forEach((tab) => {
      const active = tab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.id !== selected.getAttribute("aria-controls"); });
    // 分页只改变可见区域，不重填表单，未保存的修改在各页间保留。
    body.scrollTop = 0;
    if (focus) selected.focus();
    revealTab(selected);
  }

  function revealTab(selected) {
    if (!dialog.open || !selected) return;
    // 只滚动分类栏，避免 scrollIntoView 连带移动内容区或整个弹窗。
    const tabRect = selected.getBoundingClientRect();
    const listRect = tabList.getBoundingClientRect();
    if (compactLayout.matches) {
      if (tabRect.left < listRect.left) tabList.scrollLeft += tabRect.left - listRect.left;
      else if (tabRect.right > listRect.right) tabList.scrollLeft += tabRect.right - listRect.right;
    } else {
      if (tabRect.top < listRect.top) tabList.scrollTop += tabRect.top - listRect.top;
      else if (tabRect.bottom > listRect.bottom) tabList.scrollTop += tabRect.bottom - listRect.bottom;
    }
  }

  function updateNavigationLayout() {
    tabList.setAttribute("aria-orientation", compactLayout.matches ? "horizontal" : "vertical");
    revealTab(tabs.find((tab) => tab.dataset.settingsTab === activeTab));
  }

  function focusField(field) {
    const panel = field.closest("[data-settings-category]");
    if (panel) selectTab(panel.dataset.settingsCategory);
    field.focus();
  }

  function renderReadingPreview() {
    for (const { config, select } of readingControls) {
      const option = config.options.find((option) => option.value === select.value);
      readingPreview.style.setProperty(config.cssProperty, option.cssValue);
    }
  }

  function renderReadingOptions() {
    document.querySelector("#settings-reading-title").textContent = t("settingsReadingTitle");
    readingResetButton.textContent = t("settingsReadingReset");
    document.querySelector("#settings-reading-hint").textContent = t("settingsReadingHint");
    readingPreview.textContent = t("settingsReadingPreview");
    for (const { field, config, select } of readingControls) {
      const selected = select.value || getSettings()[field];
      document.querySelector(`[data-reading-label="${field}"]`).textContent = t(config.labelKey);
      select.replaceChildren(...config.options.map((option) => {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label ?? t(option.labelKey);
        return element;
      }));
      select.value = selected;
    }
    renderReadingPreview();
  }

  function renderIntervalOptions() {
    const selected = refreshInterval.value;
    const options = [
      [30, "settingsRefresh30Seconds"],
      [60, "settingsRefresh60Seconds"],
      [120, "settingsRefresh2Minutes"],
      [300, "settingsRefresh5Minutes"],
      [600, "settingsRefresh10Minutes"],
    ];
    refreshInterval.replaceChildren(...options.map(([value, labelKey]) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = t(labelKey);
      return option;
    }));
    refreshInterval.value = selected || "60";
  }

  function setBusy(busy) {
    saving = busy;
    form.setAttribute("aria-busy", String(busy));
    if (busy) {
      // 自动覆盖新增字段，并保留原先因业务条件禁用的控件状态。
      dialog.querySelectorAll("input, select, textarea, button, fieldset").forEach((control) => {
        if (control.matches("[data-settings-tab]")) return;
        disabledStates.set(control, control.disabled);
        control.disabled = true;
      });
    } else {
      disabledStates.forEach((disabled, control) => { control.disabled = disabled; });
      disabledStates.clear();
    }
  }

  function showStatus(message = "", error = false) {
    status.textContent = message;
    status.dataset.kind = error ? "error" : "normal";
    status.hidden = !message;
  }

  function fillForm() {
    const settings = getSettings();
    cliPathInput.value = settings.cliPath;
    refreshInterval.value = String(settings.refreshIntervalSeconds);
    emailVisibilityOptions.forEach((input) => { input.checked = input.value === (settings.hideEmails ? "hide" : "show"); });
    thresholdInputs.forEach((input, index) => {
      input.value = String(settings.quotaAlertThresholds[index]);
    });
    readingControls.forEach(({ field, select }) => { select.value = settings[field]; });
    renderReadingPreview();
    showStatus();
  }

  function readQuotaAlertThresholds() {
    const thresholds = thresholdInputs.map((input) => Number(input.value));
    const valid = thresholds.every((threshold) => Number.isInteger(threshold) && threshold >= 1 && threshold <= 100)
      && thresholds.every((threshold, index) => index === 0 || thresholds[index - 1] < threshold);
    return valid ? thresholds : null;
  }

  function renderStorageHint() {
    storageHint.textContent = storagePath
      ? t("settingsStorageHint", { path: storagePath })
      : storageError ? t("settingsStorageReadFailed") : t("settingsStorageLoading");
    storageHint.title = storagePath ?? storageError ?? "";
  }

  async function readStoragePath() {
    if (storagePath || readingStoragePath) return;
    readingStoragePath = true;
    storageError = null;
    renderStorageHint();
    try {
      storagePath = await onReadStoragePath();
    } catch (error) {
      storageError = String(error);
    } finally {
      readingStoragePath = false;
      renderStorageHint();
    }
  }

  function open() {
    fillForm();
    void readStoragePath();
    if (!dialog.open) dialog.showModal();
    selectTab(activeTab);
    panels.find((panel) => !panel.hidden)?.querySelector("input, select")?.focus();
  }

  function updateLanguage() {
    document.querySelector("#settings-email-label").textContent = t("settingsEmailVisibility");
    document.querySelector("#settings-email-hint").textContent = t("settingsEmailVisibilityHint");
    document.querySelector("#settings-email-show").textContent = t("settingsEmailShow");
    document.querySelector("#settings-email-hide").textContent = t("settingsEmailHide");
    openButton.title = openButton.ariaLabel = t("openSettings");
    renderCloseIconButton(closeButton, { label: t("closeSettings") });
    document.querySelector("#settings-title").textContent = t("settingsTitle");
    document.querySelector("#settings-intro").textContent = t("settingsLayoutIntro");
    tabList.setAttribute("aria-label", t("settingsCategoryLabel"));
    tabs.forEach((tab) => { tab.textContent = t(tab.dataset.settingsLabel); });
    dialog.querySelectorAll("[data-settings-layout-i18n]").forEach((element) => { element.textContent = t(element.dataset.settingsLayoutI18n); });
    renderStorageHint();
    document.querySelector("#settings-cli-label").textContent = t("settingsCliPath");
    document.querySelector("#settings-cli-hint").textContent = t("settingsCliPathHint");
    cliPathInput.placeholder = t("settingsCliPathPlaceholder");
    browseButton.textContent = t("settingsBrowse");
    resetButton.textContent = t("settingsUsePath");
    document.querySelector("#settings-refresh-label").textContent = t("settingsRefreshInterval");
    document.querySelector("#settings-refresh-hint").textContent = t("settingsRefreshIntervalHint");
    document.querySelector("#settings-quota-thresholds-label").textContent = t("settingsQuotaAlertThresholds");
    document.querySelector("#settings-quota-thresholds-hint").textContent = t("settingsQuotaAlertThresholdsHint");
    document.querySelector("#settings-quota-threshold-low").textContent = t("settingsQuotaAlertThresholdLow");
    document.querySelector("#settings-quota-threshold-medium").textContent = t("settingsQuotaAlertThresholdMedium");
    document.querySelector("#settings-quota-threshold-high").textContent = t("settingsQuotaAlertThresholdHigh");
    cancelButton.textContent = t("settingsCancel");
    saveButton.textContent = t("settingsSave");
    renderIntervalOptions();
    renderReadingOptions();
  }

  browseButton.addEventListener("click", async () => {
    try {
      const selectedPath = await onBrowseCli();
      if (selectedPath) cliPathInput.value = selectedPath;
    } catch (error) {
      showStatus(t("settingsBrowseFailed", { error: String(error) }), true);
    }
  });
  openButton.addEventListener("click", open);
  resetButton.addEventListener("click", () => {
    cliPathInput.value = "";
    cliPathInput.focus();
  });
  cancelButton.addEventListener("click", () => { if (!saving) dialog.close(); });
  closeButton.addEventListener("click", () => { if (!saving) dialog.close(); });
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.settingsTab));
    tab.addEventListener("keydown", (event) => {
      let target;
      if (event.key === (compactLayout.matches ? "ArrowRight" : "ArrowDown")) target = (index + 1) % tabs.length;
      else if (event.key === (compactLayout.matches ? "ArrowLeft" : "ArrowUp")) target = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[target].dataset.settingsTab, true);
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    const quotaAlertThresholds = readQuotaAlertThresholds();
    if (!quotaAlertThresholds) {
      showStatus(t("settingsQuotaAlertThresholdInvalid"), true);
      focusField(thresholdInputs.find((input) => !input.checkValidity()) ?? thresholdInputs[0]);
      return;
    }
    setBusy(true);
    showStatus(t("settingsSaving"));
    try {
      const version = await onSave({
        hideEmails: emailVisibilityOptions.some((input) => input.checked && input.value === "hide"),
        cliPath: cliPathInput.value,
        refreshIntervalSeconds: Number(refreshInterval.value),
        quotaAlertThresholds,
        ...Object.fromEntries(readingControls.map(({ field, select }) => [field, select.value])),
      });
      showStatus(t("settingsSaved", { version }));
    } catch (error) {
      showStatus(t("settingsSaveFailed", { error: String(error) }), true);
    } finally {
      setBusy(false);
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog && !saving) dialog.close();
  });
  dialog.addEventListener("cancel", (event) => { if (saving) event.preventDefault(); });

  readingResetButton.addEventListener("click", () => {
    if (saving) return;
    // 只恢复阅读选项，沿用表单的保存流程，取消时仍保留已保存的偏好。
    readingControls.forEach(({ config, select }) => { select.value = config.defaultValue; });
    renderReadingPreview();
    showStatus();
  });
  readingControls.forEach(({ select }) => select.addEventListener("change", renderReadingPreview));
  updateLanguage();
  compactLayout.addEventListener("change", updateNavigationLayout);
  updateNavigationLayout();
  selectTab(activeTab);
  return { open, updateLanguage };
}
