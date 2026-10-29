import { STATUSES, CATEGORIES, categoryOf } from '../feedback-model.js?v=20261017-17';
export { STATUSES };
export const VALIDITIES = ["待确认", "有效", "重复", "无效"];

export function decodeRecord(issue) {
  if (issue.pull_request) return null;
  const match = issue.body?.match(/<!-- kepori-data:([A-Za-z0-9+/=]+) -->/);
  if (!match) return null;
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(match[1]), c => c.charCodeAt(0))));
  } catch { throw new Error(`第 ${issue.number} 条私有记录无法读取，请联系维护者检查。`); }
  if (!["feedback", "member"].includes(data?.kind)) return null;
  if (!Number.isSafeInteger(issue.number) || typeof data.email !== "string") throw new Error("私有记录格式异常，已停止加载。");
  if (data.kind === "feedback" && (!STATUSES.includes(data.status) || !VALIDITIES.includes(data.validity))) {
    throw new Error(`F-${issue.number} 的状态格式异常，已停止加载。`);
  }
  if (data.kind === "feedback" && data.category !== undefined && !Object.hasOwn(CATEGORIES, data.category)) throw new Error(`F-${issue.number} 的分类格式异常，已停止加载。`);
  if (data.kind === "feedback" && data.removed !== undefined && typeof data.removed !== "boolean") throw new Error(`F-${issue.number} 的回收站状态异常，已停止加载。`);
  return { ...data, ...(data.kind === "feedback" ? { category: categoryOf(data.category), removed: data.removed === true } : {}), issue_number: issue.number, public_id: `F-${issue.number}`,
    suspected: issue.labels?.some(label => label.name === "疑似重复") || false };
}

export function groupMembers(records) {
  const groups = new Map();
  for (const record of records) {
    const email = record.email.normalize("NFKC").trim().toLowerCase();
    if (!groups.has(email)) groups.set(email, { email, records: [], valid: 0, duplicates: 0, issued: false, member: null });
    const group = groups.get(email);
    if (record.kind === "member") {
      // Keep the original user issue authoritative when an import created duplicates.
      if (!group.member || record.issue_number < group.member.issue_number) {
        group.member = record;
        group.issued = record.issued === true;
      }
    }
    else {
      group.records.push(record);
      if (!record.removed && record.validity === "有效" && !record.duplicate_of) group.valid++;
      if (!record.removed && record.validity === "重复") group.duplicates++;
    }
  }
  return [...groups.values()].filter(group => group.records.length)
    .sort((a, b) => Number(a.issued) - Number(b.issued) || Number(b.valid >= 3) - Number(a.valid >= 3) || b.valid - a.valid || a.email.localeCompare(b.email));
}

export function duplicateTarget(source, targetId, records) {
  const lookup = new Map(records.map(record => [record.public_id, record]));
  let target = lookup.get(targetId);
  const visited = new Set([source.public_id]);
  while (target) {
    if (source.removed || target.removed) throw new Error("请先恢复已移除的反馈，再设置重复关联。");
    if (visited.has(target.public_id)) throw new Error("不能关联自身，也不能形成重复循环。");
    visited.add(target.public_id);
    if (!target.duplicate_of) return target;
    target = lookup.get(target.duplicate_of);
  }
  throw new Error("原反馈不存在，请刷新后重新选择。");
}

export function operation(record, type, value, feedback) {
  if (record.kind === "member") {
    if (type !== "issued" || typeof value !== "boolean") throw new Error("发码操作无效。");
    return { body: value ? "/已发放" : "/撤销发放", expected: { issued: value } };
  }
  if (type === "removed" && typeof value === "boolean") return { body: value ? "/移除" : "/恢复", expected: { removed: value } };
  if (record.removed) throw new Error("请先恢复这条反馈，再修改处理结果。");
  if (type === "status" && STATUSES.includes(value)) return { body: `/状态 ${value}`, expected: { status: value } };
  if (type === "category" && Object.hasOwn(CATEGORIES, value)) return { body: `/分类 ${value}`, expected: { category: value } };
  if (type === "validity" && ["待确认", "有效", "无效"].includes(value)) {
    return { body: `/计数 ${value}`, expected: { validity: value, duplicate_of: null } };
  }
  if (type === "duplicate") {
    const target = duplicateTarget(record, value, feedback);
    return { body: `/重复 ${target.public_id}`, expected: { validity: "重复", duplicate_of: target.public_id } };
  }
  if (type === "reply" && typeof value === "string") {
    const reply = value.trim();
    if (reply.includes("\n") || reply.includes("\r") || reply.length > 6000 || reply === "清空") {
      throw new Error("公开回复请写成一段，最多 6000 字；清除回复请留空保存。");
    }
    return { body: `/回复 ${reply || "清空"}`, expected: { reply } };
  }
  throw new Error("不支持的管理操作。");
}

export function commandResult(record, pending) {
  if ((record.command_id || 0) < pending.id) return "pending";
  return Object.entries(pending.expected).every(([key, value]) => (record[key] ?? null) === value) ? "applied" : "rejected";
}

export function semanticCandidates(comments) {
  const candidates = new Map();
  for (const comment of comments) {
    if (comment.user?.login !== "github-actions[bot]" || !comment.body?.includes("疑似同义反馈")) continue;
    for (const match of comment.body.matchAll(/- (F-\d+) · 相似度 (\d+%)/g)) candidates.set(match[1], match[2]);
  }
  return candidates;
}
