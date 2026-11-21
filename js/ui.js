// Canvas 按钮：命中测试（可外扩热区）+ 按下态 + 单次触发保护
import { roundRect, text } from './render/draw.js';
import { audio } from './audio.js';

export class Button {
  constructor(o) {
    Object.assign(this, { pad: 0, color: '#555', textColor: '#fff', size: 18, radius: 10, enabled: true, visible: true, active: false, pressed: false, sound: 'click' }, o);
  }
  hit(px, py) {
    const p = this.pad;
    return this.visible && this.enabled && px >= this.x - p && px <= this.x + this.w + p && py >= this.y - p && py <= this.y + this.h + p;
  }
  draw(ctx) {
    if (!this.visible) return;
    ctx.save();
    ctx.globalAlpha = this.enabled ? 1 : 0.4;
    const dy = this.pressed ? 2 : 0;
    if (!this.noFrame) {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; roundRect(ctx, this.x, this.y + 3, this.w, this.h, this.radius); ctx.fill();
      ctx.fillStyle = this.color; roundRect(ctx, this.x, this.y + dy, this.w, this.h, this.radius); ctx.fill();
      ctx.lineWidth = this.active ? 4 : 2; ctx.strokeStyle = this.active ? '#ffd54a' : 'rgba(43,24,16,.9)'; ctx.stroke();
    }
    if (this.drawIcon) this.drawIcon(ctx, this.x + this.w / 2, this.y + this.h / 2 + dy, this);
    else text(ctx, this.label, this.x + this.w / 2, this.y + this.h / 2 + dy, { size: this.size, bold: true, color: this.textColor });
    ctx.restore();
  }
}

export class ButtonGroup {
  constructor() { this.buttons = []; this.down = new Map(); }
  add(b) { this.buttons.push(b instanceof Button ? b : new Button(b)); return this.buttons[this.buttons.length - 1]; }
  get(id) { return this.buttons.find((b) => b.id === id); }
  find(x, y) { for (let i = this.buttons.length - 1; i >= 0; i--) if (this.buttons[i].hit(x, y)) return this.buttons[i]; return null; }
  pointerDown(ev) { const b = this.find(ev.x, ev.y); if (b) { b.pressed = true; this.down.set(ev.id, b); return b; } return null; }
  // 抬起时仍在按钮内才触发；返回是否被消费
  pointerUp(ev, guard) {
    const b = this.down.get(ev.id); this.down.delete(ev.id);
    if (!b) return false;
    b.pressed = false;
    if (b.hit(ev.x, ev.y) && b.onTap && (!guard || guard(b))) { if (b.sound) audio.play(b.sound); b.onTap(b); }
    return true;
  }
  cancel() { this.buttons.forEach((b) => { b.pressed = false; }); this.down.clear(); }
  draw(ctx) { this.buttons.forEach((b) => b.draw(ctx)); }
}

// 占位图标（美术补图前使用）
export const ICONS = {
  pause(ctx, x, y) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 9, y - 11, 6, 22); ctx.fillRect(x + 3, y - 11, 6, 22); },
  sound(ctx, x, y, b) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x - 12, y - 5); ctx.lineTo(x - 6, y - 5); ctx.lineTo(x + 2, y - 12); ctx.lineTo(x + 2, y + 12); ctx.lineTo(x - 6, y + 5); ctx.lineTo(x - 12, y + 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    if (b.on) { ctx.beginPath(); ctx.arc(x + 4, y, 8, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 4, y, 14, -0.9, 0.9); ctx.stroke(); }
    else { ctx.strokeStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(x + 6, y - 7); ctx.lineTo(x + 16, y + 7); ctx.moveTo(x + 16, y - 7); ctx.lineTo(x + 6, y + 7); ctx.stroke(); }
  }
};
