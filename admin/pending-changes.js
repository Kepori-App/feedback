import { commandResult } from './domain.js?v=20261017-17';

const field = type => type === 'duplicate' ? 'validity' : type;
export const CHANGE_LABELS = { validity: '计数', status: '处理进展', category: '分类', reply: '公开回复', removed: '移除／恢复', issued: '发码标记' };

// Independent fields can save together; counting/duplicates and removal stay ordered.
export class PendingChanges {
  #records = new Map();
  get size() { return [...this.#records.values()].reduce((total, changes) => total + changes.size, 0); }
  has(number) { return this.#records.has(number); }
  begin(number, type) {
    const key = field(type), changes = this.#records.get(number) || new Map();
    if (!Object.hasOwn(CHANGE_LABELS, key) || changes.has(key) || changes.has('removed') || (key === 'removed' && changes.size)) return false;
    changes.set(key, { type, started: Date.now(), id: null }); this.#records.set(number, changes); return true;
  }
  submitted(number, type, id, expected) {
    const change = this.#records.get(number)?.get(field(type));
    if (change) Object.assign(change, { id, expected });
  }
  cancel(number, type) {
    const changes = this.#records.get(number); changes?.delete(field(type));
    if (!changes?.size) this.#records.delete(number);
  }
  state(number) {
    const changes = this.#records.get(number) || new Map();
    return { any: changes.size > 0, labels: [...changes.keys()].map(key => CHANGE_LABELS[key]),
      ...Object.fromEntries(Object.keys(CHANGE_LABELS).map(key => [key, changes.has(key)])) };
  }
  settle(records) {
    const results = [];
    for (const [number, changes] of this.#records) {
      const record = records.find(item => item.issue_number === number);
      if (!record) continue;
      for (const [key, change] of changes) {
        if (change.id === null) continue;
        const result = commandResult(record, change);
        if (result !== 'pending') { this.cancel(number, key); results.push({ number, field: key, result }); }
      }
    }
    return results;
  }
  slow() { return [...this.#records.values()].some(changes => [...changes.values()].some(change => Date.now() - change.started > 300000)); }
  recent() { return [...this.#records.values()].some(changes => [...changes.values()].some(change => Date.now() - change.started < 300000)); }
  clear() { this.#records.clear(); }
}
