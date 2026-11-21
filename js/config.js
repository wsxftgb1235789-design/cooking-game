// 全局常量。版本号只在这里改。
export const VERSION = 'v0.2.3';
export const COOKING_MODULE = 'wok';

// 逻辑设计分辨率（20:9）。布局全部用这个坐标系，渲染时等比缩放到安全区内。
export const DESIGN_W = 915; // = ui/ui-spec.md 基准视口
export const DESIGN_H = 412;

// 缓存版本：所有运行时加载的资源 URL 都带 ?v=<VERSION>（换版本 → 新 URL → 绕过浏览器/CDN 旧缓存）
export const ASSET_QUERY = `v=${encodeURIComponent(VERSION)}`;
export function withV(url) { return url + (url.includes('?') ? '&' : '?') + ASSET_QUERY; }
export const LEVELS_URL = withV('levels/levels.json');
export const MAX_FRAME_DT = 0.05; // 单帧 dt 上限（秒），防止卡顿/切回前台时跳变

// localStorage 键
export const STORE = { tutorialDone: 'cg.tutorialDone', sound: 'cg.sound', progress: 'cg.progress' };

// ---- 美术：assets/img/<name>.png（只拷贝/加载 rules v0.2 用得到的，废弃的煎蛋/青菜/平底锅/熟度条不加载）----
export const IMAGES = [
  'counter_tile', 'plate', 'trash_bin',
  'wok_body', 'wok_handle', 'wok_toss_01', 'wok_toss_02', 'wok_toss_03', 'wok_toss_04', 'handle_track',
  'thermo_frame', 'thermo_fill', 'thermo_needle', 'flame_low', 'flame_medium', 'flame_high',
  'oil_bottle', 'egg_raw', 'rice_bowl', 'chili_garlic', 'clams_bowl', 'salt_shaker', 'sauce_bottle', 'scallion_bowl',
  'fried_rice_raw', 'fried_rice_cooked', 'fried_rice_burnt', 'clams_raw', 'clams_cooked', 'clams_burnt', 'dish_fried_rice', 'dish_clams',
  'smoke_01', 'smoke_02', 'smoke_03', 'smoke_04', 'smoke_black_01', 'smoke_black_02', 'smoke_black_03', 'smoke_black_04',
  'wash_steam_01', 'wash_steam_02', 'wash_steam_03', 'wash_steam_04', 'fx_sequence_stars_01', 'fx_sequence_stars_02', 'fx_sequence_stars_03',
  'ui_bubble_less_salt', 'ui_bubble_more_salt', 'ui_order_card', 'ui_patience_bar_frame', 'ui_patience_fill_green', 'ui_patience_fill_yellow', 'ui_patience_fill_red',
  'ui_pause', 'ui_sound_on', 'ui_sound_off', 'ui_star_bright', 'ui_star_dim', 'ui_results_panel', 'ui_button',
  'ui_tutorial_arrow_full', 'ui_tutorial_hint' // art v0.3.1 教学走廊箭头
];

// ---- 音效：事件名 → 文件主名（assets/audio/<name>.ogg|.mp3）。null = WebAudio 合成占位，以后放文件后改成文件名即可 ----
export const SOUNDS = {
  ignite: 'sfx_ignite', oil: 'sfx_pour_oil', drop_pan: 'sfx_drop_pan', toss: 'sfx_toss', season: 'sfx_season',
  smoke_warn: 'sfx_burn_warning', burnt: 'sfx_burnt', ready: 'sfx_ready',
  order_new: 'sfx_order_new', order_success: 'sfx_order_success', order_timeout: 'sfx_order_timeout',
  result_win: 'sfx_level_clear', result_fail: 'sfx_level_fail', click: 'sfx_tap',
  sizzle_low: 'sfx_sizzle_low_loop', sizzle_high: 'sfx_sizzle_high_loop', // 循环（WebAudio 无缝 loop）
  mistake: null, reject: null, stir: null
};
