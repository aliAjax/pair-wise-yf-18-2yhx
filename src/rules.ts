// 业务规则：数据类型、预置改单与宝石、迁移引擎
// 规则：改单尺寸后，原订单宝石逐颗候选，优先迁往「最早缺品订单」中尺寸差最小的石位；
// 尺寸差 > 0.15mm 或缺陷未复核 → 留原点并计入待处理（软留）；
// 出现占用冲突（配石位满）或主石超额（主石位已有主石）→ 整次不迁（硬阻断，全部回滚）。

export type Shape = "圆形" | "椭圆" | "梨形" | "祖母绿切";
export type Role = "主石" | "配石";

export interface Order {
  id: string;
  customer: string;
  date: string; // YYYY-MM-DD，判定「最早」缺品订单
  mainShape: Shape;
  mainMm: number; // 主石目标尺寸（可被改单修改）
  sideShape: Shape;
  sideMm: number; // 配石目标尺寸
  sideNeed: number; // 配石石位数
}

export interface Gem {
  id: string;
  shape: Shape;
  mm: number;
  reviewed: boolean; // 缺陷复核状态
  role: Role;
  orderId: string | null; // 主配石位所在订单；null = 待处理（未分拣）
  held: boolean; // true = 留在原点并计入待处理（含未分拣）
}

export type MigrationStatus = "migrated" | "blocked";

export interface PlanItem {
  gemId: string;
  role: Role;
  targetOrderId: string | null;
  diff: number | null;
  outcome: "moved" | "held-size" | "held-review";
  note: string;
}

export interface Report {
  key: string;
  sourceOrderId: string;
  changedAt: string;
  mainFrom: number;
  mainTo: number;
  status: MigrationStatus;
  blockedReason: string | null;
  items: PlanItem[];
}

export interface BenchState {
  orders: Order[];
  gems: Gem[];
  reports: Report[];
}

export const SIZE_LIMIT = 0.15; // 毫米
export const MAIN_QUOTA = 1; // 每单一主石位

// ---------- 预置数据：五张改单 ----------
export function seedState(): BenchState {
  const orders: Order[] = [
    {
      id: "GD-301",
      customer: "盈福珠宝 · 椭圆主戒（缺主石）",
      date: "2026-08-02",
      mainShape: "椭圆",
      mainMm: 9.5,
      sideShape: "圆形",
      sideMm: 2.0,
      sideNeed: 4,
    },
    {
      id: "GD-302",
      customer: "锦澜金行 · 圆钻围镶（缺主石）",
      date: "2026-08-11",
      mainShape: "圆形",
      mainMm: 6.5,
      sideShape: "圆形",
      sideMm: 1.5,
      sideNeed: 4,
    },
    {
      id: "GD-303",
      customer: "翠珑阁 · 祖母绿套链（满员）",
      date: "2026-08-20",
      mainShape: "祖母绿切",
      mainMm: 7.0,
      sideShape: "梨形",
      sideMm: 4.0,
      sideNeed: 2,
    },
    {
      id: "GD-304",
      customer: "珊瑚艺廊 · 梨形坠（缺一配石）",
      date: "2026-09-01",
      mainShape: "梨形",
      mainMm: 9.0,
      sideShape: "圆形",
      sideMm: 1.8,
      sideNeed: 2,
    },
    {
      id: "GD-305",
      customer: "宝源定制 · 椭圆排戒（返工源单）",
      date: "2026-09-08",
      mainShape: "椭圆",
      mainMm: 9.5,
      sideShape: "圆形",
      sideMm: 2.0,
      sideNeed: 4,
    },
  ];

  // ---------- 十六颗已分拣宝石：外形 / 毫米尺寸 / 缺陷复核 / 主配石位 ----------
  const gems: Gem[] = [
    // GD-301：主石缺品，配石 2/4；另有 1 颗未复核留原点待处理
    { id: "S-01", shape: "圆形", mm: 2.02, reviewed: true, role: "配石", orderId: "GD-301", held: false },
    { id: "S-02", shape: "圆形", mm: 1.98, reviewed: true, role: "配石", orderId: "GD-301", held: false },
    { id: "S-16", shape: "圆形", mm: 2.01, reviewed: false, role: "配石", orderId: "GD-301", held: true },
    // GD-302：主石缺品，配石 2/4
    { id: "S-03", shape: "圆形", mm: 1.51, reviewed: true, role: "配石", orderId: "GD-302", held: false },
    { id: "S-04", shape: "圆形", mm: 1.49, reviewed: true, role: "配石", orderId: "GD-302", held: false },
    // GD-303：主配石满员
    { id: "S-05", shape: "祖母绿切", mm: 7.02, reviewed: true, role: "主石", orderId: "GD-303", held: false },
    { id: "S-06", shape: "梨形", mm: 4.02, reviewed: true, role: "配石", orderId: "GD-303", held: false },
    { id: "S-07", shape: "梨形", mm: 3.98, reviewed: true, role: "配石", orderId: "GD-303", held: false },
    // GD-304：主石在位，配石缺 1 位
    { id: "S-08", shape: "梨形", mm: 9.02, reviewed: true, role: "主石", orderId: "GD-304", held: false },
    { id: "S-09", shape: "圆形", mm: 1.79, reviewed: true, role: "配石", orderId: "GD-304", held: false },
    // GD-305：返工源单。S-11 为分拣时多入的第二颗椭圆主石（未复核）；S-14 未复核
    { id: "S-10", shape: "椭圆", mm: 9.48, reviewed: true, role: "主石", orderId: "GD-305", held: false },
    { id: "S-11", shape: "椭圆", mm: 9.52, reviewed: false, role: "主石", orderId: "GD-305", held: false },
    { id: "S-12", shape: "圆形", mm: 2.03, reviewed: true, role: "配石", orderId: "GD-305", held: false },
    { id: "S-13", shape: "圆形", mm: 1.99, reviewed: true, role: "配石", orderId: "GD-305", held: false },
    { id: "S-14", shape: "圆形", mm: 2.0, reviewed: false, role: "配石", orderId: "GD-305", held: false },
    { id: "S-15", shape: "圆形", mm: 2.2, reviewed: true, role: "配石", orderId: "GD-305", held: false },
  ];

  return { orders, gems, reports: [] };
}

// ---------- 缺品判定 ----------
export function occupied(state: BenchState, orderId: string, role: Role): number {
  return state.gems.filter(
    (g) => g.orderId === orderId && g.role === role && !g.held
  ).length;
}

export function freeSeats(state: BenchState, orderId: string, role: Role): number {
  if (role === "主石") {
    return Math.max(0, MAIN_QUOTA - occupied(state, orderId, "主石"));
  }
  const order = orderById(state, orderId);
  if (!order) return 0;
  return Math.max(0, order.sideNeed - occupied(state, orderId, "配石"));
}

/** 缺品订单：仍有未占石位（最早 = date 升序，同日期按单号） */
export function deficitOrders(state: BenchState, excludeId?: string): Order[] {
  return state.orders
    .filter((o) => o.id !== excludeId)
    .filter((o) => freeSeats(state, o.id, "主石") > 0 || freeSeats(state, o.id, "配石") > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function orderById(state: BenchState, id: string): Order | undefined {
  return state.orders.find((o) => o.id === id);
}

interface Seat {
  order: Order;
  role: Role;
  shape: Shape;
  target: number;
}

function buildSeats(work: BenchState, targets: Order[]): Seat[] {
  const seats: Seat[] = [];
  for (const o of targets) {
    const mains = freeSeats(work, o.id, "主石");
    for (let i = 0; i < mains; i++) {
      seats.push({ order: o, role: "主石", shape: o.mainShape, target: o.mainMm });
    }
    const sides = freeSeats(work, o.id, "配石");
    for (let i = 0; i < sides; i++) {
      seats.push({ order: o, role: "配石", shape: o.sideShape, target: o.sideMm });
    }
  }
  // 最早缺品订单优先；同一订单内主石位在前（尺寸差最小在候选排序时决定）
  return seats;
}

/**
 * 执行一次返工迁移。
 * 改单尺寸后，从原订单逐颗迁往最早缺品订单：
 *  - 候选 = 缺陷已复核 且 与空位外形/主配角色一致 且 尺寸差 ≤ 0.15mm；
 *  - 优先尺寸差最小，同级时按订单日期最早、单号、宝石编号；
 *  - 超 0.15mm 或缺陷未复核 → 留原点、计入待处理（软留，不阻断）；
 *  - 合格宝石无空位可去 → 配石位满为「占用冲突」，主石位满为「主石超额」，整次不迁并回滚。
 */
export function runMigration(
  prev: BenchState,
  sourceOrderId: string,
  mainTo: number
): { state: BenchState; report: Report } {
  const source = orderById(prev, sourceOrderId);
  if (!source) {
    throw new Error(`未找到订单 ${sourceOrderId}`);
  }
  const mainFrom = source.mainMm;

  // 尺寸改单先生效（即使整次不迁，尺寸修改仍然保留，宝石全部回原点）
  const orders = prev.orders.map((o) =>
    o.id === sourceOrderId ? { ...o, mainMm: mainTo } : o
  );
  const work: BenchState = { ...prev, orders };

  // 从原订单释放的逐颗宝石（保持分拣顺序）；原本待处理的宝石不参与本次迁移
  const pool = prev.gems.filter((g) => g.orderId === sourceOrderId);

  const targets = deficitOrders(work, sourceOrderId);
  const seats = buildSeats(work, targets);

  const occupiedSeats = new Set<string>();
  const assignments = new Map<string, Seat>(); // gemId -> seat

  // 每颗宝石找最佳空位（尺寸差最小）
  function bestSeat(gem: Gem): { seat: Seat; diff: number } | null {
    let best: { seat: Seat; diff: number } | null = null;
    seats.forEach((seat, idx) => {
      if (occupiedSeats.has(String(idx))) return;
      if (seat.shape !== gem.shape || seat.role !== gem.role) return;
      const diff = Math.abs(seat.target - gem.mm);
      // seats 已按「最早缺品订单 → 同单主石位优先」排序，平局保留先出现的空位
      if (!best || diff < best.diff) {
        best = { seat, diff };
      }
    });
    return best;
  }

  // 第一阶段：筛出软留（未复核 / 最小尺寸差超 0.15），其余为合格候选
  interface Qualified {
    gem: Gem;
    minDiff: number;
    nearest: Seat;
  }
  const qualified: Qualified[] = [];
  const soft: PlanItem[] = [];

  for (const gem of pool) {
    if (!gem.reviewed) {
      soft.push({
        gemId: gem.id,
        role: gem.role,
        targetOrderId: null,
        diff: null,
        outcome: "held-review",
        note: "缺陷未复核，留原点计入待处理",
      });
      continue;
    }
    const found = bestSeat(gem);
    if (!found || found.diff > SIZE_LIMIT + 1e-9) {
      soft.push({
        gemId: gem.id,
        role: gem.role,
        targetOrderId: found ? found.seat.order.id : null,
        diff: found ? round2(found.diff) : null,
        outcome: "held-size",
        note: found
          ? `最近缺口 ${found.seat.order.id}·${found.seat.role} 尺寸差 ${found.diff.toFixed(
              2
            )}mm > 0.15mm，留原点`
          : "无外形/主配角色相符的缺品石位，留原点",
      });
      continue;
    }
    qualified.push({ gem, minDiff: found.diff, nearest: found.seat });
  }

  // 优先尺寸差最小（同级：最早订单 → 单号 → 石位角色 → 宝石编号）
  qualified.sort((a, b) => {
    if (a.minDiff !== b.minDiff) return a.minDiff - b.minDiff;
    const d = a.nearest.order.date.localeCompare(b.nearest.order.date);
    if (d !== 0) return d;
    if (a.nearest.order.id !== b.nearest.order.id) {
      return a.nearest.order.id.localeCompare(b.nearest.order.id);
    }
    if (a.nearest.role !== b.nearest.role) {
      return a.nearest.role === "主石" ? -1 : 1;
    }
    return a.gem.id.localeCompare(b.gem.id);
  });

  // 第二阶段：逐颗在「仍空位」中重选最佳石位；合格宝石无位可去 → 整次不迁
  let blockedReason: string | null = null;
  let blockerGem: Gem | null = null;

  for (const q of qualified) {
    let pickIdx = -1;
    let pickDiff = Infinity;
    let nearestIdx = -1;
    let nearestDiff = Infinity;
    seats.forEach((seat, idx) => {
      if (occupiedSeats.has(String(idx))) return;
      if (seat.shape !== q.gem.shape || seat.role !== q.gem.role) return;
      const diff = Math.abs(seat.target - q.gem.mm);
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestIdx = idx;
      }
      if (diff <= SIZE_LIMIT + 1e-9 && diff < pickDiff) {
        pickDiff = diff;
        pickIdx = idx;
      }
    });
    if (pickIdx === -1) {
      blockerGem = q.gem;
      if (q.gem.role === "主石") {
        blockedReason =
          nearestIdx === -1
            ? `主石超额：${q.gem.id} 已无相符的空主石位`
            : `主石超额：${q.gem.id} 尺寸差 ≤0.15mm 的主石位均已被占用`;
      } else {
        const nearest = nearestIdx >= 0 ? seats[nearestIdx] : null;
        blockedReason =
          nearest && nearestDiff > SIZE_LIMIT + 1e-9
            ? `占用冲突：${q.gem.id} 尺寸差 ≤0.15mm 的配石位均已被占用（最近余位 ${nearest.order.id} 差 ${nearestDiff.toFixed(
                2
              )}mm）`
            : `占用冲突：${q.gem.id} 相符配石位均已被占用`;
      }
      break;
    }
    occupiedSeats.add(String(pickIdx));
    assignments.set(q.gem.id, seats[pickIdx]);
  }

  const now = new Date();
  const baseReport: Omit<Report, "status" | "blockedReason" | "items"> = {
    key: `${sourceOrderId}-${now.getTime()}`,
    sourceOrderId,
    changedAt: now.toLocaleString("zh-CN", { hour12: false }),
    mainFrom,
    mainTo,
  };

  if (blockedReason && blockerGem) {
    // 整次不迁：尺寸修改保留，全部宝石回滚到原订单
    const items: PlanItem[] = pool.map((gem) => {
      if (!gem.reviewed) {
        return {
          gemId: gem.id,
          role: gem.role,
          targetOrderId: null,
          diff: null,
          outcome: "held-review",
          note: "缺陷未复核（整次不迁，随单回滚）",
        };
      }
      const s = seats
        .filter((st) => st.shape === gem.shape && st.role === gem.role)
        .map((st) => ({ seat: st, diff: Math.abs(st.target - gem.mm) }))
        .sort((a, b) => a.diff - b.diff)[0];
      const caused = gem.id === blockerGem!.id;
      const reason =
        gem.role === "主石" ? "主石位已满（主石超额）" : "配石位已满（占用冲突）";
      return {
        gemId: gem.id,
        role: gem.role,
        targetOrderId: s ? s.seat.order.id : null,
        diff: s ? round2(s.diff) : null,
        outcome: "held-size",
        note: s
          ? caused
            ? `${s.seat.order.id}·${s.seat.role}（差 ${s.diff.toFixed(2)}mm）${reason}，整次不迁`
            : `拟往 ${s.seat.order.id}·${s.seat.role}（差 ${s.diff.toFixed(
                2
              )}mm），因整次不迁随单回滚`
          : "无相符缺口，整次不迁随单回滚",
      };
    });
    const report: Report = {
      ...baseReport,
      status: "blocked",
      blockedReason,
      items,
    };
    return { state: { ...work, reports: [report, ...prev.reports] }, report };
  }

  // 提交迁移
  const gems = prev.gems.map((g) => {
    const seat = assignments.get(g.id);
    if (seat) {
      return { ...g, orderId: seat.order.id, held: false };
    }
    const isPool = pool.some((p) => p.id === g.id);
    if (isPool) {
      // 软留：留在原点（源单），计入待处理
      return { ...g, orderId: sourceOrderId, held: true };
    }
    return g;
  });

  const moved: PlanItem[] = qualified
    .filter((q) => assignments.has(q.gem.id))
    .map((q) => {
      const seat = assignments.get(q.gem.id)!;
      const diff = Math.abs(seat.target - q.gem.mm);
      return {
        gemId: q.gem.id,
        role: q.gem.role,
        targetOrderId: seat.order.id,
        diff: round2(diff),
        outcome: "moved",
        note: `${q.gem.id} → ${seat.order.id}·${seat.role}（${seat.shape} ${seat.target.toFixed(
          2
        )}mm，差 ${diff.toFixed(2)}mm）`,
      };
    });

  const report: Report = {
    ...baseReport,
    status: "migrated",
    blockedReason: null,
    items: [...moved, ...soft],
  };

  return {
    state: { orders, gems, reports: [report, ...prev.reports] },
    report,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function stats(state: BenchState) {
  const movedTotal = state.reports
    .filter((r) => r.status === "migrated")
    .reduce((n, r) => n + r.items.filter((i) => i.outcome === "moved").length, 0);
  const heldTotal = state.gems.filter((g) => g.held).length;
  return {
    orders: state.orders.length,
    gems: state.gems.length,
    deficit: deficitOrders(state).length,
    held: heldTotal,
    runs: state.reports.length,
    blocked: state.reports.filter((r) => r.status === "blocked").length,
    moved: movedTotal,
  };
}
