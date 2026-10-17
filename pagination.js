// Shared list-only pagination. Data loading, filtering and export remain independent.
export function pageWindow(total, requested = 1, size = 10) {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(size) || size < 1) throw new Error('分页数据无法读取');
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  const start = (page - 1) * size;
  return { page, pages, start, end: Math.min(start + size, total), total, size };
}
export function pageNumbers(page, pages) {
  const numbers = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach(n => numbers.add(n));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach(n => numbers.add(n));
  const result = [];
  for (const value of [...numbers].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b)) {
    const previous = result.at(-1);
    if (typeof previous === 'number' && value > previous + 1) {
      if (value === previous + 2) result.push(previous + 1); else result.push(null);
    }
    result.push(value);
  }
  return result;
}
export function pageFor(items, key, value, size = 20) {
  const index = items.findIndex(item => key(item) === value);
  return index < 0 ? 1 : Math.floor(index / size) + 1;
}
export function renderPagination(root, state, change, { unit = '条', label = '反馈分页' } = {}) {
  root.replaceChildren(); root.hidden = state.pages <= 1;
  if (root.hidden) return;
  const count = document.createElement('span'); count.className = 'page-range';
  count.textContent = `${state.start + 1}–${state.end} / ${state.total} ${unit}`;
  const nav = document.createElement('nav'); nav.className = 'page-buttons'; nav.setAttribute('aria-label', label);
  function add(text, title, target, disabled = false, current = false) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.setAttribute('aria-label', title); button.disabled = disabled;
    button.dataset.page = String(target);
    if (current) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => change(target)); nav.append(button);
  }
  add('‹', '上一页', state.page - 1, state.page === 1);
  for (const number of pageNumbers(state.page, state.pages)) {
    if (number === null) {
      const ellipsis = document.createElement('span'); ellipsis.textContent = '…'; ellipsis.setAttribute('aria-hidden', 'true'); nav.append(ellipsis);
    } else add(String(number), `第 ${number} 页`, number, false, number === state.page);
  }
  add('›', '下一页', state.page + 1, state.page === state.pages);
  root.append(count, nav);
}
