import { useState, useCallback } from "react";

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
};

const inp = {
  background: "#0a0a1a", border: "1px solid #1e2235",
  borderRadius: 8, color: "#e8eaf0", padding: "7px 10px",
  fontSize: 13, width: "100%", boxSizing: "border-box",
};

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else current += char;
  }
  result.push(current.trim());
  return result;
}

export default function TRImport({ instruments, onImport, onClose }) {
  const [csvData, setCsvData] = useState("");
  const [importMode, setImportMode] = useState("merge");
  const [importResult, setImportResult] = useState(null);

  const handleProcess = useCallback(() => {
    if (!csvData) return;
    const lines = csvData.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) return;

    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(parseCSVLine);

    const idx = {
      category: headers.indexOf("category"),
      type: headers.indexOf("type"),
      isin: headers.indexOf("symbol"),
      name: headers.indexOf("name"),
      shares: headers.indexOf("shares"),
      price: headers.indexOf("price"),
      amount: headers.indexOf("amount"),
      fee: headers.indexOf("fee"),
      tax: headers.indexOf("tax"),
      date: headers.indexOf("date")
    };

    let newInstruments = importMode === "replace" ? {} : { ...instruments };
    let stats = { created: 0, updated: 0, transactions: 0, dividends: 0 };

    rows.forEach(row => {
      const category = row[idx.category];
      const type = row[idx.type];
      const isin = row[idx.isin];
      if (!isin) return;

      if (!newInstruments[isin]) {
        newInstruments[isin] = {
          name: row[idx.name] || "Unbekannt",
          isin: isin,
          symbol: isin,
          sector: "Sonstige",
          currentPrice: parseFloat(row[idx.price] || 0),
          targetPaa: 5,
          transactions: [],
          dividends: [],
          savingsPlan: { active: false, amount: 0, interval: 1 }
        };
        stats.created++;
      }

      // TRADING Logic
      if (category === "TRADING" && (type === "BUY" || type === "SELL")) {
        const shares = Math.abs(parseFloat(row[idx.shares] || 0));
        const price = parseFloat(row[idx.price] || 0);
        const fee = Math.abs(parseFloat(row[idx.fee] || 0));
        const date = row[idx.date];
        
        const isDup = newInstruments[isin].transactions.some(t => t.date === date && t.shares === shares);
        if (!isDup) {
          newInstruments[isin].transactions.push({
            id: Math.random().toString(36).substr(2, 9),
            date,
            type: type === "BUY" ? "Kauf" : "Verkauf",
            shares,
            price,
            fees: fee
          });
          stats.transactions++;
        }
      }

      // DIVIDEND Logic
      if (type === "DIVIDEND" || type === "INTEREST") {
        const amount = parseFloat(row[idx.amount] || 0);
        const tax = Math.abs(parseFloat(row[idx.tax] || 0));
        const date = row[idx.date];
        const isDup = newInstruments[isin].dividends?.some(d => d.date === date && d.amount === amount);
        if (!isDup) {
          if (!newInstruments[isin].dividends) newInstruments[isin].dividends = [];
          newInstruments[isin].dividends.push({
            id: Math.random().toString(36).substr(2, 9),
            date, amount, tax, net: amount - tax
          });
          stats.dividends++;
        }
      }
    });

    onImport(newInstruments);
    setImportResult(stats);
  }, [csvData, importMode, instruments, onImport]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div style={{ background: "#0a0a1a", width: "100%", maxWidth: 450, borderRadius: 24, border: `1px solid ${C.border}`, padding: 24, textAlign: "center" }}>
        {!importResult ? (
          <>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>Trade Republic Import</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Füge den Inhalt deiner Transaktionsexport.csv hier ein.</p>
            <textarea 
              value={csvData} 
              onChange={e => setCsvData(e.target.value)} 
              placeholder="datetime,date,category..."
              style={{ ...inp, height: 180, marginBottom: 15, fontSize: 11, fontFamily: "monospace" }}
            />
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button onClick={() => setImportMode("merge")} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: importMode === "merge" ? C.blue : C.faint, color: "white", cursor: "pointer" }}>Zusammenführen</button>
              <button onClick={() => setImportMode("replace")} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: importMode === "replace" ? C.red : C.faint, color: "white", cursor: "pointer" }}>Ersetzen</button>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: "none", color: C.text }}>Abbrechen</button>
              <button onClick={handleProcess} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: C.green, color: "black", fontWeight: 700 }}>Importieren</button>
            </div>
          </>
        ) : (
          <div>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <h2 style={{ marginBottom: 20 }}>Import erfolgreich</h2>
            <div style={{ textAlign: "left", fontSize: 13, background: C.faint, padding: 15, borderRadius: 12, marginBottom: 20 }}>
              <div>New Tickers: {importResult.created}</div>
              <div>Transactions: {importResult.transactions}</div>
              <div>Dividends: {importResult.dividends}</div>
            </div>
            <button onClick={onClose} style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", background: C.blue, color: "white" }}>Schließen</button>
          </div>
        )}
      </div>
    </div>
  );
}
