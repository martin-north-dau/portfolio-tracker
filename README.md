# 📱 Portfoliotracker – Deployment-Anleitung

## Voraussetzungen
- Node.js installiert (kostenlos: https://nodejs.org → LTS-Version)
- Ein kostenloses Konto auf https://github.com
- Ein kostenloses Konto auf https://vercel.com

---

## Schritt 1 – Projekt lokal einrichten

```bash
# In den Projektordner wechseln
cd portfolio-tracker

# Abhängigkeiten installieren
npm install

# Lokal testen (öffnet http://localhost:5173)
npm run dev
```

---

## Schritt 2 – GitHub Repository erstellen

1. Gehe auf https://github.com → "New repository"
2. Name: `portfolio-tracker` → "Create repository"
3. Dann im Terminal:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/portfolio-tracker.git
git push -u origin main
```

---

## Schritt 3 – Auf Vercel deployen

1. Gehe auf https://vercel.com → "Add New Project"
2. "Import Git Repository" → dein `portfolio-tracker` auswählen
3. Framework: **Vite** wird automatisch erkannt
4. Klicke "Deploy" → fertig!

Du bekommst eine URL wie:
`https://portfolio-tracker-xyz.vercel.app`

---

## Schritt 4 – Eigene Domain verknüpfen (optional)

Falls du eine eigene Webseite hast (z.B. `meine-seite.de`):

**Option A: Subdomain** (empfohlen)
- In Vercel: Settings → Domains → `depot.meine-seite.de` eingeben
- Beim Domain-Anbieter: CNAME-Eintrag `depot` → `cname.vercel-dns.com`

**Option B: iFrame einbetten** auf bestehender Seite:
```html
<iframe
  src="https://portfolio-tracker-xyz.vercel.app"
  width="430"
  height="100vh"
  style="border:none; border-radius:16px;"
></iframe>
```

---

## Schritt 5 – Als iPhone App installieren (PWA)

1. Safari öffnen → deine Vercel-URL aufrufen
2. Unten auf das **Teilen-Symbol** tippen (Quadrat mit Pfeil nach oben)
3. **"Zum Home-Bildschirm"** antippen
4. Name bestätigen → "Hinzufügen"

→ Die App erscheint wie eine native iPhone-App auf dem Home-Bildschirm,
  startet ohne Browser-Adressleiste und läuft im Vollbildmodus.

---

## Datensicherung

Alle Daten werden automatisch im Browser gespeichert (localStorage).
Zusätzlich kannst du jederzeit in der App unter **Depot → Export JSON**
ein Backup herunterladen und auf einem anderen Gerät via **Import JSON** wiederherstellen.

---

## Updates einspielen

Wenn du Code-Änderungen machst:
```bash
git add .
git commit -m "Update"
git push
```
→ Vercel deployed automatisch innerhalb von ~30 Sekunden.

---

## Projektstruktur

```
portfolio-tracker/
├── index.html              # HTML-Einstiegspunkt + PWA-Meta-Tags
├── vite.config.js          # Build-Konfiguration
├── package.json            # Abhängigkeiten
├── vercel.json             # Vercel SPA-Routing
├── public/
│   └── manifest.json       # PWA-Manifest (iPhone Home-Screen)
└── src/
    ├── main.jsx            # React-Einstiegspunkt
    ├── App.jsx             # Hauptanwendung (alle Komponenten)
    └── useLocalStorage.js  # Datenpersistenz-Hook
```
