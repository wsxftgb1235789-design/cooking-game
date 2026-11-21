// rules v0.2.1 默认数值。键名与 levels/FORMAT.md（formatVersion 2）一致；levels.json 没给的字段用这里的值。
export const DEFAULT_TEMP = { start: 20, min: 20, max: 100, riseBase: 2, risePerH: 14, cool: 8, tossCool: 10, tossFloor: 40, foodDrop: 15, blueBelow: 40, redAbove: 75 };
export const DEFAULT_RATES = { C: { blue: 4, yellow: 12, red: 12 }, B: { blue: 0, yellow: 0, yellowOvercooked: 8, red: 30 }, noOilYellow: 4, noOilRed: 10 };
export const DEFAULT_JUDGE = { doneC: 60, perfectC: 80, perfectBMax: 15, burntB: 50, smokeB: 20, blackSmokeB: 50 };
export const DEFAULT_SEASONING = {
  levels: { 0: '无味', 1: '清淡', 2: '适中', 3: '重口' }, maxTaps: 3, tapMinInterval: 0.15, default: 2,
  requests: { less_salt: { label: '少盐', level: 1 }, more_salt: { label: '多盐', level: 3 } }
};
// 全局手感参数（根节点 tuning，可选）
export const DEFAULT_TUNING = {
  gesture: { lockPx: 12, plateDragPx: 80, circleDeg: 360, circleMinRadius: 20, circleMaxRadius: 85, handleOffBelow: 0.1, trashTapSlop: 12, grabPad: 8, trashDropPad: 10, tapOnH: 0.5, minH: 0.2 },
  trashWindow: 2,
  maxFrameDt: 0.05
};
export const DEFAULT_KITCHEN = { washTime: 1 };
export const DEFAULT_TUTORIAL_TEMP_CAP = 75;

// 食材 / 调料（source id → 显示名、图片名、占位色）。图片放 assets/img/<art>.png 即自动替换占位
export const SOURCES = {
  oil:          { kind: 'condiment',  name: '油壶',   art: 'oil_bottle',       color: '#f6c343', glyph: '油' },
  salt:         { kind: 'condiment',  name: '盐罐',   art: 'salt_shaker',      color: '#e8eef2', glyph: '盐' },
  sauce:        { kind: 'condiment',  name: '酱汁瓶', art: 'sauce_bottle',     color: '#7b3f1d', glyph: '酱' },
  scallion:     { kind: 'condiment',  name: '葱花',   art: 'scallion_bowl',    color: '#5fbf4a', glyph: '葱' },
  egg:          { kind: 'ingredient', name: '鸡蛋',   art: 'egg_raw',          color: '#f7e7b0', glyph: '蛋' },
  rice:         { kind: 'ingredient', name: '米饭',   art: 'rice_bowl',        color: '#fbfaf3', glyph: '饭' },
  chili_garlic: { kind: 'ingredient', name: '辣椒蒜', art: 'chili_garlic',     color: '#e53935', glyph: '辣' },
  clams:        { kind: 'ingredient', name: '花甲',   art: 'clams_bowl',       color: '#b9a27e', glyph: '甲' }
};
// 菜品外观（锅中 / 盘中三态图片名，缺图画占位）
export const DISH_ART = {
  egg_fried_rice: { pan: 'fried_rice', dish: 'dish_fried_rice', color: '#f2d27a' },
  spicy_clams:    { pan: 'clams', dish: 'dish_clams', color: '#e0703a' }
};
