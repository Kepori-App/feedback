import { element, card, badge, meta, duplicateLink, empty } from './render.js?v=20261017-6';
import { attachmentGallery, pendingAttachments } from './attachments.js?v=20261017-6';
import { STATUSES, categoryLabel, statusLabel, visibleFeedback, validatePublic } from './feedback-model.js?v=20261017-6';

const $ = selector => document.querySelector(selector);
const list = $('#feedback-list'), dialog = $('#detail-dialog');
let feedback = [], category = 'all', status = 'all', pageSize = 24, selectedId = '', formUrl = '';
const returnedFromForm = new URLSearchParams(location.search).get('submitted') === '1';

function configureForm(url) {
  formUrl = /^https:\/\/tally\.so\/r\/[a-zA-Z0-9]+$/.test(url) ? url : '';
  for (const link of document.querySelectorAll('[data-submit]')) link.href = formUrl || '#feedback';
}
function submitAction(label = '提交反馈') {
  return formUrl ? { label, run: () => location.assign(formUrl) } : null;
}
function render() {
  const visible = visibleFeedback(feedback, { category, status, query: $('#search').value });
  const filtered = category !== 'all' || status !== 'all' || $('#search').value.trim();
  $('#reset-filters').hidden = !filtered;
  for (const button of document.querySelectorAll('[data-category]')) {
    const selected = button.dataset.category === category;
    button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
  }
  list.replaceChildren();
  if (!feedback.length) list.append(returnedFromForm ?
    empty('反馈还在同步中', '内容通常一小时内显示，无需重复提交。你可以稍后刷新查看。', { label: '刷新列表', run: load }) :
    empty('期待你的第一条反馈', '遇到问题，或有个新想法，都可以告诉我们。', submitAction('提交第一条反馈')));
  else if (!visible.length) list.append(empty('没有找到相关反馈', '换个分类或关键词试试，也欢迎提出新的反馈。', { label: '清除筛选', run: reset }));
  else visible.slice(0, pageSize).forEach(record => list.append(card(record, openDetail)));
  $('#list-footer').hidden = visible.length <= pageSize;
  $('#total-count').textContent = `${visible.length} 条`;
  $('#result-info').textContent = `找到 ${visible.length} 条反馈，已展示 ${Math.min(pageSize, visible.length)} 条。`;
  list.setAttribute('aria-busy', 'false');
}
function updateProgressOptions() {
  const select = $('#status-filter');
  const all = element('option', '', '全部进展'); all.value = 'all';
  select.replaceChildren(all, ...STATUSES.map(value => {
    const option = element('option', '', statusLabel(value, category)); option.value = value; return option;
  }));
  select.value = status;
}
function reset() {
  category = 'all'; status = 'all'; pageSize = 24; $('#search').value = '';
  updateProgressOptions(); render();
}
function openDetail(id, changeUrl = true) {
  const record = feedback.find(item => item.id === id);
  if (!record) { $('#result-info').textContent = '这条反馈暂时无法找到，可能还未同步。'; return; }
  // Stop a video when a duplicate link switches the same open dialog to another record.
  dialog.querySelectorAll('video').forEach(video => video.pause());
  selectedId = id;
  $('#detail-id').textContent = `${id} · ${categoryLabel(record.category)}`;
  const content = $('#detail-content'), labels = element('div', 'card-top');
  labels.append(badge(record.status, statusLabel(record.status, record.category)));
  if (record.validity !== '待确认') labels.append(badge(record.validity));
  const title = element('h2', '', record.title); title.id = 'detail-title';
  content.replaceChildren(labels, title, meta(record), element('p', 'detail-description', record.description),
    attachmentGallery(record.attachments), pendingAttachments(record.attachmentsPending));
  if (record.duplicateOf) content.append(duplicateLink(record, openDetail));
  if (record.reply) {
    const reply = element('div', 'detail-reply'); reply.append(element('strong', '', '开发者回复'), document.createTextNode(record.reply)); content.append(reply);
  }
  if (record.validity === '待确认') content.append(element('p', 'subtle', '活动计数待确认。处理进展与是否计数分别判断。'));
  $('#copy-status').textContent = '';
  if (changeUrl && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
  if (!dialog.open) dialog.showModal();
  $('#close-dialog').focus(); dialog.scrollTop = 0;
}
async function load() {
  list.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('./data/feedback.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('暂时无法连接');
    const data = validatePublic(await response.json());
    feedback = data.feedback; configureForm(data.formUrl); render();
    if (/^#F-\d+$/.test(location.hash)) openDetail(location.hash.slice(1), false);
  } catch {
    list.setAttribute('aria-busy', 'false');
    list.replaceChildren(empty('反馈暂时没有加载出来', '请稍后重试，或通过页脚联系开发者。', { label: '重新加载', run: load }));
  }
}
for (const button of document.querySelectorAll('[data-category]')) button.addEventListener('click', () => {
  category = button.dataset.category; pageSize = 24; updateProgressOptions(); render();
});
$('#status-filter').addEventListener('change', event => { status = event.target.value; pageSize = 24; render(); });
$('#search').addEventListener('input', () => { pageSize = 24; render(); });
$('#reset-filters').addEventListener('click', reset);
$('#load-more').addEventListener('click', () => { pageSize += 24; render(); });
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  dialog.querySelectorAll('video').forEach(video => video.pause());
  if (/^#F-\d+$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
});
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
});
$('#copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${selectedId}`); $('#copy-status').textContent = '链接已复制'; }
  catch { $('#copy-status').textContent = '请复制浏览器地址栏中的链接'; }
});
window.addEventListener('popstate', () => {
  if (/^#F-\d+$/.test(location.hash)) openDetail(location.hash.slice(1), false);
  else if (dialog.open) dialog.close();
});
for (const link of document.querySelectorAll('[data-rules]')) link.addEventListener('click', () => { $('#rules').open = true; });
if (location.hash === '#rules') $('#rules').open = true;
const query = new URLSearchParams(location.search);
if (returnedFromForm) $('#submission-note').hidden = false;
$('#dismiss-submission').addEventListener('click', () => {
  $('#submission-note').hidden = true;
  query.delete('submitted');
  history.replaceState(null, '', location.pathname + (query.size ? `?${query}` : '') + location.hash);
});
updateProgressOptions(); configureForm('https://tally.so/r/6DJpgN'); load();
