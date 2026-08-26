/**
 * 个人中心按需读取当前登录账户，仅保留用于展示的邮箱、套餐和登录方式。
 * 不缓存认证数据，也不会将 app-server 返回的原始响应传到页面。
 */
export function createAccountDialogView({ t, invoke }) {
  const openButton = document.querySelector("#account-button");
  const dialog = document.querySelector("#account-dialog");
  const closeButton = document.querySelector("#account-close");
  const email = document.querySelector("#account-email");
  const plan = document.querySelector("#account-plan");
  const accountType = document.querySelector("#account-type");
  const message = document.querySelector("#account-message");
  let profile = null;
  let loading = false;
  let error = null;

  function accountTypeLabel(type) {
    const key = {
      chatgpt: "accountTypeChatgpt",
      apiKey: "accountTypeApiKey",
      amazonBedrock: "accountTypeBedrock",
    }[type];
    return t(key ?? "accountTypeUnknown");
  }

  function render() {
    openButton.title = openButton.ariaLabel = t("openPersonalCenter");
    closeButton.ariaLabel = t("closePersonalCenter");
    if (loading) {
      email.textContent = plan.textContent = accountType.textContent = t("accountLoading");
      message.hidden = true;
      return;
    }

    email.textContent = profile?.email ?? t("accountEmailUnavailable");
    plan.textContent = profile?.planType ?? t("accountPlanUnavailable");
    accountType.textContent = accountTypeLabel(profile?.accountType);
    message.hidden = !error;
    message.textContent = error ? t("accountReadFailed", { error }) : "";
  }

  async function open() {
    if (!dialog.open) dialog.showModal();
    loading = true;
    error = null;
    render();
    try {
      profile = await invoke("read_account");
    } catch (readError) {
      profile = null;
      error = String(readError);
    } finally {
      loading = false;
      render();
    }
  }

  openButton.addEventListener("click", () => void open());
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  return { updateLanguage: render };
}
