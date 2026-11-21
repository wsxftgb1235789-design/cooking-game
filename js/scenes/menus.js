// 加载、错误、选关界面
import { DESIGN_W, DESIGN_H, VERSION } from '../config.js?v=v0.2.3';
import { ButtonGroup, ICONS } from '../ui.js?v=v0.2.3';
import { fillRR, roundRect, text, drawImg } from '../render/draw.js?v=v0.2.3';
import { img } from '../assets.js?v=v0.2.3';
import { audio } from '../audio.js?v=v0.2.3';
import { progress } from '../storage.js?v=v0.2.3';

function bg(ctx) {
  const tile = img('counter_tile');
  if (tile) { for (let y = 0; y < DESIGN_H; y += 96) for (let x = 0; x < DESIGN_W; x += 96) ctx.drawImage(tile, x, y, 96, 96); }
  else { ctx.fillStyle = '#d9a066'; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H); }
  ctx.fillStyle = 'rgba(43,24,16,.55)'; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
}

export class LoadingScene {
  constructor() { this.name = 'loading'; this.done = 0; this.total = 1; this.label = '加载中'; }
  setProgress(done, total, label) { this.done = done; this.total = total; if (label) this.label = label; }
  update() {}
  draw(ctx) {
    ctx.fillStyle = '#2b2520'; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    text(ctx, '做饭闯关', DESIGN_W / 2, 150, { size: 40, bold: true });
    const w = 420, x = (DESIGN_W - w) / 2, y = 220, k = this.total ? this.done / this.total : 0;
    fillRR(ctx, x, y, w, 22, 11, '#4e423a'); fillRR(ctx, x, y, Math.max(22, w * k), 22, 11, '#ffb300');
    text(ctx, `${this.label} ${Math.round(k * 100)}%（${this.done}/${this.total}）`, DESIGN_W / 2, y + 50, { size: 16, color: '#e0d6cf' });
  }
  snapshot() { return { scene: 'loading', done: this.done, total: this.total }; }
}

export class ErrorScene {
  constructor(title, errors) {
    this.name = 'error'; this.title = title; this.errors = errors;
    this.ui = new ButtonGroup();
    this.ui.add({ id: 'reload', label: '重新加载', x: DESIGN_W / 2 - 80, y: 366, w: 160, h: 50, color: '#455a64', onTap: () => location.reload() });
    console.error(`[cooking-game] ${title}\n` + errors.join('\n'));
  }
  pointerDown(e) { this.ui.pointerDown(e); }
  pointerUp(e) { this.ui.pointerUp(e); }
  update() {}
  draw(ctx) {
    ctx.fillStyle = '#3b1f1f'; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    text(ctx, `⚠ ${this.title}`, DESIGN_W / 2, 36, { size: 24, bold: true, color: '#ffcdd2' });
    text(ctx, '请把下面的错误发给关卡与数值 / 主程（文件：levels/levels.json，格式见 levels/FORMAT.md）', DESIGN_W / 2, 66, { size: 13, color: '#ffab91' });
    const max = 11;
    this.errors.slice(0, max).forEach((e, i) => text(ctx, `• ${e}`, 40, 96 + i * 23, { size: 15, align: 'left', color: '#fff', maxW: DESIGN_W - 80 }));
    if (this.errors.length > max) text(ctx, `……还有 ${this.errors.length - max} 条，见浏览器控制台`, 40, 96 + max * 23, { size: 14, align: 'left', color: '#ffab91' });
    this.ui.draw(ctx);
  }
  snapshot() { return { scene: 'error', title: this.title, errors: this.errors }; }
}

export class SelectScene {
  constructor(app) {
    this.app = app; this.name = 'select';
    this.ui = new ButtonGroup();
    const p = progress.get();
    const L = app.data.levels; const n = L.length;
    const cw = 240, gap = 24, x0 = (DESIGN_W - (n * cw + (n - 1) * gap)) / 2;
    this.cards = L.map((lv, i) => {
      const locked = i + 1 > (p.unlocked || 1);
      const r = { x: x0 + i * (cw + gap), y: 110, w: cw, h: 220 };
      this.ui.add({ id: `level:${i + 1}`, label: locked ? '未解锁' : '开始', x: r.x + 40, y: r.y + 156, w: cw - 80, h: 50, color: locked ? '#757575' : '#2e7d32', size: 20, enabled: !locked, onTap: () => app.startLevel(i) });
      return { lv, r, locked, best: p.best?.[lv.id] };
    });
    this.ui.add({ id: 'sound', x: DESIGN_W - 88, y: 14, w: 52, h: 52, noFrame: true, drawIcon: (ctx, x, y, b) => drawImg(ctx, audio.enabled ? 'ui_sound_on' : 'ui_sound_off', b.x, b.y, b.w, b.h, { color: '#37474f' }), onTap: () => audio.setEnabled(!audio.enabled) });
  }
  pointerDown(e) { this.ui.pointerDown(e); }
  pointerUp(e) { this.ui.pointerUp(e); }
  update() {}
  draw(ctx) {
    bg(ctx);
    text(ctx, '做饭闯关 · 选关', DESIGN_W / 2, 50, { size: 32, bold: true, stroke: '#2b1810' });
    this.cards.forEach(({ lv, r, locked, best }) => {
      fillRR(ctx, r.x, r.y, r.w, r.h, 16, locked ? 'rgba(255,248,236,.55)' : 'rgba(255,248,236,.96)');
      ctx.lineWidth = 3; ctx.strokeStyle = '#2b1810'; roundRect(ctx, r.x, r.y, r.w, r.h, 16); ctx.stroke();
      text(ctx, lv.name, r.x + r.w / 2, r.y + 28, { size: 19, bold: true, color: '#2b1810', maxW: r.w - 16 });
      text(ctx, lv.description, r.x + r.w / 2, r.y + 56, { size: 13, color: '#6d4c41', maxW: r.w - 16 });
      lv.recipes.forEach((rid, k) => drawImg(ctx, rid === 'spicy_clams' ? 'dish_clams' : 'dish_fried_rice', r.x + r.w / 2 - lv.recipes.length * 28 + k * 56, r.y + 70, 52, 52, { color: '#ccc' }));
      const stars = best?.stars || 0;
      if (locked) text(ctx, '通关上一关解锁', r.x + r.w / 2, r.y + 138, { size: 14, bold: true, color: '#5d4037' });
      else text(ctx, '★★★'.slice(0, stars) + '☆☆☆'.slice(0, 3 - stars) + (best ? `  最高 ${best.score}` : ''), r.x + r.w / 2, r.y + 138, { size: 16, bold: true, color: stars ? '#f9a825' : '#a1887f' });
    });
    this.ui.draw(ctx);
  }
  snapshot() { return { scene: 'select', cards: this.cards.map((c) => ({ id: c.lv.id, locked: c.locked, best: c.best || null })) }; }
}
