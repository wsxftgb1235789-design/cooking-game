// 关卡计时：只用累计 dt，不用墙钟。timeLimit = 0 表示不设总倒计时
export class LevelTimer {
  constructor(limit = 0) { this.limit = limit; this.elapsed = 0; }
  update(dt) { this.elapsed += dt; }
  get remaining() { return this.limit > 0 ? Math.max(0, this.limit - this.elapsed) : Infinity; }
  get expired() { return this.limit > 0 && this.elapsed >= this.limit; }
}
