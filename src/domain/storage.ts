// 业务文件二：浏览器存档（localStorage 持久化，刷新保留）
import { createInitialState, type StationState } from "./rules";

const STORAGE_KEY = "facet-rework-station:v1";

export function loadState(): StationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as Partial<StationState>;
    // 结构兜底：缺字段则回退到初始数据
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.gems)) {
      return createInitialState();
    }
    return {
      orders: parsed.orders as StationState["orders"],
      gems: parsed.gems as StationState["gems"],
      pending: Array.isArray(parsed.pending) ? (parsed.pending as StationState["pending"]) : [],
      logs: Array.isArray(parsed.logs) ? (parsed.logs as StationState["logs"]) : [],
    };
  } catch {
    return createInitialState();
  }
}

export function saveState(state: StationState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默降级为内存态
  }
}

export function resetState(): StationState {
  const fresh = createInitialState();
  saveState(fresh);
  return fresh;
}
