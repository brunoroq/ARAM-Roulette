import { assets } from '../assets.ts';
import type { Messages } from '../i18n/en.ts';
import type { shareModel } from './model.ts';

export const SHARE_WIDTH = 1500;
export const SHARE_HEIGHT = 860;
type Model = ReturnType<typeof shareModel>;

async function loadImage(src: string): Promise<HTMLImageElement> {
  const url = new URL(src, document.baseURI);
  if (url.origin !== location.origin) throw new Error('Share assets must be local.');
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Image load timed out')), 15000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error(`Unable to load ${url.pathname}`)); };
    image.src = url.href;
  });
  await image.decode();
  return image;
}

/** Dedicated canvas composition; no DOM serialization, foreignObject or remote requests. */
export async function renderShareCard(canvas: HTMLCanvasElement, model: Model, t: Messages, language: string): Promise<Blob> {
  const local = (src: string) => `${import.meta.env.BASE_URL}${src}`;
  const [logo, background, champion, ...icons] = await Promise.all([
    loadImage(assets.logoCompact), loadImage(assets.background), loadImage(local(model.champion.icon)),
    ...model.spells.map(({ spell }) => loadImage(local(spell.icon))),
    ...model.items.map(item => loadImage(local(item.icon))),
  ]);
  await document.fonts.load('32px Bangers');
  await document.fonts.ready;
  if (!document.fonts.check('32px Bangers')) throw new Error('Share font unavailable');
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Canvas is unavailable');
  const ink = '#070d18', cream = '#fff0cb', cyan = '#56d9ed', pink = '#ff426f';
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const box = (x: number, y: number, w: number, h: number, fill: string, border = ink) => {
    c.fillStyle = ink; c.fillRect(x + 6, y + 7, w, h);
    c.fillStyle = fill; c.fillRect(x, y, w, h);
    c.strokeStyle = border; c.lineWidth = 4; c.strokeRect(x, y, w, h);
  };
  const text = (value: string, x: number, y: number, size: number, color = cream, width?: number) => {
    c.font = `${size}px Bangers`; c.fillStyle = color; c.textBaseline = 'top';
    c.fillText(value, x, y, width);
  };
  const wrapped = (value: string, x: number, y: number, width: number, size: number) => {
    // Fit complete names into three lines rather than truncating the actual build.
    let lines: string[] = [];
    do {
      c.font = `${size}px Bangers`; lines = [''];
      for (const word of value.split(/\s+/)) {
        const last = lines.length - 1;
        const next = lines[last] ? `${lines[last]} ${word}` : word;
        if (c.measureText(next).width > width && lines[last]) lines.push(word);
        else lines[last] = next;
      }
      if (lines.length <= 3) break;
      size -= 2;
    } while (size > 16);
    lines.forEach((line, index) => text(line, x, y + index * (size + 4), size, ink, width));
  };
  const icon = (image: HTMLImageElement, x: number, y: number, size: number, border = cyan) => {
    c.fillStyle = ink; c.fillRect(x - 5, y - 5, size + 10, size + 10);
    c.drawImage(image, x, y, size, size);
    c.strokeStyle = border; c.lineWidth = 3; c.strokeRect(x - 4, y - 4, size + 8, size + 8);
  };
  const cover = Math.max(SHARE_WIDTH / background.width, SHARE_HEIGHT / background.height);
  c.drawImage(background, (SHARE_WIDTH - background.width * cover) / 2, (SHARE_HEIGHT - background.height * cover) / 2, background.width * cover, background.height * cover);
  c.fillStyle = '#061322df'; c.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  c.strokeStyle = cyan; c.lineWidth = 4; c.strokeRect(16, 16, SHARE_WIDTH - 32, SHARE_HEIGHT - 32);
  const logoScale = Math.min(390 / logo.width, 115 / logo.height);
  c.drawImage(logo, 44, 33, logo.width * logoScale, logo.height * logoScale);
  box(1195, 55, 255, 54, cyan);
  text(t.app.mode, 1220, 66, 32, ink, 210);
  box(42, 170, 1410, 177, '#11283e');
  icon(champion, 66, 193, 130);
  text(model.champion.name, 225, 202, 58, cream, 620);
  c.font = '23px "Trebuchet MS", sans-serif'; c.fillStyle = '#b0c3d0';
  c.fillText(model.champion.title, 227, 280, 590);
  model.spells.forEach(({ key, spell }, i) => {
    const x = 950 + i * 255;
    icon(icons[i], x, 194, 86, i ? pink : cyan);
    box(x + 65, 260, 34, 37, ink);
    text(key, x + 74, 263, 29);
    text(spell.name, x - 15, 307, 27, cream, 220);
  });
  text(t.tray.label, 47, 373, 32);
  model.items.forEach((item, i) => {
    const x = 44 + i * 238;
    c.save(); c.translate(x + 108, 581); c.rotate((i % 2 ? 1 : -1) * Math.PI / 360); c.translate(-108, -581);
    box(0, 427, 220, 307, cream, i % 2 ? pink : cyan);
    text(String(i + 1).padStart(2, '0'), 13, 440, 25, '#726347');
    icon(icons[i + 2], 58, 452, 104, ink);
    wrapped(item.name, 15, 582, 190, 29);
    text(t.tray.gold(number(item.cost)), 16, 696, 23, ink, 190);
    c.restore();
  });
  text(t.share.total(number(model.total)), 48, 783, 34, '#ffe34d', 1020);
  text(t.app.brandName, 1215, 785, 32, cyan, 230);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'));
}
