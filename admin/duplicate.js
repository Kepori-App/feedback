import { duplicateTarget, semanticCandidates } from './domain.js?v=20261017-11';
import { el, button } from './views.js?v=20261017-11';

export function duplicateControls(record, feedback, actions) {
  const root = el('div', 'duplicate-controls');
  if (record.suspected && record.validity !== '重复') {
    const candidates = el('div', 'candidate-box');
    candidates.append(el('p', 'subtle', '正在读取相似反馈…')); root.append(candidates);
    actions.api.comments(record.issue_number).then(comments => {
      if (!root.isConnected) return;
      const items = [];
      for (const [id] of semanticCandidates(comments)) {
        const target = feedback.find(item => item.public_id === id);
        if (!target) continue;
        try { duplicateTarget(record, id, feedback); } catch { continue; }
        const row = el('div', 'candidate-row');
        const title = button(`${id} · ${target.title}`, () => actions.feedback(id), 'candidate-link');
        const mark = button('标为重复', () => actions.send(record, 'duplicate', id), 'button secondary small');
        mark.setAttribute('aria-label', `标为与 ${id} 重复`);
        row.append(title, mark); items.push(row);
      }
      candidates.replaceChildren(el('p', 'subtle', items.length ? '相似反馈，请确认是否同一需求：' : '暂无可用候选，可在下方选择原反馈。'), ...items);
      if (items.length) candidates.append(el('p', 'subtle', '标为重复后不计数，仍会公开并关联原反馈。'));
    }).catch(error => { if (root.isConnected) candidates.replaceChildren(el('p', 'subtle', error.message)); });
  }
  const duplicate = el('details', 'duplicate-box');
  duplicate.append(el('summary', '', record.duplicate_of ? `重复于 ${record.duplicate_of}` : '选择原反馈，标记重复'));
  const label = el('label', 'field', '搜索原反馈');
  const search = el('input'); search.type = 'search'; search.placeholder = '输入编号或关键词（选填）'; label.append(search);
  const select = el('select', 'duplicate-select'); select.setAttribute('aria-label', '选择原反馈');
  const submit = button('确认重复 · 不计数', () => actions.send(record, 'duplicate', select.value));
  const optionList = () => {
    const query = search.value.trim().normalize('NFKC').toLowerCase();
    const options = [];
    for (const other of feedback) {
      try { if (duplicateTarget(record, other.public_id, feedback).public_id !== other.public_id) continue; }
      catch { continue; }
      if (query && !`${other.public_id} ${other.title} ${other.description}`.normalize('NFKC').toLowerCase().includes(query)) continue;
      const option = el('option', '', `${other.public_id} · ${other.title}`); option.value = other.public_id; options.push(option);
    }
    select.replaceChildren(...options); submit.disabled = !options.length;
  };
  search.addEventListener('input', optionList); optionList();
  duplicate.append(label, select, submit, el('p', 'subtle', '分类不同也可能是同一需求。重复反馈不计入三条。'));
  root.append(duplicate); return root;
}
