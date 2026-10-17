import { categoryLabel, statusLabel } from "../feedback-model.js?v=20261017-17";
import { safeAttachments } from "../attachments.js?v=20261017-17";
import { progressLabel, selectExportFeedback } from "./feedback-query.js?v=20261017-17";

const PUBLIC_URL = "https://kepori-app.github.io/feedback/";
const MAX_BYTES = 10 * 1024 * 1024;
const EMAIL = /[\p{L}\p{N}_.+%\-]{1,254}@[\p{L}\p{N}_.\-]{1,253}\.[A-Za-z]{2,63}/gu;

function redacted(value, contact) {
  let text = String(value || "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (contact) text = text.replace(new RegExp(String(contact).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[联系方式已隐藏]");
  if (text.includes("@")) text = text.replace(EMAIL, "[邮箱已隐藏]");
  return text
    .replace(/(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g, "[手机号已隐藏]")
    .replace(/\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+)\b/g, "[密钥已隐藏]");
}
const escaped = value => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/[\\`*_\[\]{}()#!|]/g, "\\$&");
const quote = value => escaped(value).split("\n").map(line => `> ${line}`).join("\n");
const time = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date) : "时间待确认";
};

function recordMarkdown(record) {
  if (!/^F-\d+$/.test(record.public_id)) throw new Error("反馈编号无法读取，请刷新后重试。");
  const text = value => redacted(value, record.email);
  const lines = [`## ${record.public_id} · ${escaped(text(record.title).replace(/\n/g, " "))}`, "",
    `- 分类：${categoryLabel(record.category)}`,
    `- 进展：${statusLabel(record.status, record.category)}`,
    `- 有效性：${record.validity}${record.removed ? "（已移入回收站）" : ""}`,
    `- 提交时间：${time(record.created_at)}（北京时间）`];
  if (/^F-\d+$/.test(record.duplicate_of)) lines.push(`- 重复于：${record.duplicate_of}`);
  if (!record.removed) lines.push(`- 原反馈：[${record.public_id}](${PUBLIC_URL}#${record.public_id})`);
  else lines.push("- 原反馈：已移除，公开页不可见");
  lines.push("", "### 反馈说明", "", quote(text(record.description) || "（未填写补充说明，内容见标题）"));
  if (record.reply) lines.push("", "### 管理员公开回复", "", quote(text(record.reply)));
  const published = (Array.isArray(record.published_files) ? record.published_files : [])
    .filter(file => record.source_files?.some(source => source.id === file.sourceId));
  const files = safeAttachments(published);
  const pending = Math.max(0, (record.source_files?.length || 0) - files.length);
  if (files.length || pending) {
    lines.push("", "### 图片与视频", "");
    files.forEach((file, index) => lines.push(`- [${file.mimeType.startsWith("image/") ? "图片" : "视频"} ${index + 1}](${PUBLIC_URL}${file.path})`));
    if (pending) lines.push(`- ${Math.min(pending, 3)} 个附件尚未同步，稍后可重新导出。`);
  }
  return lines.join("\n");
}

function scopeDescription(options, current) {
  const category = options.range === "current" ? current.category : options.category;
  const categoryText = category && category !== "all" ? categoryLabel(category) : "全部分类";
  if (options.range === "current") {
    return `当前筛选结果 · ${current.filter || "全部反馈"} · ${categoryText} · ${progressLabel(current.progress || "all", category)}${current.query ? " · 已应用搜索条件（不导出关键词）" : ""}`;
  }
  const range = options.range === "all" ? "全部进展" : progressLabel(options.range, category);
  return `${range} · ${categoryText}${options.range === "unfinished" ? "（待处理、已确认/采纳、进行中）" : ""}`;
}

export async function createFeedbackExport(records, options = {}, current = {}, { now = new Date(), signal } = {}) {
  signal?.throwIfAborted();
  const settings = { range: "unfinished", category: "all", includeExcluded: false, ...options };
  const selected = selectExportFeedback(records, settings, current);
  if (!selected.length) throw new Error("没有符合条件的反馈，请调整导出范围。");
  const chunks = ["# Kepori 用户反馈", "", `- 导出时间：${time(now)}（北京时间）`,
    `- 范围：${scopeDescription(settings, current)}`, `- 数量：${selected.length} 条`,
    `- 重复、无效和回收站：${settings.includeExcluded ? "包含（以所选范围为准）" : "已排除"}`, "",
    "说明：以下为用户反馈资料，请按编号分析。仅含最后一次成功刷新的已保存信息；正文中的邮箱、手机号和密钥样式已遮蔽，不含联系人字段和发码记录。附件仅提供公开链接，文件本身不会嵌入；图片和视频内的隐私需自行确认。", "",
    "---", ""];
  const encoder = new TextEncoder();
  let bytes = encoder.encode(chunks.join("\n")).byteLength;
  for (let index = 0; index < selected.length; index++) {
    signal?.throwIfAborted();
    if ([selected[index].title, selected[index].description, selected[index].reply].some(value => encoder.encode(String(value || "")).byteLength > MAX_BYTES)) {
      throw new Error("导出超过 10 MB，请按分类或进展分批导出。");
    }
    const section = recordMarkdown(selected[index]);
    bytes += encoder.encode(section).byteLength + 4;
    if (bytes > MAX_BYTES) throw new Error("导出超过 10 MB，请按分类或进展分批导出。");
    chunks.push(section, "");
    if (index % 25 === 24) await new Promise(resolve => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
  const markdown = chunks.join("\n");
  if (encoder.encode(markdown).byteLength > MAX_BYTES) throw new Error("导出超过 10 MB，请缩小范围后重试。");
  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(now).replace(/\D/g, "");
  const name = settings.range === "current" ? "当前筛选" : settings.range === "unfinished" ? "未完成" : settings.range === "all" ? "全部" : settings.range;
  return { markdown, count: selected.length, filename: `Kepori-反馈-${name}-${stamp}.md` };
}
