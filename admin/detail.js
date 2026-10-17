import { STATUSES, duplicateTarget, semanticCandidates } from "./domain.js";
import { el, button, badge, date } from "./views.js";

export function feedbackDetail(record, group, feedback, pending, actions) {
  const root = el("div", "detail-panel");
  root.append(el("span", "eyebrow muted", `${record.public_id} · ${date(record.created_at)}`), el("h2", "inspector-title", record.title));
  const tags = el("div", "record-badges");
  tags.append(badge(record.validity, record.validity === "有效"), badge(record.status));
  root.append(tags, el("p", "feedback-text", record.description));
  const contact = el("div", "private-contact");
  contact.append(el("span", "subtle", "联系邮箱 · 仅管理员可见"), el("strong", "", record.email),
    button(`此邮箱有效 ${group?.valid || 0} / 3 条，查看全部 →`, () => actions.member(record.email), "text-button"));
  root.append(contact);
  const form = el("fieldset", "action-sections");
  form.disabled = pending;
  const validity = el("section", "action-section");
  validity.append(el("h3", "", "① 这条是否计数"));
  const choices = el("div", "action-row");
  for (const [value, label] of [["有效", "标记有效"], ["无效", "不计数"], ["待确认", "恢复待确认"]]) {
    const choice = button(label, () => actions.send(record, "validity", value));
    choice.disabled = record.validity === value && !record.duplicate_of;
    choices.append(choice);
  }
  validity.append(choices);
  const duplicate = el("details", "duplicate-box");
  duplicate.append(el("summary", "", record.duplicate_of ? `重复反馈 → ${record.duplicate_of}` : "标记重复，选择已有建议"));
  const label = el("label", "field", "搜索原反馈");
  const search = el("input"); search.type = "search"; search.placeholder = "输入编号或建议关键词"; label.append(search);
  const select = el("select", "duplicate-select"); select.setAttribute("aria-label", "选择原反馈");
  const optionList = () => {
    const query = search.value.trim().toLowerCase();
    const options = [];
    for (const other of feedback) {
      try { if (duplicateTarget(record, other.public_id, feedback).public_id !== other.public_id) continue; }
      catch { continue; }
      if (query && !`${other.public_id} ${other.title} ${other.description}`.toLowerCase().includes(query)) continue;
      const option = el("option", "", `${other.public_id} · ${other.title}`); option.value = other.public_id; options.push(option);
    }
    select.replaceChildren(...options);
    submitDuplicate.disabled = !options.length;
  };
  const submitDuplicate = button("确认重复 · 不计数", () => actions.send(record, "duplicate", select.value));
  search.addEventListener("input", optionList); optionList();
  duplicate.append(label, select, submitDuplicate, el("p", "subtle", "重复仍会公开，并链接到原建议；不计入三条。"));
  validity.append(duplicate);
  if (record.suspected) {
    const candidates = el("div", "candidate-box"); candidates.append(el("p", "subtle", "正在读取同义反馈候选…"));
    validity.append(candidates);
    actions.api.comments(record.issue_number).then(comments => {
      if (!root.isConnected) return;
      candidates.replaceChildren(el("p", "subtle", "自动比较仅供参考，请确认是否为同一个需求。"));
      for (const [id, score] of semanticCandidates(comments)) {
        const target = feedback.find(item => item.public_id === id);
        if (!target) continue;
        candidates.append(button(`${id} · ${target.title}（相似度 ${score}）`, () => actions.feedback(id), "candidate-link"));
      }
    }).catch(error => { if (root.isConnected) candidates.replaceChildren(el("p", "subtle", error.message)); });
  }
  const status = el("section", "action-section"); status.append(el("h3", "", "② 处理进展"));
  const statusRow = el("div", "status-actions");
  const statusSelect = el("select", "status-select"); statusSelect.setAttribute("aria-label", "处理状态");
  for (const value of STATUSES) { const option = el("option", "", value); option.value = value; statusSelect.append(option); }
  statusSelect.value = record.status;
  const saveStatus = button("保存状态", () => actions.send(record, "status", statusSelect.value));
  saveStatus.disabled = true;
  statusSelect.addEventListener("change", () => { saveStatus.disabled = statusSelect.value === record.status; });
  statusRow.append(statusSelect, saveStatus); status.append(statusRow, el("p", "subtle", "有效反馈可以暂不采纳，计数与采纳互不影响。"));
  const reply = el("section", "action-section"); reply.append(el("h3", "", "③ 公开回复（选填）"));
  const replyField = el("input", "reply-input"); replyField.type = "text"; replyField.maxLength = 6000;
  replyField.setAttribute("aria-label", "公开回复内容"); replyField.placeholder = "例如：感谢建议，已安排到下一版。"; replyField.value = record.reply || "";
  reply.append(replyField, button("保存公开回复", () => actions.send(record, "reply", replyField.value)), el("p", "subtle", "留空保存可清除回复。这里的文字所有人可见。"));
  form.append(validity, status, reply); root.append(form);
  if (pending) root.prepend(el("p", "notice", "操作已提交，正在同步；确认后累计数会自动更新。"));
  return root;
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
  if (pending) reward.append(el("p", "notice", "发放标记已提交，正在同步。"));
  root.append(reward, el("h3", "history-title", "该邮箱的全部反馈"));
  const history = el("div", "member-history");
  for (const record of [...group.records].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const link = button("", () => actions.feedback(record.public_id), "history-link");
    link.append(el("span", "subtle", `${record.public_id} · ${date(record.created_at)} · ${record.validity}`), el("strong", "", record.title)); history.append(link);
  }
  root.append(history); return root;
}
