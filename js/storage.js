// localStorage 安全封装（隐私模式/禁用存储时不抛错）
import { STORE } from './config.js';
const mem = {};
export function load(key, def) {
  try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch (_) { return key in mem ? mem[key] : def; }
}
export function save(key, val) {
  mem[key] = val;
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) { /* ignore */ }
}
export const progress = {
  get() { return load(STORE.progress, { unlocked: 1, best: {} }); },
  // 通关后解锁下一关并记录最好成绩
  record(levelIndex, levelId, score, stars) {
    const p = this.get();
    p.unlocked = Math.max(p.unlocked || 1, levelIndex + 2);
    const b = p.best[levelId];
    if (!b || score > b.score || stars > b.stars) p.best[levelId] = { score: Math.max(score, b?.score || 0), stars: Math.max(stars, b?.stars || 0) };
    save(STORE.progress, p);
    return p;
  }
};
