// 业务文件一：领域规则、类型与预置数据
// 宝石刻面返工迁移台 —— 改单尺寸后的逐颗迁移规则全部集中在此文件。

export type Shape = "圆形" | "椭圆" | "梨形" | "祖母绿切";
export type Role = "主石" | "配石";
export type Review = "已复核" | "未复核";

/** 改单：一道返工订单，规定外形、目标尺寸与主/配石位容量 */
export interface Order {
  id: string;
  name: string;
  createdAt: string; // ISO 开单时间，“最早缺品订单”按此排序
  shape: Shape;
  size: number; // 毫米
  mainSlots: number; // 主石位
  sideSlots: number; // 配石位
}

/** 已分拣宝石：外形、毫米尺寸、缺陷复核状态、主配石位、当前所在改单 */
export interface Gem {
  id: string;
  shape: Shape;
  size: number; // 毫米
  review: Review;
  role: Role;
  orderId: string;
}

/** 留在原点、计入待处理的宝石 */
export interface PendingEntry {
  gemId: string;
  orderId: string;
  reason: string;
  at: string;
}

export interface PlannedMove {
  gemId: string;
  role: Role;
  targetOrderId: string;
  diff: number;
}

export interface Conflict {
  orderId: string;
  role: Role;
  capacity: number;
  required: number;
  gemIds: string[];
}

export interface MigrationReport {
  at: string;
  orderId: string;
  orderName: string;
  oldSize: number;
  newSize: number;
  moves: PlannedMove[];
  pending: { gemId: string; reason: string }[];
  conflicts: Conflict[];
  aborted: boolean;
  summary: string;
}

export interface StationState {
  orders: Order[];
  gems: Gem[];
  pending: PendingEntry[];
  logs: MigrationReport[];
}

/** 尺寸差阈值：超过 0.15 毫米不迁移 */
export const SIZE_TOLERANCE = 0.15;
const LOG_LIMIT = 30;

export const fmtMm = (n: number): string => `${n.toFixed(2)}mm`;

/* ---------------------------------- 预置数据 ---------------------------------- */

export function createInitialState(): StationState {
  const orders: Order[] = [
    { id: "GD-101", name: "「蓝莲」吊坠返工", createdAt: "2026-09-15T09:00:00.000Z", shape: "椭圆", size: 6.0, mainSlots: 1, sideSlots: 4 },
    { id: "GD-102", name: "「晨星」戒指返工", createdAt: "2026-09-16T09:00:00.000Z", shape: "圆形", size: 4.0, mainSlots: 1, sideSlots: 6 },
    { id: "GD-103", name: "「翠谷」手链返工", createdAt: "2026-09-17T09:00:00.000Z", shape: "椭圆", size: 6.1, mainSlots: 1, sideSlots: 4 },
    { id: "GD-104", name: "「梨云」耳坠返工", createdAt: "2026-09-18T09:00:00.000Z", shape: "梨形", size: 7.0, mainSlots: 2, sideSlots: 4 },
    { id: "GD-105", name: "「藤影」胸针返工", createdAt: "2026-09-19T09:00:00.000Z", shape: "祖母绿切", size: 6.5, mainSlots: 1, sideSlots: 4 },
  ];

  // 十六颗已分拣宝石（GD-103 主石位空缺，为最早的缺品订单）
  const gems: Gem[] = [
    { id: "ST-2041", shape: "椭圆", size: 6.0, review: "已复核", role: "主石", orderId: "GD-101" },
    { id: "ST-2042", shape: "椭圆", size: 6.02, review: "已复核", role: "配石", orderId: "GD-101" },
    { id: "ST-2043", shape: "椭圆", size: 5.98, review: "已复核", role: "配石", orderId: "GD-101" },
    { id: "ST-2044", shape: "椭圆", size: 6.05, review: "未复核", role: "配石", orderId: "GD-101" },
    { id: "ST-2045", shape: "椭圆", size: 5.85, review: "已复核", role: "配石", orderId: "GD-101" },

    { id: "ST-2061", shape: "圆形", size: 4.0, review: "已复核", role: "主石", orderId: "GD-102" },
    { id: "ST-2062", shape: "圆形", size: 4.02, review: "已复核", role: "配石", orderId: "GD-102" },
    { id: "ST-2063", shape: "圆形", size: 3.98, review: "已复核", role: "配石", orderId: "GD-102" },
    { id: "ST-2064", shape: "圆形", size: 4.05, review: "未复核", role: "配石", orderId: "GD-102" },

    { id: "ST-2082", shape: "椭圆", size: 6.08, review: "已复核", role: "配石", orderId: "GD-103" },
    { id: "ST-2083", shape: "椭圆", size: 6.12, review: "已复核", role: "配石", orderId: "GD-103" },

    { id: "ST-2091", shape: "梨形", size: 7.0, review: "已复核", role: "主石", orderId: "GD-104" },
    { id: "ST-2092", shape: "梨形", size: 6.95, review: "已复核", role: "主石", orderId: "GD-104" },
    { id: "ST-2093", shape: "梨形", size: 7.06, review: "已复核", role: "配石", orderId: "GD-104" },

    { id: "ST-2101", shape: "祖母绿切", size: 6.5, review: "已复核", role: "主石", orderId: "GD-105" },
    { id: "ST-2102", shape: "祖母绿切", size: 6.46, review: "已复核", role: "配石", orderId: "GD-105" },
  ];

  return { orders, gems, pending: [], logs: [] };
}

/* ---------------------------------- 槽位核算 ---------------------------------- */

export const slotCapacity = (order: Order, role: Role): number =>
  role === "主石" ? order.mainSlots : order.sideSlots;

export function roleCount(gems: Gem[], orderId: string, role: Role): number {
  return gems.reduce((n, g) => (g.orderId === orderId && g.role === role ? n + 1 : n), 0);
}

export function vacancies(order: Order, gems: Gem[], role: Role): number {
  return slotCapacity(order, role) - roleCount(gems, order.id, role);
}

/* ---------------------------------- 迁移规则 ---------------------------------- */

interface RankedOrder {
  order: Order;
  diff: number;
}

/** 候选目标排序：尺寸差最小优先，差值相同按开单时间最早，再按单号 */
function rankCandidates(gem: Gem, source: Order, state: StationState): RankedOrder[] {
  return state.orders
    .filter((o) => o.id !== source.id && o.shape === gem.shape)
    .map((order) => ({ order, diff: Math.abs(order.size - gem.size) }))
    .sort((a, b) => {
      if (a.diff !== b.diff) return a.diff - b.diff;
      const ta = Date.parse(a.order.createdAt);
      const tb = Date.parse(b.order.createdAt);
      if (ta !== tb) return ta - tb;
      return a.order.id.localeCompare(b.order.id);
    });
}

/**
 * 改单尺寸后：原订单上的宝石逐颗独立选取目标（最早缺品订单中尺寸差最小者），
 * 再统一校验占用。任一冲突则整次不迁。
 */
export function resizeAndMigrate(
  prev: StationState,
  orderId: string,
  newSize: number,
  now: string = new Date().toISOString()
): StationState {
  const source = prev.orders.find((o) => o.id === orderId);
  if (!source || !Number.isFinite(newSize) || newSize <= 0) return prev;

  const sourceGems = prev.gems
    .filter((g) => g.orderId === orderId)
    .sort((a, b) => a.id.localeCompare(b.id));

  const moves: PlannedMove[] = [];
  const pendingResults: { gemId: string; reason: string }[] = [];

  // 第一阶段：逐颗出方案（只依据当前占用，不预占）
  for (const gem of sourceGems) {
    if (gem.review !== "已复核") {
      pendingResults.push({ gemId: gem.id, reason: "缺陷未复核，留原点待处理" });
      continue;
    }

    const ranked = rankCandidates(gem, source, prev);
    if (ranked.length === 0) {
      pendingResults.push({ gemId: gem.id, reason: "无同形改单可接收，留原点待处理" });
      continue;
    }

    const nearest = ranked[0];
    const open = ranked.find((r) => vacancies(r.order, prev.gems, gem.role) > 0);
    if (!open) {
      pendingResults.push({
        gemId: gem.id,
        reason: `同形订单${gem.role}位均满（最近差值 ${fmtMm(nearest.diff)}），留原点待处理`,
      });
      continue;
    }
    if (open.diff > SIZE_TOLERANCE) {
      pendingResults.push({
        gemId: gem.id,
        reason: `最早缺品订单尺寸差 ${fmtMm(open.diff)}，超出 ${fmtMm(SIZE_TOLERANCE)}，留原点待处理`,
      });
      continue;
    }

    moves.push({ gemId: gem.id, role: gem.role, targetOrderId: open.order.id, diff: open.diff });
  }

  // 第二阶段：统一校验占用冲突 / 主石超额
  const movingIds = new Set(moves.map((m) => m.gemId));
  const conflicts: Conflict[] = [];
  for (const role of ["主石", "配石"] as Role[]) {
    const targets = new Set(moves.filter((m) => m.role === role).map((m) => m.targetOrderId));
    for (const targetId of targets) {
      const target = prev.orders.find((o) => o.id === targetId)!;
      const capacity = slotCapacity(target, role);
      const staying = prev.gems.filter(
        (g) => g.orderId === targetId && g.role === role && !movingIds.has(g.id)
      ).length;
      const incoming = moves.filter((m) => m.targetOrderId === targetId && m.role === role);
      const required = staying + incoming.length;
      if (required > capacity) {
        conflicts.push({
          orderId: targetId,
          role,
          capacity,
          required,
          gemIds: incoming.map((m) => m.gemId),
        });
      }
    }
  }

  const aborted = conflicts.length > 0;
  const summary = aborted
    ? `占用冲突（${conflicts
        .map((c) => `${c.orderId} ${c.role}位需 ${c.required} 颗、容量 ${c.capacity}`)
        .join("；")}），整次不迁，全部宝石留原点。`
    : `迁往 ${moves.length} 颗，${pendingResults.length} 颗留原点计入待处理。`;

  const report: MigrationReport = {
    at: now,
    orderId: source.id,
    orderName: source.name,
    oldSize: source.size,
    newSize,
    moves,
    pending: pendingResults,
    conflicts,
    aborted,
    summary,
  };

  // 尺寸无论是否冲突都落单；冲突时不动宝石、不动待处理
  const orders = prev.orders.map((o) => (o.id === orderId ? { ...o, size: newSize } : o));

  let gems = prev.gems;
  let pending = prev.pending;
  if (!aborted) {
    gems = prev.gems.map((g) => {
      const move = moves.find((m) => m.gemId === g.id);
      return move ? { ...g, orderId: move.targetOrderId } : g;
    });
    // 原单宝石本批次重新评估，旧待处理记录先清再立
    const sourceIds = new Set(sourceGems.map((g) => g.id));
    pending = [
      ...prev.pending.filter((p) => !sourceIds.has(p.gemId)),
      ...pendingResults.map((p) => ({ gemId: p.gemId, orderId, reason: p.reason, at: now })),
    ];
  }

  return { orders, gems, pending, logs: [report, ...prev.logs].slice(0, LOG_LIMIT) };
}

/** 复核动作：仅切换缺陷复核状态，不触发迁移；复核通过后撤销其“未复核”待处理标记 */
export function setReview(prev: StationState, gemId: string, review: Review): StationState {
  const gems = prev.gems.map((g) => (g.id === gemId ? { ...g, review } : g));
  const pending =
    review === "已复核"
      ? prev.pending.filter((p) => !(p.gemId === gemId && p.reason.startsWith("缺陷未复核")))
      : prev.pending;
  return { ...prev, gems, pending };
}
