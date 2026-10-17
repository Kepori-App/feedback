// Pointer-opened dialogs keep their focus target without a persistent focus ring.
// Keyboard navigation always restores visible focus. Inputs retain their own styling.
export function installInputModality(document) {
  const root = document.documentElement;
  root.dataset.inputModality = 'pointer';
  const pointer = () => { root.dataset.inputModality = 'pointer'; };
  const keyboard = event => {
    if (['Tab', 'Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) root.dataset.inputModality = 'keyboard';
  };
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('keydown', keyboard, true);
  return () => {
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('keydown', keyboard, true);
    delete root.dataset.inputModality;
  };
}
