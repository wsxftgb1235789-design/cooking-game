// 图片预加载：带进度回调；单张失败只记录，绘制时自动回退占位，不会中断
import { IMAGES, withV } from './config.js?v=v0.2.2';

const images = {};
export const missing = [];

export function img(name) { return images[name] || null; }

export function loadImages(onProgress, base = 'assets/img/') {
  let done = 0;
  const total = IMAGES.length;
  return Promise.all(IMAGES.map((name) => new Promise((resolve) => {
    const im = new Image();
    im.decoding = 'async';
    const finish = (ok) => {
      if (ok) images[name] = im; else { missing.push(name); console.warn(`[assets] 图片加载失败，使用占位：${name}`); }
      done++; onProgress && onProgress(done, total); resolve();
    };
    im.onload = () => finish(true);
    im.onerror = () => finish(false);
    im.src = withV(`${base}${name}.png`);
  })));
}
