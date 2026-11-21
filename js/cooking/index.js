// 烹饪模块注册表。订单 / 计分 / 结算 / 教学只依赖 cooking/README.md 定义的接口，不关心具体玩法。
// 换玩法：在 cooking/ 下新建模块实现同样接口，注册到 REGISTRY，再改 config.js 的 COOKING_MODULE。
import { WokCooking } from './wok/index.js?v=v0.2.3';

const REGISTRY = { wok: WokCooking };

export function createCooking(name) {
  const C = REGISTRY[name];
  if (!C) throw new Error(`未知的烹饪模块：${name}`);
  return new C();
}
