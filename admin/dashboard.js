import { decodeRecord, groupMembers, operation, commandResult } from "./domain.js?v=20261017-12";
import { el, notice, empty, metric, feedbackRow, memberRow } from "./views.js?v=20261017-12";
import { feedbackDetail, memberDetail, captureDraft, restoreDraft } from "./detail.js?v=20261017-12";

const FILTERS = { feedback: ["待确认", "全部反馈", "有效", "重复", "无效", "回收站"], members: ["待发码", "全部用户", "已发码", "累计中"] };
export function createDashboard(api) {
  const byId = id => document.getElementById(id);
  let records = [], groups = [], view = "feedback", filter = "待确认", category = "all", selected = null, limit = 30;
  let stopped = false, refreshing = false, timer, summaryNumber, lastDetail = "", importRequested = false;
  const pending = new Map(), sending = new Set(), removers = [];
  const listen = (node, event, handler) => { node.addEventListener(event, handler); removers.push(() => node.removeEventListener(event, handler)); };
  const feedback = () => records.filter(record => record.kind === "feedback");
  const message = (text, error = false) => notice(byId("workspace-message"), text, error);
  const actions = { api, send, feedback: id => selectView("feedback", feedback().find(item => item.public_id === id)?.removed ? "回收站" : "全部反馈", id), member: email => selectView("members", "全部用户", email) };

  function selectView(nextView, nextFilter, selection = null) {
    view = nextView; filter = nextFilter; category = "all"; selected = selection; limit = 30; lastDetail = "";
    byId("admin-search").value = ""; render();
  }
  function choose(id) {
    selected = id; lastDetail = ""; render();
    if (matchMedia("(max-width: 700px)").matches) byId("inspector").scrollIntoView({ behavior: "instant", block: "start" });
  }
  function render() {
    const items = feedback();
    byId("metrics").replaceChildren(
      metric(items.filter(item => !item.removed && item.validity === "待确认").length, "待确认反馈", () => selectView("feedback", "待确认")),
      metric(groups.filter(group => group.valid >= 3 && !group.issued).length, "待发码", () => selectView("members", "待发码")));
    document.querySelectorAll("[data-view]").forEach(node => {
      const active = node.dataset.view === view; node.classList.toggle("active", active); node.setAttribute("aria-pressed", String(active));
    });
    const filterControl = byId("admin-filter");
    if (filterControl.dataset.view !== view) {
      filterControl.replaceChildren(...FILTERS[view].map(value => { const option = el("option", "", value); option.value = value; return option; }));
      filterControl.dataset.view = view;
    }
    filterControl.value = filter;
    byId("admin-category").hidden = view !== "feedback"; byId("admin-category").value = category;
    const query = byId("admin-search").value.trim().toLowerCase();
    let visible = view === "feedback" ? items.filter(item => (category === "all" || item.category === category) &&
      (filter === "回收站" ? item.removed : !item.removed && (filter === "全部反馈" || item.validity === filter)) &&
      `${item.public_id} ${item.title} ${item.description} ${item.email}`.toLowerCase().includes(query))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)) : groups.filter(group =>
      (filter === "全部用户" || (filter === "待发码" && group.valid >= 3 && !group.issued) ||
        (filter === "已发码" && group.issued) || (filter === "累计中" && group.valid < 3 && !group.issued)) && group.email.toLowerCase().includes(query));
    byId("list-title").textContent = filter === "待确认" ? "待确认的反馈" : filter;
    byId("list-count").textContent = `${visible.length} ${view === "feedback" ? "条" : "位"}`;
    const key = item => view === "feedback" ? item.public_id : item.email;
    const all = view === "feedback" ? items.filter(item => filter === "回收站" ? item.removed : !item.removed) : groups;
    if (!all.some(item => key(item) === selected)) selected = visible[0] ? key(visible[0]) : null;
    byId("admin-list").replaceChildren(...visible.slice(0, limit).map(item => view === "feedback" ?
      feedbackRow(item, selected === key(item), pending.has(item.issue_number), () => choose(key(item))) :
      memberRow(item, selected === key(item), pending.has(item.member?.issue_number), () => choose(key(item)))));
    if (!visible.length) byId("admin-list").append(empty(query ? "没有匹配的记录" : filter === "回收站" ? "回收站是空的" : view === "members" && filter === "待发码" ? "暂时没有待发码用户" : "这里暂时没有记录", query ? "试试其他关键词或邮箱。" : filter === "回收站" ? "移除的反馈会保留在这里，可以随时恢复。" : "用户提交后会自动同步。你也可以点击上方“同步新反馈”。"));
    byId("more").hidden = visible.length <= limit;
    const current = all.find(item => key(item) === selected);
    const owner = current && view === "feedback" ? groups.find(group => group.email === current.email) : null;
    const detailData = current && (view === "feedback" ? [current.public_id, current.category, current.title, current.description,
      current.email, current.created_at, current.status, current.validity, current.duplicate_of, current.reply, current.suspected, current.removed,
      current.published_files, current.source_files?.map(item => item.id)] :
      [current.email, current.valid, current.duplicates, current.issued, current.member?.issue_number,
        current.records.map(item => [item.public_id, item.title, item.created_at, item.validity, item.removed])]);
    const signature = JSON.stringify([view, detailData, current && pending.get(view === "feedback" ? current.issue_number : current.member?.issue_number)]);
    if (signature !== lastDetail) {
      lastDetail = signature;
      const draft = captureDraft(byId("inspector"));
      byId("inspector").replaceChildren(current ? view === "feedback" ?
        feedbackDetail(current, groups.find(group => group.email === current.email), items, pending.has(current.issue_number), actions) :
        memberDetail(current, pending.has(current.member?.issue_number), actions) : empty("选一条，认真回应", "反馈详情、处理按钮和用户累计会显示在这里。"));
      restoreDraft(byId("inspector"), draft);
    }
    const contactTotal = byId("inspector").querySelector(".contact-total");
    if (contactTotal && owner) contactTotal.textContent = `此邮箱有效 ${owner.valid} / 3 条，查看全部 →`;
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
      message("已提交，正在同步…");
    } catch (error) { if (!stopped) message(error.message, true); }
    finally {
      sending.delete(record.issue_number);
      if (!stopped) {
        const currentIssue = view === "feedback" ? records.find(item => item.public_id === selected)?.issue_number : groups.find(item => item.email === selected)?.member?.issue_number;
        if (currentIssue === record.issue_number) lastDetail = "";
        render(); schedule();
      }
    }
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
      const rejections = [], hadPending = pending.size > 0;
      for (const [number, change] of pending) {
        const record = records.find(item => item.issue_number === number);
        const result = record ? commandResult(record, change) : "pending";
        if (result !== "pending") { pending.delete(number); if (result === "rejected") rejections.push(`F-${number}`); }
      }
      render();
      byId("account-info").textContent = `上次刷新 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
      if (rejections.length) message(`${rejections.join("、")} 的操作未按预期应用，请检查记录后重试。`, true);
      else if (pending.size) message([...pending.values()].some(item => Date.now() - item.started > 300000) ? "同步较慢，稍后刷新即可，无需重复提交。" : "正在同步…");
      else if (hadPending) message("已保存，公开页稍后更新。");
      else if (importRequested) message("已请求同步，新反馈通常数分钟后出现。");
      else message(manual ? "已刷新。" : "");
    } catch (error) { if (!stopped) message(error.message, true); }
    finally { refreshing = false; if (!stopped) { byId("refresh").disabled = false; byId("admin-list").setAttribute("aria-busy", "false"); schedule(); } }
  }
  async function requestImport() {
    if (!summaryNumber || importRequested) return;
    byId("import").disabled = true;
    try {
      await api.comment(summaryNumber, "/同步");
      if (stopped) return;
      importRequested = true; message("已请求同步，新反馈通常数分钟后出现。");
      const reset = setTimeout(() => { if (!stopped) { importRequested = false; byId("import").disabled = false; } }, 180000);
      removers.push(() => clearTimeout(reset)); schedule();
    } catch (error) { if (!stopped) { message(error.message, true); byId("import").disabled = false; } }
  }
  listen(byId("refresh"), "click", () => refresh());
  listen(byId("import"), "click", requestImport);
  listen(byId("more"), "click", () => { limit += 30; render(); });
  listen(byId("admin-filter"), "change", event => { filter = event.target.value; selected = null; limit = 30; render(); });
  listen(byId("admin-category"), "change", event => { category = event.target.value; selected = null; limit = 30; render(); });
  listen(byId("admin-search"), "input", () => { limit = 30; selected = null; render(); });
  document.querySelectorAll("[data-view]").forEach(node => listen(node, "click", () => selectView(node.dataset.view, FILTERS[node.dataset.view][0])));
  byId("import").disabled = true;
  render(); refresh(false);
  return { refresh, destroy() { stopped = true; clearTimeout(timer); removers.forEach(remove => remove()); pending.clear(); records = []; groups = []; byId("admin-list").replaceChildren(); byId("inspector").replaceChildren(); byId("metrics").replaceChildren(); byId("admin-search").value = ""; notice(byId("workspace-message")); } };
}
