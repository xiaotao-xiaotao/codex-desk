/**
 * 连续且内容完全相同的结构化活动代表同一种重复操作，可合并为一条摘要。
 * 不跨越不同文件、命令或状态合并；携带 patch 的文件操作也不合并，确保每次历史差异都可查看。
 */
export function groupConsecutiveActivities(activities) {
  const grouped = [];
  for (const activity of activities ?? []) {
    const previous = grouped.at(-1);
    const isSameActivity = previous
      && previous.kind === activity.kind
      && previous.title === activity.title
      && previous.detail === activity.detail
      && previous.status === activity.status
      && !(previous.changes?.length || activity.changes?.length);
    if (isSameActivity) {
      previous.count += 1;
    } else {
      grouped.push({ ...activity, count: 1 });
    }
  }
  return grouped;
}
