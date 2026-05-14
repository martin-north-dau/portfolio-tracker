import { useState, useMemo, useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage.js";
import TRImport from "./TRImport.jsx";

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
};

export default function App() {
  const [instruments, setInstruments] = useLocalStorage("portfolio_data", {});
  const [historicalPrices, setHistoricalPrices] = useLocalStorage("hist_prices", {});
  const [showTRImport, setShowTRImport] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const API_KEY = "d82p4m9r01qvkevnc3qgd82p4m9r01qvkevnc3r0";

  // Helper: Calculate Metrics
  const calcPositionMetrics = (inst) => {
    let totalShares = 0;
    let totalCost = 0;
    inst.transactions.forEach(t => {
      if (t.type === "Kauf") {
        totalShares += t.shares;
        totalCost += (t.shares * t.price) + (t.fees || 0);
      } else {
        totalShares -= t.shares;
        // Simple FIFO / Average Cost logic
      }
    });
    const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
    const currentVal = totalShares * (inst.currentPrice || 0);
    const profitAbs = currentVal - (avgPrice * totalShares);
    return { shares: totalShares, avgPrice, currentVal, profitAbs };
  };

  // API: Current Prices
  const updateAllPrices = async () => {
    setIsUpdating(true);
    const updated = { ...instruments };
    for (const isin in updated) {
      try {
        const symbol = updated[isin].symbol || isin;
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`);
        const data = await res.json();
        if (data.c) updated[isin].currentPrice = data.c;
      } catch (e) { console.error(e); }
      await new Promise(r => setTimeout(r, 200));
    }
    setInstruments(updated);
    setIsUpdating(false);
  };

  // API: Historical Prices
  const fetchHistoricalPrices = async () => {
    setIsUpdating(true);
    const updatedHist = { ...historicalPrices };
    const currentYear = new Date().getFullYear();
    for (const isin in instruments) {
      const symbol = instruments[isin].symbol || isin;
      if (!updatedHist[isin]) updatedHist[isin] = {};
      for (let year = currentYear - 1; year >= 2021; year--) {
        if (updatedHist[isin][year]) continue;
        try {
          const ts = Math.floor(new Date(`${year}-12-31T20:00:00Z`).getTime() / 1000);
          const res = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${ts-345600}&to=${ts}&token=${API_KEY}`);
          const data = await res.json();
          if (data.c && data.c.length > 0) updatedHist[isin][year] = data.c[data.c.length-1];
        } catch (e) {}
        await new Promise(r => setTimeout(r, 200));
      }
    }
    setHistoricalPrices(updatedHist);
    setIsUpdating(false);
  };

  // Logic: Yearly Performance
  const yearlyPerformance = useMemo(() => {
    const years = {};
    const currentYear = new Date().getFullYear();
    Object.keys(instruments).forEach(isin => {
      const inst = instruments[isin];
      const m = calcPositionMetrics(inst);
      if (!years[currentYear]) years[currentYear] = { profit: 0, dividends: 0, invested: 0 };
      years[currentYear].profit += m.profitAbs;
      years[currentYear].invested += (m.avgPrice * m.shares);

      inst.dividends?.forEach(d => {
        const y = new Date(d.date).getFullYear();
        if (!years[y]) years[y] = { profit: 0, dividends: 0, invested: 0 };
        years[y].dividends += d.amount;
      });

      Object.entries(historicalPrices[isin] || {}).forEach(([y, price]) => {
        if (!years[y]) years[y] = { profit: 0, dividends: 0, invested: 0 };
        if (parseInt(y) < currentYear) {
            years[y].profit += (price * m.shares) - (m.avgPrice * m.shares);
            years[y].invested += (m.avgPrice * m.shares);
        }
      });
    });
    return Object.entries(years).sort((a,b) => b[0]-a[0]);
  }, [instruments, historicalPrices]);

  // Logic: 10-Year Projection
  const projection = useMemo(() => {
    let currentTotal = 0;
    let monthlyInvest = 0;
    let weightedRet = 0;
    Object.values(instruments).forEach(inst => {
      const m = calcPositionMetrics(inst);
      currentTotal += m.currentVal;
      if (inst.savingsPlan?.active) monthlyInvest += (inst.savingsPlan.amount / (inst.savingsPlan.interval || 1));
      if (currentTotal > 0) weightedRet += (m.currentVal / currentTotal) * (inst.targetPaa || 5);
    });
    const data = [];
    let run = currentTotal;
    const r = (weightedRet || 5) / 100;
    for (let i = 0; i <= 10; i++) {
      data.push({ year: new Date().getFullYear() + i, value: run });
      run = (run * (1+r)) + (monthlyInvest * 12 * (1 + r/2));
    }
    return { chart: data, monthly: monthlyInvest, rate: weightedRet };
  }, [instruments]);

  return (
    <div style={{ backgroundColor: C.bg, minHeight: "100vh", color: C.text, padding: 20, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Portfolio Tracker</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={updateAllPrices} disabled={isUpdating} style={{ background: C.blue, color: "white", border: "none", padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{isUpdating ? "..." : "🔄 Kurse"}</button>
          <button onClick={() => setShowTRImport(true)} style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontSize: 12 }}>Import</button>
        </div>
      </div>

      {/* Yearly Performance Table */}
      <div style={{ background: C.surface, borderRadius: 16, padding: 20, border: `1px solid ${C.border}`, marginBottom: 25 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 15 }}>
          <h2 style={{ fontSize: 15, color: C.blue }}>📊 Performance nach Jahren</h2>
          <button onClick={fetchHistoricalPrices} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>Hist. laden</button>
        </div>
        <table style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ color: C.muted, textAlign: "left" }}>
              <th>Jahr</th><th>Investiert</th><th>Dividenden</th><th style={{ textAlign: "right" }}>Rendite</th>
            </tr>
          </thead>
          <tbody>
            {yearlyPerformance.map(([y, d]) => (
              <tr key={y} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: "10px 0", fontWeight: 700 }}>{y}</td>
                <td>{d.invested.toFixed(0)} €</td>
                <td style={{ color: C.green }}>+{d.dividends.toFixed(2)} €</td>
                <td style={{ textAlign: "right", color: (d.profit+d.dividends) >= 0 ? C.green : C.red, fontWeight: 700 }}>
                  {(((d.profit+d.dividends)/d.invested)*100 || 0).toFixed(1)} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Projection Chart */}
      <div style={{ background: C.surface, borderRadius: 16, padding: 20, border: `1px solid ${C.border}` }}>
        <h2 style={{ fontSize: 15, color: C.purple, marginBottom: 5 }}>🚀 10-Jahre Prognose</h2>
        <p style={{ fontSize: 10, color: C.muted, marginBottom: 20 }}>Ø {projection.rate.toFixed(1)}% p.a. + {projection.monthly.toFixed(0)}€ mtl.</p>
        <div style={{ display: "flex", alignItems: "flex-end", height: 120, gap: 5 }}>
          {projection.chart.map((d, i) => (
            <div key={d.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: "100%", height: `${(d.value / projection.chart[10].value) * 100}%`, background: `linear-gradient(to top, ${C.purple}33, ${C.purple})`, borderRadius: "3px 3px 0 0" }} />
              <span style={{ fontSize: 8, color: C.muted, marginTop: 5 }}>{d.year}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{projection.chart[10].value.toLocaleString()} €</div>
        </div>
      </div>

      {showTRImport && <TRImport instruments={instruments} onImport={setInstruments} onClose={() => setShowTRImport(false)} />}
    </div>
  );
}
