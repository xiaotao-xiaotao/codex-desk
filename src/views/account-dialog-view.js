/**
 * 主界面账户区只读取用于展示的邮箱和套餐。
 * 不缓存认证数据，也不会将 app-server 返回的原始响应传到页面。
 */
export function createAccountOverviewView({ t, invoke }) {
  const email = document.querySelector("#account-email");
  const emailVisibilityButton = document.querySelector("#account-email-visibility");
  const plan = document.querySelector("#account-plan");
  const billingButton = document.querySelector("#account-billing");
  const message = document.querySelector("#account-message");
  let profile = null;
  let loading = false;
  let error = null;
  let isEmailVisible = true;

  /**
   * 保留邮箱前 2 位、@ 前最后 1 位及完整域名，既能辨认账号，也不会暴露主体内容。
   * 短邮箱会减少可见字符，确保至少隐藏 1 位。
   */
  function maskEmail(value) {
    const separatorIndex = value.lastIndexOf("@");
    if (separatorIndex <= 0) return "•".repeat(Math.max(1, value.length));

    const localPart = value.slice(0, separatorIndex);
    const domain = value.slice(separatorIndex);
    if (localPart.length <= 2) {
      return `${localPart.slice(0, 1)}${"•".repeat(Math.max(1, localPart.length - 1))}${domain}`;
    }
    if (localPart.length === 3) return `${localPart[0]}•${localPart[2]}${domain}`;
    return `${localPart.slice(0, 2)}${"•".repeat(localPart.length - 3)}${localPart.at(-1)}${domain}`;
  }

  function render() {
    if (loading) {
      email.textContent = plan.textContent = t("accountLoading");
      emailVisibilityButton.hidden = true;
      message.hidden = true;
      return;
    }

    const hasEmail = Boolean(profile?.email);
    email.textContent = hasEmail && !isEmailVisible ? maskEmail(profile.email) : (profile?.email ?? t("accountEmailUnavailable"));
    // 脱敏状态下不保留完整邮箱的悬浮提示，避免看似隐藏但仍可直接读到原文。
    email.title = hasEmail && isEmailVisible ? profile.email : "";
    emailVisibilityButton.hidden = !hasEmail;
    emailVisibilityButton.setAttribute("aria-pressed", String(isEmailVisible));
    emailVisibilityButton.classList.toggle("is-concealed", !isEmailVisible);
    const visibilityLabel = t(isEmailVisible ? "hideAccountEmail" : "showAccountEmail");
    emailVisibilityButton.title = visibilityLabel;
    emailVisibilityButton.setAttribute("aria-label", visibilityLabel);
    plan.textContent = profile?.planType ?? t("accountPlanUnavailable");
    message.hidden = !error;
    message.textContent = error ? t(error.key, { error: error.detail }) : "";
  }

  function toggleEmailVisibility() {
    if (!profile?.email) return;
    isEmailVisible = !isEmailVisible;
    render();
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    error = null;
    render();
    try {
      profile = await invoke("read_account");
    } catch (readError) {
      profile = null;
      error = { key: "accountReadFailed", detail: String(readError) };
    } finally {
      loading = false;
      render();
    }
  }

  async function openBillingPage() {
    error = null;
    render();
    try {
      // 账单门户会按浏览器登录态和购买渠道动态跳转，桌面端只打开官方账单入口。
      await invoke("open_billing_page");
    } catch (openError) {
      error = { key: "accountBillingOpenFailed", detail: String(openError) };
      render();
    }
  }

  billingButton.addEventListener("click", () => void openBillingPage());
  emailVisibilityButton.addEventListener("click", toggleEmailVisibility);

  return { refresh, updateLanguage: render };
}
