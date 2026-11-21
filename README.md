# 做饭闯关 · H5 原型（v0.2.3）

横屏手机网页游戏，纯 HTML5 Canvas + 原生 ES 模块，无构建步骤。规则：`docs/rules.md` v0.2.2；关卡格式：`levels/FORMAT.md`（formatVersion 2）；布局：`ui/layout.md` v0.2「最终坐标」（915×412），元素 id = `ui/ui-spec.md` 稳定 id。

## 运行

```bash
cd src && python3 -m http.server 8765 --bind 127.0.0.1   # 打开 http://127.0.0.1:8765/
```

## 目录

| 路径 | 说明 |
|---|---|
| `index.html` / `css/style.css` | 页面、竖屏提示、全屏按钮 |
| `js/main.js` | 入口：预加载（进度条）→ 读关卡 → 选关；主循环（累计 dt，单帧上限 0.05 s）；切后台 / 竖屏自动暂停；调试参数 |
| `js/config.js` | 版本号、`COOKING_MODULE`、图片清单 `IMAGES`、音效映射 `SOUNDS`（事件名 → 文件名，null = 合成占位） |
| `js/layout.js` | **所有界面坐标**（= ui/layout.md 最终坐标，注释里标了 ui-spec id）+ id 别名；锅柄抓取框、教学箭头位置也在这里 |
| `js/levels.js` | 关卡加载、校验（错误逐条上屏）、补默认值 |
| `js/scenes/level.js` | 通用关卡场景：订单、出餐判定、得分 / 失误、教学、提示、暂停、结算 |
| `js/scenes/menus.js` | 加载、配置错误、选关界面 |
| `js/cooking/` | **可替换的烹饪模块**，接口见 `js/cooking/README.md`；当前实现 `wok/`（rules v0.2.1） |
| `js/systems/` | 订单（模式 A/B、满员顺延）、计分、计时、教学 / 轻提示 |
| `js/audio.js` | WebAudio：首次触摸解锁；ogg 优先 mp3 回退；滋滋声用 buffer loop 无缝循环，暂停 / 关音效即停 |
| `js/input.js` | 指针事件 + pointer capture，**只认第一根手指** |
| `levels/levels.json` | 游戏实际读取的关卡（由脚本同步，不要手改） |
| `assets/img`, `assets/audio` | 素材副本（由脚本同步，不要手改） |
| `tools/sync-levels.sh` | 校验 `levels/levels.json`（没有则用 `levels.sample.json`）并拷到 `src/levels/` |
| `tools/sync-assets.sh` | 按 `config.js` 清单从 `art/` `audio/` 拷素材；清单外的旧文件（废弃的煎蛋 / 青菜等）从 `src/assets` 删除 |

改了关卡或素材后：`bash src/tools/sync-levels.sh && bash src/tools/sync-assets.sh`。

## 调试参数（不带参数时全部不显示）

| 参数 | 作用 |
|---|---|
| `?debug=1` | 每口锅（按 ui-spec id 标 `pan1`/`pan2`）显示 H、T、C、B、颠勺次数、调料档、顺序是否全对、最近一次手势判定（调火 / 画圈 / 装盘 → plate-N / 无效+原因）；画出 `panN-toss` 判定圈（r 20 / 85）、`panN-track-hit`、`plate-zone`；底部显示最近事件 |
| `?level=N` | 跳过选关直接进第 N 关（教学是否播放仍按 `tutorialDone`） |
| `?T=60&C=40&B=10` | 进关时预设锅 1（给了 C 或 B 时自动放入该关第一道菜的主料并记已倒油） |
| `?debugSpeed=N` | 游戏时间 ×N（只给自动化测试用） |

例：`http://127.0.0.1:8765/?debug=1&level=1&T=70&C=50&B=0`。清进度：浏览器控制台 `localStorage.clear()`。

## 测试钩子

`window.__game.state()`（场景快照，含 `cooking` 子快照）、`__game.rect(id)`（元素逻辑矩形，id 见 FORMAT §5.2）、`__game.toScreen(x, y)`。自测脚本：`/workspace/pwtest/v02.mjs`（Playwright，915×412 横屏触屏）。

## 本地存储

`cg.tutorialDone`、`cg.sound`、`cg.progress`（`{unlocked, best{关卡id:{score,stars}}}`）。

## 发布到公网（GitHub Pages）

```bash
bash src/tools/deploy.sh            # 同步关卡 → 构建 /workspace/deploy → commit（信息带版本号）→ push main → 等公网 VERSION 生效（最多约 5 分钟）
bash src/tools/deploy.sh --no-push  # 只构建部署副本，不提交
```

- 公网：https://wsxftgb1235789-design.github.io/cooking-game/（仓库 `wsxftgb1235789-design/cooking-game`，main 根目录；部署副本排除 `tools/`，保留 `.git`、`.nojekyll`）。
- 缓存：版本号只在 `js/config.js` 的 `VERSION` 改。
  - 运行时加载（levels.json、图片、音频、version.json）在源码里通过 `withV()` 带 `?v=<VERSION>`；
  - `index.html` 的 css / 入口 js / manifest 和所有 ES module 的相对 `import` 由 deploy.sh 在**部署副本**里加 `?v=<VERSION>`（源码不变，本地直接跑 src 不受影响），加完后校验没有漏掉的引用，漏一个就中止发布。
  - 版本自检：启动和切回前台时取 `version.json`（no-store），和已加载的 VERSION 不一致就在顶部提示「有新版本，点这里刷新」。
