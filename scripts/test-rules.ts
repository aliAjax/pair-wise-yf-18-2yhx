// 临时验证脚本：迁移规则语义断言
import { BenchState, seedState, runMigration, occupied, orderById } from "../src/rules";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("  PASS", msg);
  } else {
    failures++;
    console.error("  FAIL", msg);
  }
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function orderOf(state: BenchState, gemId: string) {
  return state.gems.find((g) => g.id === gemId)!;
}

function setReview(state: BenchState, gemId: string, v: boolean) {
  state.gems.find((x) => x.id === gemId)!.reviewed = v;
}

// 场景 A：默认改单 GD-305 9.5→8.0
{
  console.log("\n[场景A] 默认改单：3 颗迁走，S-15 尺寸超限软留，2 颗未复核软留");
  const st = seedState();
  const { state: next, report } = runMigration(st, "GD-305", 8.0);
  assert(report.status === "migrated", "状态 migrated");
  const moved = report.items.filter((i) => i.outcome === "moved");
  assert(moved.length === 3, `3 颗迁走（实际 ${moved.length}）`);
  assert(orderOf(next, "S-10").orderId === "GD-301", "S-10 → GD-301（最早缺品、唯一椭圆主石位）");
  // 配石合格顺序：S-13(1.99,Δ0.01) → S-12(2.03,Δ0.03)，都入 GD-301；GD-304 仅余 1.8 位
  assert(orderOf(next, "S-13").orderId === "GD-301", "S-13（Δ0.01 最小）→ GD-301");
  assert(orderOf(next, "S-12").orderId === "GD-301", "S-12（Δ0.03）→ GD-301");
  const s15 = orderOf(next, "S-15");
  assert(s15.orderId === "GD-305" && s15.held, "S-15（最近差 0.20）超 0.15 留原点待处理");
  assert(
    report.items.find((i) => i.gemId === "S-15")!.outcome === "held-size",
    "S-15 标注 held-size"
  );
  const s11 = orderOf(next, "S-11");
  const s14 = orderOf(next, "S-14");
  assert(s11.orderId === "GD-305" && s11.held, "S-11 未复核留原点且待处理");
  assert(s14.orderId === "GD-305" && s14.held, "S-14 未复核留原点且待处理");
  assert(next.orders.find((o) => o.id === "GD-305")!.mainMm === 8.0, "改单尺寸已生效 8.0");
  assert(next.gems.filter((g) => g.held).length === 4, "待处理共 4 颗（预置 S-16 + 3 软留）");
}

// 场景 B：复核 S-14 后再改单 → 合格配石 4 颗，尺寸内空位仅 3 个 → 占用冲突，整次不迁
{
  console.log("\n[场景B] 复核 S-14：占用冲突，整次不迁回滚");
  const st = seedState();
  setReview(st, "S-14", true);
  const before = clone(st.gems);
  const { state: next, report } = runMigration(st, "GD-305", 8.0);
  assert(report.status === "blocked", "状态 blocked");
  assert(/占用冲突/.test(report.blockedReason ?? ""), `阻断原因含「占用冲突」：${report.blockedReason}`);
  const same = next.gems.every((g) => {
    const b = before.find((x) => x.id === g.id)!;
    return b.orderId === g.orderId && b.held === g.held;
  });
  assert(same, "全部宝石回滚至原状态");
  assert(next.orders.find((o) => o.id === "GD-305")!.mainMm === 8.0, "尺寸修改保留（仅迁移回滚）");
  assert(next.reports.length === 1, "台账保留 1 条阻断记录");
}

// 场景 C：复核第二主石 S-11（S-14 仍未复核）→ 主石 2 颗但空主石位仅 1 个 → 主石超额
{
  console.log("\n[场景C] 复核 S-11：主石超额，整次不迁");
  const st = seedState();
  setReview(st, "S-11", true);
  const before = clone(st.gems);
  const { state: next, report } = runMigration(st, "GD-305", 8.0);
  assert(report.status === "blocked", "状态 blocked");
  assert(/主石超额/.test(report.blockedReason ?? ""), `阻断原因含「主石超额」：${report.blockedReason}`);
  const same = next.gems.every((g) => {
    const b = before.find((x) => x.id === g.id)!;
    return b.orderId === g.orderId && b.held === g.held;
  });
  assert(same, "配石也不迁，全部回滚");
}

// 场景 D：先成功改单到 8.0（S-10 迁往 GD-301），再对 GD-305 改单到 6.5；
// 此时 GD-305 留下的未复核/软留椭圆主石……改为：把 S-11 复核后对空 GD-305 二次改单，
// S-11 对 GD-302 圆形位外形不符、对 GD-301 椭圆位差 1.5 → 无相符空位，整次不迁不适用；
// 故直接验证改单目标尺寸影响「后续迁入」：GD-305 改 8.0 成功后其主石位空出，
// 再次改单 8.15，一颗 8.0 的椭圆主石（模拟）差 0.15 边界可迁、8.17 差 0.17 不可迁。
{
  console.log("\n[场景D] 改单后目标石位尺寸作为迁入基准（0.15 边界）");
  const st = seedState();
  const { state: n1 } = runMigration(st, "GD-305", 8.0);
  assert(occupied(n1, "GD-305", "主石") === 0, "首次迁移后 GD-305 主石位空缺");
  assert(orderById(n1, "GD-305")!.mainMm === 8.0, "GD-305 目标主石 8.0");

  // 边界内：差恰好 0.15 → 可迁
  const a = clone(n1);
  a.gems.push({
    id: "X-01",
    shape: "椭圆",
    mm: 8.15,
    reviewed: true,
    role: "主石",
    orderId: "GD-304",
    held: false,
  });
  const xa = runMigration(a, "GD-304", 9.02).state;
  // GD-301 满；GD-302 圆形主石外形不符；GD-305 椭圆 8.0 与 X-01 差 0.15 → 可迁
  assert(
    xa.gems.find((g) => g.id === "X-01")!.orderId === "GD-305",
    "Δ=0.15 边界内：X-01 → GD-305"
  );

  // 边界外：差 0.17 → 软留
  const b = clone(n1);
  b.gems.push({
    id: "X-02",
    shape: "椭圆",
    mm: 8.17,
    reviewed: true,
    role: "主石",
    orderId: "GD-304",
    held: false,
  });
  const rb = runMigration(b, "GD-304", 9.02);
  assert(
    rb.state.gems.find((g) => g.id === "X-02")!.orderId === "GD-304" &&
      rb.state.gems.find((g) => g.id === "X-02")!.held,
    "Δ=0.17 超界：X-02 留原点待处理"
  );
  assert(rb.report.items.find((i) => i.gemId === "X-02")!.outcome === "held-size", "标注 held-size");
}

// 场景 E：连续迁移后占位数更新
{
  console.log("\n[场景E] 迁移后石位占用");
  const st = seedState();
  const { state: n1 } = runMigration(st, "GD-305", 8.0);
  assert(occupied(n1, "GD-301", "主石") === 1, "GD-301 主石 1/1");
  assert(occupied(n1, "GD-301", "配石") === 4, "GD-301 配石 4/4");
  assert(occupied(n1, "GD-304", "配石") === 1, "GD-304 配石仍 1/2（无 Δ≤0.15 的配石可去）");
  assert(occupied(n1, "GD-302", "主石") === 0, "GD-302 圆形主石位仍缺（椭圆主石外形不符）");
}

console.log(failures === 0 ? "\n全部断言通过 ✅" : `\n${failures} 条断言失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
