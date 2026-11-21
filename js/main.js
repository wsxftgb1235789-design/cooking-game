// 入口：预加载 → 读关卡配置 → 选关；主循环用累计 dt（单帧上限），切后台/竖屏自动暂停
import { VERSION, LEVELS_URL, MAX_FRAME_DT, IMAGES } from './config.js';
import { Viewport } from './viewport.js';
import { Input } from './input.js';
import { setupFullscreenButton } from './fullscreen.js';
import { loadImages, missing } from './assets.js';
import { audio } from './audio.js';
import { loadLevels } from './levels.js';
import { LoadingScene, ErrorScene, SelectScene } from './scenes/menus.js';
import { LevelScene } from './scenes/level.js';

const params = new URLSearchParams(location.search);
const DEBUG_SPEED = Math.max(0.1, Math.min(20, parseFloat(params.get('debugSpeed')) || 1)); // 仅测试用

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.viewport = new Viewport(this.canvas);
    this.input = new Input(this.canvas, this.viewport);
    this.fsBtn = document.getElementById('btn-fullscreen');
    setupFullscreenButton(this.fsBtn);
    document.getElementById('version-tag').textContent = VERSION;
    this.scene = new LoadingScene();
    this.data = null;
    this.input.on('down', (e) => { if (!this.viewport.portrait) this.scene.pointerDown?.(e); });
    this.input.on('move', (e) => this.scene.pointerMove?.(e));
    this.input.on('up', (e) => this.scene.pointerUp?.(e));
    // 切后台 / 锁屏 / 页面隐藏：自动暂停（回来后停在暂停界面）
    const hide = () => { this.scene.pause?.('hidden'); audio.suspend(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); else { audio.resume(); this.last = performance.now(); } });
    window.addEventListener('pagehide', hide);
    window.addEventListener('blur', () => { /* 桌面失焦不暂停，只处理 visibility */ });
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }
  setScene(s) { this.scene = s; this.fsBtn.style.display = s.name === 'level' ? 'none' : ''; }
  goSelect() { this.setScene(new SelectScene(this)); }
  startLevel(i) {
    audio.stopLoops(); this.scene.cooking?.destroy?.(); this.input.reset?.();
    this.setScene(new LevelScene(this, i));
    // 调试：?T=&C=&B= 预设第 1 口锅（只在调试参数存在时生效）
    const pre = {}; ['T', 'C', 'B'].forEach((k) => { if (params.has(k) && params.get(k) !== '') pre[k] = parseFloat(params.get(k)); });
    if (Object.keys(pre).length) this.scene.cooking.applyDebugPreset?.(pre);
  }

  async boot() {
    const total = IMAGES.length + audio.count;
    let imgDone = 0, sndDone = 0;
    const upd = () => this.scene.setProgress?.(imgDone + sndDone, total, '加载素材');
    await Promise.all([
      loadImages((d) => { imgDone = d; upd(); }),
      audio.preload((d) => { sndDone = d; upd(); })
    ]);
    if (missing.length) console.warn('[cooking-game] 以下图片使用占位：', missing.join(', '));
    const res = await loadLevels(LEVELS_URL);
    if (!res.ok) { this.setScene(new ErrorScene('关卡配置有误，无法开始', res.errors)); return; }
    this.data = res.data;
    this.maxDt = this.data.tuning?.maxFrameDt || MAX_FRAME_DT;
    const lv = parseInt(params.get('level'), 10); // 调试：?level=N 直接进第 N 关
    if (lv >= 1 && lv <= this.data.levels.length) this.startLevel(lv - 1); else this.goSelect();
    console.info(`[cooking-game] ${VERSION} 就绪：${this.data.levels.length} 关`);
  }

  frame(now) {
    const frameDt = Math.min(this.maxDt || MAX_FRAME_DT, Math.max(0, (now - this.last) / 1000)); // 单帧上限，避免跳变
    this.last = now;
    if (this.viewport.portrait) this.scene.pause?.('portrait');
    const running = !document.hidden && !this.viewport.portrait;
    if (running) this.scene.update?.(frameDt * DEBUG_SPEED, frameDt);
    this.viewport.begin('#2b2520');
    this.scene.draw(this.viewport.ctx);
    requestAnimationFrame((t) => this.frame(t));
  }
}

const app = new App();
window.__game = {
  version: VERSION, app,
  state: () => app.scene.snapshot?.() || { scene: app.scene.name },
  rect: (id) => { const r = app.scene.rectOf?.(id) || app.scene.ui?.get?.(id) || app.scene.overlayUI?.get?.(id); return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null; },
  toScreen: (x, y) => ({ x: app.viewport.offsetX + x * app.viewport.scale, y: app.viewport.offsetY + y * app.viewport.scale })
};
app.boot().catch((err) => { console.error('[cooking-game] 启动失败', err); app.setScene(new ErrorScene('启动失败', [String(err && err.message || err)])); });
