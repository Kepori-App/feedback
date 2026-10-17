import { decodeRecord, groupMembers, operation, commandResult } from "./domain.js";
import { el, button, notice, empty, metric, feedbackRow, memberRow } from "./views.js";
import { feedbackDetail, memberDetail } from "./detail.js";

const FILTERS = { feedback: ["待确认", "全部反馈", "有效", "重复", "无效"], members: ["待发码", "全部用户", "已发码", "累计中"] };
export function createDashboard(api) {
  const byId = id => document.getElementById(id);
  let records = [], groups = [], view = "feedback", filter = "待确认", selected = null, limit = 30;
  let stopped = false, refreshing = false, timer, summaryNumber, lastDetail = "", importRequested = false;
  const pending = new Map(), sending = new Set(), removers = [];
  const listen = (node, event, handler) => { node.addEventListener(event, handler); removers.push(() => node.removeEventListener(event, handler)); };
  const feedback = () => records.filter(record => record.kind === "feedback");
  const message = (text, error = false) => notice(byId("workspace-message"), text, error);
  const actions = { api, send, feedback: id => selectView("feedback", "全部反馈", id), member: email => selectView("members", "全部用户", email) };

  function selectView(nextView, nextFilter, selection = null) {
    view = nextView; filter = nextFilter; selected = selection; limit = 30; lastDetail = "";
    byId("admin-search").value = ""; render();
  }
  function choose(id) {
    selected = id; lastDetail = ""; render();
    if (matchMedia("(max-width: 800px)").matches) byId("inspector").scrollIntoView({ behavior: "instant", block: "start" });
  }
  function render() {
    const items = feedback();
    byId("metrics").replaceChildren(
      metric(items.filter(item => item.validity === "待确认").length, "待确认反馈", () => selectView("feedback", "待确认")),
      metric(groups.filter(group => group.valid >= 3 && !group.issued).length, "达标待发码", () => selectView("members", "待发码")),
      metric(items.length, "全部反馈", () => selectView("feedback", "全部反馈")),
      metric(groups.filter(group => group.issued).length, "已发码用户", () => selectView("members", "已发码")));
    document.querySelectorAll("[data-view]").forEach(node => {
      const active = node.dataset.view === view; node.classList.toggle("active", active); node.setAttribute("aria-pressed", String(active));
    });
    byId("admin-filters").replaceChildren(...FILTERS[view].map(value => {
      const node = button(value, () => { filter = value; selected = null; limit = 30; render(); }, `filter${filter === value ? " active" : ""}`);
      node.setAttribute("aria-pressed", String(filter === value)); return node;
    }));
    const query = byId("admin-search").value.trim().toLowerCase();
    let visible = view === "feedback" ? items.filter(item => (filter === "全部反馈" || item.validity === filter) &&
      `${item.public_id} ${item.title} ${item.description} ${item.email}`.toLowerCase().includes(query))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)) : groups.filter(group =>
      (filter === "全部用户" || (filter === "待发码" && group.valid >= 3 && !group.issued) ||
        (filter === "已发码" && group.issued) || (filter === "累计中" && group.valid < 3 && !group.issued)) && group.email.toLowerCase().includes(query));
    byId("list-title").textContent = filter === "待确认" ? "待确认的反馈" : filter;
    byId("list-count").textContent = `${visible.length} ${view === "feedback" ? "条" : "位"}`;
    const key = item => view === "feedback" ? item.public_id : item.email;
    const all = view === "feedback" ? items : groups;
    if (!all.some(item => key(item) === selected)) selected = visible[0] ? key(visible[0]) : null;
    byId("admin-list").replaceChildren(...visible.slice(0, limit).map(item => view === "feedback" ?
      feedbackRow(item, selected === key(item), pending.has(item.issue_number), () => choose(key(item))) :
      memberRow(item, selected === key(item), pending.has(item.member?.issue_number), () => choose(key(item)))));
    if (!visible.length) byId("admin-list").append(empty(query ? "没有匹配的记录" : view === "members" && filter === "待发码" ? "暂时没有待发码用户" : "这里暂时没有记录", query ? "试试其他关键词或邮箱。" : "用户提交后会自动同步。你也可以点击上方“同步新反馈”。"));
    byId("more").hidden = visible.length <= limit;
    const current = all.find(item => key(item) === selected);
    const owner = current && view === "feedback" ? groups.find(group => group.email === current.email) : null;
    const signature = JSON.stringify([view, current, owner?.valid, current && pending.get(view === "feedback" ? current.issue_number : current.member?.issue_number)]);
    if (signature !== lastDetail) {
      lastDetail = signature;
      byId("inspector").replaceChildren(current ? view === "feedback" ?
        feedbackDetail(current, groups.find(group => group.email === current.email), items, pending.has(current.issue_number), actions) :
        memberDetail(current, pending.has(current.member?.issue_number), actions) : empty("选一条，认真回应", "反馈详情、处理按钮和用户累计会显示在这里。"));
    }
  }
  async function send(record, type, value) {
    if (stopped || !record || pending.has(record.issue_number) || sending.has(record.issue_number)) return;
    sending.add(record.issue_number);
    const fieldset = byId("inspector").querySelector("fieldset"); if (fieldset) fieldset.disabled = true;
    byId("inspector").querySelectorAll("button").forEach(node => { node.disabled = true; });
    try {
      const change = operation(record, type, value, feedback());
      const response = await api.comment(record.issue_number, change.body);
      if (stopped) return;
      pending.set(record.issue_number, { id: response.id, expected: change.expected, started: Date.now() });
      message("操作已提交，正在同步。确认后会自动更新；公开页随后更新。");
    } catch (error) { if (!stopped) message(error.message, true); }
    finally { sending.delete(record.issue_number); if (!stopped) { lastDetail = ""; render(); schedule(); } }
  }
  function schedule() {
    clearTimeout(timer);
    if (stopped) return;
    const active = [...pending.values()].some(item => Date.now() - item.started < 300000);
    timer = setTimeout(() => refresh(false), active || importRequested ? 10000 : 60000);
  }
  async function refresh(manual = true) {
    if (stopped || refreshing) return;
    refreshing = true; byId("refresh").disabled = true; byId("admin-list").setAttribute("aria-busy", "true");
    try {
      const issues = await api.issues();
      if (stopped) return;
      summaryNumber = issues.find(issue => issue.labels?.some(label => label.name === "类型:总览"))?.number;
      byId("import").disabled = !summaryNumber || importRequested;
      records = issues.map(decodeRecord).filter(Boolean); groups = groupMembers(records);
      const rejections = [];
      for (const [number, change] of pending) {
        const record = records.find(item => item.issue_number === number);
        const result = record ? commandResult(record, change) : "pending";
        if (result !== "pending") { pending.delete(number); if (result === "rejected") rejections.push(`F-${number}`); }
      }
      render();
      byId("account-info").textContent = `私有记录已连接 · ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())} 刷新`;
      if (rejections.length) message(`${rejections.join("、")} 的操作未按预期应用，请检查记录后重试。`, true);
      else if (pending.size) message([...pending.values()].some(item => Date.now() - item.started > 300000) ? "GitHub 处理时间较长，记录仍在同步。稍后点“刷新列表”；不必重复提交。" : "操作已提交，正在同步；累计以 GitHub 确认结果为准。");
      else if (manual) message(importRequested ? "列表已刷新。同步请求已发送，新提交通常数分钟后出现。" : "已读取最新私有记录。公开网站可能再延迟一两分钟更新。");
      else if (!importRequested) message("记录已同步。公开网站随后更新。");
    } catch (error) { if (!stopped) message(error.message, true); }
    finally { refreshing = false; if (!stopped) { byId("refresh").disabled = false; byId("admin-list").setAttribute("aria-busy", "false"); schedule(); } }
  }
  async function requestImport() {
    if (!summaryNumber || importRequested) return;
    byId("import").disabled = true;
    try {
      await api.comment(summaryNumber, "/同步");
      if (stopped) return;
      importRequested = true; message("已请求从 Tally 同步新反馈，通常需数分钟。页面会自动刷新。每小时也会自动同步。");
      const reset = setTimeout(() => { if (!stopped) { importRequested = false; byId("import").disabled = false; } }, 180000);
      removers.push(() => clearTimeout(reset)); schedule();
    } catch (error) { if (!stopped) { message(error.message, true); byId("import").disabled = false; } }
  }
  listen(byId("refresh"), "click", () => refresh());
  listen(byId("import"), "click", requestImport);
  listen(byId("more"), "click", () => { limit += 30; render(); });
  listen(byId("admin-search"), "input", () => { limit = 30; selected = null; render(); });
  document.querySelectorAll("[data-view]").forEach(node => listen(node, "click", () => selectView(node.dataset.view, FILTERS[node.dataset.view][0])));
  byId("import").disabled = true;
  render(); refresh(false);
  return { refresh, destroy() { stopped = true; clearTimeout(timer); removers.forEach(remove => remove()); pending.clear(); records = []; groups = []; byId("admin-list").replaceChildren(); byId("inspector").replaceChildren(); byId("metrics").replaceChildren(); byId("admin-search").value = ""; notice(byId("workspace-message")); } };
}
