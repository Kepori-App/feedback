import { CATEGORIES } from "../feedback-model.js?v=20261017-17";
import { el, notice } from "./views.js?v=20261017-17";
import { PROGRESS, progressLabel, selectExportFeedback } from "./feedback-query.js?v=20261017-17";
import { createFeedbackExport } from "./feedback-export.js?v=20261017-17";

export function connectFeedbackExport(snapshot, message) {
  const byId = id => document.getElementById(id);
  const dialog = byId("feedback-export-dialog"), range = byId("export-range"), category = byId("export-category");
  const excluded = byId("export-excluded"), download = byId("download-feedback"), error = byId("export-message");
  const removers = [];
  let data = null, job = null, stopped = false;
  const listen = (node, event, handler) => { node.addEventListener(event, handler); removers.push(() => node.removeEventListener(event, handler)); };
  const options = () => ({ range: range.value, category: category.value, includeExcluded: excluded.checked });
  const addOption = (value, text) => { const option = el("option", "", text); option.value = value; return option; };
  function update() {
    job?.abort(); job = null; notice(error);
    category.disabled = range.value === "current";
    if (category.disabled && data) category.value = data.query.category || "all";
    for (const option of range.options) {
      if (!["current", "unfinished", "all"].includes(option.value)) option.textContent = progressLabel(option.value, category.value);
    }
    const count = data ? selectExportFeedback(data.records, options(), data.query).length : 0;
    byId("export-count").textContent = count ? `共 ${new Intl.NumberFormat("zh-CN").format(count)} 条反馈` : "暂无符合条件的反馈";
    download.disabled = !count; download.textContent = "下载 Markdown";
  }
  function open() {
    if (stopped) return;
    data = snapshot();
    range.replaceChildren(addOption("unfinished", "未完成"), addOption("current", "当前筛选结果"),
      ...PROGRESS.filter(value => !["all", "unfinished"].includes(value)).map(value => addOption(value, progressLabel(value))), addOption("all", "全部进展"));
    category.replaceChildren(addOption("all", "全部分类"), ...Object.entries(CATEGORIES).map(([value, text]) => addOption(value, text)));
    range.value = "unfinished"; category.value = data.query.category || "all"; excluded.checked = false;
    update(); dialog.showModal();
  }
  function closed() {
    job?.abort(); job = null; data = null; notice(error); byId("export-count").textContent = "";
  }
  async function save() {
    if (!data || job || download.disabled || stopped) return;
    const controller = new AbortController(); job = controller;
    download.disabled = true; download.textContent = "正在整理…"; notice(error);
    try {
      const result = await createFeedbackExport(data.records, options(), data.query, { signal: controller.signal });
      if (stopped || controller.signal.aborted || !dialog.open) return;
      const url = URL.createObjectURL(new Blob([result.markdown], { type: "text/markdown;charset=utf-8" }));
      const link = el("a"); link.href = url; link.download = result.filename; document.body.append(link);
      try { link.click(); }
      finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      dialog.close(); message(`已开始下载 ${result.count} 条反馈，可将 Markdown 文件交给 AI。`);
    } catch (failure) {
      if (!stopped && !controller.signal.aborted && dialog.open) notice(error, failure.message || "无法生成下载文件，请重试。", true);
    } finally {
      if (job === controller) { job = null; download.textContent = "下载 Markdown"; download.disabled = !data || !selectExportFeedback(data.records, options(), data.query).length; }
    }
  }
  listen(byId("export-feedback"), "click", open);
  listen(byId("close-export"), "click", () => dialog.close());
  listen(dialog, "close", closed); listen(range, "change", update); listen(category, "change", update); listen(excluded, "change", update);
  listen(download, "click", save);
  return { destroy() { stopped = true; job?.abort(); if (dialog.open) dialog.close(); closed(); removers.forEach(remove => remove()); } };
}
