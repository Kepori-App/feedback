import { element, card, badge, meta, duplicateLink, empty } from './render.js?v=20261017-4';
import { attachmentGallery, pendingAttachments } from './attachments.js?v=20261017-4';

const $ = selector => document.querySelector(selector);
const list = $('#feedback-list');
const dialog = $('#detail-dialog');
const statuses = ['待评估', '已采纳', '开发中', '已完成', '暂不采纳'];
let feedback = [], currentStatus = '全部', pageSize = 24, selectedId = '', formUrl = '';
const normalize = value => value.normalize('NFKC').toLocaleLowerCase();

function validate(data) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.feedback)) throw new Error('数据格式无法读取');
  const ids = new Set();
  for (const record of data.feedback) {
    if (!/^F-\d+$/.test(record.id) || ids.has(record.id) || !statuses.includes(record.status) ||
      !['待确认', '有效', '重复', '无效'].includes(record.validity) ||
      !['title', 'description', 'nickname', 'createdAt', 'reply'].every(key => typeof record[key] === 'string') ||
      (record.duplicateOf !== null && !/^F-\d+$/.test(record.duplicateOf))) throw new Error('反馈记录无法读取');
    ids.add(record.id);
  }
  return data;
}

function configureForm(url) {
  formUrl = /^https:\/\/tally\.so\/r\/[a-zA-Z0-9]+$/.test(url) ? url : '';
  $('#form-link').hidden = !formUrl;
  $('#form-message').textContent = formUrl ? '提交前先搜索，避免重复。' : '反馈表单正在准备中，请稍后再来。';
  for (const link of document.querySelectorAll('[data-submit], #form-link')) {
    link.href = formUrl || '#submit';
    if (formUrl) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    else { link.removeAttribute('target'); link.removeAttribute('rel'); }
  }
}

function render() {
  const query = normalize($('#search').value.trim());
  const visible = feedback.filter(record => (currentStatus === '全部' || record.status === currentStatus) &&
    normalize(`${record.id} ${record.title} ${record.description} ${record.nickname}`).includes(query));
  const sort = $('#sort').value;
  const priority = { '开发中': 3, '已采纳': 2, '已完成': 1, '待评估': 0, '暂不采纳': -1 };
  visible.sort((a, b) => sort === 'updated' ?
    priority[b.status] - priority[a.status] || b.createdAt.localeCompare(a.createdAt) :
    (sort === 'oldest' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
  list.replaceChildren();
  if (!feedback.length) list.append(empty('还没有反馈', '欢迎提交第一条建议。'));
  else if (!visible.length) list.append(empty('暂时没有找到', '试试其他关键词，或看看全部反馈。', {
    label: '查看全部', run() { $('#search').value = ''; setStatus('全部'); },
  }));
  else for (const record of visible.slice(0, pageSize)) list.append(card(record, openDetail));
  $('#list-footer').hidden = visible.length <= pageSize;
  $('#total-count').textContent = `${visible.length} 条`;
  $('#result-info').textContent = `找到 ${visible.length} 条反馈，已展示 ${Math.min(pageSize, visible.length)} 条。`;
  list.setAttribute('aria-busy', 'false');
}

function setStatus(status) {
  currentStatus = status;
  $('#status-filter').value = status;
  pageSize = 24;
  for (const button of document.querySelectorAll('[data-status]')) {
    const active = button.dataset.status === status;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  render();
}

function openDetail(id, changeUrl = true) {
  const record = feedback.find(item => item.id === id);
  if (!record) {
    if (/^F-\d+$/.test(id)) $('#result-info').textContent = '这条反馈暂时无法找到，可能还未同步。';
    return;
  }
  selectedId = id;
  $('#detail-id').textContent = `${id} · 公开反馈`;
  const content = $('#detail-content');
  const labels = element('div', 'card-top');
  labels.append(badge(record.status));
  if (record.validity !== '待确认') labels.append(badge(record.validity));
  const title = element('h2', '', record.title);
  title.id = 'detail-title';
  content.replaceChildren(labels, title, meta(record), element('p', 'detail-description', record.description));
  content.append(attachmentGallery(record.attachments), pendingAttachments(record.attachmentsPending));
  if (record.duplicateOf) content.append(duplicateLink(record, openDetail));
  if (record.reply) {
    const reply = element('div', 'detail-reply');
    reply.append(element('strong', '', '开发者回复'), document.createTextNode(record.reply));
    content.append(reply);
  }
  if (record.validity === '待确认') content.append(element('p', 'subtle', '活动计数待确认。是否采纳与是否有效分别判断。'));
  $('#copy-status').textContent = '';
  if (changeUrl) history.pushState(null, '', `#${id}`);
  if (!dialog.open) dialog.showModal();
  $('#close-dialog').focus();
  dialog.scrollTop = 0;
}

async function load() {
  try {
    const response = await fetch('./data/feedback.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('暂时无法连接');
    const data = validate(await response.json());
    feedback = data.feedback;
    configureForm(data.formUrl);
    render();
    if (/^#F-\d+$/.test(location.hash)) openDetail(location.hash.slice(1), false);
  } catch {
    list.setAttribute('aria-busy', 'false');
    list.replaceChildren(empty('反馈暂时没有加载出来', '请稍后重试，或通过页脚联系开发者。', { label: '重新加载', run: load }));
  }
}

for (const button of document.querySelectorAll('[data-status]')) button.addEventListener('click', () => setStatus(button.dataset.status));
$('#status-filter').addEventListener('change', event => setStatus(event.target.value));
$('#search').addEventListener('input', () => { pageSize = 24; render(); });
$('#sort').addEventListener('change', render);
$('#load-more').addEventListener('click', () => { pageSize += 24; render(); });
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => dialog.querySelectorAll('video').forEach(video => video.pause()));
dialog.addEventListener('close', () => { if (/^#F-\d+$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
$('#copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${selectedId}`); $('#copy-status').textContent = '链接已复制'; }
  catch { $('#copy-status').textContent = '请复制浏览器地址栏中的链接'; }
});
window.addEventListener('popstate', () => {
  if (/^#F-\d+$/.test(location.hash)) openDetail(location.hash.slice(1), false);
  else if (dialog.open) dialog.close();
});
configureForm('');
load();
