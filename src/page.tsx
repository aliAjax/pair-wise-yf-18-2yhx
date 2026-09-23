import { useEffect, useMemo, useState } from "react";
import {
  BenchState,
  Gem,
  Order,
  PlanItem,
  Report,
  Role,
  Shape,
  SIZE_LIMIT,
  deficitOrders,
  freeSeats,
  occupied,
  runMigration,
  stats,
} from "./rules";
import { loadState, resetState, saveState } from "./storage";
import "./styles.css";

const SHAPES: Shape[] = ["圆形", "椭圆", "梨形", "祖母绿切"];

function App() {
  const [state, setState] = useState<BenchState>(loadState);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [shapeFilter, setShapeFilter] = useState<Shape | "全部">("全部");

  useEffect(() => {
    saveState(state);
  }, [state]);

  const s = stats(state);
  const deficitIds = useMemo(
    () => new Set(deficitOrders(state).map((o) => o.id)),
    [state]
  );

  function draftOf(o: Order): string {
    return drafts[o.id] ?? o.mainMm.toFixed(2);
  }

  function doMigration(o: Order) {
    const raw = (drafts[o.id] ?? "").trim();
    const value = Number(raw === "" ? o.mainMm : raw);
    if (!Number.isFinite(value) || value <= 0) {
      alert("请输入有效的改单尺寸（毫米，大于 0）");
      return;
    }
    const rounded = Math.round(value * 100) / 100;
    const { state: next, report } = runMigration(state, o.id, rounded);
    setState(next);
    setDrafts((d) => ({ ...d, [o.id]: rounded.toFixed(2) }));
    setActiveKey(report.key);
  }

  function toggleReview(gemId: string) {
    setState((prev) => ({
      ...prev,
      gems: prev.gems.map((g) =>
        g.id === gemId ? { ...g, reviewed: !g.reviewed } : g
      ),
    }));
  }

  function doReset() {
    if (!confirm("恢复五张改单与十六颗宝石的预置分拣台？当前迁移记录将清空。")) return;
    setState(resetState());
    setDrafts({});
    setActiveKey(null);
  }

  const gemsAt = (o: Order, role: Role) =>
    state.gems.filter((g) => g.orderId === o.id && g.role === role);

  const visibleGems = state.gems.filter(
    (g) => shapeFilter === "全部" || g.shape === shapeFilter
  );

  return (
    <main className="app">
      <section className="hero">
        <p>宝石刻面 · 返工迁移台 · 数据本地留存</p>
        <h1>宝石刻面返工迁移台</h1>
        <span>
          改单尺寸后，从原订单逐颗迁往最早的缺品订单；优先尺寸差最小，超过
          {SIZE_LIMIT.toFixed(2)}mm 或缺陷未复核的宝石留在原点并计入待处理；
          遇占用冲突或主石超额则整次不迁、全部回滚。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>改单</small>
          <strong>{s.orders}</strong>
        </article>
        <article>
          <small>已分拣宝石</small>
          <strong>{s.gems}</strong>
        </article>
        <article>
          <small>缺品订单</small>
          <strong>{s.deficit}</strong>
        </article>
        <article>
          <small>待处理宝石</small>
          <strong className="metric-amber">{s.held}</strong>
        </article>
        <article>
          <small>迁移成功 / 整次不迁</small>
          <strong>
            {s.moved} 颗 · {s.blocked} 次
          </strong>
        </article>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>返工台</p>
            <h2>五张改单 · 修改主石尺寸后执行迁移</h2>
          </div>
          <button onClick={doReset}>恢复预置数据</button>
        </div>
        <div className="order-grid">
          {state.orders.map((o) => {
            const pool = state.gems.filter((g) => g.orderId === o.id);
            return (
              <article
                key={o.id}
                className={"order-card" + (deficitIds.has(o.id) ? " is-deficit" : "")}
              >
                <header>
                  <div>
                    <h3>{o.id}</h3>
                    <p className="muted">{o.customer}</p>
                  </div>
                  <div className="order-tags">
                    <span className="tag date">{o.date}</span>
                    {deficitIds.has(o.id) && <span className="tag deficit">缺品</span>}
                  </div>
                </header>

                <SeatRow
                  label="主石位"
                  shape={o.mainShape}
                  mm={o.mainMm}
                  count={occupied(state, o.id, "主石")}
                  need={1}
                  gems={gemsAt(o, "主石")}
                />
                <SeatRow
                  label="配石位"
                  shape={o.sideShape}
                  mm={o.sideMm}
                  count={occupied(state, o.id, "配石")}
                  need={o.sideNeed}
                  gems={gemsAt(o, "配石")}
                />

                <div className="rework-row">
                  <label>
                    <span>改单后主石尺寸（mm）</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={draftOf(o)}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [o.id]: e.target.value }))
                      }
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={pool.length === 0}
                    onClick={() => doMigration(o)}
                  >
                    改单并迁移
                  </button>
                </div>
                {pool.length === 0 && (
                  <p className="muted tiny">原订单已无宝石，需先从其他改单迁入。</p>
                )}
                <p className="muted tiny">
                  空主石位 {freeSeats(state, o.id, "主石")} · 空配石位{" "}
                  {freeSeats(state, o.id, "配石")}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>宝石清单</p>
            <h2>十六颗宝石 · 外形 / 尺寸 / 缺陷复核 / 主配石位</h2>
          </div>
        </div>
        <div className="chips" style={{ marginBottom: 14 }}>
          {(["全部", ...SHAPES] as const).map((sh) => (
            <button
              key={sh}
              className={shapeFilter === sh ? "chip-on" : ""}
              onClick={() => setShapeFilter(sh)}
            >
              {sh}
            </button>
          ))}
        </div>
        <div className="gem-table">
          <div className="gem-row gem-head">
            <span>编号</span>
            <span>外形</span>
            <span>毫米尺寸</span>
            <span>主/配</span>
            <span>石位</span>
            <span>缺陷复核</span>
          </div>
          {visibleGems.map((g) => (
            <div key={g.id} className={"gem-row" + (g.held ? " is-held" : "")}>
              <span className="gem-id">{g.id}</span>
              <span>{g.shape}</span>
              <span>{g.mm.toFixed(2)} mm</span>
              <span>
                <span className={"role-badge " + (g.role === "主石" ? "main" : "side")}>
                  {g.role}
                </span>
              </span>
              <span>
                {g.orderId ? (
                  g.held ? (
                    <span className="tag held">{g.orderId} · 留原点待处理</span>
                  ) : (
                    <span className="tag placed">{g.orderId}</span>
                  )
                ) : (
                  <span className="tag held">未分拣 · 待处理</span>
                )}
              </span>
              <span>
                <button
                  className={"review-badge " + (g.reviewed ? "ok" : "pending")}
                  onClick={() => toggleReview(g.id)}
                  title="点击切换缺陷复核状态"
                >
                  {g.reviewed ? "✓ 已复核" : "待复核"}
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>迁移台账</p>
            <h2>逐次改单记录（浏览器存档，刷新保留）</h2>
          </div>
        </div>
        {state.reports.length === 0 ? (
          <p className="muted">尚无迁移记录。在上方改单中修改主石尺寸并点击「改单并迁移」。</p>
        ) : (
          <div className="report-list">
            {state.reports.map((r) => (
              <ReportCard
                key={r.key}
                report={r}
                active={r.key === activeKey}
                orders={state.orders}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SeatRow({
  label,
  shape,
  mm,
  count,
  need,
  gems,
}: {
  label: string;
  shape: Shape;
  mm: number;
  count: number;
  need: number;
  gems: Gem[];
}) {
  const missing = need - count;
  const over = count > need;
  return (
    <div className={"seat-row" + (over ? " over" : "")}>
      <div className="seat-line">
        <b>{label}</b>
        <span>
          {shape} · {mm.toFixed(2)}mm
        </span>
        {over && <span className="tag held">超额 {count - need}</span>}
        <span className={missing > 0 ? "seat-count bad" : over ? "seat-count bad" : "seat-count ok"}>
          {count}/{need}
        </span>
      </div>
      <div className="seat-gems">
        {gems.map((g) => (
          <span key={g.id} className={"mini-gem" + (g.held ? " held" : "")}>
            {g.id}
            {g.held ? "·待处理" : ""}
          </span>
        ))}
        {Array.from({ length: Math.max(0, missing) }).map((_, i) => (
          <span key={"empty-" + i} className="mini-gem empty">
            缺品
          </span>
        ))}
      </div>
    </div>
  );
}

function ReportCard({
  report,
  active,
  orders,
}: {
  report: Report;
  active: boolean;
  orders: Order[];
}) {
  const source = orders.find((o) => o.id === report.sourceOrderId);
  const moved = report.items.filter((i) => i.outcome === "moved");
  const held = report.items.filter((i) => i.outcome !== "moved");
  return (
    <article
      className={
        "report-card " +
        (report.status === "blocked" ? "blocked" : "migrated") +
        (active ? " active" : "")
      }
    >
      <header>
        <div>
          <h3>
            {report.sourceOrderId}
            {source ? ` · ${source.customer}` : ""}
          </h3>
          <p className="muted tiny">
            {report.changedAt} · 主石尺寸 {report.mainFrom.toFixed(2)} →{" "}
            {report.mainTo.toFixed(2)} mm
          </p>
        </div>
        <span className={"tag big " + (report.status === "blocked" ? "block-tag" : "move-tag")}>
          {report.status === "blocked" ? "整次不迁 · 已回滚" : `迁移成功 · ${moved.length} 颗`}
        </span>
      </header>
      {report.blockedReason && <p className="block-reason">⛔ {report.blockedReason}</p>}
      <ul className="plan-list">
        {report.items.map((it: PlanItem, idx) => (
          <li key={idx} className={"plan-" + it.outcome}>
            <b>{it.gemId}</b>
            <span className="plan-role">{it.role}</span>
            <span>{it.note}</span>
            {it.diff !== null && <em>Δ {it.diff.toFixed(2)}mm</em>}
          </li>
        ))}
      </ul>
      {held.length > 0 && report.status === "migrated" && (
        <p className="muted tiny">其中 {held.length} 颗留在原点计入待处理。</p>
      )}
    </article>
  );
}

export default App;
