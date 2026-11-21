// 得分、失误、星级。docs/rules.md §3–§4，levels/FORMAT.md §3.3–3.5
export class Scoreboard {
  constructor(level) { this.level = level; this.score = 0; this.mistakes = 0; this.perfect = 0; this.completed = 0; this.timeouts = 0; }
  add(n) { this.score = Math.max(0, this.score + n); return n; } // 总分不低于 0
  addMistake() { this.mistakes++; return this.failed; }
  get failed() { const m = this.level.mistakes.max; return m > 0 && this.mistakes >= m; }
  // 出餐得分（菜对且熟/完美）
  serveScore(order, zone) {
    const s = this.level.scoring;
    return s.orderComplete + (zone === 'perfect' ? s.perfectBonus : 0) + Math.floor(order.left) * s.timeBonusPerSecond;
  }
}
export function starsFor(level, score, cleared) {
  if (!cleared) return 0;
  if (score >= level.stars.three) return 3;
  if (score >= level.stars.two) return 2;
  return 1;
}
