import { renderCloseIconButton } from "../utils/close-icon-button.js";
import { READING_SETTINGS } from "../features/settings-controller.js";

export function createSettingsDialogView({ t, getSettings, onBrowseCli, onSave }) {
  const openButton = document.querySelector("#settings-button");
  const dialog = document.querySelector("#settings-dialog");
  const closeButton = document.querySelector("#settings-close");
  const form = document.querySelector("#settings-form");
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
  const readingPreview = document.querySelector("#settings-reading-preview");
  const readingResetButton = document.querySelector("#settings-reading-reset");
  const readingControls = Object.entries(READING_SETTINGS).map(([field, config]) => ({
    field, config, select: document.querySelector(`[data-reading-setting="${field}"]`),
  }));
  let saving = false;

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
    cliPathInput.disabled = busy;
    browseButton.disabled = busy;
    resetButton.disabled = busy;
    refreshInterval.disabled = busy;
    emailVisibilityOptions.forEach((input) => { input.disabled = busy; });
    thresholdInputs.forEach((input) => { input.disabled = busy; });
    readingControls.forEach(({ select }) => { select.disabled = busy; });
    readingResetButton.disabled = busy;
    cancelButton.disabled = busy;
    saveButton.disabled = busy;
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

  function open() {
    fillForm();
    if (!dialog.open) dialog.showModal();
    cliPathInput.focus();
  }

  function updateLanguage() {
    document.querySelector("#settings-email-label").textContent = t("settingsEmailVisibility");
    document.querySelector("#settings-email-hint").textContent = t("settingsEmailVisibilityHint");
    document.querySelector("#settings-email-show").textContent = t("settingsEmailShow");
    document.querySelector("#settings-email-hide").textContent = t("settingsEmailHide");
    openButton.title = openButton.ariaLabel = t("openSettings");
    renderCloseIconButton(closeButton, { label: t("closeSettings") });
    document.querySelector("#settings-title").textContent = t("settingsTitle");
    document.querySelector("#settings-intro").textContent = t("settingsIntro");
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
  cancelButton.addEventListener("click", () => dialog.close());
  closeButton.addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    const quotaAlertThresholds = readQuotaAlertThresholds();
    if (!quotaAlertThresholds) {
      showStatus(t("settingsQuotaAlertThresholdInvalid"), true);
      (thresholdInputs.find((input) => !input.checkValidity()) ?? thresholdInputs[0]).focus();
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
    if (event.target === dialog) dialog.close();
  });

  readingResetButton.addEventListener("click", () => {
    if (saving) return;
    // 只恢复阅读选项，沿用表单的保存流程，取消时仍保留已保存的偏好。
    readingControls.forEach(({ config, select }) => { select.value = config.defaultValue; });
    renderReadingPreview();
    showStatus();
  });
  readingControls.forEach(({ select }) => select.addEventListener("change", renderReadingPreview));
  updateLanguage();
  return { open, updateLanguage };
}
