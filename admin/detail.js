import { STATUSES } from "./domain.js?v=20261017-6";
import { CATEGORIES, categoryLabel, statusLabel } from "../feedback-model.js?v=20261017-6";
import { el, button, badge, date } from "./views.js?v=20261017-6";
import { attachmentGallery, pendingAttachments } from "../attachments.js?v=20261017-6";
import { duplicateControls } from "./duplicate.js?v=20261017-6";

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

export function feedbackDetail(record, group, feedback, pending, actions) {
  const root = el("div", "detail-panel");
  root.dataset.feedbackId = record.public_id;
  root.append(el("span", "eyebrow muted", `${record.public_id} · ${date(record.created_at)}`), el("h2", "inspector-title", record.title));
  const tags = el("div", "record-badges");
  tags.append(badge(categoryLabel(record.category)), badge(record.validity, record.validity === "有效"), badge(statusLabel(record.status, record.category)));
  root.append(tags, el("p", "feedback-text", record.description));
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
  const form = el("fieldset", "action-sections");
  form.disabled = pending;
  const validity = el("section", "action-section");
  validity.append(el("h3", "", "计数"));
  const choices = el("div", "action-row");
  for (const [value, label] of [["有效", "标记有效"], ["无效", "不计数"], ["待确认", "恢复待确认"]]) {
    const choice = button(label, () => actions.send(record, "validity", value));
    choice.disabled = record.validity === value && !record.duplicate_of;
    choices.append(choice);
  }
  validity.append(choices);
  validity.append(duplicateControls(record, feedback, actions));
  const category = el("section", "action-section"); category.append(el("h3", "", "分类"),
    choiceButtons(Object.entries(CATEGORIES), record.category || "other", value => actions.send(record, "category", value), "反馈分类"));
  const status = el("section", "action-section"); status.append(el("h3", "", "处理进展"),
    choiceButtons(STATUSES.map(value => [value, statusLabel(value, record.category)]), record.status,
      value => actions.send(record, "status", value), "处理进展"));
  const reply = el("details", "action-section reply-section"); reply.append(el("summary", "", "公开回复（选填）"));
  reply.open = Boolean(record.reply);
  const replyField = el("input", "reply-input"); replyField.type = "text"; replyField.maxLength = 6000;
  replyField.setAttribute("aria-label", "公开回复内容"); replyField.placeholder = "例如：感谢建议，已安排到下一版。"; replyField.value = record.reply || "";
  replyField.dataset.initial = record.reply || "";
  reply.append(replyField, button("保存公开回复", () => actions.send(record, "reply", replyField.value)), el("p", "subtle", "留空保存可清除回复。这里的文字所有人可见。"));
  form.append(validity, status, category, reply); root.append(form);
  return root;
}

export function captureDraft(inspector) {
  const panel = inspector.querySelector("[data-feedback-id]");
  if (!panel) return null;
  const reply = panel.querySelector(".reply-input");
  const search = panel.querySelector(".duplicate-box input");
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
  if (!draft || !panel || draft.id !== panel.dataset.feedbackId) return;
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
  const count = el("div", "member-progress");
  count.append(el("strong", "", String(group.valid)), el("span", "", "/ 3 条有效反馈"));
  root.append(count, el("p", "subtle", `共 ${group.records.length} 条反馈，其中 ${group.duplicates} 条重复。不按月清零。`));
  const reward = el("div", "member-reward");
  reward.append(el("h3", "", group.issued ? "已记录发码" : group.valid >= 3 ? "已达标，可以联系发码" : "继续累计中"), el("p", "subtle", "三条有效且不重复反馈，获得 48 元购买终身会员的优惠资格。"));
  const email = el("a", "button secondary small", "打开邮箱联系用户 ↗");
  email.href = `mailto:${encodeURIComponent(group.email)}`; reward.append(email);
  const issue = group.member;
  const issued = button(group.issued ? "撤销已发码标记" : "我已发码，标记完成", () => actions.send(issue, "issued", !group.issued));
  issued.disabled = pending || !issue || (!group.issued && group.valid < 3);
  reward.append(issued, el("p", "subtle", "请先自行发送兑换码，再标记。此按钮只记录发放结果。"));
  if (!issue) reward.append(el("p", "subtle", "用户累计记录仍在生成，稍后刷新即可标记。"));
  root.append(reward, el("h3", "history-title", "该邮箱的全部反馈"));
  const history = el("div", "member-history");
  for (const record of [...group.records].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const link = button("", () => actions.feedback(record.public_id), "history-link");
    link.append(el("span", "subtle", `${record.public_id} · ${date(record.created_at)} · ${categoryLabel(record.category)} · ${record.validity}`), el("strong", "", record.title)); history.append(link);
  }
  root.append(history); return root;
}
