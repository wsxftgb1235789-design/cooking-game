import { canonicalId } from '../layout.js';
// 新手教学（强引导，一步一卡）+ 轻提示。数据来自 levels.json 的 tutorial.steps / hints（FORMAT.md §3.6）
// waitFor / showAt / trigger 匹配。字段见 FORMAT.md §5：gte(数值≥) value(tempGte 阈值) count(次数≥) band stepType source orderIndex recipe after(本步开始后先发生过的事件)
export function matches(w, name, data = {}, seen = null) {
  if (!w || w.event !== name) return false;
  const num = data.value ?? data.count;
  if (w.gte != null && !(num >= w.gte)) return false;
  if (w.value != null && !(data.value >= w.value)) return false;
  if (w.count != null && !((data.count ?? data.value) >= w.count)) return false;
  if (w.band && data.band !== w.band) return false;
  if (w.stepType && data.stepType !== w.stepType) return false;
  if (w.source && data.source !== w.source) return false;
  if (w.recipe && data.recipe !== w.recipe) return false;
  if (w.orderIndex != null && data.orderIndex !== w.orderIndex) return false;
  if (w.after && !(seen && seen.has(w.after))) return false;
  return true;
}

// 玩家的有效操作（结束阅读期）
const ACTIONS = new Set(['tapAnywhere', 'fireOn', 'heat', 'step', 'ingredientIn', 'seasoningCount', 'toss', 'plate', 'trash', 'serve', 'returned', 'rejected', 'wrongDish']);

export class Tutorial {
  constructor(steps) { this.reading = false; this.seen = new Set(); this.steps = steps || []; this.active = false; this.idx = 0; this.branch = null; this.shown = true; this.finished = false; this.t = 0; }
  start() { if (!this.steps.length) return; this.active = true; this.idx = 0; this.enter(); }
  enter() { const s = this.steps[this.idx]; this.shown = !s.showAt; this.t = 0; this.seen = new Set(); this.reading = this.shown; }
  // 教学 T 上限：v0.2.1 起 tempCap 在整个教学期间都生效（教学全程 T ≤ tempCap）。
  // releaseTempCap 仍可写，但只表示“这一步放开火力调节”，不会让 T 超过 tempCap（见 FORMAT §5）
  get capOn() { return this.active; }
  // 阅读期：一张新提示卡出现（步骤显示 / showAt 触发 / 糊锅分支）到玩家第一次有效操作之前。
  // 有效操作 = 被烹饪模块接受并发出的动作事件，或“点任意处继续”。阅读期内锅里的 C、B 暂停（T 不停）
  get readingPause() { return this.active && this.reading && !!this.view && !this.view.waiting; }
  // 当前展示的步骤（showAt 未触发时继续展示上一步画面）
  get view() {
    if (!this.active) return null;
    if (this.branch) return this.branch;
    if (!this.shown && this.idx > 0) return { ...this.steps[this.idx - 1], waiting: true };
    return this.steps[this.idx];
  }
  get current() { return this.branch || this.steps[this.idx]; }
  onEvent(name, data) {
    if (!this.active) return false;
    if (ACTIONS.has(name)) this.reading = false;
    const cur = this.current;
    // 糊了：用当前步的 onBurnt；当前步没写时借用后面最近一步的 onBurnt（避免 t6/t7 糊锅卡死）
    if (!this.branch && name === 'burnt') {
      const ob = cur.onBurnt || this.steps.slice(this.idx).find((s) => s.onBurnt)?.onBurnt;
      if (ob) { this.branch = { ...ob, id: `${cur.id}-burnt` }; this.t = 0; this.seen = new Set(); this.reading = true; return true; }
    }
    if (!this.branch && !this.shown && matches(cur.showAt, name, data)) { this.shown = true; this.t = 0; this.seen = new Set(); this.reading = true; }
    const hit = matches(cur.waitFor, name, data, this.seen) && (this.shown || this.branch);
    if (this.shown || this.branch) this.seen.add(name);
    if (hit) {
      if (this.branch) {
        const j = this.steps.findIndex((s) => s.id === this.branch.gotoStep);
        this.branch = null; this.idx = j >= 0 ? j : this.idx; this.enter();
      } else if (++this.idx >= this.steps.length) { this.active = false; this.finished = true; }
      else this.enter();
      return true;
    }
    return false;
  }
  // 强引导期间只允许涉及高亮目标的操作
  allows(ids) {
    if (!this.active) return true;
    const v = this.view;
    if (!v || v.waiting) return false;
    if (v.waitFor?.event === 'tapAnywhere') return false;
    const hl = new Set((v.highlight || []).map(canonicalId));
    return ids.some((id) => hl.has(canonicalId(id)) || (id === 'orderCard' && [...hl].some((h) => h.startsWith('orderCard'))));
  }
  update(dt) { this.t += dt; }
}

export class Hints {
  constructor(hints) { this.hints = hints.map((h) => ({ ...h, fired: 0 })); this.pending = []; this.current = null; }
  onEvent(name, data) {
    for (const h of this.hints) {
      if (h.once !== false && h.fired) continue;
      if (matches(h.trigger, name, data)) { h.fired++; this.pending.push({ text: h.text, wait: h.delay || 0, duration: h.duration || 3 }); }
    }
  }
  update(dt) {
    this.pending.forEach((p) => { p.wait -= dt; });
    if (!this.current || this.current.left <= 0) {
      const i = this.pending.findIndex((p) => p.wait <= 0);
      this.current = i >= 0 ? { text: this.pending[i].text, left: this.pending[i].duration, total: this.pending[i].duration } : null;
      if (i >= 0) this.pending.splice(i, 1);
    } else this.current.left -= dt;
  }
}
