# 烹饪模块接口（可整体替换）

关卡场景（`scenes/level.js`）只通过下面的接口和烹饪模块打交道。换玩法：在 `cooking/` 下新建模块实现同样方法，注册到 `cooking/index.js` 的 `REGISTRY`，再改 `config.js` 的 `COOKING_MODULE`。当前实现：`wok/`（rules v0.2.1）。

## 模块要实现的方法

| 方法 | 说明 |
|---|---|
| `init(level, station)` | `level` = 规范化后的关卡（`levels.js normalize`），`station` 见下 |
| `update(dt)` | 游戏 dt（暂停时场景不调用） |
| `render(ctx)` / `renderOverlay(ctx)` | 底层（锅、盘、调料架）/ 顶层（拖拽中的图标，画在指尖上方 48 px） |
| `pointerDown(ev)` → bool / `pointerMove(ev)` / `pointerUp(ev)` | `ev = {id, x, y, cancelled}`，逻辑坐标；down 返回 true 表示被模块接管 |
| `pause()` / `resume()` / `destroy()` | 暂停时丢弃进行中的手势、停循环音 |
| `setTempCap(cap)` | 教学温度上限（Infinity = 不限） |
| `setCookFrozen(bool)` | 教学阅读期：暂停熟度 / 焦度增长（温度照常） |
| `rectOf(id)` | 元素矩形，id 见 FORMAT §5.2（`pot:N` `potHandle:N` `potTrack:N` `thermometer:N` `strip:N` `plate:N` `plateArea` `plateZone:N` `source:*` `trash`） |
| `snapshot()` | 测试用状态 |
| `applyDebugPreset({T, C, B})` | `?T=&C=&B=` 调试预设 |

## station（场景提供给模块）

| 字段 | 说明 |
|---|---|
| `emit(name, data)` | 发事件（教学 / 提示 / 日志），事件表见 FORMAT §5.1 |
| `allows(ids)` | 教学强引导期间该操作是否允许（ids 任一在高亮内） |
| `orders()` | 场上订单数组（含 `recipe`、`request`、`left`、`index`） |
| `orderAt(x, y)` / `orderRect(order)` | 出餐命中 |
| `serve(dish, order)` → `{outcome, points}` | 出餐判定，见下 |
| `seasoningTarget(order)` | 该订单的目标调料档（request 的 level，否则 default） |
| `float(text, x, y, color)` | 飘字 |
| `recipes` / `seasoning` / `tuning` / `debug` | 规范化配置；`debug` = `?debug=1` |

## dish（模块交给 serve 的出餐对象）

```js
{ recipeId, quality: 'perfect'|'done'|'raw'|'burnt', seasoning: 0..3, seasoningSource: 'salt'|'sauce',
  orderCorrect: bool,   // 六步按顺序、拌匀（加调料后颠 ≥2）、爆香成功、没点错调料
  meta: { c, b } }
```

## outcome（场景按 rules §5 判定）

| outcome | 条件 | 得分 / 失误 | 模块应做 |
|---|---|---|---|
| `complete` | 菜对、熟 / 完美 | `(100 + 完美且调料对 50 + 顺序全对 20 + 剩余耐心整秒×2) × (调料对 ? 1 : 0.5)`；不算失误 | 清空盘子 |
| `returned` | 生 | rawReturnPenalty，失误 +1 | 盘子留着（可拖回空锅继续炒） |
| `rejected` | 焦 | −30，失误 +1 | 清空盘子（倒掉） |
| `wrong` | 菜送错 | 0 | 盘子留着 |
| `ignored` | 订单已结算 / 教学拦截 | 无 | 不动（防重复结算） |

教学单：不计分、不计失误。
