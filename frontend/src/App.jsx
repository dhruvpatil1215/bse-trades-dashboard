import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const inr = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const inrCompact = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const ALERT_ICONS = { success: "✓", warning: "⏳", error: "✕" };

function App() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [pulling, setPulling] = useState(false);
  const [message, setMessage] = useState(null);
  const [sseOk, setSseOk] = useState(false);
  const [flashIds, setFlashIds] = useState(() => new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${API}/trades`, { signal: controller.signal });
        if (!res.ok) throw new Error("Failed to fetch trades");
        const data = await res.json();

        setTrades((current) => {
          const existing = new Set(current.map((t) => t.tradeId));
          const fresh = (data.trades || []).filter((t) => !existing.has(t.tradeId));
          return [...current, ...fresh];
        });
      } catch (err) {
        if (err.name !== "AbortError") setLoadError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const es = new EventSource(`${API}/events`);

    es.onopen = () => setSseOk(true);
    es.onerror = () => setSseOk(false);

    es.onmessage = (event) => {
      try {
        const trade = JSON.parse(event.data);
        setTrades((current) => {
          if (current.some((t) => t.tradeId === trade.tradeId)) return current;
          setFlashIds((ids) => new Set(ids).add(trade.tradeId));
          return [trade, ...current];
        });
      } catch {
        return;
      }
    };

    es.addEventListener("pull-status", (event) => {
      try {
        const { inProgress } = JSON.parse(event.data);
        setPulling(inProgress);
        setMessage(
          inProgress
            ? { text: "Trade pull in progress. New trades will appear live.", type: "warning" }
            : { text: "Trade pull completed successfully.", type: "success" }
        );
      } catch {
        return;
      }
    });

    return () => es.close();
  }, []);

  useEffect(() => {
    fetch(`${API}/pull/status`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ inProgress }) => setPulling(inProgress))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (message?.type !== "success") return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  const startPull = async () => {
    setMessage(null);
    try {
      const res = await fetch(`${API}/pull/start`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ text: data.message, type: "error" });
        return;
      }

      setPulling(true);
      setMessage({ text: data.message, type: "warning" });
    } catch {
      setMessage({ text: "Could not reach the backend. Check that it is running.", type: "error" });
    }
  };

  const clearFlash = (tradeId) => {
    setFlashIds((ids) => {
      if (!ids.has(tradeId)) return ids;
      const next = new Set(ids);
      next.delete(tradeId);
      return next;
    });
  };

  const sorted = useMemo(
    () =>
      [...trades].sort((a, b) =>
        String(b.tradeId).localeCompare(String(a.tradeId), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      ),
    [trades]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((t) =>
      [t.tradeId, t.client, t.symbol].some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [sorted, query]);

  const stats = useMemo(() => {
    const symbols = new Set(trades.map((t) => t.symbol));
    const value = trades.reduce((sum, t) => sum + (t.price || 0) * (t.quantity || 0), 0);
    return { symbols: symbols.size, value };
  }, [trades]);

  const isFiltered = query.trim() !== "";

  return (
    <div className="dashboard">
      <header className="header">
        <div className="header-brand">
          <div className="header-icon" aria-hidden="true">📈</div>
          <div>
            <h1 className="header-title">BSE trades</h1>
            <p className="header-sub">Live feed over server-sent events</p>
          </div>
        </div>

        <div className="header-right">
          <span className={`sse-badge ${sseOk ? "connected" : "disconnected"}`} role="status">
            <span className="sse-dot" />
            {sseOk ? "Live" : "Reconnecting"}
          </span>

          <button
            className="btn-pull"
            onClick={startPull}
            disabled={pulling}
            aria-busy={pulling}
          >
            {pulling ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Pulling trades
              </>
            ) : (
              <>
                <span aria-hidden="true">⬇</span>
                Pull trades
              </>
            )}
          </button>
        </div>
      </header>

      <div className="stats-row">
        <div className={`stat-card ${pulling ? "status-active" : "status-idle"}`}>
          <span className="stat-label">Pull status</span>
          <span className="stat-value stat-value-sm">{pulling ? "In progress" : "Idle"}</span>
          <span className="stat-hint">
            {pulling ? "Fetching from the BSE API in batches of 500" : "Ready to pull"}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Trades loaded</span>
          <span className="stat-value">{trades.length.toLocaleString("en-IN")}</span>
          <span className="stat-hint">Highest trade ID first</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Symbols</span>
          <span className="stat-value">{stats.symbols}</span>
          <span className="stat-hint">Distinct instruments traded</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Traded value</span>
          <span className="stat-value">₹{inrCompact.format(stats.value)}</span>
          <span className="stat-hint">Price × quantity, all loaded trades</span>
        </div>
      </div>

      {message && (
        <div className={`alert ${message.type}`} role="status" aria-live="polite">
          <span className="alert-icon" aria-hidden="true">{ALERT_ICONS[message.type]}</span>
          <span className="alert-text">{message.text}</span>
          <button className="alert-close" onClick={() => setMessage(null)} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}

      <section className="table-section" aria-label="Trades">
        <div className="table-header">
          <div>
            <h2 className="table-title">Recent trades</h2>
            {!loading && !loadError && (
              <p className="table-meta">
                {isFiltered
                  ? `${visible.length} of ${trades.length} trades match`
                  : `${trades.length} trade${trades.length !== 1 ? "s" : ""}, highest trade ID first`}
              </p>
            )}
          </div>

          <input
            type="search"
            className="search"
            placeholder="Search by ID, client or symbol"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search trades"
          />
        </div>

        <div className="table-wrap">
          {loading ? (
            <div className="skeleton" aria-label="Loading trades">
              {Array.from({ length: 8 }).map((_, i) => (
                <div className="skeleton-row" key={i}>
                  <div className="skeleton-cell w-80" />
                  <div className="skeleton-cell w-90" />
                  <div className="skeleton-cell w-70" />
                  <div className="skeleton-cell w-50" />
                  <div className="skeleton-cell w-60" />
                  <div className="skeleton-cell grow" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="state-box">
              <span className="state-icon" aria-hidden="true">⚠️</span>
              <p className="state-title">Couldn't load trades</p>
              <p className="state-sub">{loadError}. Check that the backend is running on port 5000, then reload.</p>
            </div>
          ) : trades.length === 0 ? (
            <div className="state-box">
              <span className="state-icon" aria-hidden="true">📭</span>
              <p className="state-title">No trades yet</p>
              <p className="state-sub">Select "Pull trades" to fetch trades from the BSE API.</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="state-box">
              <span className="state-icon" aria-hidden="true">🔍</span>
              <p className="state-title">No matching trades</p>
              <p className="state-sub">Nothing matches "{query.trim()}". Try a different ID, client or symbol.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="trades-table" aria-label="BSE trade records">
                <thead>
                  <tr>
                    <th scope="col">Trade ID</th>
                    <th scope="col" className="col-client">Client</th>
                    <th scope="col">Symbol</th>
                    <th scope="col" className="right">Qty</th>
                    <th scope="col" className="right">Price (₹)</th>
                    <th scope="col" className="col-ts">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((trade) => (
                    <tr
                      key={trade.tradeId}
                      className={flashIds.has(trade.tradeId) ? "trade-row-new" : ""}
                      onAnimationEnd={() => clearFlash(trade.tradeId)}
                    >
                      <td><span className="trade-id">{trade.tradeId}</span></td>
                      <td className="col-client">{trade.client}</td>
                      <td><span className="symbol-pill">{trade.symbol}</span></td>
                      <td className="right">{Number(trade.quantity ?? 0).toLocaleString("en-IN")}</td>
                      <td className="right price-cell">₹{inr.format(trade.price ?? 0)}</td>
                      <td className="col-ts ts-cell">{dateTime.format(new Date(trade.timestamp))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default App;