import { STATUSES } from "./domain.js?v=20261017-17";
import { CATEGORIES, categoryLabel, statusLabel } from "../feedback-model.js?v=20261017-17";
import { el, button, badge, date } from "./views.js?v=20261017-17";
import { attachmentGallery, pendingAttachments } from "../attachments.js?v=20261017-17";
import { duplicateControls } from "./duplicate.js?v=20261017-17";

function choiceButtons(values, selected, action, label) {
  const row = el("div", "action-row choice-row"); row.setAttribute("role", "group"); row.setAttribute("aria-label", label);
  for (const [value, text] of values) {
    const option = button(text, () => action(value), "button secondary small choice-button");
    option.setAttribute("aria-pressed", String(value === selected));
    option.classList.toggle("active", value === selected); option.disabled = value === selected;
    row.append(option);
  }
  return row;
}

function savingNotice(root, saving) {
  if (saving.any) {
    const status = el("p", "notice", `正在保存：${saving.labels.join("、")}。${saving.removed || saving.issued ? "" : "其他选项可继续操作。"}`);
    status.setAttribute("role", "status"); root.append(status);
  }
  if (saving.notice && (!saving.any || saving.notice.error)) {
    const status = el("p", `notice${saving.notice.error ? " error" : ""}`, saving.notice.text);
    status.setAttribute("role", "status"); root.append(status);
  }
}
function actionSection(label, disabled, className = "action-section") {
  const section = el("fieldset", className); section.disabled = disabled; section.setAttribute("aria-label", label); return section;
}

export function feedbackDetail(record, group, feedback, pending, actions) {
  const root = el("div", "detail-panel");
  root.dataset.feedbackId = record.public_id;
  root.append(el("span", "eyebrow muted", `${record.public_id} · ${date(record.created_at)}`), el("h2", "inspector-title", record.title));
  const tags = el("div", "record-badges");
  tags.append(badge(categoryLabel(record.category)));
  if (record.removed) tags.append(badge("已移除 · 不公开、不计数"));
  else tags.append(badge(record.validity, record.validity === "有效"), badge(statusLabel(record.status, record.category)));
  root.append(tags, el("p", "feedback-text", record.description));
  savingNotice(root, pending);
  const files = record.published_files?.filter(item => record.source_files?.some(source => source.id === item.sourceId)) || [];
  if (files.length) {
    const attachments = el("details", "admin-attachments");
    attachments.append(el("summary", "", `查看 ${files.length} 个附件`), attachmentGallery(files)); root.append(attachments);
  }
  root.append(pendingAttachments(Math.max(0, (record.source_files?.length || 0) - files.length)));
  const contact = el("div", "private-contact");
  contact.append(el("span", "subtle", "联系邮箱 · 仅管理员可见"), el("strong", "", record.email),
    button(`此邮箱有效 ${group?.valid || 0} / 3 条，查看全部 →`, () => actions.member(record.email), "text-button contact-total"));
  root.append(contact);
  if (record.removed) {
    const restore = button("恢复反馈", () => actions.send(record, "removed", false)); restore.disabled = pending.any;
    const removed = el("section", "moderation-section");
    removed.append(el("p", "subtle", "这条反馈已移入回收站。恢复后重新公开，并按原有标记计数。"), restore);
    root.append(removed); return root;
  }
  const form = el("div", "action-sections");
  const validity = actionSection("计数与重复", pending.validity || pending.removed);
  validity.append(el("h3", "", "计数"));
  const choices = el("div", "action-row");
  for (const [value, label] of [["有效", "标记有效"], ["无效", "不计数"], ["待确认", "恢复待确认"]]) {
    const choice = button(label, () => actions.send(record, "validity", value));
    choice.disabled = record.validity === value && !record.duplicate_of;
    choices.append(choice);
  }
  validity.append(choices);
  validity.append(duplicateControls(record, feedback, actions));
  const category = actionSection("分类", pending.category || pending.removed); category.append(el("h3", "", "分类"),
    choiceButtons(Object.entries(CATEGORIES), record.category || "other", value => actions.send(record, "category", value), "反馈分类"));
  const status = actionSection("处理进展", pending.status || pending.removed); status.append(el("h3", "", "处理进展"),
    choiceButtons(STATUSES.map(value => [value, statusLabel(value, record.category)]), record.status,
      value => actions.send(record, "status", value), "处理进展"));
  const reply = el("details", "action-section reply-section"); reply.append(el("summary", "", "公开回复（选填）"));
  reply.open = Boolean(record.reply);
  const replyField = el("input", "reply-input"); replyField.type = "text"; replyField.maxLength = 6000;
  replyField.setAttribute("aria-label", "公开回复内容"); replyField.placeholder = "例如：感谢建议，已安排到下一版。"; replyField.value = record.reply || "";
  replyField.dataset.initial = record.reply || "";
  const replyControls = actionSection("公开回复", pending.reply || pending.removed, "action-sections");
  replyControls.append(replyField, button("保存公开回复", () => actions.send(record, "reply", replyField.value)), el("p", "subtle", "留空保存可清除回复。这里的文字所有人可见。"));
  reply.append(replyControls);
  const moderation = el("section", "moderation-section");
  const remove = button("移入回收站", () => actions.send(record, "removed", true), "text-button"); remove.disabled = pending.any;
  moderation.append(remove,
    el("p", "subtle", "从公开页移除并停止计数，之后可恢复。"));
  form.append(validity, status, category, reply, moderation); root.append(form);
  return root;
}

export function captureDraft(inspector) {
  const panel = inspector.querySelector("[data-feedback-id]");
  if (!panel) return null;
  const reply = panel.querySelector(".reply-input");
  const search = panel.querySelector(".duplicate-box input");
  if (!reply || !search) return null;
  const active = document.activeElement;
  return { id: panel.dataset.feedbackId,
    reply: reply.value !== reply.dataset.initial ? reply.value : undefined,
    duplicateOpen: panel.querySelector(".duplicate-box").open,
    replyOpen: panel.querySelector(".reply-section").open,
    attachmentsOpen: panel.querySelector(".admin-attachments")?.open,
    query: search.value, target: panel.querySelector(".duplicate-select").value,
    focus: active === reply ? ".reply-input" : active === search ? ".duplicate-box input" : null,
    start: active === reply || active === search ? active.selectionStart : null,
    end: active === reply || active === search ? active.selectionEnd : null };
}

export function restoreDraft(inspector, draft) {
  const panel = inspector.querySelector("[data-feedback-id]");
  if (!draft || !panel || draft.id !== panel.dataset.feedbackId || !panel.querySelector(".reply-input")) return;
  panel.querySelector(".duplicate-box").open = draft.duplicateOpen;
  panel.querySelector(".reply-section").open = draft.replyOpen;
  if (panel.querySelector(".admin-attachments")) panel.querySelector(".admin-attachments").open = draft.attachmentsOpen || false;
  const search = panel.querySelector(".duplicate-box input"); search.value = draft.query;
  search.dispatchEvent(new Event("input"));
  const target = panel.querySelector(".duplicate-select");
  if ([...target.options].some(option => option.value === draft.target)) target.value = draft.target;
  if (draft.reply !== undefined) panel.querySelector(".reply-input").value = draft.reply;
  if (draft.focus) {
    const field = panel.querySelector(draft.focus); field.focus({ preventScroll: true });
    if (draft.start !== null) field.setSelectionRange(draft.start, draft.end);
  }
}

export function memberDetail(group, pending, actions) {
  const root = el("div", "detail-panel");
  root.append(el("span", "eyebrow muted", "同一邮箱 · 持续累计"), el("h2", "inspector-title", group.email));
  savingNotice(root, pending);
  const count = el("div", "member-progress");
  count.append(el("strong", "", String(group.valid)), el("span", "", "/ 3 条有效反馈"));
  const removedCount = group.records.filter(record => record.removed).length;
  root.append(count, el("p", "subtle", `共 ${group.records.length} 条反馈，${group.duplicates} 条重复${removedCount ? `，${removedCount} 条已移除` : ""}。不按月清零。`));
  const reward = el("div", "member-reward");
  reward.append(el("h3", "", group.issued ? "已记录发码" : group.valid >= 3 ? "已达标，可以联系发码" : "继续累计中"), el("p", "subtle", "累计三条有效且不重复反馈，可获 48 元解锁终身会员的资格。"));
  const email = el("a", "button secondary small", "打开邮箱联系用户 ↗");
  email.href = `mailto:${encodeURIComponent(group.email)}`; reward.append(email);
  const issue = group.member;
  const issued = button(group.issued ? "撤销已发码标记" : "我已发码，标记完成", () => actions.send(issue, "issued", !group.issued));
  issued.disabled = pending.any || !issue || (!group.issued && group.valid < 3);
  reward.append(issued, el("p", "subtle", "请先自行发送兑换码，再标记。此按钮只记录发放结果。"));
  if (!issue) reward.append(el("p", "subtle", "用户累计记录仍在生成，稍后刷新即可标记。"));
  root.append(reward, el("h3", "history-title", "该邮箱的全部反馈"));
  const history = el("div", "member-history");
  for (const record of [...group.records].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const link = button("", () => actions.feedback(record.public_id), "history-link");
    link.append(el("span", "subtle", `${record.public_id} · ${date(record.created_at)} · ${categoryLabel(record.category)} · ${record.removed ? "已移除 · 不计数" : record.validity}`), el("strong", "", record.title)); history.append(link);
  }
  root.append(history); return root;
}
