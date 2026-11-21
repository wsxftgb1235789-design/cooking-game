// 关卡配置：加载 + 按 levels/FORMAT.md（formatVersion 2）校验 + 规范化（缺省字段补代码默认值）。
// 出错返回 errors 列表，由错误界面逐条显示。
import { DEFAULT_TEMP, DEFAULT_RATES, DEFAULT_JUDGE, DEFAULT_SEASONING, DEFAULT_TUNING, DEFAULT_KITCHEN, DEFAULT_TUTORIAL_TEMP_CAP, SOURCES } from './cooking/wok/defaults.js';

const DEF_SCORING = { orderComplete: 100, perfectBonus: 50, orderBonus: 20, timeBonusPerSecond: 2, wrongSeasoningMultiplier: 0.5, rawReturnPenalty: 0, burntPenalty: -30, timeoutPenalty: -50, wrongDishPenalty: 0 };
const DEF_MISTAKES = { max: 3, countRaw: true, countBurnt: true, countTimeout: true };
const STEP_TYPES = ['oil', 'ingredient', 'seasoning', 'toss', 'garnish'];
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v; return o; };

export function validate(d) {
  const E = [];
  if (!isObj(d)) return ['根节点必须是 JSON 对象'];
  if (d.formatVersion === 1) return ['formatVersion 1 是 rules v0.1（四档火力）的格式；v0.2 需要 formatVersion 2，见 levels/FORMAT.md'];
  if (d.formatVersion !== 2) E.push(`formatVersion 应为 2，实际为 ${JSON.stringify(d.formatVersion)}`);
  // seasoning
  const S = merge(DEFAULT_SEASONING, d.seasoning);
  if (d.seasoning != null && !isObj(d.seasoning)) E.push('seasoning 应为对象');
  if (!(Number.isInteger(S.maxTaps) && S.maxTaps >= 1 && S.maxTaps <= 5)) E.push('seasoning.maxTaps 应为 1–5 的整数');
  if (!(num(S.tapMinInterval) && S.tapMinInterval >= 0 && S.tapMinInterval <= 1)) E.push('seasoning.tapMinInterval 应为 0–1 秒');
  if (!(Number.isInteger(S.default) && S.default >= 0 && S.default <= S.maxTaps)) E.push('seasoning.default 应为 0–maxTaps 的整数');
  for (const [k, r] of Object.entries(S.requests || {})) if (!isObj(r) || typeof r.label !== 'string' || !(Number.isInteger(r.level) && r.level >= 0 && r.level <= S.maxTaps)) E.push(`seasoning.requests.${k} 需要 label（文字）和 level（0–${S.maxTaps}）`);
  // tuning
  if (d.tuning != null && !isObj(d.tuning)) E.push('tuning 应为对象');
  // recipes
  const R = d.recipes;
  if (!isObj(R) || !Object.keys(R).length) E.push('缺少 recipes（菜品表）');
  else for (const [id, r] of Object.entries(R)) {
    const t = `recipes.${id}`;
    if (typeof r.name !== 'string' || !r.name) E.push(`${t}.name 缺失`);
    if (!Array.isArray(r.steps) || !r.steps.length) { E.push(`${t}.steps 应为非空数组`); continue; }
    let mains = 0, seas = 0;
    r.steps.forEach((s, j) => {
      const st = `${t}.steps[${j}]`;
      if (!STEP_TYPES.includes(s.type)) { E.push(`${st}.type 应为 ${STEP_TYPES.join(' / ')}，实际 ${s.type}`); return; }
      if (s.type !== 'toss') {
        if (!SOURCES[s.source]) E.push(`${st}.source 不认识：${s.source}（可用：${Object.keys(SOURCES).join(', ')}）`);
        else if (s.type === 'ingredient' && SOURCES[s.source].kind !== 'ingredient') E.push(`${st}.source ${s.source} 不是食材`);
        else if (s.type !== 'ingredient' && SOURCES[s.source].kind !== 'condiment') E.push(`${st}.source ${s.source} 不是调料架上的瓶罐`);
      }
      if (s.type === 'toss' && !(Number.isInteger(s.count ?? 2) && (s.count ?? 2) >= 1)) E.push(`${st}.count 应为 ≥1 的整数`);
      if (s.taps != null && !(Number.isInteger(s.taps) && s.taps >= 1 && s.taps <= 5)) E.push(`${st}.taps 应为 1–5 的整数`);
      if (s.requireTempMin != null && !num(s.requireTempMin)) E.push(`${st}.requireTempMin 应为数字`);
      if (s.main) mains++;
      if (s.type === 'seasoning') seas++;
    });
    if (mains !== 1) E.push(`${t}.steps 需要且只能有 1 个 main（主料）步骤，当前 ${mains} 个`);
    if (seas > 1) E.push(`${t}.steps 最多 1 个 seasoning 步骤（客人要求作用在它上面）`);
    const T = merge(DEFAULT_TEMP, r.temp);
    if (!(T.min <= T.start && T.start <= T.max)) E.push(`${t}.temp 需满足 min ≤ start ≤ max`);
    if (!(T.blueBelow <= T.redAbove)) E.push(`${t}.temp.blueBelow 应 ≤ redAbove`);
    ['riseBase', 'risePerH', 'cool', 'tossCool', 'tossFloor', 'foodDrop'].forEach((k) => { if (!num(T[k]) || T[k] < 0) E.push(`${t}.temp.${k} 应为 ≥0 的数字`); });
    const RT = merge(DEFAULT_RATES, r.rates);
    ['blue', 'yellow', 'red'].forEach((b) => { if (!num(RT.C[b]) || RT.C[b] < 0) E.push(`${t}.rates.C.${b} 应为 ≥0 的数字`); if (!num(RT.B[b]) || RT.B[b] < 0) E.push(`${t}.rates.B.${b} 应为 ≥0 的数字`); });
    ['noOilYellow', 'noOilRed'].forEach((k) => { if (!num(RT[k]) || RT[k] < 0) E.push(`${t}.rates.${k} 应为 ≥0 的数字`); });
    if (r.rates && 'noOilBurnExtra' in r.rates) E.push(`${t}.rates.noOilBurnExtra 已改名：红段请用 noOilRed，黄段用 noOilYellow（见 FORMAT §8 对照表）`);
    const J = merge(DEFAULT_JUDGE, r.judge);
    if (!(J.doneC <= J.perfectC)) E.push(`${t}.judge.doneC 应 ≤ perfectC`);
    if (!(J.perfectBMax <= J.burntB)) E.push(`${t}.judge.perfectBMax 应 ≤ burntB`);
    if (r.patience != null && (!num(r.patience) || r.patience <= 0)) E.push(`${t}.patience 应为正数（秒）`);
  }
  const L = d.levels;
  if (!Array.isArray(L) || !L.length) { E.push('缺少 levels 数组'); return E; }
  const ids = new Set();
  L.forEach((lv, i) => {
    const t = `levels[${i}]${lv && lv.id ? `(${lv.id})` : ''}`;
    if (!isObj(lv)) { E.push(`${t} 不是对象`); return; }
    if (!lv.id) E.push(`${t}.id 缺失`); else if (ids.has(lv.id)) E.push(`${t}.id 重复`); else ids.add(lv.id);
    if (!lv.name) E.push(`${t}.name 缺失`);
    if (lv.timeLimit != null && (!num(lv.timeLimit) || lv.timeLimit < 0)) E.push(`${t}.timeLimit 应为 ≥ 0 的秒数`);
    if (!Array.isArray(lv.recipes) || !lv.recipes.length) E.push(`${t}.recipes 缺失`);
    else lv.recipes.forEach((r) => { if (!R?.[r]) E.push(`${t}.recipes 引用了不存在的菜品 ${r}`); });
    const k = lv.kitchen || {};
    if (!(Number.isInteger(k.pots) && k.pots >= 1 && k.pots <= 2)) E.push(`${t}.kitchen.pots 应为 1–2（当前布局最多两口锅）`);
    if (!(Number.isInteger(k.plates) && k.plates >= 1 && k.plates <= 3)) E.push(`${t}.kitchen.plates 应为 1–3（当前布局最多 3 个盘）`);
    if (k.washTime != null && !(num(k.washTime) && k.washTime >= 0 && k.washTime <= 5)) E.push(`${t}.kitchen.washTime 应为 0–5 秒`);
    if (!(Number.isInteger(lv.maxConcurrentOrders) && lv.maxConcurrentOrders >= 1 && lv.maxConcurrentOrders <= 4)) E.push(`${t}.maxConcurrentOrders 应为 1–4`);
    const sp = lv.spawn || {};
    if (sp.mode !== 'afterResolve' && sp.mode !== 'schedule') E.push(`${t}.spawn.mode 应为 afterResolve 或 schedule`);
    if (sp.mode === 'afterResolve' && (!num(sp.firstDelay) || !num(sp.interval))) E.push(`${t}.spawn 在 afterResolve 模式下需要 firstDelay 和 interval`);
    if (sp.overflow != null && sp.overflow !== 'defer') E.push(`${t}.spawn.overflow 目前只支持 "defer"`);
    if (lv.requestRate != null && !(num(lv.requestRate) && lv.requestRate >= 0 && lv.requestRate <= 1)) E.push(`${t}.requestRate 应为 0–1`);
    if (!Array.isArray(lv.orders) || !lv.orders.length) E.push(`${t}.orders 缺失或为空`);
    else {
      let last = -Infinity;
      lv.orders.forEach((o, j) => {
        const ot = `${t}.orders[${j}]`;
        if (!o || !R?.[o.recipe]) E.push(`${ot}.recipe 不存在：${o && o.recipe}`);
        else if (Array.isArray(lv.recipes) && !lv.recipes.includes(o.recipe)) E.push(`${ot}.recipe ${o.recipe} 不在本关 recipes 中`);
        if (sp.mode === 'schedule') { if (!num(o?.at) || o.at < last) E.push(`${ot}.at 缺失或比上一单早`); else last = o.at; }
        if (o?.patience != null && (!num(o.patience) || o.patience <= 0)) E.push(`${ot}.patience 应为正数`);
        if (o?.request != null && o.request !== 'none' && !S.requests?.[o.request]) E.push(`${ot}.request 不认识：${o.request}（可用：${Object.keys(S.requests || {}).join(', ')}, none）`);
      });
    }
    const st = lv.stars || {};
    if (!num(st.two) || !num(st.three)) E.push(`${t}.stars.two / stars.three 缺失`);
    else if (st.three < st.two) E.push(`${t}.stars.three 应 ≥ stars.two`);
    if (lv.mistakes?.max != null && !(Number.isInteger(lv.mistakes.max) && lv.mistakes.max >= 0)) E.push(`${t}.mistakes.max 应为 ≥ 0 的整数`);
    const tu = lv.tutorial || {};
    if (tu.tempCap != null && !num(tu.tempCap)) E.push(`${t}.tutorial.tempCap 应为数字`);
    (tu.steps || []).forEach((s, j) => { if (!s.id || !s.waitFor?.event) E.push(`${t}.tutorial.steps[${j}] 需要 id 和 waitFor.event`); });
  });
  return E;
}

function rng(seedStr) { let h = 2166136261; for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }

export function normalize(d) {
  const seasoning = merge(DEFAULT_SEASONING, d.seasoning);
  const tuning = merge(DEFAULT_TUNING, d.tuning);
  const recipes = {};
  for (const [id, r] of Object.entries(d.recipes)) {
    recipes[id] = {
      id, name: r.name,
      steps: r.steps.map((s) => ({ ...s, taps: s.taps ?? (s.type === 'oil' || s.type === 'garnish' ? 1 : undefined), count: s.type === 'toss' ? (s.count ?? 2) : undefined })),
      temp: merge(DEFAULT_TEMP, r.temp), rates: merge(DEFAULT_RATES, r.rates), judge: merge(DEFAULT_JUDGE, r.judge),
      patience: r.patience ?? 30, refTime: r.refTime ?? 0
    };
  }
  const reqKeys = Object.keys(seasoning.requests || {});
  const levels = d.levels.map((lv, index) => {
    const rand = rng(`req:${lv.id}`);
    // 本关只要有一张订单显式写了 request，就视为“固定放置”，其余订单无要求、requestRate 不再生效（levels-notes §3）
    const fixed = lv.orders.some((o) => o.request != null);
    const rate = fixed ? 0 : (lv.requestRate ?? (index === 0 ? 0 : 0.3));
    return {
      index, id: lv.id, name: lv.name, description: lv.description || '',
      timeLimit: lv.timeLimit || 0,
      recipes: lv.recipes.slice(),
      pots: lv.kitchen.pots, plates: lv.kitchen.plates, washTime: lv.kitchen.washTime ?? DEFAULT_KITCHEN.washTime,
      maxConcurrent: lv.maxConcurrentOrders,
      spawn: { overflow: 'defer', ...lv.spawn },
      requestRate: rate, requestsFixed: fixed,
      orders: lv.orders.map((o, i) => ({
        index: i, recipe: o.recipe, at: o.at ?? 0, tutorial: !!o.tutorial,
        // 客人要求：订单 request 优先（none = 明确无要求）；没写时按 requestRate 抽（同一关固定种子，可复现）；教学单无要求
        request: o.request != null ? (o.request === 'none' ? null : o.request) : (!o.tutorial && reqKeys.length && rand() < rate ? reqKeys[Math.floor(rand() * reqKeys.length)] : null),
        // 耐心优先级：订单 > 关卡[菜] > 菜品 > 30
        patience: o.patience ?? lv.patience?.[o.recipe] ?? recipes[o.recipe].patience ?? 30,
        refTime: lv.refTime?.[o.recipe] ?? recipes[o.recipe].refTime ?? 0
      })),
      scoring: { ...DEF_SCORING, ...(lv.scoring || {}) },
      mistakes: { ...DEF_MISTAKES, ...(lv.mistakes || {}) },
      stars: { ...lv.stars },
      tutorial: {
        skipIfDone: lv.tutorial?.skipIfDone ?? true,
        tempCap: lv.tutorial?.tempCap ?? DEFAULT_TUTORIAL_TEMP_CAP,
        steps: lv.tutorial?.steps || [],
        hints: (lv.tutorial?.hints || []).map((h) => ({ duration: 3, delay: 0, once: true, ...h }))
      }
    };
  });
  return { recipes, levels, seasoning, tuning };
}

export async function loadLevels(url) {
  let raw;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return { ok: false, errors: [`无法读取 ${url}（HTTP ${res.status}）`] };
    const text = await res.text();
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, errors: [`${url} 不是合法 JSON：${e.message}`] }; }
  } catch (e) { return { ok: false, errors: [`读取 ${url} 失败：${e.message}`] }; }
  const errors = validate(raw);
  if (errors.length) return { ok: false, errors };
  return { ok: true, data: normalize(raw), raw };
}
