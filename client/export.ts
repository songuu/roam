import type { JournalEntry, ShareDraft } from '../shared/types';

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Downloads may consume the object URL asynchronously, particularly on mobile.
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function downloadText(filename: string, text: string): void {
  downloadBlob(filename, new Blob([text], { type: 'text/plain;charset=utf-8' }));
}

function loadPhoto(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const photo = new Image();
    photo.onload = () => resolve(photo);
    photo.onerror = () => reject(new Error('有照片无法读取，请刷新后再导出'));
    photo.src = url;
  });
}

function drawCover(context: CanvasRenderingContext2D, photo: HTMLImageElement, x: number, y: number, width: number, height: number): void {
  const scale = Math.max(width / photo.naturalWidth, height / photo.naturalHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  context.drawImage(photo, (photo.naturalWidth - cropWidth) / 2, (photo.naturalHeight - cropHeight) / 2, cropWidth, cropHeight, x, y, width, height);
}

function wrapText(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const character of paragraph) {
      if (line && context.measureText(line + character).width > width) { lines.push(line); line = ''; }
      line += character;
    }
    lines.push(line);
  }
  return lines;
}

export async function downloadShareImage(draft: ShareDraft, entries: JournalEntry[]): Promise<void> {
  const photosById = new Map(entries.flatMap(entry => entry.photos).map(photo => [photo.id, photo]));
  const selected = [...new Set(draft.photoIds)].slice(0, 6).map(id => photosById.get(id)).filter(photo => photo !== undefined);
  const photos = await Promise.all(selected.map(photo => loadPhoto(photo.url)));
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法导出图片，请下载文字版本');
  context.fillStyle = '#f6f3eb';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#315846';
  context.font = '24px sans-serif';
  context.fillText('ROAM / 途伴 · 旅途手记', 70, 78);
  context.font = 'bold 50px sans-serif';
  const titleLines = wrapText(context, draft.title || '记录沿途的美好', 940).slice(0, 2);
  titleLines.forEach((line, index) => context.fillText(line, 70, 160 + index * 66));
  const photoTop = titleLines.length > 1 ? 270 : 210;
  const photoHeight = photos.length ? (photos.length <= 2 ? 600 : 760) : 0;
  if (photos.length) {
    const columns = photos.length === 1 ? 1 : 2;
    const rows = Math.ceil(photos.length / columns);
    const gap = 12;
    const width = (940 - gap * (columns - 1)) / columns;
    const height = (photoHeight - gap * (rows - 1)) / rows;
    photos.forEach((photo, index) => drawCover(context, photo, 70 + (index % columns) * (width + gap), photoTop + Math.floor(index / columns) * (height + gap), width, height));
  }
  context.font = '28px sans-serif';
  context.fillStyle = '#3c453d';
  const bodyTop = photoTop + photoHeight + (photos.length ? 58 : 20);
  const maxLines = Math.max(1, Math.floor((1300 - bodyTop) / 43));
  const lines = wrapText(context, draft.body, 940).filter(line => line.trim());
  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines && visibleLines.length) visibleLines[visibleLines.length - 1] = visibleLines[visibleLines.length - 1].slice(0, -1) + '…';
  visibleLines.forEach((line, index) => context.fillText(line, 70, bodyTop + index * 43));
  context.font = '22px sans-serif';
  context.fillStyle = '#748372';
  context.fillText('把向往变成旅程，把旅程留成回忆。', 70, 1380);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片导出失败，请重新尝试')), 'image/png'));
  downloadBlob(`途伴-${draft.platform}-旅途手记.png`, blob);
}
