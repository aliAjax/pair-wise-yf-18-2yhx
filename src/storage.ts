// 浏览器存档：localStorage 持久化，刷新保留
import { BenchState, seedState } from "./rules";

const KEY = "gem-facet-rework-bench-v1";

export function loadState(): BenchState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const seeded = seedState();
      saveState(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as BenchState;
    if (!parsed.orders || !parsed.gems || !Array.isArray(parsed.reports)) {
      throw new Error("存档结构不完整");
    }
    return parsed;
  } catch (err) {
    console.warn("读取存档失败，回退预置数据：", err);
    const seeded = seedState();
    saveState(seeded);
    return seeded;
  }
}

export function saveState(state: BenchState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error("写入存档失败：", err);
  }
}

export function resetState(): BenchState {
  const seeded = seedState();
  saveState(seeded);
  return seeded;
}
