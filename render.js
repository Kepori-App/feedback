export const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function badge(status) {
  const color = ['已采纳', '已完成', '有效'].includes(status) ? 'green' :
    status === '开发中' ? 'blue' : status === '重复' ? 'gold' : '';
  return element('span', `badge ${color}`, status === '重复' ? '重复 · 不计数' :
    status === '有效' ? '有效贡献' : status === '无效' ? '不计数' : status);
}

export function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '日期待确认' : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(date);
}

export function meta(record) {
  const row = element('div', 'card-meta');
  row.append(element('span', 'avatar', Array.from(record.nickname)[0] || 'K'),
    element('span', '', record.nickname));
  const date = element('time', 'meta-date', dateLabel(record.createdAt));
  date.dateTime = record.createdAt;
  row.append(date);
  return row;
}

export function duplicateLink(record, open) {
  const link = element('a', 'duplicate-link', `已有相同建议 ${record.duplicateOf}，查看原反馈 →`);
  link.href = `#${record.duplicateOf}`;
  link.addEventListener('click', event => { event.preventDefault(); open(record.duplicateOf); });
  return link;
}

export function card(record, open) {
  const article = element('article', 'feedback-card');
  const top = element('div', 'card-top');
  top.append(element('span', 'feedback-id', record.id), badge(record.status));
  if (record.validity !== '待确认') top.append(badge(record.validity));
  const title = element('button', 'title-button', record.title);
  title.type = 'button';
  title.addEventListener('click', () => open(record.id));
  const heading = element('h3');
  heading.style.margin = '0';
  heading.append(title);
  article.append(top, heading, element('p', 'feedback-description', record.description), meta(record));
  if (record.duplicateOf) article.append(duplicateLink(record, open));
  if (record.reply) article.append(element('div', 'reply-preview', `开发者回复 · ${record.reply}`));
  return article;
}

export function empty(title, text, action) {
  const node = element('div', 'empty');
  node.append(element('span', 'empty-mark', '↗'), element('h3', '', title), element('p', '', text));
  if (action) {
    const button = element('button', 'button secondary small', action.label);
    button.type = 'button';
    button.addEventListener('click', action.run);
    node.append(button);
  }
  return node;
}
