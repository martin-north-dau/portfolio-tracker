import { useState, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage.js";
import TRImport from "./TRImport.jsx";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:      "#05050f",
  surface: "rgba(255,255,255,0.03)",
  border:  "rgba(255,255,255,0.07)",
  text:    "#e8eaf0",
  muted:   "#4a5568",
  faint:   "#1e2235",
  green:   "#2dd4bf",
  red:     "#f87171",
  blue:    "#60a5fa",
  amber:   "#fbbf24",
  purple:  "#a78bfa",
  pink:    "#f472b6",
};

const SECTORS = {
  "KI & Halbleiter":      { color: "#60a5fa", icon: "⬡" },
  "Robotik & Automation": { color: "#a78bfa", icon: "◈" },
  "Erneuerbare Energien": { color: "#2dd4bf", icon: "◉" },
  "Biotech & Gesundheit": { color: "#fb923c", icon: "◎" },
  "Neue Materialien":     { color: "#f472b6", icon: "◇" },
  "ETF / Sparplan":       { color: "#fbbf24", icon: "◫" },
};

const CURRENCIES = ["EUR","USD","DKK","CHF","GBP"];
const TODAY = new Date().toISOString().slice(0,10);

const INITIAL_INSTRUMENTS = [
  {
    id: 1, ticker: "SAP", name: "SAP SE",
    sector: "KI & Halbleiter", currency: "EUR",
    currentPrice: 256.0,
    plannedReturnPct: 5.0, plannedDividendPct: 1.2, horizonYears: 5,
    type: "stock", savingsPlan: null,
    note: "Cloud-Transformation. KI-Integration in ERP. Stabiler europäischer Champion.",
    transactions: [
      { id: 1, type: "buy", date: "2026-01-15", price: 232.0, shares: 2,     fee: 4.90 },
      { id: 2, type: "buy", date: "2026-03-10", price: 241.5, shares: 2,     fee: 4.90 },
    ],
  },
  {
    id: 2, ticker: "BEP", name: "Brookfield Renewable",
    sector: "Erneuerbare Energien", currency: "USD",
    currentPrice: 34.6,
    plannedReturnPct: 8.0, plannedDividendPct: 5.9, horizonYears: 5,
    type: "stock", savingsPlan: null,
    note: "Dividendenrendite ~5.9%. FFO +10% YoY.",
    transactions: [],
  },
  {
    id: 3, ticker: "ORSTED", name: "Ørsted A/S",
    sector: "Erneuerbare Energien", currency: "DKK",
    currentPrice: 167.0,
    plannedReturnPct: 15.0, plannedDividendPct: 0, horizonYears: 5,
    type: "stock", savingsPlan: null,
    note: "⚠️ BEOBACHTUNG – Warte auf 2 saubere Quartale. Q1 2026: 6. Mai 2026.",
    transactions: [],
  },
  {
    id: 4, ticker: "MSCI World", name: "iShares Core MSCI World ETF",
    sector: "ETF / Sparplan", currency: "EUR",
    currentPrice: 108.5,
    plannedReturnPct: 7.0, plannedDividendPct: 0.4, horizonYears: 5,
    type: "etf",
    savingsPlan: { amount: 100, interval: "monthly", nextDate: "2026-05-01", active: true },
    note: "Kernposition. Monatlicher Sparplan 100 €.",
    transactions: [
      { id: 1, type: "buy", date: "2026-02-01", price: 102.4, shares: 0.977, fee: 0 },
      { id: 2, type: "buy", date: "2026-03-01", price: 105.1, shares: 0.952, fee: 0 },
      { id: 3, type: "buy", date: "2026-04-01", price: 107.3, shares: 0.932, fee: 0 },
    ],
  },
  {
    id: 5, ticker: "NASDAQ-100", name: "Invesco NASDAQ-100 ETF",
    sector: "ETF / Sparplan", currency: "EUR",
    currentPrice: 87.2,
    plannedReturnPct: 9.0, plannedDividendPct: 0, horizonYears: 5,
    type: "etf",
    savingsPlan: { amount: 50, interval: "monthly", nextDate: "2026-05-01", active: true },
    note: "Tech-Satelliten-ETF. Sparplan 50 € monatlich.",
    transactions: [
      { id: 1, type: "buy", date: "2026-03-01", price: 84.6, shares: 0.591, fee: 0 },
      { id: 2, type: "buy", date: "2026-04-01", price: 86.1, shares: 0.581, fee: 0 },
    ],
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function calcPositionMetrics(instrument) {
  const { transactions, currentPrice, plannedReturnPct, horizonYears } = instrument;
  const buys  = transactions.filter(t => t.type === "buy");
  const sells = transactions.filter(t => t.type === "sell");

  const totalBought = buys.reduce((s,t)  => s + t.shares, 0);
  const totalSold   = sells.reduce((s,t) => s + t.shares, 0);
  const sharesHeld  = Math.max(0, totalBought - totalSold);

  const totalCost      = buys.reduce((s,t)  => s + t.shares * t.price + (t.fee||0), 0);
  const avgBuyPrice    = totalBought > 0 ? buys.reduce((s,t) => s + t.shares * t.price, 0) / totalBought : 0;
  const positionValue  = sharesHeld * currentPrice;
  const costBasisHeld  = sharesHeld * avgBuyPrice;
  const unrealizedPnl  = positionValue - costBasisHeld;
  const unrealizedPct  = costBasisHeld > 0 ? (unrealizedPnl / costBasisHeld) * 100 : 0;

  const realizedPnl = sells.reduce((s,t) => {
    const avgCost = totalBought > 0 ? totalCost / totalBought : 0;
    return s + t.shares * (t.price - avgCost) - (t.fee||0);
  }, 0);

  const firstBuy   = buys.length > 0 ? new Date(buys[0].date) : null;
  const yearsHeld  = firstBuy ? Math.max(0.001, (new Date() - firstBuy) / (365.25*24*3600*1000)) : 0;
  const actualAnnual = (avgBuyPrice > 0 && yearsHeld > 0.01)
    ? (Math.pow(currentPrice / avgBuyPrice, 1 / yearsHeld) - 1) * 100
    : null;

  const planTargetPrice = (avgBuyPrice > 0 ? avgBuyPrice : currentPrice) *
    Math.pow(1 + plannedReturnPct / 100, horizonYears);
  const deltaAnnual = actualAnnual !== null ? actualAnnual - plannedReturnPct : null;

  return {
    sharesHeld, totalBought, totalSold, avgBuyPrice, totalCost,
    positionValue, costBasisHeld, unrealizedPnl, unrealizedPct,
    realizedPnl, actualAnnual, planTargetPrice, deltaAnnual, yearsHeld,
  };
}

function fv(price, pct, years) { return price * Math.pow(1 + pct / 100, years); }

function fmt(n, dec = 2) {
  if (n === undefined || n === null || isNaN(n)) return "–";
  return n.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
const Tag = ({ label, color }) => (
  <span style={{
    background: color+"18", color, border: `1px solid ${color}35`,
    borderRadius: 20, padding: "2px 9px", fontSize: 9,
    fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap",
  }}>{label}</span>
);

const Chip = ({ children, active, color = "#60a5fa", onClick }) => (
  <button onClick={onClick} style={{
    padding: "4px 11px", borderRadius: 20, fontSize: 10, fontWeight: 700,
    border: `1px solid ${active ? color : "rgba(255,255,255,0.08)"}`,
    background: active ? color+"18" : "transparent",
    color: active ? color : C.muted,
    cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
  }}>{children}</button>
);

const Field = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, marginBottom: 3 }}>{label}</div>
    {children}
  </div>
);

const inp = {
  background: "#0a0a1a", border: `1px solid ${C.faint}`,
  borderRadius: 8, color: C.text, padding: "7px 10px",
  fontSize: 13, width: "100%", boxSizing: "border-box",
};

// ─── TRANSACTION FORM ─────────────────────────────────────────────────────────
function TransactionForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ type: "buy", date: TODAY, price: "", shares: "", fee: "0" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.price > 0 && form.shares > 0 && form.date;
  const total = form.price && form.shares
    ? Math.abs(parseFloat(form.price) * parseFloat(form.shares)) + (form.type === "buy" ? parseFloat(form.fee)||0 : -(parseFloat(form.fee)||0))
    : 0;

  return (
    <div style={{ background: "#0c0c1e", borderRadius: 12, border: `1px solid ${C.faint}`, padding: 12, marginTop: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <Field label="Typ">
          <div style={{ display: "flex", gap: 5 }}>
            {["buy","sell"].map(t => (
              <button key={t} onClick={() => set("type", t)} style={{
                flex: 1, padding: "6px 0", borderRadius: 8,
                border: `1px solid ${form.type===t ? (t==="buy" ? C.green : C.red) : "rgba(255,255,255,0.08)"}`,
                background: form.type===t ? (t==="buy" ? "rgba(45,212,191,0.12)" : "rgba(248,113,113,0.12)") : "transparent",
                color: form.type===t ? (t==="buy" ? C.green : C.red) : C.muted,
                fontSize: 12, fontWeight: 800, cursor: "pointer",
              }}>{t === "buy" ? "Kauf" : "Verkauf"}</button>
            ))}
          </div>
        </Field>
        <Field label="Datum">
          <input style={inp} type="date" value={form.date} onChange={e => set("date", e.target.value)} />
        </Field>
        <Field label="Kurs">
          <input style={inp} type="number" step="0.01" placeholder="0.00" value={form.price} onChange={e => set("price", e.target.value)} />
        </Field>
        <Field label="Stück / Anteile">
          <input style={inp} type="number" step="0.0001" placeholder="0.0000" value={form.shares} onChange={e => set("shares", e.target.value)} />
        </Field>
        <Field label="Gebühren">
          <input style={inp} type="number" step="0.01" placeholder="0.00" value={form.fee} onChange={e => set("fee", e.target.value)} />
        </Field>
        <Field label="Gesamtwert">
          <div style={{ padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 8, fontSize: 13, fontWeight: 700, color: form.type === "buy" ? C.red : C.green }}>
            {total > 0 ? `${form.type === "buy" ? "-" : "+"}${fmt(total)} €` : "–"}
          </div>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 7 }}>
        <button onClick={() => valid && onSave({ ...form, price: parseFloat(form.price), shares: parseFloat(form.shares), fee: parseFloat(form.fee)||0 })} style={{
          flex: 1, padding: "9px", borderRadius: 9, border: "none",
          background: valid ? C.green : "#1a3a35", color: valid ? "#021a18" : "#2a5a55",
          fontSize: 13, fontWeight: 900, cursor: valid ? "pointer" : "default",
        }}>✓ Speichern</button>
        <button onClick={onCancel} style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.faint}`, background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer" }}>Abbrechen</button>
      </div>
    </div>
  );
}

// ─── SAVINGS PLAN FORM ────────────────────────────────────────────────────────
function SavingsPlanForm({ plan, onSave, onCancel }) {
  const [form, setForm] = useState(plan || { amount: 100, interval: "monthly", nextDate: TODAY, active: true });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const intervalLabel = { weekly:"Wöchentlich", biweekly:"2-wöchentlich", monthly:"Monatlich", quarterly:"Quartalsweise" };

  return (
    <div style={{ background: "#0c0c1e", borderRadius: 12, border: `1px solid ${C.amber}30`, padding: 12, marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>◫ Sparplan konfigurieren</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <Field label="Betrag (€)">
          <input style={inp} type="number" value={form.amount} onChange={e => set("amount", parseFloat(e.target.value)||0)} />
        </Field>
        <Field label="Intervall">
          <select style={inp} value={form.interval} onChange={e => set("interval", e.target.value)}>
            {Object.entries(intervalLabel).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Nächste Ausführung">
          <input style={inp} type="date" value={form.nextDate} onChange={e => set("nextDate", e.target.value)} />
        </Field>
        <Field label="Status">
          <button onClick={() => set("active", !form.active)} style={{
            width: "100%", padding: "7px", borderRadius: 8,
            border: `1px solid ${form.active ? C.green : C.muted}`,
            background: form.active ? "rgba(45,212,191,0.1)" : "transparent",
            color: form.active ? C.green : C.muted, fontSize: 12, fontWeight: 800, cursor: "pointer",
          }}>{form.active ? "● Aktiv" : "○ Pausiert"}</button>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 7 }}>
        <button onClick={() => onSave(form)} style={{ flex: 1, padding: "9px", borderRadius: 9, border: "none", background: C.amber, color: "#1a0e00", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>✓ Speichern</button>
        <button onClick={onCancel} style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.faint}`, background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer" }}>Abbrechen</button>
      </div>
    </div>
  );
}

// ─── INSTRUMENT SETTINGS ──────────────────────────────────────────────────────
function InstrumentSettings({ inst, onUpdate, onDelete }) {
  const [form, setForm] = useState({ ...inst });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        {[
          ["Ticker",          "ticker",             "text"],
          ["Währung",         "currency",           "select-cur"],
          ["Akt. Kurs",       "currentPrice",       "number"],
          ["Typ",             "type",               "select-type"],
          ["Plan Kurs % p.a.","plannedReturnPct",   "number"],
          ["Plan Div. % p.a.","plannedDividendPct", "number"],
          ["Horizont (Jahre)","horizonYears",       "number"],
          ["Sektor",          "sector",             "select-sector"],
        ].map(([lbl, field, type]) => (
          <Field key={field} label={lbl}>
            {type === "select-cur"    ? <select style={inp} value={form[field]} onChange={e => set(field, e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
            : type === "select-type"  ? <select style={inp} value={form[field]} onChange={e => set(field, e.target.value)}><option value="stock">Aktie</option><option value="etf">ETF</option></select>
            : type === "select-sector"? <select style={inp} value={form[field]} onChange={e => set(field, e.target.value)}>{Object.keys(SECTORS).map(s => <option key={s}>{s}</option>)}</select>
            : <input style={inp} type={type === "number" ? "number" : "text"} value={form[field]} onChange={e => set(field, type === "number" ? parseFloat(e.target.value)||0 : e.target.value)} />}
          </Field>
        ))}
      </div>
      <Field label="Name"><input style={{ ...inp, marginBottom: 8 }} value={form.name} onChange={e => set("name", e.target.value)} /></Field>
      <Field label="Notiz"><textarea style={{ ...inp, height: 60, resize: "none", marginBottom: 10 }} value={form.note} onChange={e => set("note", e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 7 }}>
        <button onClick={() => onUpdate({ ...inst, ...form })} style={{ flex: 1, padding: "9px", borderRadius: 9, border: "none", background: C.green, color: "#021a18", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>✓ Speichern</button>
        <button onClick={() => { if(window.confirm(`${inst.ticker} wirklich löschen?`)) onDelete(inst.id); }} style={{ padding: "9px 13px", borderRadius: 9, border: `1px solid ${C.red}30`, background: `${C.red}08`, color: C.red, fontSize: 13, cursor: "pointer" }}>🗑</button>
      </div>
    </div>
  );
}

// ─── INSTRUMENT CARD ──────────────────────────────────────────────────────────
function InstrumentCard({ inst, onUpdate, onDelete }) {
  const [open, setOpen]           = useState(false);
  const [section, setSection]     = useState("overview");
  const [showTxForm, setShowTxForm] = useState(false);
  const [showSpForm, setShowSpForm] = useState(false);

  const sec = SECTORS[inst.sector] || { color: C.blue, icon: "◈" };
  const m   = useMemo(() => calcPositionMetrics(inst), [inst]);
  const hasPosition = m.sharesHeld > 0;
  const intervalLabel = { weekly:"Wöchentlich", biweekly:"2-wöchentl.", monthly:"Monatlich", quarterly:"Quartalsw." };

  const addTransaction = (form) => {
    const newId = inst.transactions.length ? Math.max(...inst.transactions.map(t => t.id)) + 1 : 1;
    onUpdate({ ...inst, transactions: [...inst.transactions, { ...form, id: newId }] });
    setShowTxForm(false);
  };

  const deleteTransaction = (id) => onUpdate({ ...inst, transactions: inst.transactions.filter(t => t.id !== id) });

  const txSorted = [...inst.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${open ? sec.color+"50" : C.border}`, marginBottom: 10, overflow: "hidden", transition: "border-color 0.2s" }}>

      {/* Header */}
      <div onClick={() => setOpen(o => !o)} style={{ padding: "13px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${sec.color}15`, border: `1px solid ${sec.color}28`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: sec.color, flexShrink: 0 }}>{sec.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={{ fontWeight: 900, fontSize: 15, color: "#fff" }}>{inst.ticker}</span>
              {inst.type === "etf" && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: C.amber, background: "rgba(251,191,36,0.12)", border: `1px solid ${C.amber}30`, borderRadius: 10, padding: "1px 7px" }}>ETF</span>}
              {inst.savingsPlan?.active && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: C.green, background: "rgba(45,212,191,0.1)", border: `1px solid ${C.green}30`, borderRadius: 10, padding: "1px 7px" }}>◫ Sparplan</span>}
            </div>
            {hasPosition
              ? <span style={{ fontSize: 14, fontWeight: 900, color: m.unrealizedPct >= 0 ? C.green : C.red }}>{m.unrealizedPct >= 0 ? "+" : ""}{fmt(m.unrealizedPct)}%</span>
              : <Tag label="Watchlist" color={C.blue} />}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{inst.name}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            {hasPosition ? <span style={{ color: "#94a3b8" }}>{fmt(m.sharesHeld, 4)} Stk. · {fmt(m.positionValue, 0)} {inst.currency}</span> : <span>Kurs: {inst.currentPrice} {inst.currency}</span>}
            <span style={{ marginLeft: 8, color: C.muted }}>Plan: {inst.plannedReturnPct}% p.a.</span>
          </div>
        </div>
        <span style={{ color: C.faint, fontSize: 11, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </div>

      {/* Expanded */}
      {open && (
        <div style={{ borderTop: `1px solid rgba(255,255,255,0.05)` }}>
          {/* Section tabs */}
          <div style={{ display: "flex", borderBottom: `1px solid rgba(255,255,255,0.05)`, overflowX: "auto" }}>
            {[["overview","Übersicht"],["transactions","Transaktionen"],["plan","Planung"],["settings","Einst."]].map(([id,lbl]) => (
              <button key={id} onClick={() => setSection(id)} style={{
                flex: 1, padding: "9px 4px", background: "none", border: "none", cursor: "pointer",
                color: section === id ? sec.color : C.muted, fontWeight: section === id ? 800 : 400, fontSize: 10,
                borderBottom: section === id ? `2px solid ${sec.color}` : "2px solid transparent",
                textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
              }}>{lbl}</button>
            ))}
          </div>

          <div style={{ padding: "12px 14px 14px" }}>

            {/* OVERVIEW */}
            {section === "overview" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                  {[
                    ["Ø Kaufkurs",       `${fmt(m.avgBuyPrice,2)} ${inst.currency}`, "#94a3b8"],
                    ["Akt. Kurs",        `${inst.currentPrice} ${inst.currency}`,    C.blue],
                    ["Stückzahl",        fmt(m.sharesHeld, 4),                       "#94a3b8"],
                    ["Positionswert",    `${fmt(m.positionValue,0)} ${inst.currency}`, sec.color],
                    ["Unreal. G/V",      `${m.unrealizedPnl>=0?"+":""}${fmt(m.unrealizedPnl,0)} ${inst.currency}`, m.unrealizedPnl>=0?C.green:C.red],
                    ["Real. G/V",        `${m.realizedPnl>=0?"+":""}${fmt(m.realizedPnl,0)} ${inst.currency}`,    m.realizedPnl>=0?C.green:C.red],
                    ["Rendite p.a. (ist)",m.actualAnnual!==null?`${fmt(m.actualAnnual,2)}%`:"–",  m.actualAnnual>=0?C.green:C.red],
                    ["Plan p.a.",        `${inst.plannedReturnPct}%`,                C.blue],
                    ["Abw. v. Plan",     m.deltaAnnual!==null?`${m.deltaAnnual>=0?"+":""}${fmt(m.deltaAnnual,2)}%`:"–", m.deltaAnnual>=0?C.green:C.red],
                  ].map(([k,v,c],i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 9, padding: "8px 9px" }}>
                      <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{k}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>

                {m.deltaAnnual !== null && (
                  <div style={{ borderRadius: 10, padding: "10px 12px", background: m.deltaAnnual>=0?"rgba(45,212,191,0.07)":"rgba(248,113,113,0.07)", border: `1px solid ${m.deltaAnnual>=0?C.green:C.red}30` }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: m.deltaAnnual>=0?C.green:C.red, marginBottom: 3 }}>
                      {m.deltaAnnual >= 0 ? "✓ Plan wird übererfüllt" : "⚠ Plan wird untererfüllt"}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
                      Ist: <strong style={{ color: m.deltaAnnual>=0?C.green:C.red }}>{fmt(m.actualAnnual,2)}% p.a.</strong>
                      {" "}· Plan: <strong>{inst.plannedReturnPct}% p.a.</strong>
                      {" "}· Abw.: <strong>{m.deltaAnnual>=0?"+":""}{fmt(m.deltaAnnual,2)}% p.a.</strong>
                    </div>
                    {m.deltaAnnual < -3 && <div style={{ marginTop: 5, fontSize: 11, color: C.amber, fontWeight: 700 }}>→ Nachsteuern prüfen</div>}
                  </div>
                )}

                {inst.savingsPlan && (
                  <div style={{ marginTop: 9, borderRadius: 10, padding: "10px 12px", background: "rgba(251,191,36,0.07)", border: `1px solid ${C.amber}30` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, marginBottom: 2 }}>◫ Sparplan {inst.savingsPlan.active?"aktiv":"pausiert"}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{inst.savingsPlan.amount} € · {intervalLabel[inst.savingsPlan.interval]}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Nächste Ausf.</div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.amber }}>{inst.savingsPlan.nextDate}</div>
                      </div>
                    </div>
                  </div>
                )}

                {inst.note && (
                  <div style={{ marginTop: 9, borderRadius: 9, padding: "9px 11px", background: "rgba(255,255,255,0.03)", borderLeft: `3px solid ${sec.color}`, fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>{inst.note}</div>
                )}
              </div>
            )}

            {/* TRANSACTIONS */}
            {section === "transactions" && (
              <div>
                {inst.transactions.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5, marginBottom: 12 }}>
                    {[
                      ["Käufe",     inst.transactions.filter(t=>t.type==="buy").length,  C.green],
                      ["Verkäufe",  inst.transactions.filter(t=>t.type==="sell").length, C.red],
                      ["Ø Kurs",    `${fmt(m.avgBuyPrice,2)}`,                           C.blue],
                      ["Investiert",`${fmt(m.totalCost,0)}`,                             "#94a3b8"],
                    ].map(([k,v,c],i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 9, padding: "7px 8px" }}>
                        <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{k}</div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {txSorted.length === 0 && !showTxForm && (
                  <div style={{ textAlign: "center", color: C.muted, padding: "20px 0", fontSize: 12 }}>Noch keine Transaktionen.</div>
                )}

                {txSorted.map(tx => (
                  <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 10, marginBottom: 6, background: tx.type==="buy"?"rgba(45,212,191,0.05)":"rgba(248,113,113,0.05)", border: `1px solid ${tx.type==="buy"?C.green:C.red}20` }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: tx.type==="buy"?"rgba(45,212,191,0.15)":"rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: tx.type==="buy"?C.green:C.red }}>{tx.type==="buy"?"K":"V"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{tx.date}</span>
                        <span style={{ fontSize: 12, fontWeight: 900, color: tx.type==="buy"?C.red:C.green }}>
                          {tx.type==="buy"?"-":"+"}{fmt(tx.price * tx.shares + (tx.type==="buy"?tx.fee:-tx.fee), 2)} {inst.currency}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
                        {fmt(tx.shares, 4)} Stk. × {fmt(tx.price, 2)} {inst.currency}{tx.fee > 0 ? ` · Geb. ${fmt(tx.fee,2)} €` : ""}
                      </div>
                    </div>
                    <button onClick={() => deleteTransaction(tx.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 15, padding: "2px 4px" }}>×</button>
                  </div>
                ))}

                {showTxForm
                  ? <TransactionForm onSave={addTransaction} onCancel={() => setShowTxForm(false)} />
                  : <button onClick={() => setShowTxForm(true)} style={{ width: "100%", padding: "10px", borderRadius: 11, border: `1px dashed ${C.green}40`, background: `${C.green}06`, color: C.green, fontSize: 12, cursor: "pointer", fontWeight: 800, marginTop: 6 }}>+ Transaktion hinzufügen</button>
                }

                {inst.type === "etf" && (
                  showSpForm
                    ? <SavingsPlanForm plan={inst.savingsPlan} onSave={(sp) => { onUpdate({ ...inst, savingsPlan: sp }); setShowSpForm(false); }} onCancel={() => setShowSpForm(false)} />
                    : <button onClick={() => setShowSpForm(true)} style={{ width: "100%", padding: "10px", borderRadius: 11, border: `1px dashed ${C.amber}40`, background: `${C.amber}06`, color: C.amber, fontSize: 12, cursor: "pointer", fontWeight: 800, marginTop: 8 }}>{inst.savingsPlan ? "◫ Sparplan bearbeiten" : "◫ Sparplan einrichten"}</button>
                )}
              </div>
            )}

            {/* PLAN */}
            {section === "plan" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                  {[
                    ["Zielrendite p.a.", `${inst.plannedReturnPct}%`,                                    C.blue],
                    ["Dividende p.a.",   `${inst.plannedDividendPct}%`,                                  C.purple],
                    ["Gesamt p.a.",      `${inst.plannedReturnPct + inst.plannedDividendPct}%`,           C.green],
                    ["Horizont",        `${inst.horizonYears} Jahre`,                                    "#94a3b8"],
                    ["Zielkurs",         `${fmt(m.planTargetPrice,2)} ${inst.currency}`,                 sec.color],
                    ["Akt. Kurs",        `${inst.currentPrice} ${inst.currency}`,                        C.blue],
                  ].map(([k,v,c],i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 9, padding: "9px 10px" }}>
                      <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{k}</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 8 }}>Jahreshochrechnung</div>
                <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
                  {[1,2,3,4,5].map(y => {
                    const basis = m.avgBuyPrice > 0 ? m.avgBuyPrice : inst.currentPrice;
                    const total = inst.plannedReturnPct + inst.plannedDividendPct;
                    const val   = fv(basis, total, y);
                    return (
                      <div key={y} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 9, padding: "8px 4px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>J.{y}</div>
                        <div style={{ fontSize: 12, fontWeight: 900, color: sec.color }}>{fmt(val, 0)}</div>
                        <div style={{ fontSize: 9, color: C.green, marginTop: 2 }}>+{fmt((val/basis-1)*100, 0)}%</div>
                      </div>
                    );
                  })}
                </div>

                {inst.savingsPlan && (
                  <div style={{ background: `${C.amber}08`, borderRadius: 10, border: `1px solid ${C.amber}25`, padding: 11 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: C.amber, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Sparplan-Projektion ({inst.savingsPlan.amount} € / Monat)</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[1,2,3,4,5].map(y => {
                        const r = (inst.plannedReturnPct + inst.plannedDividendPct) / 100 / 12;
                        const n = y * 12;
                        const fvSp = r > 0 ? inst.savingsPlan.amount * ((Math.pow(1+r,n)-1)/r) : inst.savingsPlan.amount * n;
                        const fvEx = m.positionValue * Math.pow(1+(inst.plannedReturnPct+inst.plannedDividendPct)/100, y);
                        return (
                          <div key={y} style={{ flex: 1, background: "rgba(251,191,36,0.07)", borderRadius: 8, padding: "7px 4px", textAlign: "center" }}>
                            <div style={{ fontSize: 8, color: C.muted, marginBottom: 3 }}>J.{y}</div>
                            <div style={{ fontSize: 11, fontWeight: 900, color: C.amber }}>{fmt(fvSp + fvEx, 0)}</div>
                            <div style={{ fontSize: 8, color: C.muted }}>€</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SETTINGS */}
            {section === "settings" && <InstrumentSettings inst={inst} onUpdate={onUpdate} onDelete={onDelete} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [instruments, setInstruments] = useLocalStorage("portfolio-instruments-v1", INITIAL_INSTRUMENTS);
  const [activeTab, setActiveTab]     = useLocalStorage("portfolio-active-tab",     "depot");
  const [filterSector, setFilterSector] = useState("Alle");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTRImport, setShowTRImport] = useState(false);
  const [newInst, setNewInst] = useState({
    ticker: "", name: "", sector: "KI & Halbleiter", currency: "EUR",
    currentPrice: 0, plannedReturnPct: 7, plannedDividendPct: 0,
    horizonYears: 5, type: "stock", savingsPlan: null, note: "", transactions: [],
  });

  const updateInstrument = (updated) => setInstruments(is => is.map(i => i.id === updated.id ? updated : i));
  const deleteInstrument = (id)      => setInstruments(is => is.filter(i => i.id !== id));
  const addInstrument    = ()        => {
    const id = Math.max(0, ...instruments.map(i => i.id)) + 1;
    setInstruments(is => [...is, { ...newInst, id }]);
    setNewInst({ ticker: "", name: "", sector: "KI & Halbleiter", currency: "EUR", currentPrice: 0, plannedReturnPct: 7, plannedDividendPct: 0, horizonYears: 5, type: "stock", savingsPlan: null, note: "", transactions: [] });
    setShowAddForm(false);
  };

  // Export to JSON
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ instruments, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = `depot-backup-${TODAY}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  // Import from JSON
  const importData = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.instruments) { setInstruments(parsed.instruments); alert("Import erfolgreich!"); }
      } catch { alert("Ungültige Datei."); }
    };
    reader.readAsText(file);
  };

  const agg = useMemo(() => {
    const held    = instruments.filter(i => calcPositionMetrics(i).sharesHeld > 0).map(i => ({ i, m: calcPositionMetrics(i) }));
    const totalValue = held.reduce((s,{m}) => s + m.positionValue, 0);
    const totalCost  = held.reduce((s,{m}) => s + m.costBasisHeld, 0);
    const totalPnl   = totalValue - totalCost;
    const pnlPct     = totalCost > 0 ? totalPnl / totalCost * 100 : 0;
    const spTotal    = instruments.filter(i => i.savingsPlan?.active).reduce((s,i) => s + i.savingsPlan.amount, 0);
    const ahead      = held.filter(({m}) => m.deltaAnnual !== null && m.deltaAnnual >= 0).length;
    return { totalValue, totalCost, totalPnl, pnlPct, positions: held.length, spTotal, ahead, total: held.length };
  }, [instruments]);

  const filtered = filterSector === "Alle" ? instruments : instruments.filter(i => i.sector === filterSector);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Syne','DM Sans','Helvetica Neue',sans-serif", color: C.text, maxWidth: 430, margin: "0 auto", backgroundImage: "radial-gradient(ellipse 70% 40% at 15% 0%,rgba(96,165,250,0.07) 0%,transparent 65%),radial-gradient(ellipse 50% 30% at 85% 100%,rgba(45,212,191,0.06) 0%,transparent 65%)" }}>

      {/* HEADER */}
      <div style={{ padding: "22px 18px 12px", borderBottom: `1px solid ${C.border}`, background: "rgba(5,5,15,0.97)", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(20px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 9, color: C.blue, letterSpacing: "0.25em", textTransform: "uppercase", fontWeight: 800 }}>◈ Portfoliotracker</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 2, letterSpacing: "-0.04em" }}>Mein Depot</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Depot-Wert</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: agg.pnlPct >= 0 ? C.green : C.red }}>{fmt(agg.totalValue, 0)} €</div>
            <div style={{ fontSize: 10, color: agg.pnlPct >= 0 ? C.green : C.red }}>{agg.pnlPct >= 0 ? "+" : ""}{fmt(agg.pnlPct, 2)}%</div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: "rgba(5,5,15,0.95)", position: "sticky", top: 76, zIndex: 99 }}>
        {[["depot","Depot"],["performance","Performance"],["sparpläne","Sparpläne"],["planung","Planung"]].map(([id,lbl]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            flex: 1, padding: "11px 0", background: "none", border: "none", cursor: "pointer",
            color: activeTab === id ? C.blue : C.muted, fontWeight: activeTab === id ? 800 : 400, fontSize: 10,
            borderBottom: activeTab === id ? `2px solid ${C.blue}` : "2px solid transparent",
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>{lbl}</button>
        ))}
      </div>

      <div style={{ padding: "14px 13px 110px" }}>

        {/* ══ DEPOT ══ */}
        {activeTab === "depot" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 7, marginBottom: 14 }}>
              {[
                ["Positionen", agg.positions,                                            C.blue],
                ["G/V",       `${agg.totalPnl>=0?"+":""}${fmt(agg.totalPnl,0)} €`,     agg.totalPnl>=0?C.green:C.red],
                ["Im Plan",   `${agg.ahead}/${agg.total}`,                               C.green],
                ["Sparplan",  `${fmt(agg.spTotal,0)} €/M`,                              C.amber],
              ].map(([k,v,c],i) => (
                <div key={i} style={{ background: C.surface, borderRadius: 11, border: `1px solid ${C.border}`, padding: "10px 9px" }}>
                  <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 4 }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Sector filter */}
            <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
              {["Alle",...Object.keys(SECTORS)].map(s => (
                <Chip key={s} active={filterSector===s} color={SECTORS[s]?.color||C.blue} onClick={() => setFilterSector(s)}>
                  {SECTORS[s]?.icon||"◈"} {s}
                </Chip>
              ))}
            </div>

            {filtered.map(inst => <InstrumentCard key={inst.id} inst={inst} onUpdate={updateInstrument} onDelete={deleteInstrument} />)}

            {/* Add */}
            {!showAddForm ? (
              <button onClick={() => setShowAddForm(true)} style={{ width: "100%", padding: "12px", borderRadius: 14, border: `1px dashed ${C.blue}40`, background: `${C.blue}05`, color: C.blue, fontSize: 12, cursor: "pointer", fontWeight: 800, marginTop: 4 }}>+ Aktie / ETF hinzufügen</button>
            ) : (
              <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.blue}30`, padding: 14, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.blue, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>Neue Position</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    ["Ticker*",         "ticker",             "text"],
                    ["Währung",         "currency",           "select-cur"],
                    ["Akt. Kurs",       "currentPrice",       "number"],
                    ["Plan % p.a.",     "plannedReturnPct",   "number"],
                    ["Div. % p.a.",     "plannedDividendPct", "number"],
                    ["Horizont J.",     "horizonYears",       "number"],
                    ["Typ",             "type",               "select-type"],
                    ["Sektor",          "sector",             "select-sector"],
                  ].map(([lbl,field,type]) => (
                    <Field key={field} label={lbl}>
                      {type==="select-cur"    ? <select style={inp} value={newInst[field]} onChange={e => setNewInst(s=>({...s,[field]:e.target.value}))}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select>
                      : type==="select-type"  ? <select style={inp} value={newInst[field]} onChange={e => setNewInst(s=>({...s,[field]:e.target.value}))}><option value="stock">Aktie</option><option value="etf">ETF</option></select>
                      : type==="select-sector"? <select style={inp} value={newInst[field]} onChange={e => setNewInst(s=>({...s,[field]:e.target.value}))}>{Object.keys(SECTORS).map(s=><option key={s}>{s}</option>)}</select>
                      : <input style={inp} type={type==="number"?"number":"text"} value={newInst[field]} onChange={e => setNewInst(s=>({...s,[field]:type==="number"?parseFloat(e.target.value)||0:e.target.value}))} />}
                    </Field>
                  ))}
                </div>
                <Field label="Name*"><input style={{ ...inp, marginTop: 4, marginBottom: 8 }} value={newInst.name} placeholder="z.B. Apple Inc." onChange={e => setNewInst(s=>({...s,name:e.target.value}))} /></Field>
                <div style={{ display: "flex", gap: 7 }}>
                  <button onClick={addInstrument} disabled={!newInst.ticker||!newInst.name} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: newInst.ticker&&newInst.name?C.green:"#1a3a35", color: newInst.ticker&&newInst.name?"#021a18":"#2a5a55", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>Hinzufügen</button>
                  <button onClick={() => setShowAddForm(false)} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.faint}`, background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer" }}>Abbrechen</button>
                </div>
              </div>
            )}

            {/* Trade Republic Import */}
            <div style={{ marginTop: 20, background: `${C.amber}08`, borderRadius: 14, border: `1px solid ${C.amber}30`, padding: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.amber, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6 }}>📲 Trade Republic</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10, lineHeight: 1.5 }}>
                Importiere deine Transaktionen direkt aus dem Trade Republic CSV-Export. Käufe, Verkäufe und Sparpläne werden automatisch erkannt.
              </div>
              <button onClick={() => setShowTRImport(true)} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: C.amber, color: "#1a0e00", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>
                ⬆ TR CSV importieren
              </button>
            </div>

            {/* Backup / Restore */}
            <div style={{ marginTop: 12, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 }}>🔒 Datensicherung</div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, lineHeight: 1.5 }}>
                Alle Daten werden automatisch im Browser gespeichert. Erstelle zusätzlich ein JSON-Backup für andere Geräte oder als Analyse-Export für Claude.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={exportData} style={{ flex: 1, padding: "9px", borderRadius: 10, border: `1px solid ${C.green}40`, background: `${C.green}08`, color: C.green, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>⬇ Export JSON</button>
                <label style={{ flex: 1, padding: "9px", borderRadius: 10, border: `1px solid ${C.blue}40`, background: `${C.blue}08`, color: C.blue, fontSize: 12, fontWeight: 800, cursor: "pointer", textAlign: "center" }}>
                  ⬆ Import JSON
                  <input type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ══ PERFORMANCE ══ */}
        {activeTab === "performance" && (
          <div>
            <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>Plan vs. Realität</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 55px 55px 65px 60px", gap: 4, marginBottom: 6 }}>
                {["Ticker","Plan","Ist","G/V","Abw."].map((h,i) => (
                  <div key={i} style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: i>0?"right":"left" }}>{h}</div>
                ))}
              </div>
              {instruments.map(inst => {
                const m   = calcPositionMetrics(inst);
                const sec = SECTORS[inst.sector];
                return (
                  <div key={inst.id} style={{ display: "grid", gridTemplateColumns: "1fr 55px 55px 65px 60px", gap: 4, padding: "8px 0", borderBottom: `1px solid rgba(255,255,255,0.04)`, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ color: sec?.color, fontSize: 10 }}>{sec?.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{inst.ticker}</div>
                        <div style={{ fontSize: 9, color: C.muted }}>{inst.horizonYears}J</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: C.blue }}>{inst.plannedReturnPct}%</div>
                    <div style={{ textAlign: "right", fontSize: 11, fontWeight: 800, color: m.sharesHeld>0&&m.actualAnnual!==null?(m.actualAnnual>=0?C.green:C.red):C.muted }}>
                      {m.sharesHeld>0&&m.actualAnnual!==null?`${fmt(m.actualAnnual,1)}%`:"–"}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11, fontWeight: 800, color: m.sharesHeld>0?(m.unrealizedPct>=0?C.green:C.red):C.muted }}>
                      {m.sharesHeld>0?`${m.unrealizedPct>=0?"+":""}${fmt(m.unrealizedPct,1)}%`:"–"}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {m.sharesHeld>0 && m.deltaAnnual!==null
                        ? <span style={{ fontSize: 10, fontWeight: 900, color: m.deltaAnnual>=0?C.green:C.red }}>{m.deltaAnnual>=0?"+":""}{fmt(m.deltaAnnual,1)}%</span>
                        : <Tag label={inst.transactions.length===0?"Watch":"–"} color={C.muted} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ SPARPLÄNE ══ */}
        {activeTab === "sparpläne" && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 }}>Aktive Sparpläne</div>
            {instruments.filter(i => i.savingsPlan).map(inst => {
              const sp  = inst.savingsPlan;
              const sec = SECTORS[inst.sector];
              const m   = calcPositionMetrics(inst);
              const intervalLabel = { weekly:"Wöchentlich", biweekly:"2-wöchentl.", monthly:"Monatlich", quarterly:"Quartalsw." };
              const r   = (inst.plannedReturnPct + inst.plannedDividendPct) / 100 / 12;
              return (
                <div key={inst.id} style={{ background: C.surface, borderRadius: 16, border: `1px solid ${sp.active?C.amber+"40":C.border}`, marginBottom: 10, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${sec?.color}15`, border: `1px solid ${sec?.color}28`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: sec?.color }}>{sec?.icon}</div>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 14, color: "#fff" }}>{inst.ticker}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>{inst.name}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: sp.active?C.amber:C.muted }}>{sp.amount} €</div>
                      <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase" }}>{intervalLabel[sp.interval]}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                    {[
                      ["Nächste Ausf.", sp.nextDate,                                              C.amber],
                      ["Käufe ausgeführt", inst.transactions.filter(t=>t.type==="buy").length,    C.blue],
                      ["Status",       sp.active?"Aktiv":"Pausiert",                              sp.active?C.green:C.red],
                      ["Depot-Wert",   `${fmt(m.positionValue,0)} €`,                            sec?.color],
                      ["Ø Kaufkurs",   `${fmt(m.avgBuyPrice,2)} €`,                              "#94a3b8"],
                      ["Akt. Kurs",    `${inst.currentPrice} €`,                                 C.blue],
                    ].map(([k,v,c],i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 9, padding: "8px 9px" }}>
                        <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{k}</div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: `${C.amber}07`, borderRadius: 10, padding: 10, border: `1px solid ${C.amber}20` }}>
                    <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 7 }}>Projektion: Sparplan + Bestand (5 Jahre)</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[1,2,3,4,5].map(y => {
                        const n   = y * 12;
                        const fvSp = r>0 ? sp.amount*((Math.pow(1+r,n)-1)/r) : sp.amount*n;
                        const fvEx = m.positionValue * Math.pow(1+(inst.plannedReturnPct+inst.plannedDividendPct)/100, y);
                        return (
                          <div key={y} style={{ flex: 1, background: "rgba(251,191,36,0.08)", borderRadius: 8, padding: "7px 4px", textAlign: "center" }}>
                            <div style={{ fontSize: 8, color: C.muted, marginBottom: 3 }}>J.{y}</div>
                            <div style={{ fontSize: 12, fontWeight: 900, color: C.amber }}>{fmt(fvSp+fvEx, 0)}</div>
                            <div style={{ fontSize: 8, color: C.muted }}>€</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {instruments.filter(i => i.savingsPlan).length === 0 && (
              <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontSize: 12 }}>Noch keine Sparpläne. ETF-Position öffnen → Transaktionen → Sparplan einrichten.</div>
            )}
            {agg.spTotal > 0 && (
              <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 }}>Monatliche Gesamtbelastung</div>
                {instruments.filter(i => i.savingsPlan?.active).map(inst => (
                  <div key={inst.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{inst.ticker}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.amber }}>{inst.savingsPlan.amount} € / Monat</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0" }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Gesamt</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: C.amber }}>{agg.spTotal} € / Monat</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ PLANUNG ══ */}
        {activeTab === "planung" && (
          <div>
            <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>Planübersicht – 5-Jahreshochrechnung</div>
              {instruments.map(inst => {
                const sec  = SECTORS[inst.sector];
                const m    = calcPositionMetrics(inst);
                const total = inst.plannedReturnPct + inst.plannedDividendPct;
                const basis = m.avgBuyPrice > 0 ? m.avgBuyPrice : inst.currentPrice;
                return (
                  <div key={inst.id} style={{ padding: "10px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                        <span style={{ color: sec?.color, fontSize: 12 }}>{sec?.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{inst.ticker}</span>
                        <span style={{ fontSize: 9, color: C.muted }}>{total}% p.a.</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: sec?.color }}>{fmt(m.planTargetPrice, 2)} {inst.currency}</div>
                        <div style={{ fontSize: 9, color: C.muted }}>Zielkurs</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[1,2,3,4,5].map(y => {
                        const val = fv(basis, total, y);
                        return (
                          <div key={y} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "5px 3px", textAlign: "center" }}>
                            <div style={{ fontSize: 8, color: C.muted }}>J{y}</div>
                            <div style={{ fontSize: 10, fontWeight: 800, color: sec?.color }}>{fmt(val, 0)}</div>
                            <div style={{ fontSize: 7, color: C.green }}>+{fmt((val/basis-1)*100, 0)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 }}>Strategie & Regeln</div>
              {[
                ["Budget gesamt","10.000 €"],["Anlagehorizont","2 J. Trade / 5 J. Plan"],
                ["Max. Trades","1× pro Woche"],["Ørsted-Regel","2 saubere Quartale"],
                ["Nachsteuern wenn","Abw. > –3% p.a."],["Cash-Reserve","Min. 10% halten"],
                ["Fokus","China 15. FJP + Erneuerbare"],
              ].map(([k,v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)`, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: C.muted }}>{k}</span>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* TR Import Modal */}
      {showTRImport && (
        <TRImport
          instruments={instruments}
          onImport={(updated) => { setInstruments(updated); setShowTRImport(false); }}
          onClose={() => setShowTRImport(false)}
        />
      )}
    </div>
  );
}
