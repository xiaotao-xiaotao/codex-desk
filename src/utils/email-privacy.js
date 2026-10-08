/** 统一脱敏邮箱；调用方应使用同样的展示值作为悬浮提示，避免泄露原文。 */
export function displayEmail(value, hidden) {
  if (!value || !hidden) return value;
  const separator = value.lastIndexOf("@");
  if (separator <= 0) return "•".repeat(Math.max(1, value.length));
  const local = value.slice(0, separator);
  const domain = value.slice(separator);
  if (local.length === 1) return `•${domain}`;
  if (local.length === 2) return `${local[0]}•${domain}`;
  if (local.length === 3) return `${local[0]}•${local[2]}${domain}`;
  return `${local.slice(0, 2)}${"•".repeat(local.length - 3)}${local.at(-1)}${domain}`;
}
