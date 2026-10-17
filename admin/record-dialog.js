// A single native dialog for feedback and member details, with stable return focus.
export function connectRecordDialog(beforeReturn = () => {}) {
  const dialog = document.getElementById('admin-detail-dialog');
  const close = document.getElementById('close-admin-detail');
  let returnKey = '', scroll = 0, stopped = false;
  const pause = () => dialog.querySelectorAll('video').forEach(video => video.pause());
  const dismiss = () => { if (dialog.open) dialog.close(); };
  const restored = () => {
    pause(); if (stopped) return;
    beforeReturn(returnKey);
    const row = [...document.querySelectorAll('#admin-list [data-record-key]')].find(node => node.dataset.recordKey === returnKey);
    row?.focus({ preventScroll: true }); window.scrollTo({ top: scroll, behavior: 'instant' });
  };
  const outside = event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dismiss();
  };
  close.addEventListener('click', dismiss); dialog.addEventListener('close', restored); dialog.addEventListener('click', outside);
  return {
    pause, close: dismiss,
    show(key, context) {
      if (stopped || !document.querySelector('#inspector h2')) return;
      returnKey = key; document.querySelector('#inspector h2').id = 'admin-detail-title';
      document.getElementById('admin-detail-context').textContent = context;
      if (!dialog.open) { scroll = window.scrollY; dialog.showModal(); }
      close.focus({ preventScroll: true }); dialog.scrollTop = 0;
    },
    destroy() {
      stopped = true; pause(); dismiss();
      close.removeEventListener('click', dismiss); dialog.removeEventListener('close', restored); dialog.removeEventListener('click', outside);
      returnKey = '';
    },
  };
}
