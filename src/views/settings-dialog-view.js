import { renderCloseIconButton } from "../utils/close-icon-button.js";

export function createSettingsDialogView({ t, getSettings, onBrowseCli, onSave }) {
  const openButton = document.querySelector("#settings-button");
  const dialog = document.querySelector("#settings-dialog");
  const closeButton = document.querySelector("#settings-close");
  const form = document.querySelector("#settings-form");
  const cliPathInput = document.querySelector("#settings-cli-path");
  const browseButton = document.querySelector("#settings-cli-browse");
  const resetButton = document.querySelector("#settings-cli-reset");
  const refreshInterval = document.querySelector("#settings-refresh-interval");
  const cancelButton = document.querySelector("#settings-cancel");
  const saveButton = document.querySelector("#settings-save");
  const status = document.querySelector("#settings-status");
  let saving = false;

  function renderIntervalOptions() {
    const selected = refreshInterval.value;
    const options = [
      [30, "settingsRefresh30Seconds"],
      [60, "settingsRefresh60Seconds"],
      [120, "settingsRefresh2Minutes"],
      [300, "settingsRefresh5Minutes"],
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
    showStatus();
  }

  function open() {
    fillForm();
    if (!dialog.open) dialog.showModal();
    cliPathInput.focus();
  }

  function updateLanguage() {
    openButton.title = openButton.ariaLabel = t("openSettings");
    renderCloseIconButton(closeButton, { label: t("closeSettings") });
    document.querySelector("#settings-kicker").textContent = t("settingsKicker");
    document.querySelector("#settings-title").textContent = t("settingsTitle");
    document.querySelector("#settings-intro").textContent = t("settingsIntro");
    document.querySelector("#settings-cli-label").textContent = t("settingsCliPath");
    document.querySelector("#settings-cli-hint").textContent = t("settingsCliPathHint");
    cliPathInput.placeholder = t("settingsCliPathPlaceholder");
    browseButton.textContent = t("settingsBrowse");
    resetButton.textContent = t("settingsUsePath");
    document.querySelector("#settings-refresh-label").textContent = t("settingsRefreshInterval");
    document.querySelector("#settings-refresh-hint").textContent = t("settingsRefreshIntervalHint");
    cancelButton.textContent = t("settingsCancel");
    saveButton.textContent = t("settingsSave");
    renderIntervalOptions();
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
    setBusy(true);
    showStatus(t("settingsSaving"));
    try {
      const version = await onSave({
        cliPath: cliPathInput.value,
        refreshIntervalSeconds: Number(refreshInterval.value),
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

  updateLanguage();
  return { open, updateLanguage };
}
