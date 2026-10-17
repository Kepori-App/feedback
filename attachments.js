// Render only verified, content-addressed assets from this website.
const ROOT = new URL('./', import.meta.url);
const TYPES = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

export function safeAttachments(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(item => {
    if (!item || typeof item.path !== 'string') return false;
    const match = /^assets\/uploads\/[a-f0-9]{64}\.(jpg|png|gif|webp|mp4|mov|webm)$/.exec(item.path);
    return match && TYPES[match[1]] === item.mimeType && Number.isInteger(item.size) && item.size > 0 && item.size <= 10 * 1024 * 1024;
  }).slice(0, 3);
}

const node = (tag, className, text) => {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
};

export function attachmentGallery(items, { compact = false, open } = {}) {
  const files = safeAttachments(items);
  const root = node('div', compact ? 'media-strip' : 'media-gallery');
  for (const [index, file] of files.entries()) {
    const image = file.mimeType.startsWith('image/');
    const url = new URL(file.path, ROOT).href;
    const label = `${image ? '图片' : '视频'} ${index + 1}`;
    if (compact) {
      const button = node('button', `media-thumb ${image ? '' : 'media-video'}`);
      button.type = 'button'; button.setAttribute('aria-label', `查看${label}`);
      if (image) {
        const img = node('img', ''); img.src = url; img.alt = label;
        img.loading = 'lazy'; img.decoding = 'async'; button.append(img);
      } else button.append(node('span', 'play-symbol', '▷'), node('span', '', '视频'));
      button.addEventListener('click', () => open?.());
      root.append(button);
      continue;
    }
    const figure = node('figure', 'media-item');
    if (image) {
      const link = node('a', 'media-image-link'); link.href = url;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `打开${label}原图`);
      const img = node('img', ''); img.src = url; img.alt = `反馈附件 · ${label}`;
      img.loading = 'lazy'; img.decoding = 'async'; link.append(img); figure.append(link);
    } else {
      const video = node('video', ''); video.controls = true; video.playsInline = true;
      video.preload = 'metadata'; video.setAttribute('aria-label', `反馈附件 · ${label}`);
      const source = node('source', ''); source.src = url; source.type = file.mimeType;
      video.append(source, document.createTextNode('当前浏览器无法播放，请打开原文件查看。')); figure.append(video);
    }
    const caption = node('figcaption', '');
    const link = node('a', 'text-link', image ? '查看原图 ↗' : '打开原视频 ↗');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const small = file.size < 1024 * 1024;
    const size = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(file.size / (small ? 1024 : 1024 * 1024));
    caption.append(node('span', '', `${label} · ${size} ${small ? 'KB' : 'MB'}`), link);
    figure.append(caption); root.append(figure);
  }
  root.hidden = !files.length;
  return root;
}

export function pendingAttachments(count) {
  const note = node('p', 'subtle media-pending', Number.isInteger(count) && count > 0 ? `${Math.min(count, 3)} 个附件正在同步，请稍后查看。` : '');
  note.hidden = !note.textContent;
  return note;
}
