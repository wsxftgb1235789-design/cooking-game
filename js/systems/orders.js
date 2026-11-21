// 订单系统：固定出单序列；afterResolve（mode A）/ schedule（mode B）；满员顺延；耐心计时。levels/FORMAT.md §3.1–3.2
export class OrderSystem {
  constructor(level, { skipTutorial = false, emit }) {
    this.level = level;
    this.emit = emit;
    this.time = 0;
    this.queue = level.orders.filter((o) => !(skipTutorial && o.tutorial)); // 未出的订单（保持顺序）
    this.total = this.queue.length;
    this.active = [];     // 场上订单
    this.resolved = 0;
    this.nextAt = level.spawn.mode === 'afterResolve' ? level.spawn.firstDelay : null;
    this.uid = 0;
  }
  get done() { return this.resolved >= this.total; }
  get mode() { return this.level.spawn.mode; }

  update(dt) {
    this.time += dt;
    // 出单
    if (this.queue.length && this.active.length < this.level.maxConcurrent) {
      const head = this.queue[0];
      const due = this.mode === 'schedule' ? head.at <= this.time : (this.nextAt != null && this.time >= this.nextAt);
      if (due) this.spawn();
    }
    // 耐心（教学单不计时）
    for (const o of [...this.active]) {
      if (o.tutorial) continue;
      o.left -= dt;
      if (o.left <= 0) { o.left = 0; this.resolve(o, 'timeout'); }
    }
    for (const o of this.active) o.anim = Math.min(1, o.anim + dt / 0.35);
  }
  spawn() {
    const def = this.queue.shift();
    const o = { id: ++this.uid, index: def.index, recipe: def.recipe, tutorial: def.tutorial, request: def.request || null, patience: def.patience, left: def.patience, refTime: def.refTime, anim: 0 };
    this.active.push(o);
    if (this.mode === 'afterResolve') this.nextAt = null; // 等这一单结束再排下一单
    this.emit('orderSpawn', { orderIndex: def.index, order: o });
  }
  resolve(o, result) {
    const i = this.active.indexOf(o);
    if (i < 0) return false; // 已结算过（防重复）
    this.active.splice(i, 1);
    this.resolved++;
    if (this.mode === 'afterResolve') this.nextAt = this.time + this.level.spawn.interval;
    this.emit(result === 'timeout' ? 'orderTimeout' : 'orderComplete', { order: o });
    return true;
  }
}
