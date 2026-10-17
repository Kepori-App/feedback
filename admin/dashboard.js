import { decodeRecord, groupMembers, operation } from "./domain.js?v=20261017-17";
import { PendingChanges, CHANGE_LABELS } from "./pending-changes.js?v=20261017-19";
import { el, notice, empty, metric, feedbackRow, memberRow } from "./views.js?v=20261017-17";
import { feedbackDetail, memberDetail, captureDraft, restoreDraft } from "./detail.js?v=20261017-19";
import { PROGRESS, progressLabel, selectFeedback } from "./feedback-query.js?v=20261017-17";
import { connectFeedbackExport } from "./export-dialog.js?v=20261017-17";
import { pageWindow, pageFor, renderPagination } from "../pagination.js?v=20261017-17";
import { connectRecordDialog } from "./record-dialog.js?v=20261017-17";

const FILTERS = { feedback: ["待确认", "全部反馈", "有效", "重复", "无效", "回收站"], members: ["待发码", "全部用户", "已发码", "累计中"] };
export function createDashboard(api) {
  const byId = id => document.getElementById(id);
  let records = [], groups = [], view = "feedback", filter = "全部反馈", category = "all", progress = "all", selected = null, page = 1;
  let stopped = false, refreshing = false, timer, summaryNumber, lastDetail = "", importRequested = false;
  const pending = new PendingChanges(), detailNotices = new Map(), drafts = new Map(), removers = [];
  let lastVisible = [];
  const recordDialog = connectRecordDialog(key => {
    const identity = item => view === "feedback" ? item.public_id : item.email;
    if (!lastVisible.some(item => identity(item) === key)) return;
    const destination = pageFor(lastVisible, identity, key);
    if (page !== destination) { page = destination; render(); }
  });
  const listen = (node, event, handler) => { node.addEventListener(event, handler); removers.push(() => node.removeEventListener(event, handler)); };
  const feedback = () => records.filter(record => record.kind === "feedback");
  const message = (text, error = false) => notice(byId("workspace-message"), text, error);
  const actions = { api, send, feedback: id => selectView("feedback", feedback().find(item => item.public_id === id)?.removed ? "回收站" : "全部反馈", id), member: email => selectView("members", "全部用户", email) };
  const exportControl = connectFeedbackExport(() => ({ records: [...feedback()], query: { filter, category, progress, query: byId("admin-search").value } }), message);

  function selectView(nextView, nextFilter, selection = null) {
    recordDialog.pause(); view = nextView; filter = nextFilter; category = "all"; progress = "all"; selected = selection; page = 1; lastDetail = "";
    if (selection) {
      const candidates = view === "feedback" ? selectFeedback(feedback(), { filter }) : groups;
      page = pageFor(candidates, item => view === "feedback" ? item.public_id : item.email, selection);
    }
    byId("admin-search").value = ""; render();
    if (selection) recordDialog.show(selection, view === "feedback" ? "反馈详情" : "用户与发码"); else recordDialog.close();
  }
  function choose(id) {
    recordDialog.pause(); selected = id; lastDetail = ""; render();
    recordDialog.show(id, view === "feedback" ? "反馈详情" : "用户与发码");
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
    byId("feedback-list-actions").hidden = view !== "feedback";
    const progressControl = byId("admin-progress");
    if (progressControl.dataset.category !== category) {
      progressControl.replaceChildren(...PROGRESS.map(value => { const option = el("option", "", progressLabel(value, category)); option.value = value; return option; }));
      progressControl.dataset.category = category;
    }
    progressControl.value = progress;
    const query = byId("admin-search").value.trim().toLowerCase();
    let visible = view === "feedback" ? selectFeedback(items, { filter, category, progress, query }) : groups.filter(group =>
      (filter === "全部用户" || (filter === "待发码" && group.valid >= 3 && !group.issued) ||
        (filter === "已发码" && group.issued) || (filter === "累计中" && group.valid < 3 && !group.issued)) && group.email.toLowerCase().includes(query));
    byId("list-title").textContent = filter === "待确认" ? "待确认的反馈" : filter;
    lastVisible = visible;
    byId("list-count").textContent = `${visible.length} ${view === "feedback" ? "条" : "位"}`;
    const key = item => view === "feedback" ? item.public_id : item.email;
    const all = view === "feedback" ? items.filter(item => filter === "回收站" ? item.removed : !item.removed) : groups;
    if (!all.some(item => key(item) === selected)) { selected = null; recordDialog.close(); }
    const pagination = pageWindow(visible.length, page, 20); page = pagination.page;
    byId("admin-list").replaceChildren(...visible.slice(pagination.start, pagination.end).map(item => view === "feedback" ?
      feedbackRow(item, selected === key(item), pending.has(item.issue_number), () => choose(key(item))) :
      memberRow(item, selected === key(item), pending.has(item.member?.issue_number), () => choose(key(item)))));
    if (!visible.length) {
      const descriptions = { "回收站": ["回收站是空的", "移除的反馈会保留在这里，可以随时恢复。"],
        "待发码": ["暂时没有待发码用户", "累计满三条有效反馈后，会自动出现在这里。"],
        "已发码": ["还没有发码记录", "发码后，在用户详情中标记即可。"],
        "待确认": ["没有待确认的反馈", "新反馈同步后会出现在这里。"] };
      const [title, text] = descriptions[filter] || ["没有匹配的记录", "试试其他筛选条件。"];
      byId("admin-list").append(empty(query ? "没有匹配的记录" : title, query ? "试试其他关键词或邮箱。" : text));
    }
    renderPagination(byId("admin-pagination"), pagination, next => {
      page = next; render();
      byId("admin-pagination").querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
      byId("admin-list").scrollIntoView({ block: "start", behavior: "instant" });
    }, { unit: view === "feedback" ? "条" : "位", label: "管理列表分页" });
    const current = all.find(item => key(item) === selected);
    const owner = current && view === "feedback" ? groups.find(group => group.email === current.email) : null;
    const detailData = current && (view === "feedback" ? [current.public_id, current.category, current.title, current.description,
      current.email, current.created_at, current.status, current.validity, current.duplicate_of, current.reply, current.suspected, current.removed,
      current.published_files, current.source_files?.map(item => item.id)] :
      [current.email, current.valid, current.duplicates, current.issued, current.member?.issue_number,
        current.records.map(item => [item.public_id, item.title, item.created_at, item.validity, item.removed])]);
    const currentIssue = current && (view === "feedback" ? current.issue_number : current.member?.issue_number);
    const saving = { ...pending.state(currentIssue), notice: detailNotices.get(currentIssue) };
    const signature = JSON.stringify([view, detailData, saving]);
    if (signature !== lastDetail) {
      lastDetail = signature;
      const draft = captureDraft(byId("inspector"));
      if (draft) drafts.set(draft.id, draft);
      byId("inspector").replaceChildren(current ? view === "feedback" ?
        feedbackDetail(current, groups.find(group => group.email === current.email), items, saving, actions) :
        memberDetail(current, saving, actions) : empty("选一条，认真回应", "反馈详情、处理按钮和用户累计会显示在这里。"));
      restoreDraft(byId("inspector"), view === "feedback" ? drafts.get(current?.public_id) : null);
      const heading = byId("inspector").querySelector("h2"); if (heading) heading.id = "admin-detail-title";
    }
    const contactTotal = byId("inspector").querySelector(".contact-total");
    if (contactTotal && owner) contactTotal.textContent = `此邮箱有效 ${owner.valid} / 3 条，查看全部 →`;
  }
  async function send(record, type, value) {
    if (stopped || !record || !pending.begin(record.issue_number, type)) return;
    detailNotices.delete(record.issue_number); render();
    try {
      const change = operation(record, type, value, feedback());
      const response = await api.comment(record.issue_number, change.body);
      if (stopped) return;
      pending.submitted(record.issue_number, type, response.id, change.expected);
      message("已提交，正在同步…");
    } catch (error) { if (!stopped) {
      pending.cancel(record.issue_number, type); detailNotices.set(record.issue_number, { text: error.message, error: true }); message(error.message, true);
    } }
    finally {
      if (!stopped) {
        render(); schedule();
      }
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (stopped) return;
    const active = pending.recent();
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
      for (const { number, field, result } of pending.settle(records)) {
        if (result === "rejected") {
          rejections.push(`F-${number}`); detailNotices.set(number, { text: `${CHANGE_LABELS[field]}未按预期保存，请检查后重试。`, error: true });
        } else if (!detailNotices.get(number)?.error) detailNotices.set(number, { text: "已保存。", error: false });
      }
      render();
      byId("account-info").textContent = `上次刷新 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
      if (rejections.length) message(`${rejections.join("、")} 的操作未按预期应用，请检查记录后重试。`, true);
      else if (pending.size) message(pending.slow() ? "同步较慢，稍后刷新即可，无需重复提交。" : "正在同步…");
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
  listen(byId("admin-filter"), "change", event => { filter = event.target.value; selected = null; page = 1; render(); });
  listen(byId("admin-category"), "change", event => { category = event.target.value; selected = null; page = 1; render(); });
  listen(byId("admin-progress"), "change", event => { progress = event.target.value; selected = null; page = 1; render(); });
  listen(byId("admin-search"), "input", () => { page = 1; selected = null; render(); });
  document.querySelectorAll("[data-view]").forEach(node => listen(node, "click", () => selectView(node.dataset.view, FILTERS[node.dataset.view][0])));
  byId("import").disabled = true;
  render(); refresh(false);
  return { refresh, destroy() { stopped = true; clearTimeout(timer); recordDialog.destroy(); exportControl.destroy(); removers.forEach(remove => remove()); pending.clear(); detailNotices.clear(); drafts.clear(); lastVisible = []; records = []; groups = []; byId("admin-list").replaceChildren(); byId("admin-pagination").replaceChildren(); byId("admin-pagination").hidden = true; byId("inspector").replaceChildren(); byId("metrics").replaceChildren(); byId("admin-search").value = ""; notice(byId("workspace-message")); } };
}
