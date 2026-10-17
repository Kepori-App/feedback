export function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
export function button(text, action, className = "button secondary small") {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
export function notice(node, text = "", error = false) {
  node.textContent = text;
  node.hidden = !text;
  node.classList.toggle("error", error);
}
export function badge(text, positive = false) { return el("span", `admin-badge${positive ? " positive" : ""}`, text); }
export function date(value) {
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(time) : "时间待确认";
}
export function empty(title, description) {
  const node = el("div", "admin-empty");
  node.append(el("h3", "", title), el("p", "subtle", description));
  return node;
}
export function metric(value, label, action) {
  const node = button("", action, "admin-metric");
  node.append(el("strong", "", String(value)), el("span", "", label));
  return node;
}
export function feedbackRow(record, selected, pending, action) {
  const node = button("", action, `record-row${selected ? " selected" : ""}`);
  node.setAttribute("aria-pressed", String(selected));
  const top = el("span", "record-top");
  top.append(el("span", "record-id", record.public_id), el("span", "subtle", date(record.created_at)));
  const badges = el("span", "record-badges");
  badges.append(badge(record.validity, record.validity === "有效"), badge(record.status));
  if (record.suspected && record.validity === "待确认") badges.append(badge("疑似重复"));
  if (pending) badges.append(badge("同步中…"));
  node.append(top, el("strong", "record-title", record.title), el("span", "record-contact", record.email), badges);
  return node;
}
export function memberRow(group, selected, pending, action) {
  const node = button("", action, `record-row${selected ? " selected" : ""}`);
  node.setAttribute("aria-pressed", String(selected));
  const top = el("span", "record-top");
  top.append(badge(group.issued ? "已发码" : group.valid >= 3 ? "待发码" : "累计中", group.valid >= 3), el("span", "subtle", `${group.records.length} 条反馈`));
  const count = el("span", "member-count");
  count.append(el("strong", "", String(group.valid)), el("span", "subtle", " / 3 条有效反馈"));
  node.append(top, el("strong", "record-title", group.email), count);
  if (pending) node.append(badge("发放标记同步中…"));
  return node;
}
