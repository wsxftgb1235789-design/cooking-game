// 绘制工具：图片（缺图自动回退占位色块）、圆角矩形、文字、熟度条
import { img } from '../assets.js?v=v0.2.3';

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function fillRR(ctx, x, y, w, h, r, color) { ctx.fillStyle = color; roundRect(ctx, x, y, w, h, r); ctx.fill(); }

// 画图片；缺图时画占位色块 + 文字，保证不崩、看得清
export function drawImg(ctx, name, x, y, w, h, fallback = {}) {
  const im = img(name);
  if (im) { ctx.drawImage(im, x, y, w, h); return true; }
  fillRR(ctx, x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8, 10, fallback.color || '#888');
  if (fallback.label) text(ctx, fallback.label, x + w / 2, y + h / 2, { size: Math.max(10, Math.min(16, w / 5)), color: '#fff', bold: true });
  return false;
}

export function text(ctx, s, x, y, { size = 16, color = '#fff', bold = false, align = 'center', base = 'middle', stroke = null, maxW } = {}) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px system-ui, -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = base;
  if (stroke) { ctx.lineWidth = Math.max(2, size / 5); ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y, maxW); }
  ctx.fillStyle = color; ctx.fillText(s, x, y, maxW);
}

// 熟度条：优先用美术条（条带 x=24..488 / 512, y=28..68 / 96，对应 C=0..120），阈值非默认或缺图时程序绘制
export function drawDonenessBar(ctx, x, y, w, h, recipe, c, opts = {}) {
  const im = img('doneness_bar');
  const max = 120;
  const std = recipe.doneMin === 60 && recipe.perfectMin === 70 && recipe.perfectMax === 80 && recipe.burnAbove === 90 && recipe.maxDoneness === 120;
  let bx = x, bw = w, by = y, bh = h;
  if (im && std) {
    ctx.drawImage(im, x, y, w, h);
    bx = x + (24 / 512) * w; bw = (464 / 512) * w; by = y + (28 / 96) * h; bh = (40 / 96) * h;
  } else {
    const px = (v) => x + (Math.min(v, recipe.maxDoneness) / recipe.maxDoneness) * w;
    ctx.save(); roundRect(ctx, x, y, w, h, h / 2); ctx.clip();
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#3fae4a'; ctx.fillRect(px(recipe.doneMin), y, px(recipe.burnAbove) - px(recipe.doneMin), h);
    ctx.fillStyle = '#e7b416'; ctx.fillRect(px(recipe.perfectMin), y, px(recipe.perfectMax) - px(recipe.perfectMin), h);
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(px(recipe.burnAbove), y, x + w - px(recipe.burnAbove), h);
    ctx.restore(); ctx.lineWidth = 2; ctx.strokeStyle = '#2b1810'; roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
  }
  const scaleMax = std && im ? max : recipe.maxDoneness;
  const cx = bx + (Math.min(c, scaleMax) / scaleMax) * bw;
  // 指针
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b1810'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, by + 2); ctx.lineTo(cx - 7, by - 9); ctx.lineTo(cx + 7, by - 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(cx - 2, by, 4, bh); ctx.strokeRect(cx - 2, by, 4, bh);
  return { perfect: { x: bx + (recipe.perfectMin / scaleMax) * bw, y: by, w: ((recipe.perfectMax - recipe.perfectMin) / scaleMax) * bw, h: bh } };
}

export const ZONE_COLOR = { raw: '#d9d9d9', done: '#7be07f', perfect: '#ffd54a', burnt: '#ff6b6b' };
