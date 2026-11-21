// 触控输入：pointer events + 屏蔽浏览器默认手势（缩放、滚动、长按菜单、双击放大）
const pick = (e) => ({ clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, pointerType: e.pointerType, type: e.type });

export class Input {
  constructor(canvas, viewport) {
    this.viewport = viewport;
    this.handlers = { down: [], move: [], up: [] };
    const opts = { passive: false };
    const emit = (type, e) => {
      const p = viewport.toLogical(e.clientX, e.clientY);
      const ev = { x: p.x, y: p.y, id: e.pointerId, type: e.pointerType, cancelled: !!e.cancelled, raw: e };
      this.handlers[type].forEach((fn) => fn(ev));
    };
    // 单指锁定（rules §9-1）：只认第一根按下的手指，抬起/取消前其他指针的按下、移动、抬起全部忽略
    this.primary = null;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.primary !== null) return;
      this.primary = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      emit('down', e);
    }, opts);
    canvas.addEventListener('pointermove', (e) => { e.preventDefault(); if (e.pointerId === this.primary) emit('move', e); }, opts);
    const end = (e) => { if (e.pointerId !== this.primary) return; this.primary = null; emit('up', { ...pick(e), cancelled: e.type === 'pointercancel' }); };
    canvas.addEventListener('pointerup', (e) => { e.preventDefault(); end(e); }, opts);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);

    const block = (e) => e.preventDefault();
    document.addEventListener('contextmenu', block, opts);
    document.addEventListener('dblclick', block, opts);
    document.addEventListener('gesturestart', block, opts);   // iOS pinch
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || e.target === canvas) e.preventDefault(); }, opts);
    document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, opts);
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouchEnd < 300 && e.target === canvas) e.preventDefault();
      lastTouchEnd = now;
    }, opts);
  }
  on(type, fn) { this.handlers[type].push(fn); }
  reset() { this.primary = null; }
}
