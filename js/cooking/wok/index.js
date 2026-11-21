// 烹饪模块 wok：rules v0.2.1（拖锅柄控温 / 锅身画圈颠勺 / 往左横拖装盘 / 六步菜谱 / 调料档位 / 客人要求）
// 只通过 cooking/README.md 里的接口和关卡场景交互，可整体替换。
import { Wok, qualityOf, stepStatus, orderCorrect, seasonCount, seasonSourceOf } from './model.js';
import { SOURCES, DISH_ART } from './defaults.js';
import { drawImg, fillRR, roundRect, text } from '../../render/draw.js';
import { img } from '../../assets.js';
import { audio } from '../../audio.js';
import { L } from '../../layout.js';
const TRASH = L.trash;
const TAP_SLOP = 10;
const QLABEL = { raw: '生', done: '熟', perfect: '完美', burnt: '焦' };
const QCOLOR = { raw: '#e0e0e0', done: '#7be07f', perfect: '#ffd54a', burnt: '#ff6b6b' };
const inR = (r, x, y, pad = 0) => !!r && x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const wrapDeg = (a) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };

export class WokCooking {
  init(level, station) {
    this.level = level; this.station = station; this.recipes = station.recipes;
    this.seasoning = station.seasoning; this.tuning = station.tuning; this.G = this.tuning.gesture;
    this.t = 0; this.press = null; this.trashArmed = 0; this.activePot = 0; this.tapClock = {}; this.debugGesture = [];
    const first = this.recipes[level.recipes[0]];
    this.pots = Array.from({ length: level.pots }, (_, i) => {
      const g = L.pots[i];
      const w = new Wok(i, first, level.washTime, this.seasoning.maxTaps);
      w.bodyRect = g.body; w.tossRect = g.toss; w.cx = g.toss.x + g.toss.w / 2; w.cy = g.toss.y + g.toss.h / 2; w.r = this.G.circleMaxRadius ?? g.toss.w / 2;
      w.thermo = g.thermo; w.track = g.track; w.trackHit = g.trackHit; w.stripRect = g.recipe;
      w.gesture = '—';
      return w;
    });
    this.plates = Array.from({ length: level.plates }, (_, i) => ({ index: i, rect: L.plates[i], dish: null }));
    // 调料架 / 食材：只摆本关菜谱用得到的
    const used = new Set(); level.recipes.forEach((r) => this.recipes[r].steps.forEach((s) => s.source && used.add(s.source)));
    const order = ['egg', 'rice', 'chili_garlic', 'clams', 'oil', 'salt', 'sauce', 'scallion'];
    this.sources = order.filter((k) => used.has(k)).map((k) => ({ id: k, def: SOURCES[k], rect: L.sources[k] }));
  }
  get emit() { return this.station.emit; }
  allows(ids) { return this.station.allows(ids); }
  setTempCap(cap) { this.pots.forEach((p) => { p.tempCap = cap; }); }
  setCookFrozen(on) { this.pots.forEach((p) => { p.cookFrozen = !!on; }); } // 教学阅读期：C、B 不增长，T 照常
  note(pot, s) { if (pot) pot.gesture = s; this.lastGesture = s; this.debugGesture.push(s); if (this.debugGesture.length > 20) this.debugGesture.shift(); }
  recipeOfSource(id, pot) {
    if (pot?.dish?.recipe) return pot.dish.recipe;
    const cands = this.level.recipes.map((r) => this.recipes[r]).filter((r) => r.steps.some((s) => s.type === 'ingredient' && s.source === id));
    if (cands.length <= 1) return cands[0];
    // 多道菜共用的食材：优先给最早一张还没人在做的订单
    const o = this.station.orders().find((x) => cands.some((c) => c.id === x.recipe));
    return cands.find((c) => c.id === o?.recipe) || cands[0];
  }
  // 菜谱条显示用：锅里已有菜按那道菜；空锅按最早一张订单
  stripRecipe(pot) {
    if (pot.dish?.recipe) return pot.dish.recipe;
    const busy = new Set(this.pots.filter((p) => p !== pot && p.dish?.recipe).map((p) => p.dish.recipe.id));
    const os = this.station.orders();
    const o = os.find((x) => !busy.has(x.recipe)) || os[0];
    return o ? this.recipes[o.recipe] : this.recipes[this.level.recipes[0]];
  }
  orderFor(recipeId) { return this.station.orders().find((o) => o.recipe === recipeId) || null; }

  // ---------- 动作 ----------
  tapSource(src) {
    const pot = this.pots[this.activePot];
    if (!this.allows([`source:${src.id}`])) return this.note(pot, '无效：教学中只能点高亮处');
    if (src.def.kind !== 'condiment') return;
    if (pot.busy) { audio.play('reject'); this.station.float('锅在冲洗', pot.cx, pot.cy - 40, '#90caf9'); return this.note(pot, '无效：锅在冲洗'); }
    // 防连点：从上一次“计数成功”的点按算起（rules §9-7）
    const now = performance.now() / 1000, last = this.tapClock[src.id];
    if (last != null && now - last < this.seasoning.tapMinInterval) return this.note(pot, `无效：连点过快（<${this.seasoning.tapMinInterval}s）`);
    const before = this.snapshotSteps(pot);
    const r = pot.addSource(src.id);
    if (!r.counted) { audio.play('reject'); this.station.float(`${src.def.name}最多 ${this.seasoning.maxTaps} 下`, pot.cx, pot.cy - 40, '#ffcc80'); return this.note(pot, '无效：调料已到上限'); }
    this.tapClock[src.id] = now;
    audio.play(src.id === 'oil' ? 'oil' : 'season');
    this.note(pot, `点${src.def.name}（${r.count}）`);
    if (src.id !== 'oil' && src.id !== 'scallion') this.emit('seasoningCount', { value: r.count, source: src.id, pot: pot.index + 1 });
    this.afterAction(pot, before);
  }
  dropIngredient(src, pot) {
    if (!pot) return this.note(null, '无效：没放进锅');
    if (!this.allows([`source:${src.id}`, `pot:${pot.index + 1}`])) return this.note(pot, '无效：教学中只能操作高亮处');
    const recipe = this.recipeOfSource(src.id, pot);
    const before = this.snapshotSteps(pot);
    const r = pot.addIngredient(src.id, recipe);
    if (!r.ok) { audio.play('reject'); this.station.float(r.reason, pot.cx, pot.cy - 40, '#ffcc80'); return this.note(pot, `无效：${r.reason}`); }
    this.activePot = pot.index;
    audio.play('drop_pan');
    this.note(pot, `放入${src.def.name}`);
    this.emit('ingredientIn', { source: src.id, pot: pot.index + 1, main: r.main });
    this.afterAction(pot, before);
  }
  toss(pot) {
    const before = this.snapshotSteps(pot);
    const tb = pot.T; pot.toss(); pot.tossAnim = 1; audio.play('toss'); this.lastToss = { pot: pot.index + 1, before: +tb.toFixed(3), after: +pot.T.toFixed(3) };
    this.emit('toss', { count: pot.dish ? pot.dish.tossAfterSeason : 0, total: pot.dish?.tosses || 0, value: pot.T, pot: pot.index + 1 });
    this.afterAction(pot, before);
  }
  plateFrom(pot, x, y) {
    if (!this.allows([`potHandle:${pot.index + 1}`, 'plateArea'])) return this.note(pot, '无效：教学中只能操作高亮处');
    if (pot.busy) return this.note(pot, '无效：锅在冲洗（弹回）');
    if (!pot.dish?.mainIn) { audio.play('reject'); this.station.float('还没放主料', pot.cx, pot.cy - 40, '#ffcc80'); return this.note(pot, '无效：锅里没有主料'); }
    // 装进离落点最近的空盘（rules v0.2.2 §2）
    const free = this.plates.filter((p) => !p.dish).sort((a, b) => Math.hypot(center(a.rect).x - x, center(a.rect).y - y) - Math.hypot(center(b.rect).x - x, center(b.rect).y - y));
    const plate = free[0];
    if (!plate) { audio.play('reject'); this.station.float('没有空盘子，锅柄弹回', pot.cx, pot.cy - 40, '#ffcc80'); return this.note(pot, '无效：没有空盘'); }
    const d = pot.dish;
    plate.dish = { cook: d, quality: qualityOf(d, d.recipe.judge), recipe: d.recipe }; // 锁定 C、B
    pot.startWash(); // 自动冲洗
    audio.play('drop_pan');
    this.note(pot, `装盘 → plate-${plate.index + 1}`);
    this.emit('plate', { plate: plate.index + 1, pot: pot.index + 1, quality: plate.dish.quality });
  }
  armTrash() {
    if (!this.allows(['trash'])) return this.note(null, '无效：教学中只能点高亮处');
    this.trashArmed = this.tuning.trashWindow; audio.play('click'); this.note(null, '垃圾桶：2 秒内点要倒的锅');
  }
  dumpPot(pot) {
    if (!this.allows(['trash', `pot:${pot.index + 1}`])) return this.note(pot, '无效：教学中只能操作高亮处');
    this.trashArmed = 0;
    if (!pot.dish) return this.note(pot, '无效：锅是空的');
    pot.startWash(); audio.play('reject'); this.note(pot, '倒掉'); this.emit('trash', { pot: pot.index + 1 });
  }
  servePlate(plate, order) {
    if (!this.allows([`plate:${plate.index + 1}`, 'orderCard'])) return this.note(null, '无效：教学中只能操作高亮处');
    const p = plate.dish; const d = p.cook;
    const dish = { recipeId: p.recipe.id, quality: p.quality, seasoning: seasonCount(d, p.recipe), seasoningSource: seasonSourceOf(p.recipe), orderCorrect: orderCorrect(d, p.recipe), mistake: false, meta: { c: d.c, b: d.b } };
    const { outcome } = this.station.serve(dish, order);
    if (outcome === 'complete' || outcome === 'rejected') plate.dish = null; // 退回/送错/忽略：留在盘里
    this.note(null, `出餐：${outcome}`);
  }
  returnToPot(plate, pot) {
    if (!this.allows([`plate:${plate.index + 1}`, `pot:${pot.index + 1}`])) return;
    if (pot.busy || pot.dish) { audio.play('reject'); this.station.float('锅不空', pot.cx, pot.cy - 40, '#ffcc80'); return this.note(pot, '无效：锅不空'); }
    pot.dish = plate.dish.cook; pot.dish.burntNotified = pot.dish.b >= pot.dish.recipe.judge.burntB; plate.dish = null; // C、B、已完成步骤都保留
    this.activePot = pot.index; audio.play('drop_pan'); this.note(pot, '回锅');
  }
  // 还没下食材时（只倒了油）按菜谱条显示的那道菜算步骤
  snapshotSteps(pot) { const r = pot.dish?.recipe || this.stripRecipe(pot); return r && pot.dish ? stepStatus(pot.dish, r).map((s) => s.done) : null; }
  afterAction(pot, before) {
    const r = pot.dish?.recipe || this.stripRecipe(pot); if (!r || !pot.dish) return;
    const now = stepStatus(pot.dish, r);
    now.forEach((s, i) => { if (s.done && !(before && before[i])) this.emit('step', { stepType: r.steps[i].type, index: i, pot: pot.index + 1 }); });
  }

  // ---------- 输入：按下时按区域决定手势类型，前 lockPx 决定方向 ----------
  potAtBody(x, y, pad = 0) { return this.pots.find((p) => Math.hypot(x - p.cx, y - p.cy) <= p.r + pad) || null; }
  pointerDown(ev) {
    if (this.press) return true;
    const base = { id: ev.id, x0: ev.x, y0: ev.y, x: ev.x, y: ev.y, moved: 0 };
    const src = this.sources.find((s) => inR(s.rect, ev.x, ev.y));
    if (src) { this.press = { ...base, kind: src.def.kind === 'condiment' ? 'condiment' : 'ingredient', src }; return true; }
    const plate = this.plates.find((p) => inR(p.rect, ev.x, ev.y));
    if (plate && plate.dish) { this.press = { ...base, kind: 'plate', plate }; return true; } // 空盘不可拖
    const handlePot = this.pots.find((p) => inR(p.trackHit, ev.x, ev.y));
    if (handlePot) { this.activePot = handlePot.index; const ky = this.yOfH(handlePot, handlePot.H); this.press = { ...base, kind: 'handle', pot: handlePot, mode: null, grabDy: Math.abs(ev.y - ky) <= 30 ? ev.y - ky : 0 }; return true; }
    const body = this.potAtBody(ev.x, ev.y);
    if (body) { this.activePot = body.index; const a = Math.atan2(ev.y - body.cy, ev.x - body.cx) * 180 / Math.PI; this.press = { ...base, kind: 'body', pot: body, lastA: Math.hypot(ev.x - body.cx, ev.y - body.cy) >= this.G.circleMinRadius ? a : null, net: 0, tossed: 0 }; return true; }
    if (inR(TRASH, ev.x, ev.y)) { this.press = { ...base, kind: 'trash' }; return true; }
    if (this.trashArmed > 0) this.trashArmed = 0; // 点别处取消
    return false;
  }
  pointerMove(ev) {
    const p = this.press; if (!p || p.id !== ev.id) return false;
    p.x = ev.x; p.y = ev.y; p.moved = Math.max(p.moved, Math.hypot(ev.x - p.x0, ev.y - p.y0));
    if (p.kind === 'handle') {
      const dx = ev.x - p.x0, dy = ev.y - p.y0;
      if (!p.mode && Math.hypot(dx, dy) >= this.G.lockPx) {
        // 只有 dx > 0 且 |dx| > |dy| 才是装盘（向右）；相等、往左、偏竖直都算调火（rules v0.2.2 §9-4）
        p.mode = dx > 0 && Math.abs(dx) > Math.abs(dy) ? 'plate' : 'heat';
        if (p.mode === 'heat' && !this.allows([`potHandle:${p.pot.index + 1}`])) { p.mode = 'blocked'; this.note(p.pot, '无效：教学中只能操作高亮处'); }
        else this.note(p.pot, p.mode === 'plate' ? `装盘（拖动中，pan${p.pot.index + 1}-handle → plate-zone）` : `调火（pan${p.pot.index + 1}-track-hit）`);
      }
      if (p.mode === 'heat') this.setHFromY(p.pot, ev.y);
    } else if (p.kind === 'body') {
      const pot = p.pot, r = Math.hypot(ev.x - pot.cx, ev.y - pot.cy);
      if (r > pot.r) { p.net = 0; p.lastA = null; return true; } // 离锅心超过 85px：离开判定区，净角度清零
      if (r < this.G.circleMinRadius) return true;                    // 离锅心太近：不计入
      const a = Math.atan2(ev.y - pot.cy, ev.x - pot.cx) * 180 / Math.PI;
      if (p.lastA != null) {
        p.net += wrapDeg(a - p.lastA); // 带符号累加，正反向抵消（rules §9-3）
        while (Math.abs(p.net) >= this.G.circleDeg) {
          if (!this.allows([`pot:${pot.index + 1}`])) { p.net = 0; this.note(pot, '无效：教学中只能操作高亮处'); break; }
          p.net -= Math.sign(p.net) * this.G.circleDeg; p.tossed++; this.note(pot, `画圈（pan${pot.index + 1}-toss，颠勺 ${p.tossed}）`); this.toss(pot);
        }
      }
      p.lastA = a;
    }
    return true;
  }
  // 锅柄轨道映射（handle_track.png：y(H) = 16 + (1−H)·168，逻辑高 200；H=0 在底部关火窝）
  hOfY(pot, y) { const tr = pot.track; return 1 - (((y - tr.y) / tr.h) * 200 - 16) / 168; }
  yOfH(pot, H) { const tr = pot.track; return tr.y + ((16 + (1 - H) * 168) / 200) * tr.h; }
  setHFromY(pot, y) {
    const G = this.G; const raw = this.hOfY(pot, y - (this.press?.grabDy || 0));
    const H = raw < G.handleOffBelow ? 0 : Math.max(G.minH, Math.min(1, raw));
    const was = pot.H; pot.setH(H);
    if (was === 0 && H > 0) { audio.play('ignite'); this.emit('fireOn', { pot: pot.index + 1 }); }
    if (H !== was) this.emit('heat', { value: H, pot: pot.index + 1 });
  }
  pointerUp(ev) {
    const p = this.press; if (!p || p.id !== ev.id) return false;
    this.press = null;
    if (ev.cancelled) return true;
    const isTap = p.moved < TAP_SLOP;
    switch (p.kind) {
      case 'condiment': if (isTap) this.tapSource(p.src); break;
      case 'ingredient': if (!isTap) this.dropIngredient(p.src, this.potAtBody(ev.x, ev.y, 12)); break;
      case 'plate': {
        if (isTap) break;
        const o = this.station.orderAt(ev.x, ev.y);
        if (o) { this.servePlate(p.plate, o); break; }
        const pot = this.potAtBody(ev.x, ev.y, 8);
        if (pot) { this.returnToPot(p.plate, pot); break; }
        if (inR(TRASH, ev.x, ev.y, 10)) { p.plate.dish = null; audio.play('reject'); this.emit('trash', { plate: p.plate.index + 1 }); }
        break;
      }
      case 'handle': {
        const pot = p.pot;
        if (!p.mode) { // 点按锅柄：关火位时开火到 H=0.5
          if (!this.allows([`potHandle:${pot.index + 1}`])) { this.note(pot, '无效：教学中只能操作高亮处'); break; }
          if (pot.H === 0) { pot.setH(this.G.tapOnH); audio.play('ignite'); this.note(pot, '调火（点按开火）'); this.emit('fireOn', { pot: pot.index + 1 }); this.emit('heat', { value: pot.H, pot: pot.index + 1 }); }
          else this.note(pot, '无效：已开火（上下拖调火）');
        } else if (p.mode === 'plate') {
          // 松手：向右位移 > plateDragPx 且落点在 plate-zone 内才装盘，否则锅柄弹回
          const dist = ev.x - p.x0;
          if (!(dist > this.G.plateDragPx)) this.note(pot, `无效：右拖不足 ${this.G.plateDragPx}px（${Math.round(dist)}），弹回`);
          else if (!inR(L.plateZone, ev.x, ev.y)) this.note(pot, '无效：落点不在装盘区，弹回');
          else this.plateFrom(pot, ev.x, ev.y);
        }
        break;
      }
      case 'body': if (isTap && this.trashArmed > 0) this.dumpPot(p.pot); else if (isTap) this.note(p.pot, p.pot.dish ? '无效：点锅身（画圈才算颠勺）' : '无效：点锅身'); break;
      case 'trash': if (isTap) this.armTrash(); break;
    }
    return true;
  }
  pause() { this.press = null; audio.setLoop('sizzle_low', false); audio.setLoop('sizzle_high', false); }
  resume() {}
  destroy() { this.pause(); }

  // ---------- 更新 ----------
  update(dt) {
    this.t += dt;
    if (this.trashArmed > 0) this.trashArmed = Math.max(0, this.trashArmed - dt);
    for (const pot of this.pots) {
      for (const e of pot.update(dt)) {
        if (e === 'smoke') { audio.play('smoke_warn'); this.emit('smoke', { pot: pot.index + 1 }); }
        if (e === 'burnt') { audio.play('burnt'); this.emit('burnt', { pot: pot.index + 1 }); }
      }
      pot.tossAnim = Math.max(0, (pot.tossAnim || 0) - dt * 3);
      const n = pot.index + 1;
      this.emit('tempBand', { band: pot.band, pot: n });
      this.emit('tempGte', { value: pot.T, pot: n });
      if (pot.dish?.mainIn) this.emit('doneness', { value: pot.dish.c, b: pot.dish.b, pot: n });
    }
    // 滋滋循环：锅里有油/食材且开火时响；任一锅进红段用高轨，否则低轨
    const hot = this.pots.filter((p) => p.H > 0 && p.dish && (p.dish.mainIn || p.dish.taps.oil || Object.keys(p.dish.items).length));
    const high = hot.some((p) => p.band === 'red');
    audio.setLoop('sizzle_high', hot.length > 0 && high); audio.setLoop('sizzle_low', hot.length > 0 && !high);
    for (const p of this.pots) if (p.dish?.mainIn && !p.dish.readyNotified && p.dish.c >= p.dish.recipe.judge.doneC) { p.dish.readyNotified = true; audio.play('ready'); }
  }

  rectOf(id) {
    const [kind, arg] = id.split(':'); const n = +arg - 1;
    if (id === 'trash') return TRASH;
    if (id === 'plateArea') return L.plateZone;
    if (kind === 'source') return this.sources.find((s) => s.id === arg)?.rect || null;
    if (kind === 'pot') return this.pots[n]?.bodyRect || null;
    if (kind === 'potHandle') { const p = this.pots[n]; if (!p) return null; const y = this.yOfH(p, p.H), g = L.handleGrab; return { x: p.track.x + p.track.w / 2 - g.w / 2, y: y - g.h / 2, w: g.w, h: g.h }; }
    if (kind === 'potTrack') return this.pots[n]?.trackHit || null;
    if (kind === 'potToss') return this.pots[n]?.tossRect || null;
    if (kind === 'thermometer') return this.pots[n]?.thermo || null;
    if (kind === 'strip') return this.pots[n]?.stripRect || null;
    if (kind === 'plate') return this.plates[n]?.rect || null;
    return null;
  }

  // ---------- 绘制 ----------
  // 底层：调料架、盘子、锅（每口锅 = 温度计 + 锅身 + 轨道/锅柄 + 菜谱条，同一套素材多实例）
  render(ctx) {
    for (const s of this.sources) this.drawSource(ctx, s);
    const tr = TRASH; drawImg(ctx, 'trash_bin', tr.x - 4, tr.y, tr.w + 8, tr.h, { color: '#555', label: '倒掉' });
    if (this.trashArmed > 0) { ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 3; roundRect(ctx, tr.x - 3, tr.y - 3, tr.w + 6, tr.h + 6, 10); ctx.stroke(); text(ctx, '点锅倒掉', tr.x + tr.w / 2, tr.y - 10, { size: 12, bold: true, color: '#ff8a80', stroke: '#000' }); }
    { const z = L.plateZone, pl = this.press?.kind === 'handle' && this.press.mode === 'plate'; ctx.fillStyle = pl ? 'rgba(123,224,127,0.25)' : 'rgba(255,255,255,0.10)'; roundRect(ctx, z.x - 2, z.y - 2, z.w + 4, z.h + 4, 12); ctx.fill(); }
    for (const p of this.plates) if (!(this.press?.kind === 'plate' && this.press.plate === p && this.press.moved >= TAP_SLOP)) this.drawPlate(ctx, p.rect, p.dish);
    for (const pot of this.pots) this.drawPot(ctx, pot);
  }
  drawSource(ctx, s) {
    const r = s.rect, dragging = this.press?.src === s && this.press.moved >= TAP_SLOP;
    ctx.globalAlpha = dragging ? 0.45 : 1;
    drawImg(ctx, s.def.art, r.x, r.y, r.w, r.h, { color: s.def.color, label: s.def.glyph });
    ctx.globalAlpha = 1;
  }
  drawPlate(ctx, r, pd) {
    { const ps = Math.min(r.w, r.h) * 1.15; drawImg(ctx, 'plate', r.x + r.w / 2 - ps / 2, r.y + r.h / 2 - ps / 2, ps, ps, { color: '#eee' }); }
    if (!pd) return;
    const art = DISH_ART[pd.recipe.id], s = Math.min(r.w, r.h) * 1.05;
    const name = pd.quality === 'done' || pd.quality === 'perfect' ? art.dish : `${art.pan}_${pd.quality}`;
    drawImg(ctx, name, r.x + r.w / 2 - s / 2, r.y + r.h / 2 - s / 2, s, s, { color: art.color, label: QLABEL[pd.quality] });
    text(ctx, QLABEL[pd.quality], r.x + r.w / 2, r.y + r.h - 6, { size: 12, bold: true, color: QCOLOR[pd.quality], stroke: '#000' });
  }
  drawPot(ctx, pot) {
    const k = pot.bodyRect.w / 170;            // 锅图 140（layout.md），按 170 基准缩放
    const S = 200 * k;                          // wok_body 256 逻辑画布 → 锅身圆约占 190/256
    const ox = pot.cx - S * 128 / 256, oy = pot.cy - S * 132 / 256; // 枢轴 (128,132)
    // 火焰在锅下
    if (pot.H > 0) {
      const f = pot.H < 0.4 ? 'flame_low' : pot.H < 0.75 ? 'flame_medium' : 'flame_high', fw = 150 * k, fh = 90 * k * (0.7 + pot.H * 0.5);
      const wob = 1 + Math.sin(this.t * 18 + pot.index) * 0.04;
      drawImg(ctx, f, pot.cx - fw / 2, pot.cy + pot.r * 0.72 - fh * wob, fw, fh * wob, { color: '#ff7a1a' });
    }
    // 锅身（颠勺时播 wok_toss_01–04，同枢轴）
    const ta = pot.tossAnim || 0;
    const body = ta > 0 ? `wok_toss_0${Math.min(4, 1 + Math.floor((1 - ta) * 4))}` : 'wok_body';
    drawImg(ctx, body, ox, oy, S, S, { color: '#333' });
    // 锅内：主料下锅前画油/蛋/辣椒蒜占位，下锅后按生/熟/焦换图
    const d = pot.dish;
    if (d) {
      const lift = ta > 0 ? -Math.sin((1 - ta) * Math.PI) * 14 * k : 0;
      if (d.mainIn) {
        const q = qualityOf(d, d.recipe.judge), art = DISH_ART[d.recipe.id];
        const st = q === 'burnt' ? 'burnt' : q === 'raw' ? 'raw' : 'cooked';
        drawImg(ctx, `${art.pan}_${st}`, ox, oy + lift, S, S, { color: art.color });
      } else {
        if (d.taps.oil) { ctx.fillStyle = 'rgba(246,195,67,0.55)'; ctx.beginPath(); ctx.ellipse(pot.cx, pot.cy + 4, pot.r * 0.45, pot.r * 0.28, 0, 0, Math.PI * 2); ctx.fill(); }
        let i = 0; for (const id of Object.keys(d.items)) { const a = SOURCES[id]; drawImg(ctx, a.art, pot.cx - 26 * k + i * 22 * k, pot.cy - 22 * k + lift, 52 * k, 52 * k, { color: a.color, label: a.glyph }); i++; }
      }
      // 冒烟：B≥smokeB 灰烟，B≥blackSmokeB 黑烟（4 帧循环）
      const J = d.recipe?.judge;
      if (J && d.mainIn && d.b >= J.smokeB) {
        const black = d.b >= J.blackSmokeB, fr = 1 + (Math.floor(this.t * 8) % 4);
        drawImg(ctx, `${black ? 'smoke_black' : 'smoke'}_0${fr}`, pot.cx - 70 * k, pot.cy - pot.r - 90 * k, 140 * k, 140 * k, { color: 'rgba(80,80,80,0.5)' });
      }
    }
    if (pot.busy) {
      const fr = 1 + (Math.floor(this.t * 10) % 4);
      drawImg(ctx, `wash_steam_0${fr}`, pot.cx - 80 * k, pot.cy - 90 * k, 160 * k, 160 * k, { color: 'rgba(144,202,249,0.5)' });
      text(ctx, `冲洗 ${pot.wash.toFixed(1)}s`, pot.cx, pot.cy + pot.r - 10, { size: 14, bold: true, color: '#e3f2fd', stroke: '#000' });
    }
    this.drawThermo(ctx, pot);
    this.drawTrack(ctx, pot);
    this.drawStrip(ctx, pot);
    if (this.station.debug) this.drawDebug(ctx, pot);
  }
  drawThermo(ctx, pot) {
    const r = pot.thermo, sx = r.w / 48, sy = r.h / 200;
    drawImg(ctx, 'thermo_frame', r.x, r.y, r.w, r.h, { color: '#ddd' });
    const T = Math.max(0, Math.min(100, pot.T)), fh = 160 * sy * T / 100, fill = img('thermo_fill');
    const colX = r.x + 16 * sx, colB = r.y + 180 * sy;
    if (fill) ctx.drawImage(fill, 0, fill.height * (1 - T / 100), fill.width, fill.height * T / 100, colX, colB - fh, 16 * sx, fh);
    else { ctx.fillStyle = pot.band === 'red' ? '#e53935' : pot.band === 'yellow' ? '#ffb300' : '#42a5f5'; ctx.fillRect(colX, colB - fh, 16 * sx, fh); }
    const ny = r.y + (180 - T * 1.6) * sy;
    drawImg(ctx, 'thermo_needle', r.x + r.w - 4, ny - 6, 20, 12, { color: '#222' });
    if (pot.tempCap < 1000) { const cy = r.y + (180 - pot.tempCap * 1.6) * sy; ctx.strokeStyle = '#fff'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(r.x - 4, cy); ctx.lineTo(r.x + r.w + 4, cy); ctx.stroke(); ctx.setLineDash([]); }
    text(ctx, `${Math.round(pot.T)}°`, r.x + r.w / 2, r.y + r.h + 12, { size: 12, bold: true, color: '#fff', stroke: '#000' });
  }
  drawTrack(ctx, pot) {
    const tr = pot.track, tw = tr.h * 48 / 200, tx = tr.x + tr.w / 2 - tw / 2;
    drawImg(ctx, 'handle_track', tx, tr.y, tw, tr.h, { color: '#333' });
    // 锅柄：wok_handle 56×200，握点 (28,128) 对齐 y(H)
    const hw = tw * 1.05, hh = hw * 200 / 56, gy = this.yOfH(pot, pot.H);
    drawImg(ctx, 'wok_handle', tr.x + tr.w / 2 - hw / 2, gy - hh * 128 / 200, hw, hh, { color: '#8d6e63' });
    text(ctx, pot.H === 0 ? '关火' : `火 ${Math.round(pot.H * 100)}%`, tr.x + tr.w / 2, tr.y + tr.h + 2, { size: 11, bold: true, color: pot.H === 0 ? '#bbb' : '#ffcc80', stroke: '#000', base: 'top' });
  }
  drawStrip(ctx, pot) {
    const r = pot.stripRect, recipe = this.stripRecipe(pot); if (!recipe) return;
    const st = stepStatus(pot.dish, recipe), n = recipe.steps.length, cw = r.w / n;
    const cur = st.findIndex((s) => !s.done);
    const order = this.orderFor(recipe.id), want = order ? this.station.seasoningTarget(order) : this.seasoning.default;
    recipe.steps.forEach((s, i) => {
      const x = r.x + i * cw;
      fillRR(ctx, x + 1, r.y, cw - 2, r.h, 6, st[i].done ? 'rgba(76,175,80,0.85)' : i === cur ? 'rgba(255,213,74,0.92)' : 'rgba(0,0,0,0.55)');
      const art = s.source ? SOURCES[s.source].art : null;
      if (art) drawImg(ctx, art, x + 2, r.y + 2, r.h - 4, r.h - 4, { color: SOURCES[s.source].color });
      const lab = s.type === 'toss' ? `颠${st[i].count || 0}/${s.count || 2}` : s.type === 'seasoning' ? `${st[i].count || 0}/${want}` : st[i].done ? '✓' : String(i + 1);
      text(ctx, lab, x + (art ? r.h - 2 : 4), r.y + r.h / 2, { size: 11, bold: true, align: 'left', color: i === cur && !st[i].done ? '#3e2723' : '#fff', maxW: cw - r.h });
    });
  }
  drawDebug(ctx, pot) {
    const r = L.debugPanel(pot.index, this.pots.length), d = pot.dish;
    fillRR(ctx, r.x, r.y, r.w, r.h, 8, 'rgba(0,0,0,0.72)');
    // 判定区可视化：pan-toss 圆（r 20 / 85）、pan-track-hit、plate-zone
    ctx.save(); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,229,255,.8)';
    ctx.beginPath(); ctx.arc(pot.cx, pot.cy, pot.r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(pot.cx, pot.cy, this.G.circleMinRadius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(pot.trackHit.x, pot.trackHit.y, pot.trackHit.w, pot.trackHit.h);
    if (pot.index === 0) { const z = L.plateZone; ctx.strokeStyle = 'rgba(123,224,127,.9)'; ctx.strokeRect(z.x, z.y, z.w, z.h); text(ctx, 'plate-zone', z.x + 4, z.y + 10, { size: 10, align: 'left', color: '#b9f6ca' }); }
    ctx.restore();
    const n = pot.index + 1;
    const lines = [
      `pan${n}  H ${pot.H.toFixed(2)}  T ${pot.T.toFixed(1)} (${pot.band})`,
      `C ${d ? d.c.toFixed(1) : '-'}  B ${d ? d.b.toFixed(1) : '-'}  颠勺 ${d ? d.tosses : 0}（调料后 ${d ? d.tossAfterSeason : 0}）`,
      `调料档 ${d?.recipe ? seasonCount(d, d.recipe) : 0}  无油 ${d?.noOil ? '是' : '否'}  顺序 ${d?.recipe && orderCorrect(d, d.recipe) ? '全对' : '—'}`,
      `手势：${pot.gesture}`
    ];
    lines.forEach((s, i) => text(ctx, s, r.x + 8, r.y + 12 + i * 20, { size: 12, align: 'left', color: i === 3 ? '#ffd54a' : '#e0f7fa', maxW: r.w - 14 }));
  }
  // 顶层：拖拽中的图标画在指尖上方 48px（ui-spec §4）
  renderOverlay(ctx) {
    const p = this.press; if (!p || p.moved < TAP_SLOP) return;
    const x = p.x, y = p.y - 48;
    if (p.kind === 'ingredient') drawImg(ctx, p.src.def.art, x - 30, y - 30, 60, 60, { color: p.src.def.color, label: p.src.def.glyph });
    if (p.kind === 'plate') this.drawPlate(ctx, { x: x - 40, y: y - 34, w: 80, h: 68 }, p.plate.dish);
    if (p.kind === 'handle' && p.mode === 'plate') {
      const dist = p.x - p.x0, ok = dist > this.G.plateDragPx && inR(L.plateZone, p.x, p.y);
      if (p.pot.dish?.mainIn) { const art = DISH_ART[p.pot.dish.recipe.id]; ctx.globalAlpha = 0.85; drawImg(ctx, art.dish, p.x - 30, p.y - 78, 60, 60, { color: art.color }); ctx.globalAlpha = 1; }
      ctx.strokeStyle = ok ? '#7be07f' : '#ffcc80'; ctx.lineWidth = 4; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(p.x0, p.y0); ctx.lineTo(p.x, p.y0); ctx.stroke(); ctx.setLineDash([]);
      text(ctx, ok ? '松手装盘' : dist > this.G.plateDragPx ? '拖到右侧盘子上' : `再往右 ${Math.ceil(this.G.plateDragPx - dist)}px`, p.x, p.y0 - 26, { size: 14, bold: true, color: ok ? '#7be07f' : '#ffcc80', stroke: '#000' });
    }
  }
  applyDebugPreset({ T, C, B }) {
    const pot = this.pots[0];
    if (T != null) pot.T = T;
    if (C != null || B != null) {
      const recipe = this.recipes[this.level.recipes[0]];
      const d = pot.ensureDish(); d.recipe = recipe; d.mainIn = true;
      const main = recipe.steps.find((s) => s.main); d.items[main.source] = { seq: ++d.seq, T: pot.T };
      d.taps.oil = 1; d.log.unshift({ id: 'oil', seq: 0 });
      if (C != null) d.c = C; if (B != null) d.b = B;
    }
  }
  snapshot() {
    return {
      activePot: this.activePot, lastToss: this.lastToss || null, trashArmed: +this.trashArmed.toFixed(2), lastGesture: this.lastGesture || null,
      pots: this.pots.map((p) => ({ H: +p.H.toFixed(3), T: +p.T.toFixed(3), band: p.band, busy: p.busy, cap: p.tempCap, cookFrozen: !!p.cookFrozen,
        recipe: p.dish?.recipe?.id || null, c: p.dish ? +p.dish.c.toFixed(3) : null, b: p.dish ? +p.dish.b.toFixed(3) : null,
        mainIn: !!p.dish?.mainIn, noOil: !!p.dish?.noOil, tosses: p.dish?.tosses || 0, tossAfterSeason: p.dish?.tossAfterSeason || 0,
        taps: p.dish ? { ...p.dish.taps } : {}, season: p.dish?.recipe ? seasonCount(p.dish, p.dish.recipe) : 0,
        orderCorrect: p.dish?.recipe ? orderCorrect(p.dish, p.dish.recipe) : false,
        quality: p.dish?.mainIn ? qualityOf(p.dish, p.dish.recipe.judge) : null, gesture: p.gesture })),
      plates: this.plates.map((p) => (p.dish ? { recipe: p.recipe?.id || p.dish.recipe.id, quality: p.dish.quality, c: +p.dish.cook.c.toFixed(2), b: +p.dish.cook.b.toFixed(2) } : null))
    };
  }
}
