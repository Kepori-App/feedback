// Only public-page totals leave the site. No third-party script or local identity.
export const VISITS_PAGE = 'https://kepori-app.github.io/feedback/';
export const VISITS_ENDPOINT = 'https://busuanzi.9420.ltd/api';

export function isPublicPage(url) {
  const page = new URL(url);
  return page.origin === 'https://kepori-app.github.io' &&
    ['/feedback/', '/feedback/index.html'].includes(page.pathname);
}

export function visitTotal(result) {
  const count = result?.data?.page_pv;
  if (result?.success !== true || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('Invalid visit total');
  }
  return count;
}

export async function requestVisits({ transport = fetch, signal } = {}) {
  const response = await transport(VISITS_ENDPOINT, {
    method: 'POST', headers: { 'x-bsz-referer': VISITS_PAGE }, signal,
    credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) throw new Error('Visit service unavailable');
  return visitTotal(await response.json());
}

export async function showVisits(node, { url = location.href, transport = fetch } = {}) {
  if (!node || !isPublicPage(url)) return;
  node.hidden = false;
  const controller = new AbortController();
  let leaving = false;
  const stop = () => { leaving = true; controller.abort(); };
  window.addEventListener('pagehide', stop, { once: true });
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const count = await requestVisits({ transport, signal: controller.signal });
    if (leaving) return;
    if (!controller.signal.aborted) node.textContent = `访问 ${new Intl.NumberFormat('zh-CN').format(count)} 次`;
    else node.textContent = '访问统计暂不可用';
  } catch {
    // Never invent a number or retry a POST whose result is unknown.
    if (!leaving) node.textContent = '访问统计暂不可用';
  } finally {
    clearTimeout(timeout);
    window.removeEventListener('pagehide', stop);
  }
}

if (typeof document !== 'undefined') showVisits(document.getElementById('visit-count'));
