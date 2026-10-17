import { element, card, meta, badge, duplicateLink, empty } from './render.js?v=20261017-17';
import { attachmentGallery, pendingAttachments } from './attachments.js?v=20261017-17';
import { STATUSES, categoryLabel, statusLabel, visibleFeedback, validatePublic } from './feedback-model.js?v=20261017-17';
import { pageWindow, renderPagination } from './pagination.js?v=20261017-17';
import { installInputModality } from './input-modality.js?v=20261017-17';

installInputModality(document);
const $ = selector => document.querySelector(selector);
const list = $('#feedback-list'), dialog = $('#detail-dialog'), rules = $('#rules-dialog');
let feedback = [], category = 'all', status = 'all', sort = 'newest', page = 1, selectedId = '', formUrl = '';
let loadController = null, returnId = '', returnScroll = 0;
const returnedFromForm = new URLSearchParams(location.search).get('submitted') === '1';
function configureForm(url) {
  formUrl = /^https:\/\/tally\.so\/r\/[a-zA-Z0-9]+$/.test(url) ? url : '';
  for (const link of document.querySelectorAll('[data-submit]')) link.href = formUrl || '#feedback';
}
function submitAction(label = '提交反馈') { return formUrl ? { label, run: () => location.assign(formUrl) } : null; }
function render(animate = false) {
  const visible = visibleFeedback(feedback, { category, status, query: $('#search').value, sort });
  const pagination = pageWindow(visible.length, page, 10); page = pagination.page;
  $('#reset-filters').hidden = !(category !== 'all' || status !== 'all' || $('#search').value.trim());
  for (const button of document.querySelectorAll('[data-category]')) {
    const selected = button.dataset.category === category;
    button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
  }
  list.classList.toggle('is-changing', animate); list.replaceChildren();
  if (!feedback.length) list.append(returnedFromForm ?
    empty('反馈还在同步中', '同步可能需要一些时间，无需重复提交。', { label: '刷新列表', run: load }) :
    empty('期待你的第一条反馈', '遇到问题，或有个新想法，都可以告诉我们。', submitAction('提交第一条反馈')));
  else if (!visible.length) list.append(empty('没有找到相关反馈', '试试其他关键词，或清除筛选。', { label: '清除筛选', run: reset }));
  else visible.slice(pagination.start, pagination.end).forEach(record => list.append(card(record, openDetail)));
  renderPagination($('#pagination'), pagination, next => {
    page = next; render(true);
    $('#pagination').querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
    $('#feedback').scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  $('#total-count').textContent = `${visible.length} 条反馈`;
  $('#result-info').textContent = visible.length ? `找到 ${visible.length} 条反馈，第 ${page} 页，展示第 ${pagination.start + 1} 至 ${pagination.end} 条。` : '没有匹配的反馈。';
  list.setAttribute('aria-busy', 'false');
}
function updateProgressOptions() {
  const select = $('#status-filter');
  select.replaceChildren(...[['all', '全部进展'], ['unfinished', '未完成'], ...STATUSES.map(value => [value, statusLabel(value, category)])].map(([value, label]) => {
    const option = element('option', '', label); option.value = value; return option;
  })); select.value = status;
}
function reset() { category = 'all'; status = 'all'; page = 1; $('#search').value = ''; updateProgressOptions(); render(); }
function openDetail(id, changeUrl = true) {
  const record = feedback.find(item => item.id === id);
  if (!record) { $('#result-info').textContent = '这条反馈暂时无法找到，可能还未同步。'; return; }
  if (!dialog.open) {
    returnId = document.activeElement?.closest('[data-feedback-card]')?.dataset.feedbackCard || id;
    returnScroll = window.scrollY;
  }
  dialog.querySelectorAll('video').forEach(video => video.pause()); selectedId = id;
  $('#detail-id').textContent = `${categoryLabel(record.category)} · ${id}`;
  const content = $('#detail-content'), title = element('h2', '', record.title); title.id = 'detail-title';
  content.replaceChildren(badge(record.status, statusLabel(record.status, record.category)), title, meta(record),
    element('p', 'detail-description', record.description), attachmentGallery(record.attachments), pendingAttachments(record.attachmentsPending));
  if (record.reply) {
    const reply = element('div', 'detail-reply'); reply.append(element('strong', '', '开发者回复'), document.createTextNode(record.reply)); content.append(reply);
  }
  const repeated = record.validity === '重复' || Boolean(record.duplicateOf);
  const text = repeated ? '重复反馈 · 不计入有效条数' : record.validity === '有效' ? '已计入 1 条有效反馈' : record.validity === '无效' ? '未计入有效反馈' : '有效性待确认';
  const result = element('div', `contribution-result${repeated ? ' repeated' : record.validity === '有效' ? ' valid' : ''}`, text);
  if (record.duplicateOf) result.append(duplicateLink(record, openDetail)); content.append(result);
  $('#copy-status').textContent = '';
  if (changeUrl && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
  if (!dialog.open) dialog.showModal();
  $('#close-dialog').focus({ preventScroll: true }); dialog.scrollTop = 0;
}
async function load() {
  loadController?.abort(); const controller = new AbortController(); loadController = controller;
  list.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('./data/feedback.json', { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw new Error('暂时无法连接');
    const data = validatePublic(await response.json()); if (controller.signal.aborted) return;
    feedback = data.feedback; configureForm(data.formUrl); render(true);
    if (/^#F-\d+$/.test(location.hash)) openDetail(location.hash.slice(1), false);
  } catch {
    if (controller.signal.aborted) return;
    list.setAttribute('aria-busy', 'false'); $('#pagination').hidden = true;
    $('#total-count').textContent = '加载失败'; $('#result-info').textContent = '反馈暂时无法加载，请重试。';
    list.replaceChildren(empty('反馈暂时没有加载出来', '请稍后重试，或通过页脚联系开发者。', { label: '重新加载', run: load }));
  }
}
for (const button of document.querySelectorAll('[data-category]')) button.addEventListener('click', () => {
  if (category === button.dataset.category) return;
  category = button.dataset.category; page = 1; updateProgressOptions(); render(true);
});
$('#status-filter').addEventListener('change', event => { status = event.target.value; page = 1; render(true); });
$('#sort-filter').addEventListener('change', event => { sort = event.target.value; page = 1; render(true); });
$('#search').addEventListener('input', () => { page = 1; render(); });
$('#reset-filters').addEventListener('click', reset);
$('#close-dialog').addEventListener('click', () => dialog.close());
$('#return-list').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  dialog.querySelectorAll('video').forEach(video => video.pause());
  if (/^#F-\d+$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  document.querySelector(`[data-feedback-id="${returnId}"]`)?.focus({ preventScroll: true });
  window.scrollTo({ top: returnScroll, behavior: 'instant' });
});
for (const modal of [dialog, rules]) modal.addEventListener('click', event => {
  if (event.target !== modal) return; const r = modal.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close();
});
$('#copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${selectedId}`); $('#copy-status').textContent = '链接已复制'; }
  catch { $('#copy-status').textContent = '请复制浏览器地址栏中的链接'; }
});
window.addEventListener('popstate', () => {
  if (/^#F-\d+$/.test(location.hash)) openDetail(location.hash.slice(1), false); else if (dialog.open) dialog.close();
});
for (const link of document.querySelectorAll('[data-rules]')) link.addEventListener('click', event => { event.preventDefault(); if (!rules.open) rules.showModal(); });
$('#close-rules').addEventListener('click', () => rules.close());
if (location.hash === '#rules') rules.showModal();
const query = new URLSearchParams(location.search);
if (returnedFromForm) $('#submission-note').hidden = false;
$('#dismiss-submission').addEventListener('click', () => {
  $('#submission-note').hidden = true; query.delete('submitted');
  history.replaceState(null, '', location.pathname + (query.size ? `?${query}` : '') + location.hash);
});
window.addEventListener('pagehide', () => { loadController?.abort(); dialog.querySelectorAll('video').forEach(video => video.pause()); });
updateProgressOptions(); configureForm('https://tally.so/r/6DJpgN'); load();
