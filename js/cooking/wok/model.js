// 炒锅逻辑（不含绘制/输入）：温度 T、熟度 C、糊度 B，六步菜谱进度，调料档位，顺序全对。rules v0.2.1 §3、§4、§9
export class Wok {
  constructor(index, defaultRecipe, washTime, maxTaps = 3) {
    this.index = index; this.defaultRecipe = defaultRecipe; this.washTime = washTime; this.maxTaps = maxTaps;
    this.H = 0; this.T = defaultRecipe.temp.start;
    this.wash = 0;            // 冲洗剩余秒数
    this.tempCap = Infinity;  // 教学单温度上限
    this.dish = null;         // 在做的菜（装盘时整块交给盘子，退回时整块还回来）
  }
  // 锅里没有菜品时，温度参数用本关第一道菜的 temp
  get recipe() { return this.dish?.recipe || this.defaultRecipe; }
  get busy() { return this.wash > 0; }
  get band() { const t = this.recipe.temp; return this.T < t.blueBelow ? 'blue' : this.T > t.redAbove ? 'red' : 'yellow'; }
  ensureDish() { if (!this.dish) this.dish = newDish(); return this.dish; }
  startWash() { this.dish = null; this.wash = this.washTime; }
  setH(h) { this.H = Math.max(0, Math.min(1, h)); }

  // 点调料架：返回 { counted, count }（防连点在模块里按真实点按间隔处理）
  addSource(id) {
    const d = this.ensureDish(); const seq = ++d.seq;
    d.taps[id] = (d.taps[id] || 0);
    if (d.taps[id] >= this.maxTaps && (id !== 'oil' && id !== 'scallion')) return { counted: false, reason: 'max', count: d.taps[id] };
    d.taps[id]++; d.log.push({ id, seq });
    if (id !== 'oil' && id !== 'scallion') { d.tossAfterSeason = 0; }
    return { counted: true, count: d.taps[id] };
  }
  addIngredient(id, recipe) {
    if (this.busy) return { ok: false, reason: '锅在冲洗' };
    const d = this.ensureDish();
    if (d.recipe && d.recipe.id !== recipe.id) return { ok: false, reason: '锅里是别的菜' };
    if (d.items[id]) return { ok: false, reason: '已经放过了' };
    d.recipe = recipe;
    const step = recipe.steps.find((s) => s.type === 'ingredient' && s.source === id);
    d.items[id] = { seq: ++d.seq, T: this.T };
    if (step && step.requireTempMin != null && this.T < step.requireTempMin) d.aromaticOk = false;
    if (step?.main) { d.mainIn = true; d.noOil = !(d.taps.oil > 0); this.T = Math.max(recipe.temp.min, this.T - recipe.temp.foodDrop); }
    return { ok: true, main: !!step?.main };
  }
  // 颠勺：T = max(min(T, tossFloor), T - tossCool)
  toss() {
    const t = this.recipe.temp;
    this.T = Math.max(Math.min(this.T, t.tossFloor), this.T - t.tossCool);
    const d = this.dish;
    if (d) { d.tosses++; d.seq++; if (anySeason(d)) { d.tossAfterSeason++; if (d.tossAfterSeason === 2) d.mixedSeq = d.seq; } }
  }
  update(dt) {
    const ev = [];
    const r = this.recipe, t = r.temp;
    if (this.wash > 0) this.wash = Math.max(0, this.wash - dt);
    if (this.H > 0) this.T = Math.min(t.max, this.T + (t.riseBase + t.risePerH * this.H) * dt);
    else this.T = Math.max(t.min, this.T - t.cool * dt);
    if (this.T > this.tempCap) this.T = this.tempCap;
    const d = this.dish;
    if (d && d.mainIn && !this.cookFrozen) {
      const band = this.band, R = r.rates, J = r.judge;
      let db = band === 'yellow' && d.c >= 100 ? R.B.yellowOvercooked : R.B[band];
      if (d.noOil) db += band === 'yellow' ? R.noOilYellow : band === 'red' ? R.noOilRed : 0;
      d.c = Math.min(100, d.c + R.C[band] * dt);
      d.b = Math.min(100, d.b + db * dt);
      if (d.b >= J.smokeB && !d.smokeNotified) { d.smokeNotified = true; ev.push('smoke'); }
      if (d.b >= J.burntB && !d.burntNotified) { d.burntNotified = true; ev.push('burnt'); }
    }
    return ev;
  }
}

export function newDish() {
  return { recipe: null, seq: 0, taps: {}, items: {}, tossAfterSeason: 0, tosses: 0, mainIn: false, noOil: false, aromaticOk: true, c: 0, b: 0, log: [] };
}
const anySeason = (d) => Object.entries(d.taps).some(([k, v]) => k !== 'oil' && k !== 'scallion' && v > 0);
export const seasonSourceOf = (recipe) => recipe.steps.find((s) => s.type === 'seasoning')?.source || null;
export function seasonCount(d, recipe) { const k = seasonSourceOf(recipe); return k ? Math.min(3, d.taps[k] || 0) : 0; }
// 点了不属于这道菜的调料（蛋炒饭点酱汁、花甲点盐）→ 顺序全对失效（rules §9-6）
export function wrongSeasoning(d, recipe) { const k = seasonSourceOf(recipe); return Object.entries(d.taps).some(([i, v]) => v > 0 && i !== k && i !== 'oil' && i !== 'scallion'); }

// 品质（不含调料是否合口味，那个出餐时按订单判定）
export function qualityOf(d, J) {
  if (d.b >= J.burntB) return 'burnt';
  if (d.c < J.doneC) return 'raw';
  if (d.c >= J.perfectC && d.b < J.perfectBMax) return 'perfect';
  return 'done';
}
// 每步完成情况（菜谱条）：{ done, seq, count }
export function stepStatus(d, recipe) {
  return recipe.steps.map((s) => {
    if (!d) return { done: false, count: 0 };
    const first = (id) => d.log.find((l) => l.id === id);
    if (s.type === 'oil' || s.type === 'garnish') { const n = d.taps[s.source] || 0; const e = first(s.source); return { done: n >= (s.taps || 1), seq: n >= (s.taps || 1) ? d.log.filter((l) => l.id === s.source)[(s.taps || 1) - 1].seq : undefined, count: n }; }
    if (s.type === 'ingredient') { const e = d.items[s.source]; return { done: !!e, seq: e?.seq }; }
    if (s.type === 'seasoning') { const e = first(s.source); return { done: !!e, seq: e?.seq, count: Math.min(3, d.taps[s.source] || 0) }; }
    if (s.type === 'toss') { const need = s.count || 2; const ok = anySeason(d) && d.tossAfterSeason >= need; return { done: ok, seq: d.mixedSeq, count: anySeason(d) ? d.tossAfterSeason : 0 }; }
    return { done: false };
  });
}
// 顺序全对：所有步骤完成、完成顺序与菜谱一致、调料拌匀、爆香成功、没点错调料
export function orderCorrect(d, recipe) {
  if (!d || !d.recipe) return false;
  const st = stepStatus(d, recipe);
  if (!st.every((s) => s.done)) return false;
  for (let i = 1; i < st.length; i++) if (!(st[i].seq > st[i - 1].seq)) return false;
  return d.aromaticOk && !wrongSeasoning(d, recipe);
}
