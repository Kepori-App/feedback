/** Keep a submitted form's return page current; refresh handles its own errors. */
export function installPublicRefresh(refresh, { page = document, host = window, delay = 30000 } = {}) {
  let timer = null, running = false, suspended = false, stopped = false;
  function schedule() {
    host.clearTimeout(timer); timer = null;
    if (!stopped && !suspended && !page.hidden && !running) timer = host.setTimeout(tick, delay);
  }
  async function tick() {
    timer = null;
    if (stopped || suspended || page.hidden) return;
    if (page.querySelector('dialog[open]') || page.activeElement?.matches('input, select, textarea') || page.getSelection?.()?.toString()) {
      schedule(); return;
    }
    running = true;
    try { await refresh(); }
    finally { running = false; schedule(); }
  }
  function pause() { suspended = true; host.clearTimeout(timer); timer = null; }
  function resume() { suspended = false; schedule(); }
  function stop() {
    stopped = true; pause();
    page.removeEventListener('visibilitychange', schedule);
    host.removeEventListener('pagehide', pause); host.removeEventListener('pageshow', resume);
  }
  page.addEventListener('visibilitychange', schedule);
  host.addEventListener('pagehide', pause); host.addEventListener('pageshow', resume);
  schedule(); return stop;
}
