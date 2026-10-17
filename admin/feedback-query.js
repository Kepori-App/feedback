import { STATUSES, statusLabel } from "../feedback-model.js?v=20261017-12";

export const PROGRESS = ["all", "unfinished", ...STATUSES];
export function progressLabel(value, category = "all") {
  return value === "all" ? "全部进展" : value === "unfinished" ? "未完成" : statusLabel(value, category);
}

export function selectFeedback(records, { filter = "全部反馈", category = "all", progress = "all", query = "", removed } = {}) {
  const search = String(query).normalize("NFKC").trim().toLocaleLowerCase();
  const trash = removed || (filter === "回收站" ? "only" : "exclude");
  return records.filter(record => record.kind === "feedback" &&
    (trash === "include" || (trash === "only" ? record.removed === true : !record.removed)) &&
    (filter === "全部反馈" || filter === "回收站" || record.validity === filter) &&
    (category === "all" || record.category === category) &&
    (progress === "all" || (progress === "unfinished" ? STATUSES.slice(0, 3).includes(record.status) : record.status === progress)) &&
    `${record.public_id} ${record.title} ${record.description} ${record.email}`.normalize("NFKC").toLocaleLowerCase().includes(search))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || a.public_id.localeCompare(b.public_id, "en", { numeric: true }));
}

export function selectExportFeedback(records, { range = "unfinished", category = "all", includeExcluded = false } = {}, current = {}) {
  if (range !== "current" && !PROGRESS.includes(range)) throw new Error("请选择有效的导出范围。");
  const scoped = selectFeedback(records, range === "current" ? current : {
    category, progress: range, removed: includeExcluded ? "include" : "exclude",
  });
  return scoped.filter(record => includeExcluded || (!record.removed && !record.duplicate_of && ["待确认", "有效"].includes(record.validity)));
}
