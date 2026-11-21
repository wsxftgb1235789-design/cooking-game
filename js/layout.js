// 布局常量 = ui/layout.md v0.2「最终坐标」（定稿），逻辑坐标 915×412 CSS px；元素 id 用 ui/ui-spec.md 稳定 id。
// 界面再调只改这里。
export const DESIGN = { w: 915, h: 412 };

const pan = (dx, recipe) => ({
  recipe,                                                   // panN-recipe
  thermo: { x: 248 + dx, y: 112, w: 28, h: 160 },           // panN-thermo
  body: { x: 286 + dx, y: 120, w: 140, h: 140 },            // panN-body（锅图）
  toss: { x: 271 + dx, y: 105, w: 170, h: 170 },            // panN-toss（画圈判定 Ø170，有效半径 20–85）
  track: { x: 434 + dx, y: 110, w: 32, h: 170 },            // panN-track（滑轨图；y_grip(H)=110+[16+(1-H)·168]·0.85）
  trackHit: dx ? { x: 708, y: 108, w: 52, h: 174 } : { x: 422, y: 108, w: 56, h: 174 } // panN-track-hit
});

export const L = {
  pause: { x: 36, y: 12, w: 48, h: 48, pad: 4 },            // btn-pause（热区 56）
  sound: { x: 92, y: 12, w: 48, h: 48, pad: 4 },            // btn-sound
  hud: { x: 148, y: 16, w: 256, h: 40 },                    // hud-score
  order: (i) => ({ x: 420 + i * 148, y: 12, w: 140, h: 68 }),                       // order-N
  orderRequest: (i) => [{ x: 440, y: 72, w: 80, h: 36 }, { x: 588, y: 72, w: 80, h: 36 }, { x: 656, y: 72, w: 80, h: 36 }][i], // order-N-request
  pots: [pan(0, { x: 248, y: 80, w: 178, h: 26 }), pan(286, { x: 572, y: 100, w: 140, h: 18 })],
  plateZone: { x: 760, y: 112, w: 100, h: 248 },            // plate-zone（装盘投放总区）
  plates: [{ x: 760, y: 280, w: 100, h: 80 }, { x: 760, y: 196, w: 100, h: 80 }, { x: 760, y: 112, w: 100, h: 80 }], // plate-1..3
  sources: {                                                // bottle-* / ing-*
    oil: { x: 36, y: 328, w: 56, h: 56 }, egg: { x: 100, y: 328, w: 56, h: 56 }, rice: { x: 164, y: 328, w: 56, h: 56 }, salt: { x: 228, y: 328, w: 56, h: 56 },
    scallion: { x: 292, y: 328, w: 56, h: 56 }, chili_garlic: { x: 356, y: 328, w: 56, h: 56 }, clams: { x: 420, y: 328, w: 56, h: 56 }, sauce: { x: 484, y: 328, w: 56, h: 56 }
  },
  trash: { x: 560, y: 324, w: 64, h: 64 },                  // trash
  corridorY: 306,                                           // 灶1 装盘走锅下方走廊中线（教学箭头）
  handleGrab: { w: 32, h: 48 },                             // panN-handle 抓取框：以 y_grip(H) 为中心（H=0 → (434,242,32,48)），界面改定后只改这里
  tutorialArrow: { x: 466, y: 188, w: 320, h: 140 },        // ui_tutorial_arrow_full（art v0.3.1）
  tutorialHint: { x: 536, y: 242, w: 216, h: 56 },          // ui_tutorial_hint「往右拖到盘子上」
  // 程序自用（不在 ui-spec 里）：提示条、调试面板
  banner: (pots) => (pots === 1 ? { x: 474, y: 118, w: 280, h: 72 } : { x: 250, y: 290, w: 440, h: 30 }),
  debugPanel: (i, pots) => (pots === 1 ? { x: 474, y: 196, w: 280, h: 90 } : { x: 248 + i * 286, y: 186, w: 212, h: 90 })
};

const SRC_ID = { oil: 'bottle-oil', salt: 'bottle-salt', sauce: 'bottle-sauce', scallion: 'ing-scallion', egg: 'ing-egg', rice: 'ing-rice', chili_garlic: 'ing-chili', clams: 'ing-clams' };
export const uiId = { source: (k) => SRC_ID[k] || k, pan: (n, part) => `pan${n}-${part}` };

// id 别名：ui-spec 稳定 id ↔ 内部 id（levels.json 的 potHandle:1 等写法也认）
export function canonicalId(id) {
  if (!id) return id;
  let m;
  if ((m = id.match(/^pan(\d)-(handle|thermo|body|toss|track-hit|track|recipe)$/))) return { handle: 'potHandle', thermo: 'thermometer', body: 'pot', toss: 'pot', 'track-hit': 'potTrack', track: 'potTrack', recipe: 'strip' }[m[2]] + ':' + m[1];
  if (/^plate-zone(-\d)?$/.test(id) || id === 'plateArea') return 'plateArea';
  if ((m = id.match(/^plate-(\d)$/))) return `plate:${m[1]}`;
  if ((m = id.match(/^order-(\d)$/))) return +m[1] === 1 ? 'orderCard' : `orderCard@${+m[1] - 1}`;
  if ((m = id.match(/^bottle-(\w+)$/))) return `source:${m[1]}`;
  if ((m = id.match(/^ing-(\w+)$/))) return `source:${m[1] === 'chili' ? 'chili_garlic' : m[1]}`;
  if (id === 'btn-pause') return 'pause';
  if (id === 'btn-sound') return 'sound';
  if (id === 'hud-score') return 'hud';
  return id;
}
