// 业务文件三：页面 —— 宝石刻面返工迁移台
import { useEffect, useMemo, useState } from "react";
import {
  fmtMm,
  resizeAndMigrate,
  roleCount,
  setReview,
  slotCapacity,
  vacancies,
  SIZE_TOLERANCE,
  type Gem,
  type Order,
  type Shape,
  type StationState,
} from "../domain/rules";
import { loadState, resetState, saveState } from "../domain/storage";

const SHAPES: Shape[] = ["圆形", "椭圆", "梨形", "祖母绿切"];
const SHAPE_FILTERS: ("全部" | Shape)[] = ["全部", "圆形", "椭圆", "梨形", "祖母绿切"];

const dtText = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
};

export default function Station() {
  const [state, setState] = useState<StationState>(loadState);
  const [shapeFilter, setShapeFilter] = useState<"全部" | Shape>("全部");
  const [orderFilter, setOrderFilter] = useState<"全部" | string>("全部");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // 数据存浏览器，刷新保留
  useEffect(() => {
    saveState(state);
  }, [state]);

  const orderMap = useMemo(() => new Map(state.orders.map((o) => [o.id, o])), [state.orders]);
  const pendingGemIds = useMemo(
    () => new Set(state.pending.map((p) => p.gemId)),
    [state.pending]
  );

  const shortageOrders = state.orders.filter(
    (o) => vacancies(o, state.gems, "主石") > 0 || vacancies(o, state.gems, "配石") > 0
  );
  const lastLog = state.logs[0];

  const submitResize = (order: Order) => {
    const raw = drafts[order.id] ?? String(order.size);
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      alert(`「${order.name}」的新尺寸需为正数毫米。`);
      return;
    }
    const next = resizeAndMigrate(state, order.id, Number(value.toFixed(2)));
    setState(next);
    setDrafts((d) => ({ ...d, [order.id]: String(Number(value.toFixed(2))) }));
  };

  const resetAll = () => {
    if (confirm("恢复为预置的 5 张改单与 16 颗已分拣宝石？当前存档将被清空。")) {
      setState(resetState());
      setDrafts({});
    }
  };

  const filteredGems = state.gems.filter(
    (g) =>
      (shapeFilter === "全部" || g.shape === shapeFilter) &&
      (orderFilter === "全部" || g.orderId === orderFilter)
  );

  return (
    <main className="app">
      <header className="hero">
        <p>hxyfront-62006 · 珠宝镶嵌 · Port 62006</p>
        <h1>宝石刻面返工迁移台</h1>
        <span>
          改单调整尺寸后，原订单上的宝石逐颗迁往最早的缺品订单：尺寸差最小优先，差值超 {fmtMm(SIZE_TOLERANCE)}{" "}
          或缺陷未复核的留在原点并计入待处理；占用冲突或主石超额时整次不迁。数据存浏览器，刷新保留。
        </span>
      </header>

      <section className="metrics">
        <article>
          <small>改单总数</small>
          <strong>{state.orders.length}</strong>
        </article>
        <article>
          <small>已分拣宝石</small>
          <strong>{state.gems.length}</strong>
        </article>
        <article>
          <small>缺品订单</small>
          <strong>{shortageOrders.length}</strong>
        </article>
        <article>
          <small>待处理宝石</small>
          <strong className={state.pending.length ? "warn" : ""}>{state.pending.length}</strong>
        </article>
      </section>

      {lastLog && (
        <section className={`panel banner ${lastLog.aborted ? "abort" : "ok"}`}>
          <b>{lastLog.aborted ? "整次未迁" : "迁移完成"}</b>
          <span>
            {dtText(lastLog.at)} · {lastLog.orderId} {lastLog.orderName}：{fmtMm(lastLog.oldSize)} →{" "}
            {fmtMm(lastLog.newSize)} · {lastLog.summary}
          </span>
        </section>
      )}

      <section className="workspace">
        <aside className="panel">
          <div className="heading">
            <h2>筛选与规则</h2>
            <button onClick={resetAll}>重置存档</button>
          </div>

          <p className="side-label">外形</p>
          <div className="chips">
            {SHAPE_FILTERS.map((s) => (
              <button
                key={s}
                className={shapeFilter === s ? "chip-on" : ""}
                onClick={() => setShapeFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <p className="side-label">改单</p>
          <div className="chips vertical">
            <button
              className={orderFilter === "全部" ? "chip-on" : ""}
              onClick={() => setOrderFilter("全部")}
            >
              全部
            </button>
            {state.orders.map((o) => (
              <button
                key={o.id}
                className={orderFilter === o.id ? "chip-on" : ""}
                onClick={() => setOrderFilter(o.id)}
              >
                {o.id} {o.name}
              </button>
            ))}
          </div>

          <p className="side-label">迁移规则</p>
          <ol className="rules">
            <li>改单落新尺寸后，只处理原订单上的宝石。</li>
            <li>逐颗迁往最早的缺品订单，候选中尺寸差最小优先。</li>
            <li>差值超 {fmtMm(SIZE_TOLERANCE)} 或缺陷未复核 → 留原点、计入待处理。</li>
            <li>槽位占用冲突或主石超额 → 整次不迁，全部留原点。</li>
          </ol>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>改单尺寸</p>
              <h2>五张返工订单</h2>
            </div>
          </div>
          <div className="order-grid">
            {state.orders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                state={state}
                draft={drafts[o.id] ?? String(o.size)}
                onDraft={(v) => setDrafts((d) => ({ ...d, [o.id]: v }))}
                onSubmit={() => submitResize(o)}
              />
            ))}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>已分拣宝石（{filteredGems.length}）</p>
            <h2>十六颗刻面宝石</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="gem-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>外形</th>
                <th>毫米尺寸</th>
                <th>缺陷复核</th>
                <th>主配石位</th>
                <th>当前改单</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredGems.map((g) => (
                <GemRow
                  key={g.id}
                  gem={g}
                  orderName={orderMap.get(g.orderId)?.name ?? "—"}
                  pendingReason={state.pending.find((p) => p.gemId === g.id)?.reason}
                  onToggleReview={() =>
                    setState((s) =>
                      setReview(s, g.id, g.review === "已复核" ? "未复核" : "已复核")
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lower-grid">
        <section className="panel">
          <div className="heading">
            <div>
              <p>留原点</p>
              <h2>待处理（{state.pending.length}）</h2>
            </div>
          </div>
          {state.pending.length === 0 ? (
            <p className="empty">暂无留原点宝石。</p>
          ) : (
            <div className="records">
              {state.pending.map((p) => {
                const gem = state.gems.find((g) => g.id === p.gemId);
                const order = orderMap.get(p.orderId);
                return (
                  <article key={`${p.gemId}-${p.at}`}>
                    <b>{p.gemId.replace("ST-", "")}</b>
                    <div>
                      <h3>
                        {p.gemId}
                        {gem ? ` · ${gem.role}` : ""}
                        {order ? ` · 留于 ${order.id}` : ""}
                      </h3>
                      <p>{p.reason}</p>
                      <small>{dtText(p.at)}</small>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>迁移台账</p>
              <h2>改单记录</h2>
            </div>
          </div>
          {state.logs.length === 0 ? (
            <p className="empty">尚未调整过改单尺寸。</p>
          ) : (
            <div className="records logs">
              {state.logs.map((log) => (
                <article key={log.at} className={log.aborted ? "abort" : ""}>
                  <b>{log.aborted ? "止" : "迁"}</b>
                  <div>
                    <h3>
                      {log.orderId} · {fmtMm(log.oldSize)} → {fmtMm(log.newSize)}
                    </h3>
                    <p>{log.summary}</p>
                    {log.moves.length > 0 && (
                      <p className="moves">
                        {log.moves
                          .map(
                            (m) =>
                              `${m.gemId} → ${m.targetOrderId}（差 ${fmtMm(m.diff)}，${m.role}位）`
                          )
                          .join("；")}
                      </p>
                    )}
                    {log.pending.length > 0 && (
                      <p className="moves">
                        留原点：{log.pending.map((p) => `${p.gemId}（${p.reason}）`).join("；")}
                      </p>
                    )}
                    <small>{dtText(log.at)}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

/* -------------------------------- 子组件 -------------------------------- */

function OrderCard({
  order,
  state,
  draft,
  onDraft,
  onSubmit,
}: {
  order: Order;
  state: StationState;
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: () => void;
}) {
  const mainUsed = roleCount(state.gems, order.id, "主石");
  const sideUsed = roleCount(state.gems, order.id, "配石");
  const mainVac = vacancies(order, state.gems, "主石");
  const sideVac = vacancies(order, state.gems, "配石");
  const changed = Number(draft) !== order.size;

  return (
    <article className={`order-card${mainVac > 0 || sideVac > 0 ? " shortage" : ""}`}>
      <header>
        <b>{order.id}</b>
        <span className="tag">{order.shape}</span>
      </header>
      <h3>{order.name}</h3>
      <p className="muted">开单 {dtText(order.createdAt)}</p>
      <div className="slots">
        <span className={mainVac > 0 ? "vac" : ""}>
          主石 {mainUsed}/{slotCapacity(order, "主石")}
        </span>
        <span className={sideVac > 0 ? "vac" : ""}>
          配石 {sideUsed}/{slotCapacity(order, "配石")}
        </span>
      </div>
      <label className="resize-line">
        <span>新尺寸（mm）</span>
        <div>
          <input
            type="number"
            step="0.01"
            min="0"
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
          />
          <button className="primary" disabled={!changed} onClick={onSubmit}>
            改单并迁移
          </button>
        </div>
      </label>
      {(mainVac > 0 || sideVac > 0) && (
        <p className="vac-note">
          缺品：
          {[
            mainVac > 0 ? `主石 ×${mainVac}` : "",
            sideVac > 0 ? `配石 ×${sideVac}` : "",
          ]
            .filter(Boolean)
            .join("，")}
        </p>
      )}
    </article>
  );
}

function GemRow({
  gem,
  orderName,
  pendingReason,
  onToggleReview,
}: {
  gem: Gem;
  orderName: string;
  pendingReason?: string;
  onToggleReview: () => void;
}) {
  const isPending = Boolean(pendingReason);
  return (
    <tr className={isPending ? "pending-row" : ""}>
      <td>
        <b>{gem.id}</b>
      </td>
      <td>{gem.shape}</td>
      <td>{fmtMm(gem.size)}</td>
      <td>
        <button
          className={`review-btn ${gem.review === "已复核" ? "rev-ok" : "rev-no"}`}
          onClick={onToggleReview}
          title="点击切换复核状态"
        >
          {gem.review}
        </button>
      </td>
      <td>
        <span className={`role-tag role-${gem.role === "主石" ? "main" : "side"}`}>{gem.role}</span>
      </td>
      <td>
        {gem.orderId}
        <div className="muted inline">{orderName}</div>
      </td>
      <td>{isPending ? <span className="pending-flag">待处理：{pendingReason}</span> : <span className="settled">已分拣就位</span>}</td>
    </tr>
  );
}
