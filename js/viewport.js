// 视口：处理 devicePixelRatio、safe-area、20:9 等比缩放、横竖屏判定
import { DESIGN_W, DESIGN_H } from './config.js';

const probe = () => document.getElementById('safe-probe');

function readSafeArea() {
  const el = probe();
  if (!el) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(el);
  const n = (v) => parseFloat(v) || 0;
  return { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
}

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.listeners = [];
    this.update = this.update.bind(this);
    window.addEventListener('resize', this.update);
    window.addEventListener('orientationchange', () => setTimeout(this.update, 150));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this.update);
    this.update();
  }
  onChange(fn) { this.listeners.push(fn); }
  update() {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const safe = readSafeArea();
    const c = this.canvas;
    const pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    // 安全区内的可用矩形（CSS px）
    const availW = Math.max(1, cssW - safe.left - safe.right);
    const availH = Math.max(1, cssH - safe.top - safe.bottom);
    const scale = Math.min(availW / DESIGN_W, availH / DESIGN_H);
    const offsetX = safe.left + (availW - DESIGN_W * scale) / 2;
    const offsetY = safe.top + (availH - DESIGN_H * scale) / 2;
    Object.assign(this, { cssW, cssH, dpr, safe, scale, offsetX, offsetY, portrait: cssH > cssW });
    this.listeners.forEach((fn) => fn(this));
  }
  // 开始一帧：清屏并把坐标系切到逻辑设计坐标
  begin(bg = '#2b2520') {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.offsetX, dpr * this.offsetY);
  }
  // 客户端坐标 → 逻辑坐标
  toLogical(clientX, clientY) {
    return { x: (clientX - this.offsetX) / this.scale, y: (clientY - this.offsetY) / this.scale };
  }
}
