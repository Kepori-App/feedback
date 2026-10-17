// Shared public/admin vocabulary. Canonical workflow states stay stable.
export const STATUSES = ['待评估', '已采纳', '开发中', '已完成', '暂不采纳'];
export const CATEGORIES = { bug: '问题反馈', suggestion: '改进建议', other: '其他' };
const STATUS_LABELS = {
  bug: ['待排查', '已确认', '修复中', '已修复', '暂不处理'],
  suggestion: STATUSES,
  other: ['待处理', '已确认', '处理中', '已完成', '暂不处理'],
  all: ['待处理', '已确认/采纳', '进行中', '已完成', '暂不处理'],
};
export const categoryOf = value => Object.hasOwn(CATEGORIES, value) ? value : 'other';
export const categoryLabel = value => CATEGORIES[categoryOf(value)];
export function statusLabel(status, category = 'all') {
  return STATUS_LABELS[category]?.[STATUSES.indexOf(status)] || STATUS_LABELS.other[STATUSES.indexOf(status)] || status;
}
const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
export function visibleFeedback(records, { category = 'all', status = 'all', query = '', sort = 'newest' } = {}) {
  const search = normalize(query);
  return records.filter(record => (category === 'all' || categoryOf(record.category) === category) &&
    (status === 'all' || (status === 'unfinished' ? STATUSES.slice(0, 3).includes(record.status) : record.status === status)) &&
    normalize(`${record.id} ${record.title} ${record.description} ${record.nickname}`).includes(search))
    .sort((a, b) => (sort === 'oldest' ? 1 : -1) * (a.createdAt.localeCompare(b.createdAt) || Number(a.id.slice(2)) - Number(b.id.slice(2))));
}
export function validatePublic(data) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.feedback)) throw new Error('数据格式无法读取');
  const ids = new Set();
  const feedback = data.feedback.map(record => {
    if (!/^F-\d+$/.test(record.id) || ids.has(record.id) || !STATUSES.includes(record.status) ||
      !['待确认', '有效', '重复', '无效'].includes(record.validity) ||
      !['title', 'description', 'nickname', 'createdAt', 'reply'].every(key => typeof record[key] === 'string') ||
      (record.duplicateOf !== null && !/^F-\d+$/.test(record.duplicateOf)) ||
      (record.category !== undefined && !Object.hasOwn(CATEGORIES, record.category))) throw new Error('反馈记录无法读取');
    ids.add(record.id);
    return { ...record, category: categoryOf(record.category) };
  });
  return { ...data, feedback };
}
