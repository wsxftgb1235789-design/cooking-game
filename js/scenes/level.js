// 关卡场景（通用）：订单、计时、得分/失误、教学、提示、暂停、结算。做菜交给可替换的烹饪模块（cooking/README.md）
import { DESIGN_W, DESIGN_H, STORE, COOKING_MODULE } from '../config.js?v=v0.2.2';
import { L, canonicalId } from '../layout.js?v=v0.2.2';
import { createCooking } from '../cooking/index.js?v=v0.2.2';
import { DISH_ART } from '../cooking/wok/defaults.js?v=v0.2.2';
import { OrderSystem } from '../systems/orders.js?v=v0.2.2';
import { Scoreboard, starsFor } from '../systems/scoring.js?v=v0.2.2';
import { LevelTimer } from '../systems/timer.js?v=v0.2.2';
import { Tutorial, Hints } from '../systems/tutorial.js?v=v0.2.2';
import { ButtonGroup } from '../ui.js?v=v0.2.2';
import { drawImg, fillRR, roundRect, text } from '../render/draw.js?v=v0.2.2';
import { img } from '../assets.js?v=v0.2.2';
import { audio } from '../audio.js?v=v0.2.2';
import { load, save, progress } from '../storage.js?v=v0.2.2';

const inR = (r, x, y, pad = 0) => !!r && x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const PARAMS = new URLSearchParams(location.search);
export const DEBUG = PARAMS.get('debug') === '1';

export class LevelScene {
  constructor(app, levelIndex) {
    this.app = app; this.name = 'level';
    this.level = app.data.levels[levelIndex];
    this.data = app.data;
    this.t = 0; this.paused = false; this.pauseReason = null; this.result = null;
    this.floats = []; this.fx = []; this.press = null; this.served = 0; this.log = [];
    const LV = this.level;
    const hasTutorialOrder = LV.orders.some((o) => o.tutorial);
    const done = !!load(STORE.tutorialDone, false);
    const skipOk = LV.tutorial.skipIfDone !== false;
    this.useTutorial = hasTutorialOrder && LV.tutorial.steps.length > 0 && !(done && skipOk);
    this.skippedTutorial = hasTutorialOrder && done && skipOk; // 重玩：跳过教学单（订单 index 仍按配置位置）
    this.tutorial = new Tutorial(this.useTutorial ? LV.tutorial.steps : []);
    this.hints = new Hints(LV.tutorial.hints || []);
    this.score = new Scoreboard(LV);
    this.timer = new LevelTimer(LV.timeLimit);
    this.orders = new OrderSystem(LV, { skipTutorial: this.skippedTutorial, emit: (e, d) => this.emit(e, d) });

    const self = this;
    this.station = {
      emit: (e, d) => self.emit(e, d),
      allows: (ids) => self.tutorial.allows(ids),
      orders: () => self.orders.active,
      orderAt: (x, y) => self.orderAt(x, y),
      orderRect: (o) => self.cardRect(o),
      serve: (dish, order) => self.serve(dish, order),
      float: (s, x, y, c) => self.float(s, x, y, c),
      inTutorial: () => self.tutorial.active,
      seasoningTarget: (o) => self.seasoningTarget(o),
      recipes: app.data.recipes, seasoning: app.data.seasoning, tuning: app.data.tuning, debug: DEBUG
    };
    this.cooking = createCooking(COOKING_MODULE);
    this.cooking.init(LV, this.station);

    this.hud = new ButtonGroup();
    this.hud.add({ id: 'sound', ...L.sound, sound: 'click', drawIcon: (ctx, x, y, b) => drawImg(ctx, audio.enabled ? 'ui_sound_on' : 'ui_sound_off', b.x, b.y, b.w, b.h, { color: '#37474f', label: audio.enabled ? '♪' : '×' }), noFrame: true, onTap: () => audio.setEnabled(!audio.enabled) });
    this.hud.add({ id: 'pause', ...L.pause, drawIcon: (ctx, x, y, b) => drawImg(ctx, 'ui_pause', b.x, b.y, b.w, b.h, { color: '#37474f', label: 'II' }), noFrame: true, onTap: () => this.pause('button') });
    this.overlayUI = new ButtonGroup();
    this.emit('levelStart', {});
  }

  // ---------- 事件总线：教学 / 提示 / 音效都从这里走 ----------
  emit(name, data = {}) {
    if (name !== 'tempBand' && name !== 'tempGte' && name !== 'doneness' && name !== 'heat') { this.log.push(name); if (this.log.length > 60) this.log.shift(); }
    if (name === 'orderSpawn') {
      audio.play('order_new');
      if (data.order?.tutorial && this.useTutorial && !this.tutorial.active && !this.tutorial.finished) this.tutorial.start();
    }
    if (name === 'orderTimeout') this.onTimeout(data.order);
    const was = this.tutorial.active;
    this.tutorial.onEvent(name, data);
    if (was && !this.tutorial.active && this.tutorial.finished) save(STORE.tutorialDone, true);
    this.hints.onEvent(name, data);
  }
  float(s, x, y, color = '#fff') { this.floats.push({ s, x, y, color, t: 0 }); }
  seasoningTarget(o) { const S = this.data.seasoning; return (o && o.request && S.requests[o.request]?.level) ?? S.default; }
  cardRect(o) { const i = this.orders.active.indexOf(o); return i < 0 ? null : L.order(i); }
  orderAt(x, y) { return this.orders.active.find((o, i) => inR(L.order(i), x, y, 8)) || null; }

  // ---------- 出餐判定（rules §5）----------
  // dish: { recipeId, quality, seasoning, seasoningSource, orderCorrect } → outcome: complete / returned / rejected / wrong / ignored
  serve(dish, order) {
    if (this.result || !order || !this.orders.active.includes(order)) return { outcome: 'ignored' };
    if (!this.tutorial.allows(['orderCard'])) return { outcome: 'ignored' };
    const S = this.level.scoring, M = this.level.mistakes, c = center(this.cardRect(order));
    const tut = order.tutorial;
    if (dish.recipeId !== order.recipe) {
      this.score.add(tut ? 0 : S.wrongDishPenalty || 0); audio.play('reject'); this.float('送错菜了', c.x, c.y + 50, '#ffcc80');
      this.emit('wrongDish', { orderIndex: order.index }); return { outcome: 'wrong' };
    }
    if (dish.quality === 'burnt') {
      if (!tut) { this.score.add(S.burntPenalty); if (M.countBurnt !== false) this.mistake(); }
      audio.play('burnt'); this.float(tut ? '糊了，重做' : `糊了 ${S.burntPenalty}`, c.x, c.y + 50, '#ff6b6b');
      this.emit('rejected', { orderIndex: order.index }); return { outcome: 'rejected' };
    }
    if (dish.quality === 'raw') {
      if (!tut) { this.score.add(S.rawReturnPenalty || 0); if (M.countRaw !== false) this.mistake(); }
      audio.play('reject'); this.float('还没熟，退回', c.x, c.y + 50, '#ffcc80');
      this.emit('returned', { orderIndex: order.index }); return { outcome: 'returned' };
    }
    const want = this.seasoningTarget(order), seasonOk = dish.seasoning === want;
    const perfect = dish.quality === 'perfect' && seasonOk;
    let pts = S.orderComplete + (perfect ? S.perfectBonus : 0) + (dish.orderCorrect ? S.orderBonus : 0) + Math.floor(order.left) * S.timeBonusPerSecond;
    if (!seasonOk) pts = Math.round(pts * S.wrongSeasoningMultiplier);
    if (tut) pts = 0; // 教学单不计分
    if (!this.orders.resolve(order, 'complete')) return { outcome: 'ignored' }; // 防重复结算
    this.score.add(pts); this.served++;
    if (!tut) { this.score.completed++; if (perfect) this.score.perfect++; } // 教学单不进结算统计
    audio.play('order_success');
    this.float(tut ? '出餐！' : `+${pts}${seasonOk ? '' : '（调料不对 ×' + S.wrongSeasoningMultiplier + '）'}`, c.x, c.y + 50, seasonOk ? '#7be07f' : '#ffcc80');
    if (dish.orderCorrect) { this.fx.push({ x: c.x, y: c.y + 10, t: 0 }); if (!tut) this.float(`顺序全对 +${S.orderBonus}`, c.x, c.y + 80, '#ffd54a'); this.emit('orderBonus', { orderIndex: order.index }); }
    if (tut) save(STORE.tutorialDone, true);
    this.emit('serve', { orderIndex: order.index, recipe: order.recipe, quality: dish.quality, seasonOk, points: pts });
    this.checkEnd();
    return { outcome: 'complete', points: pts };
  }
  mistake() { audio.play('mistake'); if (this.score.addMistake()) this.end(false, '失误达到上限'); }
  onTimeout(order) {
    if (order.tutorial) return;
    const S = this.level.scoring;
    this.score.add(S.timeoutPenalty); this.score.timeouts++;
    audio.play('order_timeout'); this.float(`客人走了 ${S.timeoutPenalty}`, 500, 96, '#ff6b6b');
    if (this.level.mistakes.countTimeout !== false) this.mistake();
    this.checkEnd();
  }
  checkEnd() {
    if (this.result) return;
    if (this.score.failed) return this.end(false, '失误达到上限');
    if (this.orders.done) this.end(true, '');
    else if (this.timer.expired) this.end(false, '时间到');
  }
  end(cleared, reason = '') {
    if (this.result) return;
    const stars = starsFor(this.level, this.score.score, cleared);
    if (cleared) progress.record(this.level.index, this.level.id, this.score.score, stars);
    const hasNext = this.level.index + 1 < this.data.levels.length;
    this.result = { cleared, stars, score: this.score.score, perfect: this.score.perfect, mistakes: this.score.mistakes, reason, unlockedNext: cleared && hasNext, t: 0 };
    this.press = null; this.cooking.pause();
    audio.play(cleared ? 'result_win' : 'result_fail');
    const g = new ButtonGroup(), cx = DESIGN_W / 2, nextOk = hasNext && progress.get().unlocked > this.level.index + 1;
    const btn = (o) => g.add({ h: 52, size: 19, color: '#455a64', drawIcon: buttonArt, noFrame: true, ...o });
    btn({ id: 'retry', label: '重玩', x: cx - 214, y: 290, w: 132, onTap: () => this.app.startLevel(this.level.index) });
    btn({ id: 'select', label: '选关', x: cx - 66, y: 290, w: 132, onTap: () => this.app.goSelect() });
    btn({ id: 'next', label: hasNext ? '下一关' : '最后一关', x: cx + 82, y: 290, w: 132, enabled: nextOk, onTap: () => this.app.startLevel(this.level.index + 1) });
    this.overlayUI = g;
  }

  // ---------- 暂停：冻结 T/C/B/耐心/计时；回来停在暂停界面，点继续才恢复 ----------
  pause(reason) {
    if (this.paused || this.result) return;
    this.paused = true; this.pauseReason = reason; this.press = null;
    this.cooking.pause(); this.hud.cancel(); this.app.input?.reset?.();
    const g = new ButtonGroup(), cx = DESIGN_W / 2;
    const btn = (o) => g.add({ h: 52, size: 20, color: '#455a64', drawIcon: buttonArt, noFrame: true, ...o });
    btn({ id: 'resume', label: '继续', x: cx - 110, y: 136, w: 220, h: 56, size: 22, onTap: () => this.resume() });
    btn({ id: 'retry', label: '重试', x: cx - 110, y: 202, w: 106, onTap: () => this.app.startLevel(this.level.index) });
    btn({ id: 'select', label: '选关', x: cx + 4, y: 202, w: 106, onTap: () => this.app.goSelect() });
    g.add({ id: 'sound2', x: cx - 26, y: 266, w: 52, h: 52, noFrame: true, drawIcon: (ctx, x, y, b) => drawImg(ctx, audio.enabled ? 'ui_sound_on' : 'ui_sound_off', b.x, b.y, b.w, b.h, { color: '#37474f' }), onTap: () => audio.setEnabled(!audio.enabled) });
    this.overlayUI = g;
  }
  resume() { if (this.app.viewport?.portrait) return; this.paused = false; this.pauseReason = null; this.overlayUI = new ButtonGroup(); this.cooking.resume(); }

  // ---------- 输入（单指，见 input.js）----------
  pointerDown(ev) {
    if (this.result || this.paused) { this.overlayUI.pointerDown(ev); return; }
    if (this.hud.pointerDown(ev)) return;
    const v = this.tutorial.view;
    if (v && !v.waiting && v.waitFor?.event === 'tapAnywhere') { this.press = { kind: 'tapAnywhere', id: ev.id }; return; }
    if (this.cooking.pointerDown(ev)) this.press = { kind: 'cooking', id: ev.id };
  }
  pointerMove(ev) { if (this.press?.kind === 'cooking' && !this.paused && !this.result) this.cooking.pointerMove(ev); }
  pointerUp(ev) {
    if (this.result || this.paused) { this.overlayUI.pointerUp(ev); return; }
    if (this.hud.pointerUp(ev)) return;
    const p = this.press; this.press = null;
    if (!p) return;
    if (p.kind === 'tapAnywhere') { if (!ev.cancelled) this.emit('tapAnywhere', {}); return; }
    this.cooking.pointerUp(ev);
  }

  // ---------- 更新（累计 dt）----------
  update(dt) {
    this.t += dt;
    if (this.result) { this.result.t += dt; return; }
    if (this.paused) return;
    this.tutorial.update(dt);
    this.cooking.setTempCap(this.tutorial.capOn ? (this.level.tutorial.tempCap ?? 75) : Infinity);
    { const p0 = this.cooking.pots?.[0]; if (this.tutorial.active && p0) this.tutorial.updateHeat(dt, p0.T, p0.recipe?.temp); } // BUG-001：等温度阶段火太小的提示
    this.cooking.setCookFrozen?.(this.tutorial.readingPause); // 教学阅读期暂停 C、B（正式订单不受影响）
    const frozen = this.tutorial.active; // 强引导期间订单与关卡计时冻结（教学单本来就不计时）
    if (!frozen) { this.orders.update(dt); this.timer.update(dt); }
    else this.orders.active.forEach((o) => { o.anim = Math.min(1, o.anim + dt / 0.35); });
    this.cooking.update(dt);
    this.hints.update(dt);
    this.floats.forEach((f) => { f.t += dt; }); this.floats = this.floats.filter((f) => f.t < 1.4);
    this.fx.forEach((f) => { f.t += dt; }); this.fx = this.fx.filter((f) => f.t < 0.6);
    this.checkEnd();
  }

  rectOf(id) {
    const c = canonicalId(id);
    if (c === 'orderCard') return this.orders.active.length ? L.order(0) : L.order(0);
    if (c.startsWith('orderCard@')) return L.order(+c.split('@')[1]);
    if (c === 'pause' || c === 'sound') return L[c];
    if (c === 'hud') return L.hud;
    if (c === 'orderRequest') return null;
    return this.cooking.rectOf(c);
  }

  // ---------- 绘制 ----------
  draw(ctx) {
    const tile = img('counter_tile');
    if (tile) for (let y = 0; y < DESIGN_H; y += 92) for (let x = 0; x < DESIGN_W; x += 92) ctx.drawImage(tile, x, y, 92, 92);
    else { ctx.fillStyle = '#d9a066'; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H); }
    this.cooking.render(ctx);
    this.drawTopBar(ctx);
    this.fx.forEach((f) => drawImg(ctx, `fx_sequence_stars_0${Math.min(3, 1 + Math.floor(f.t / 0.2))}`, f.x - 60, f.y - 60, 120, 120, { color: 'rgba(255,213,74,.4)' }));
    if (this.tutorial.active) this.drawTutorial(ctx); else this.drawHint(ctx);
    this.cooking.renderOverlay?.(ctx);
    this.floats.forEach((f) => { ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4); text(ctx, f.s, f.x, f.y - f.t * 30, { size: 18, bold: true, color: f.color, stroke: '#2b1810' }); });
    ctx.globalAlpha = 1;
    if (DEBUG) text(ctx, `debug · ${this.level.id} · t ${this.orders.time.toFixed(1)}s · 事件 ${this.log.slice(-4).join(' ')}`, 8, DESIGN_H - 8, { size: 11, align: 'left', base: 'bottom', color: '#ffd54a', stroke: '#000' });
    if (this.paused) this.drawPause(ctx);
    if (this.result) this.drawResult(ctx);
  }
  drawTopBar(ctx) {
    const h = L.hud;
    fillRR(ctx, h.x, h.y, h.w, h.h, 12, 'rgba(43,24,16,.78)');
    text(ctx, `分数 ${this.score.score}`, h.x + 10, h.y + 15, { size: 16, bold: true, align: 'left', color: '#fff' });
    const max = this.level.mistakes.max;
    text(ctx, `失误 ${this.score.mistakes}/${max}`, h.x + h.w - 10, h.y + 15, { size: 13, bold: true, align: 'right', color: this.score.mistakes ? '#ff8a80' : '#c8e6c9' });
    const tl = this.timer.limit > 0 ? ` · 剩 ${Math.ceil(this.timer.remaining)}s` : '';
    text(ctx, `${this.level.name} · 订单 ${this.orders.resolved}/${this.orders.total}${tl}`, h.x + 10, h.y + 36, { size: 11, align: 'left', color: '#ffe0b2', maxW: h.w - 16 });
    this.hud.draw(ctx);
    this.orders.active.forEach((o, i) => this.drawCard(ctx, o, i));
  }
  drawCard(ctx, o, i) {
    const r0 = L.order(i), r = { ...r0, y: r0.y - (1 - o.anim) * 80 };
    drawImg(ctx, 'ui_order_card', r.x, r.y, r.w, r.h, { color: '#fff8ec' });
    const art = DISH_ART[o.recipe];
    drawImg(ctx, art?.dish, r.x + 6, r.y + 6, 40, 40, { color: art?.color || '#ccc' });
    text(ctx, this.data.recipes[o.recipe]?.name || o.recipe, r.x + 52, r.y + 20, { size: 13, bold: true, align: 'left', color: '#3e2723', maxW: o.request ? 42 : 112 });
    if (o.tutorial) text(ctx, '教学·不计时', r.x + 52, r.y + 38, { size: 10, align: 'left', color: '#6d4c41' });
    const bar = { x: r.x + 8, y: r.y + r.h - 16, w: r.w - 16, h: 8 }, k = o.tutorial ? 1 : Math.max(0, o.left / o.patience);
    drawImg(ctx, 'ui_patience_bar_frame', bar.x, bar.y, bar.w, bar.h, { color: '#4e342e' });
    const fill = img(k > 0.5 ? 'ui_patience_fill_green' : k > 0.25 ? 'ui_patience_fill_yellow' : 'ui_patience_fill_red');
    if (fill) ctx.drawImage(fill, bar.x + 1, bar.y + 1, (bar.w - 2) * k, bar.h - 2); else fillRR(ctx, bar.x, bar.y, bar.w * k, bar.h, 4, k > 0.5 ? '#43a047' : k > 0.25 ? '#fbc02d' : '#e53935');
    if (o.request) { const q = L.orderRequest(i); drawImg(ctx, `ui_bubble_${o.request}`, q.x, q.y - (1 - o.anim) * 80, q.w, q.h, { color: '#fff', label: this.data.seasoning.requests[o.request]?.label }); }
  }
  drawBanner(ctx, s, strong) {
    const b = L.banner(this.level.pots);
    fillRR(ctx, b.x, b.y, b.w, b.h, 14, strong ? 'rgba(255,248,236,.97)' : 'rgba(43,24,16,.85)');
    ctx.lineWidth = 3; ctx.strokeStyle = strong ? '#ffb300' : 'rgba(255,255,255,.4)'; roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.stroke();
    text(ctx, s, b.x + b.w / 2, b.y + b.h / 2, { size: b.h >= 50 ? (strong ? 20 : 17) : 14, bold: true, color: strong ? '#2b1810' : '#fff', maxW: b.w - 20 });
    return b;
  }
  drawHint(ctx) { const h = this.hints.current; if (h && !this.result) { ctx.globalAlpha = Math.max(0, Math.min(1, h.left * 3, (h.total - h.left) * 6 + 0.2)); this.drawBanner(ctx, h.text, false); ctx.globalAlpha = 1; } }
  drawTutorial(ctx) {
    const v = this.tutorial.view; if (!v) return;
    const rects = (v.highlight || []).map((id) => this.rectOf(id)).filter(Boolean).map((r) => ({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 }));
    if (!v.waiting) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, DESIGN_W, DESIGN_H);
      rects.forEach((r) => { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x + r.w, r.y); ctx.closePath(); });
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill('evenodd'); ctx.restore();
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
      rects.forEach((r) => { ctx.lineWidth = 3 + pulse * 2; ctx.strokeStyle = '#ffd54a'; roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.stroke(); });
    }
    const b = this.drawBanner(ctx, v.waiting ? '继续炒，留意温度和熟度…' : v.text, !v.waiting);
    if (v.waitFor?.event === 'tapAnywhere' && !v.waiting) text(ctx, '点任意处继续 ▶', b.x + b.w - 12, b.y + b.h - 9, { size: 12, color: '#8d6e63', align: 'right' });
    if (v.waiting) return;
    // 手指动画：拖拽类画路径，画圈类画圆，点按类画脉冲
    const w = v.waitFor || {}, R = (id) => this.rectOf(id);
    let path = null, circle = null;
    if (w.event === 'ingredientIn') path = [R(`source:${w.source}`), R('pot:1')];
    else if (w.event === 'plate') { // 教学第 8 步（C≥80 后显示）：走廊箭头 + 提示框（art v0.3.1），装盘成功即换步隐藏
      const A = L.tutorialArrow, Hn = L.tutorialHint;
      if (!drawImgQuiet(ctx, 'ui_tutorial_arrow_full', A.x, A.y, A.w, A.h)) path = null;
      drawImgQuiet(ctx, 'ui_tutorial_hint', Hn.x, Hn.y + Math.sin(this.t * 4) * 2, Hn.w, Hn.h);
      const h = R('potHandle:1'); if (h) path = [h, { x: 515, y: L.corridorY - 10, w: 10, h: 20 }, { x: 760, y: L.corridorY - 10, w: 10, h: 20 }];
    }
    else if (w.event === 'serve') path = [R('plate:1'), R('orderCard')];
    else if (w.event === 'toss' || w.after === 'toss') circle = R('pot:1');
    else if (w.event === 'heatHint') { const h = R('potHandle:1'); if (h) path = [{ ...h, y: h.y + 40 }, h]; } // 往上拖
    else if (w.event === 'tempBand' && !w.after) { const h = R('potHandle:1'); if (h) path = [h, { ...h, y: h.y + 50 }]; }
    let fx, fy;
    if (path && path.every(Boolean)) {
      const pts = path.map(center); const segs = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y)); const tot = segs.reduce((a, b) => a + b, 0);
      if (pts.length > 2 && !img('ui_tutorial_arrow_full')) { ctx.save(); ctx.strokeStyle = 'rgba(255,213,74,.85)'; ctx.lineWidth = 5; ctx.setLineDash([12, 8]); ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke(); ctx.restore();
        const e = pts[pts.length - 1], b = pts[pts.length - 2], ang = Math.atan2(e.y - b.y, e.x - b.x); ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x - 16 * Math.cos(ang - 0.5), e.y - 16 * Math.sin(ang - 0.5)); ctx.lineTo(e.x - 16 * Math.cos(ang + 0.5), e.y - 16 * Math.sin(ang + 0.5)); ctx.fill(); }
      const k = (this.t * 0.6) % 1; let d = (k < 0.85 ? k / 0.85 : 1) * tot, i = 0; while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
      const f = segs[i] ? Math.min(1, d / segs[i]) : 1; fx = pts[i].x + (pts[i + 1].x - pts[i].x) * f; fy = pts[i].y + (pts[i + 1].y - pts[i].y) * f;
    }
    else if (circle) { const c = center(circle), a = this.t * 4; fx = c.x + Math.cos(a) * circle.w * 0.3; fy = c.y + Math.sin(a) * circle.h * 0.3; }
    else if (rects.length && w.event !== 'tapAnywhere') { const c = center(rects[0]); fx = c.x; fy = c.y + Math.sin(this.t * 6) * 6; }
    if (fx != null) this.drawFinger(ctx, fx, fy);
  }
  drawFinger(ctx, x, y) {
    ctx.save(); ctx.translate(x + 10, y + 14);
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.strokeStyle = '#2b1810'; ctx.lineWidth = 2.5;
    roundRect(ctx, -7, -22, 14, 30, 7); ctx.fill(); ctx.stroke(); roundRect(ctx, -14, 0, 30, 26, 10); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, 10 + 6 * (0.5 + 0.5 * Math.sin(this.t * 8)), 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,213,74,.9)'; ctx.lineWidth = 3; ctx.stroke();
  }
  drawPanel(ctx, x, y, w, h) { if (!drawImgQuiet(ctx, 'ui_results_panel', x, y, w, h)) { fillRR(ctx, x, y, w, h, 18, 'rgba(255,248,236,.97)'); ctx.lineWidth = 4; ctx.strokeStyle = '#2b1810'; roundRect(ctx, x, y, w, h, 18); ctx.stroke(); } }
  drawPause(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    this.drawPanel(ctx, DESIGN_W / 2 - 165, 50, 330, 290);
    text(ctx, '已暂停', DESIGN_W / 2, 88, { size: 24, bold: true, color: '#fff8ec', stroke: '#5d4037' });
    const why = { hidden: '切到后台时自动暂停', portrait: '请横屏后点继续', button: '' }[this.pauseReason] || '';
    if (why) text(ctx, why, DESIGN_W / 2, 118, { size: 13, bold: true, color: '#5d4037' });
    this.overlayUI.draw(ctx);
  }
  drawResult(ctx) {
    const r = this.result, cx = DESIGN_W / 2;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    this.drawPanel(ctx, cx - 240, 40, 480, 320);
    // BUG-007：底图自带的两个按钮槽和程序画的三个按钮对不齐 → 用面板底色盖掉按钮槽（底图 960×640 缩到 480×320，槽在 y 242–302）
    if (img('ui_results_panel')) { ctx.fillStyle = 'rgb(246,230,200)'; ctx.fillRect(cx - 200, 276, 400, 72); }
    text(ctx, r.cleared ? '通关！' : '挑战失败', cx, 76, { size: 26, bold: true, color: '#fff8ec', stroke: r.cleared ? '#2e7d32' : '#c62828' });
    for (let i = 0; i < 3; i++) drawImg(ctx, i < r.stars && r.t > 0.25 * (i + 1) ? 'ui_star_bright' : 'ui_star_dim', cx - 30 + (i - 1) * 74, 110, 60, 60, { color: i < r.stars ? '#ffc107' : '#bbb' });
    text(ctx, `得分 ${r.score}`, cx - 150, 236, { size: 16, bold: true, color: '#3e2723' });
    text(ctx, `完美 ${r.perfect}`, cx, 236, { size: 16, bold: true, color: '#3e2723' });
    text(ctx, `失误 ${r.mistakes}`, cx + 150, 236, { size: 16, bold: true, color: '#3e2723' });
    text(ctx, `${this.level.name}${r.reason ? ' · ' + r.reason : ''} · 二星 ${this.level.stars.two} / 三星 ${this.level.stars.three}${r.unlockedNext ? ' · 已解锁下一关' : ''}`, cx, 278, { size: 11, color: '#5d4037', maxW: 420 }); // 说明行放在统计框（下沿 y≈269）和按钮之间
    this.overlayUI.draw(ctx);
  }

  snapshot() {
    return {
      scene: 'level', level: this.level.id, levelIndex: this.level.index, paused: this.paused, pauseReason: this.pauseReason,
      time: +this.orders.time.toFixed(3), tutorialActive: this.tutorial.active, reading: this.tutorial.readingPause, tutorialText: this.tutorial.view?.text || null, tutorialStep: this.tutorial.view?.id || null, tutorialWaiting: !!this.tutorial.view?.waiting, heatHint: this.tutorial.heatHint, skippedTutorial: this.skippedTutorial,
      orders: this.orders.active.map((o) => ({ index: o.index, recipe: o.recipe, request: o.request, left: +o.left.toFixed(3), tutorial: o.tutorial })),
      queue: this.orders.queue.length, resolved: this.orders.resolved, total: this.orders.total,
      cooking: this.cooking.snapshot(), events: this.log.slice(-20),
      score: this.score.score, mistakes: this.score.mistakes, perfect: this.score.perfect, completed: this.score.completed, served: this.served,
      hint: this.hints.current?.text || null, result: this.result ? { ...this.result } : null
    };
  }
}

function drawImgQuiet(ctx, name, x, y, w, h) { const im = img(name); if (!im) return false; ctx.drawImage(im, x, y, w, h); return true; }
// 按钮底图 ui_button + 文字
function buttonArt(ctx, x, y, b) {
  if (!drawImgQuiet(ctx, 'ui_button', b.x, b.y + (b.pressed ? 2 : 0), b.w, b.h)) { fillRR(ctx, b.x, b.y, b.w, b.h, 10, b.color); }
  text(ctx, b.label, x, y, { size: b.size, bold: true, color: '#3e2723' });
}
