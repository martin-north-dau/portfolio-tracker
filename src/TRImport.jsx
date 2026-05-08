/**
 * TRImport.jsx – Trade Republic CSV Import
 *
 * Unterstützt zwei Formate:
 *  1. Nativer TR-Export (Beta): Kontoauszüge → Transaktionsexport → Teilen
 *     Spalten: date, time, type, name, isin, shares, price, amount, tax, fee, currency
 *
 *  2. pytr account_transactions.csv (Fallback)
 *     Spalten: date, type, name, isin, shares, price, amount, fee
 *
 * Beide Formate werden automatisch erkannt.
 */

import { useState, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
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
  background: "#0a0a1a", border: `1px solid #1e2235`,
  borderRadius: 8, color: "#e8eaf0", padding: "7px 10px",
  fontSize: 13, width: "100%", boxSizing: "border-box",
};

// ─── CSV PARSER ───────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current  = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if ((ch === "," || ch === ";") && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function parseNum(str) {
  if (!str) return 0;
  // Handle European format: 1.234,56 → 1234.56
  const cleaned = String(str).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.abs(n);
}

function parseDate(str) {
  if (!str) return null;
  // ISO: 2025-01-15  or  15.01.2025  or  2025-01-15T10:30:00
  const iso = str.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const parts = str.split(".");
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
  return str.slice(0, 10);
}

// Map TR transaction type strings → "buy" | "sell" | "dividend" | "deposit" | "other"
function mapType(raw = "") {
  const t = raw.toLowerCase().trim();
  if (t.includes("kauf") || t.includes("buy") || t.includes("sparplan") || t.includes("savings")) return "buy";
  if (t.includes("verkauf") || t.includes("sell")) return "sell";
  if (t.includes("dividende") || t.includes("dividend") || t.includes("ausschüttung")) return "dividend";
  if (t.includes("einzahlung") || t.includes("deposit") || t.includes("überweisung")) return "deposit";
  if (t.includes("zinsen") || t.includes("interest") || t.includes("saveback") || t.includes("round")) return "other";
  return "other";
}

function detectFormat(headers) {
  const h = headers.map(x => x.toLowerCase().replace(/[^a-z]/g, ""));
  if (h.includes("isin")) return "tr_native";
  if (h.includes("wkn") || h.includes("typ")) return "tr_pdf";
  return "tr_native"; // best-effort fallback
}

export function parseTradeRepublicCSV(csvText) {
  const lines  = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV ist leer oder hat keine Datenzeilen.");

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/\s+/g,"_"));

  const fmt = detectFormat(headers);

  // Column index helpers
  const col = (names) => {
    for (const n of names) {
      const idx = headers.findIndex(h => h.includes(n));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const iDate   = col(["datum","date","time"]);
  const iType   = col(["typ","type","art","transaktion"]);
  const iName   = col(["name","titel","bezeichnung","wertpapier"]);
  const iISIN   = col(["isin"]);
  const iShares = col(["anteile","stueck","anzahl","shares","menge","qty","quantity"]);
  const iPrice  = col(["kurs","preis","price","einzelpreis"]);
  const iAmount = col(["betrag","amount","gesamt","total","wert"]);
  const iFee    = col(["gebuehr","gebuehren","fee","provision","kosten"]);
  const iTax    = col(["steuer","tax"]);
  const iCur    = col(["waehrung","currency","ccy"]);

  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length < 3) continue;

    const rawType = iType >= 0 ? cells[iType] : "";
    const txType  = mapType(rawType);

    // Skip non-investment rows (deposits, interest, saveback…)
    if (txType === "deposit" || txType === "other") continue;
    // Skip rows with no ISIN (cash movements)
    const isin = iISIN >= 0 ? cells[iISIN]?.trim() : "";
    if (!isin && txType !== "dividend") continue;

    const date   = parseDate(iDate >= 0 ? cells[iDate] : "");
    const name   = iName >= 0 ? cells[iName]?.trim() : isin;
    const shares = parseNum(iShares >= 0 ? cells[iShares] : "");
    const price  = parseNum(iPrice  >= 0 ? cells[iPrice]  : "");
    const fee    = parseNum(iFee    >= 0 ? cells[iFee]    : "0");
    const tax    = parseNum(iTax    >= 0 ? cells[iTax]    : "0");
    const currency = iCur >= 0 ? cells[iCur]?.trim() || "EUR" : "EUR";

    if (!date) { errors.push(`Zeile ${i+1}: Datum fehlt`); continue; }
    if (txType !== "dividend" && shares <= 0) { errors.push(`Zeile ${i+1}: Stückzahl fehlt (${name})`); continue; }
    if (txType !== "dividend" && price  <= 0) { errors.push(`Zeile ${i+1}: Kurs fehlt (${name})`); continue; }

    rows.push({ date, type: txType, name, isin, shares, price, fee: fee + tax, currency, rawType });
  }

  return { rows, errors, fmt, totalLines: lines.length - 1 };
}

// Group parsed rows by ISIN → instrument map
export function groupByInstrument(rows) {
  const map = {};
  for (const r of rows) {
    const key = r.isin || r.name;
    if (!map[key]) map[key] = { name: r.name, isin: r.isin, currency: r.currency, transactions: [] };
    if (r.type === "buy" || r.type === "sell") {
      map[key].transactions.push({
        id:     map[key].transactions.length + 1,
        type:   r.type,
        date:   r.date,
        price:  r.price,
        shares: r.shares,
        fee:    r.fee,
      });
    }
  }
  return Object.values(map).filter(g => g.transactions.length > 0);
}

// ─── IMPORT MODAL ─────────────────────────────────────────────────────────────

export default function TRImport({ instruments, onImport, onClose }) {
  const [step, setStep]         = useState("upload");   // upload | preview | done
  const [parsed, setParsed]     = useState(null);       // { rows, errors, fmt, totalLines }
  const [grouped, setGrouped]   = useState([]);          // grouped by instrument
  const [selected, setSelected] = useState({});          // isin/name → bool
  const [mode, setMode]         = useState("merge");     // merge | replace
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result  = parseTradeRepublicCSV(e.target.result);
        const groups  = groupByInstrument(result.rows);
        const sel     = {};
        groups.forEach(g => { sel[g.isin || g.name] = true; });
        setParsed(result);
        setGrouped(groups);
        setSelected(sel);
        setStep("preview");
      } catch (err) {
        alert("Fehler beim Parsen: " + err.message);
      }
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const toggleAll = (val) => {
    const s = {};
    grouped.forEach(g => { s[g.isin || g.name] = val; });
    setSelected(s);
  };

  const doImport = () => {
    const selectedGroups = grouped.filter(g => selected[g.isin || g.name]);
    let added = 0, updated = 0, created = 0;

    const newInstruments = [...instruments];

    for (const group of selectedGroups) {
      const key = group.isin || group.name;
      // Find existing instrument by ISIN or name
      const existIdx = newInstruments.findIndex(i =>
        (group.isin && (i.isin === group.isin || i.ticker === group.isin)) ||
        i.name.toLowerCase() === group.name.toLowerCase() ||
        i.ticker.toLowerCase() === group.isin?.toLowerCase()
      );

      if (existIdx >= 0) {
        // Merge or replace transactions
        const existing = { ...newInstruments[existIdx] };
        if (mode === "replace") {
          existing.transactions = group.transactions.map((t, i) => ({ ...t, id: i + 1 }));
        } else {
          // Merge: add transactions not already present (by date+price+shares)
          const existDates = new Set(existing.transactions.map(t => `${t.date}_${t.price}_${t.shares}`));
          const toAdd = group.transactions.filter(t => !existDates.has(`${t.date}_${t.price}_${t.shares}`));
          const maxId = existing.transactions.reduce((m, t) => Math.max(m, t.id), 0);
          existing.transactions = [
            ...existing.transactions,
            ...toAdd.map((t, i) => ({ ...t, id: maxId + i + 1 })),
          ].sort((a, b) => new Date(a.date) - new Date(b.date));
          added += toAdd.length;
        }
        newInstruments[existIdx] = existing;
        updated++;
      } else {
        // Create new instrument with defaults
        const newId = Math.max(0, ...newInstruments.map(i => i.id)) + 1;
        newInstruments.push({
          id:               newId,
          ticker:           group.isin || group.name.split(" ")[0].toUpperCase(),
          name:             group.name,
          isin:             group.isin || "",
          sector:           "KI & Halbleiter",
          currency:         group.currency || "EUR",
          currentPrice:     group.transactions.slice(-1)[0]?.price || 0,
          plannedReturnPct: 7,
          plannedDividendPct: 0,
          horizonYears:     5,
          type:             "stock",
          savingsPlan:      null,
          note:             `Importiert aus Trade Republic – bitte Sektor und Planziele anpassen.`,
          transactions:     group.transactions,
        });
        created++;
      }
    }

    onImport(newInstruments);
    setImportResult({ added, updated, created, total: selectedGroups.length });
    setStep("done");
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: "100%", maxWidth: 430,
        background: "#0c0c1e", borderRadius: "20px 20px 0 0",
        border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none",
        maxHeight: "92vh", overflowY: "auto",
        animation: "slideUp 0.25s ease",
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity:0; } to { transform: translateY(0); opacity:1; } }`}</style>

        {/* Header */}
        <div style={{ padding: "18px 18px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 9, color: C.amber, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 800, marginBottom: 4 }}>◈ Trade Republic</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>CSV Import</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: "50%", width: 32, height: 32, color: C.muted, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 6, padding: "14px 18px 0" }}>
          {[["upload","1. Datei"],["preview","2. Prüfen"],["done","3. Fertig"]].map(([id, lbl]) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: step === id ? C.amber : step === "done" && id !== "done" ? C.green : "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: step===id||( step==="done"&&id!=="done") ? "#000" : C.muted }}>{id==="done"&&step==="done"?"✓":["upload","preview","done"].indexOf(id)+1}</div>
              <span style={{ fontSize: 10, color: step === id ? C.amber : C.muted, fontWeight: step === id ? 700 : 400 }}>{lbl}</span>
              {id !== "done" && <span style={{ color: C.faint, fontSize: 10 }}>›</span>}
            </div>
          ))}
        </div>

        <div style={{ padding: "16px 18px 32px" }}>

          {/* ── STEP 1: UPLOAD ── */}
          {step === "upload" && (
            <div>
              {/* How to export guide */}
              <div style={{ background: `${C.amber}0a`, borderRadius: 14, border: `1px solid ${C.amber}25`, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>So exportierst du aus Trade Republic</div>
                {[
                  ["①", "Trade Republic App öffnen"],
                  ["②", "Unten auf \"Konto\" tippen (Person-Icon)"],
                  ["③", "\"Kontoauszüge\" antippen"],
                  ["④", "\"Transaktionsexport\" wählen"],
                  ["⑤", "\"Teilen\" → Datei speichern (CSV)"],
                  ["⑥", "CSV hier hochladen →"],
                ].map(([num, txt]) => (
                  <div key={num} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 7 }}>
                    <span style={{ fontSize: 13, color: C.amber, flexShrink: 0, width: 20 }}>{num}</span>
                    <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.4 }}>{txt}</span>
                  </div>
                ))}
                <div style={{ marginTop: 8, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  Falls "Transaktionsexport" noch nicht sichtbar ist, ist das Feature bei dir noch nicht freigeschaltet (Beta). Alternativ: <strong style={{ color: C.amber }}>pytr-Export</strong> (account_transactions.csv) wird ebenfalls erkannt.
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                style={{
                  border: `2px dashed ${dragOver ? C.amber : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 16, padding: "32px 20px",
                  textAlign: "center", transition: "all 0.2s",
                  background: dragOver ? `${C.amber}06` : "transparent",
                  marginBottom: 14,
                }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>CSV hier hineinziehen</div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>oder Datei auswählen</div>
                <label style={{ display: "inline-block", padding: "10px 24px", borderRadius: 10, background: C.amber, color: "#1a0e00", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>
                  Datei auswählen
                  <input type="file" accept=".csv,.txt" onChange={e => handleFile(e.target.files[0])} style={{ display: "none" }} />
                </label>
              </div>

              {/* Supported formats */}
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 12 }}>
                <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 8 }}>Unterstützte Formate</div>
                {[
                  ["✅","TR Nativer Export","Kontoauszüge → Transaktionsexport (Beta)"],
                  ["✅","pytr CSV","account_transactions.csv"],
                  ["✅","Semikolon & Komma","Beide Trennzeichen automatisch erkannt"],
                  ["✅","Deutsche Zahlen","1.234,56 wird korrekt geparst"],
                ].map(([icon, name, desc]) => (
                  <div key={name} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>{name}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 2: PREVIEW ── */}
          {step === "preview" && parsed && (
            <div>
              {/* Parse summary */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginBottom: 14 }}>
                {[
                  ["Zeilen gelesen", parsed.totalLines, C.blue],
                  ["Transaktionen",  parsed.rows.length, C.green],
                  ["Warnungen",      parsed.errors.length, parsed.errors.length > 0 ? C.amber : C.muted],
                ].map(([k, v, c]) => (
                  <div key={k} style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{k}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: c }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Errors */}
              {parsed.errors.length > 0 && (
                <div style={{ background: "rgba(251,191,36,0.07)", borderRadius: 10, border: `1px solid ${C.amber}30`, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.amber, marginBottom: 6 }}>⚠ Übersprungene Zeilen</div>
                  {parsed.errors.slice(0, 5).map((e, i) => <div key={i} style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>{e}</div>)}
                  {parsed.errors.length > 5 && <div style={{ fontSize: 10, color: C.muted }}>…und {parsed.errors.length - 5} weitere</div>}
                </div>
              )}

              {/* Merge mode */}
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Importmodus</div>
                <div style={{ display: "flex", gap: 7 }}>
                  {[["merge","Zusammenführen","Neue Transaktionen ergänzen, bestehende behalten"],["replace","Ersetzen","Alle Transaktionen der Position neu schreiben"]].map(([val, lbl, desc]) => (
                    <button key={val} onClick={() => setMode(val)} style={{
                      flex: 1, padding: "9px 8px", borderRadius: 10,
                      border: `1px solid ${mode===val ? C.blue : "rgba(255,255,255,0.08)"}`,
                      background: mode===val ? `${C.blue}12` : "transparent",
                      color: mode===val ? C.blue : C.muted,
                      cursor: "pointer", textAlign: "left",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 2 }}>{lbl}</div>
                      <div style={{ fontSize: 9, color: mode===val ? "#60a5fa90" : C.faint, lineHeight: 1.4 }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Instrument list */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Positionen ({grouped.length})
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => toggleAll(true)}  style={{ fontSize: 10, color: C.blue, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>Alle</button>
                    <button onClick={() => toggleAll(false)} style={{ fontSize: 10, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>Keine</button>
                  </div>
                </div>

                {grouped.map(g => {
                  const key    = g.isin || g.name;
                  const isSelected = selected[key];
                  const buys   = g.transactions.filter(t => t.type === "buy").length;
                  const sells  = g.transactions.filter(t => t.type === "sell").length;
                  const exists = instruments.some(i =>
                    (g.isin && (i.isin === g.isin || i.ticker === g.isin)) ||
                    i.name.toLowerCase() === g.name.toLowerCase()
                  );
                  return (
                    <div key={key} onClick={() => setSelected(s => ({ ...s, [key]: !s[key] }))} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", borderRadius: 12, marginBottom: 6,
                      background: isSelected ? "rgba(96,165,250,0.06)" : C.surface,
                      border: `1px solid ${isSelected ? C.blue+"40" : C.border}`,
                      cursor: "pointer", transition: "all 0.15s",
                    }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? C.blue : "rgba(255,255,255,0.15)"}`, background: isSelected ? C.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {isSelected && <span style={{ fontSize: 11, color: "#000", fontWeight: 900 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                          {exists
                            ? <span style={{ fontSize: 9, color: C.green, background: `${C.green}15`, border: `1px solid ${C.green}30`, borderRadius: 10, padding: "1px 7px", fontWeight: 700, flexShrink: 0 }}>Vorhanden</span>
                            : <span style={{ fontSize: 9, color: C.amber, background: `${C.amber}15`, border: `1px solid ${C.amber}30`, borderRadius: 10, padding: "1px 7px", fontWeight: 700, flexShrink: 0 }}>Neu</span>
                          }
                        </div>
                        <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                          {g.isin && <span style={{ marginRight: 8 }}>{g.isin}</span>}
                          <span style={{ color: C.green }}>{buys} Käufe</span>
                          {sells > 0 && <span style={{ color: C.red, marginLeft: 6 }}>{sells} Verkäufe</span>}
                          <span style={{ marginLeft: 6 }}>{g.currency}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setStep("upload")} style={{ padding: "11px 16px", borderRadius: 11, border: `1px solid ${C.faint}`, background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer" }}>← Zurück</button>
                <button onClick={doImport} disabled={!Object.values(selected).some(Boolean)} style={{
                  flex: 1, padding: "11px", borderRadius: 11, border: "none",
                  background: Object.values(selected).some(Boolean) ? C.amber : "#2a1e00",
                  color: Object.values(selected).some(Boolean) ? "#1a0e00" : "#4a3500",
                  fontSize: 13, fontWeight: 900, cursor: Object.values(selected).some(Boolean) ? "pointer" : "default",
                }}>
                  {Object.values(selected).filter(Boolean).length} Positionen importieren →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: DONE ── */}
          {step === "done" && importResult && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 8 }}>Import erfolgreich!</div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24, lineHeight: 1.6 }}>
                {importResult.created > 0 && <div><span style={{ color: C.amber, fontWeight: 700 }}>{importResult.created}</span> neue Positionen angelegt</div>}
                {importResult.updated > 0 && <div><span style={{ color: C.blue,  fontWeight: 700 }}>{importResult.updated}</span> bestehende Positionen aktualisiert</div>}
                {importResult.added  > 0 && <div><span style={{ color: C.green, fontWeight: 700 }}>{importResult.added}</span>  neue Transaktionen hinzugefügt</div>}
              </div>
              <div style={{ background: `${C.amber}0a`, borderRadius: 12, border: `1px solid ${C.amber}25`, padding: 12, marginBottom: 20, textAlign: "left" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.amber, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Nächste Schritte</div>
                {[
                  "Neue Positionen: Sektor & Planziele anpassen",
                  "Aktuellen Kurs pro Position eintragen",
                  "Sparplan ggf. konfigurieren (ETFs)",
                ].map((t, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>→ {t}</div>
                ))}
              </div>
              <button onClick={onClose} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: C.amber, color: "#1a0e00", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>
                Zum Depot →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
