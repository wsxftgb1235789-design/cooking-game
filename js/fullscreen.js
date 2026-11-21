// 全屏 + 横屏锁定：尽力而为，任何失败都静默忽略
export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export async function enterFullscreenLandscape() {
  const el = document.documentElement;
  try {
    if (!isFullscreen()) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  } catch (_) { /* 不支持或被拒绝：忽略 */ }
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) { /* 桌面浏览器/未全屏时会失败：忽略 */ }
}

export function setupFullscreenButton(btn) {
  if (!btn) return;
  const supported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  if (!supported) { btn.classList.add('hidden'); return; }
  const refresh = () => btn.classList.toggle('hidden', isFullscreen());
  btn.addEventListener('click', (e) => { e.preventDefault(); enterFullscreenLandscape(); });
  document.addEventListener('fullscreenchange', refresh);
  document.addEventListener('webkitfullscreenchange', refresh);
  refresh();
}
