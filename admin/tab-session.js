const KEY = 'kepori-feedback-admin-session-v1';
const REPOSITORY = 'Kepori-App/feedback-admin';
export const SESSION_DURATION = 8 * 60 * 60 * 1000;
const validToken = token => typeof token === 'string' && /^github_pat_[A-Za-z0-9_]{40,255}$/.test(token);

// Explicit opt-in only: same-tab storage, absolute expiry, no password or records.
export class TabSession {
  constructor({ storage = () => window.sessionStorage, now = () => Date.now() } = {}) {
    this.storage = storage; this.now = now;
  }
  read() {
    let text;
    try { text = this.storage().getItem(KEY); }
    catch { throw new Error('浏览器未允许读取临时登录，请输入密码解锁。'); }
    if (!text) return null;
    let saved;
    try { saved = text.length <= 4096 ? JSON.parse(text) : null; }
    catch { saved = null; }
    if (!saved || Object.keys(saved).sort().join(',') !== 'expiresAt,repository,token,version' ||
        saved.version !== 1 || saved.repository !== REPOSITORY || !validToken(saved.token) ||
        !Number.isSafeInteger(saved.expiresAt) || saved.expiresAt <= this.now() || saved.expiresAt > this.now() + SESSION_DURATION) {
      this.clear(); return null;
    }
    return { token: saved.token, expiresAt: saved.expiresAt };
  }
  save(token) {
    if (!validToken(token)) throw new Error('管理连接格式不正确，无法保持解锁。');
    const expiresAt = this.now() + SESSION_DURATION;
    try { this.storage().setItem(KEY, JSON.stringify({ version: 1, repository: REPOSITORY, token, expiresAt })); }
    catch { throw new Error('浏览器未允许保持解锁，请取消该选项后重试。'); }
    return expiresAt;
  }
  clear() {
    try { this.storage().removeItem(KEY); }
    catch { throw new Error('无法清除临时登录，请在浏览器设置中清除此站点数据。'); }
  }
}
