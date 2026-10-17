import { safeAttachments } from './attachments.js?v=20261017-17';
import { categoryLabel, statusLabel } from './feedback-model.js?v=20261017-17';

export const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function badge(status, label) {
  const color = ['已采纳', '已完成', '有效'].includes(status) ? 'green' :
    status === '开发中' ? 'blue' : status === '重复' ? 'gold' : '';
  return element('span', `badge ${color}`, label ?? (status === '重复' ? '重复 · 不计数' :
    status === '有效' ? '有效贡献' : status === '无效' ? '不计数' : status));
}

export function dateLabel(value, compact = false) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '日期待确认' : new Intl.DateTimeFormat('zh-CN', {
    ...(!compact || date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), month: compact ? 'numeric' : 'short', day: 'numeric',
  }).format(date);
}

export function meta(record, { compact = false } = {}) {
  const row = element('div', 'card-meta');
  if (compact) row.append(element('span', '', categoryLabel(record.category)));
  row.append(element('span', '', record.nickname));
  const date = element('time', 'meta-date', dateLabel(record.createdAt, compact));
  date.dateTime = record.createdAt;
  row.append(date);
  return row;
}

export function duplicateLink(record, open) {
  const link = element('a', 'duplicate-link', `重复 · 不计数 · 查看原反馈 ${record.duplicateOf} ↗`);
  link.href = `#${record.duplicateOf}`;
  link.addEventListener('click', event => { event.preventDefault(); open(record.duplicateOf); });
  return link;
}

export function card(record, open) {
  const article = element('article', 'feedback-card');
  article.dataset.feedbackCard = record.id;
  const title = element('button', 'feedback-open');
  title.type = 'button';
  title.dataset.feedbackId = record.id;
  title.setAttribute('aria-label', `查看反馈：${record.title}，${statusLabel(record.status, record.category)}`);
  title.setAttribute('aria-haspopup', 'dialog'); title.setAttribute('aria-controls', 'detail-dialog');
  title.append(element('span', 'title-text', record.title), badge(record.status, statusLabel(record.status, record.category)));
  title.addEventListener('click', () => open(record.id));
  const heading = element('h3', 'feedback-heading');
  heading.append(title);
  const metadata = meta(record, { compact: true });
  const files = safeAttachments(record.attachments);
  if (files.length) metadata.append(element('span', 'attachment-count', `${files.length} 个附件`));
  if (record.attachmentsPending > 0) metadata.append(element('span', '', '附件同步中'));
  const arrow = element('span', 'card-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true'); metadata.append(arrow);
  article.append(heading, element('p', 'feedback-description', record.description.replace(/\s+/g, ' ')), metadata);
  if (record.duplicateOf) article.append(duplicateLink(record, open));
  else if (record.validity === '重复') article.append(element('p', 'duplicate-note', '重复 · 不计数'));
  return article;
}

export function empty(title, text, action) {
  const node = element('div', 'empty');
  node.append(element('h3', '', title), element('p', '', text));
  if (action) {
    const button = element('button', 'button secondary small', action.label);
    button.type = 'button';
    button.addEventListener('click', action.run);
    node.append(button);
  }
  return node;
}
