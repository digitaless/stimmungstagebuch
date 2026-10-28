# Stimmungstagebuch.ch

Eine eigenständige Web-App mit Vanilla JavaScript, HTML, CSS und Vite. Die Gestaltung orientiert sich am lokal verfügbaren Schlaftagebuch-Projekt; es besteht keine technische Verbindung und es werden keine Daten daraus übernommen.

## Voraussetzungen

Node.js `^20.19.0` oder `>=22.12.0`.

## Lokal starten

```sh
npm install
npm run dev
```

Öffne die vom Entwicklungsserver angezeigte lokale URL im Browser. Für einen Produktions-Build:

```sh
npm run build
npm run preview
```

## Daten und Datenschutz

- Einträge werden lokal im `localStorage` des verwendeten Browsers gespeichert. Sie sind an diesen Browser und den Website-Ursprung gebunden und werden nicht automatisch zwischen Geräten synchronisiert.
- Werden die Website-Daten im Browser gelöscht, können damit auch die gespeicherten Einträge verloren gehen. Der Browser-Speicher ist nicht verschlüsselt und bietet keine Zugangskontrolle; verfügbare Speicherplatzgrenzen unterscheiden sich je nach Browser.
- JSON-Sicherungen enthalten Tagebucheinträge. Bewahre heruntergeladene Sicherungen geschützt auf; der Browser-Speicher ist keine garantierte Datensicherung.
- Es gibt kein Backend und keine automatische Übertragung von Tagebuchdaten. Die Anwendung enthält kein Tracking und keine Konten.
- Daten können als versionierte JSON-Sicherung heruntergeladen und nach Prüfung importiert werden. Ein Import ersetzt nach Bestätigung den gesamten vorhandenen Eintragsbestand.
- Die getrennte Spracheinstellung wird ebenfalls lokal im Browser gespeichert.
- Die Anwendung liest oder importiert keine Daten des Schlaftagebuchs.

## Veröffentlichung

Die Website wird über GitHub Pages veröffentlicht. Der Workflow in `.github/workflows/deploy.yml` testet und baut die Anwendung bei Pushes auf `main` und veröffentlicht ausschliesslich den Inhalt von `dist`. Die eigene Domain `stimmungstagebuch.ch` ist über `public/CNAME` für den Build vorgesehen.

## Funktionen

- Stimmungseinträge pro lokalem Kalenderdatum erfassen, bearbeiten und löschen
- Direkte Auswahl optionaler Energie-, Anspannungs- und Schlafqualitätsskalen sowie Notizen und Medikamentenänderungen
- Verlauf und navigierbarer Monatskalender
- Zeitraumbezogene Statistiken mit lokal erzeugtem PDF-Bericht
- Kurze Einführung beim ersten Aufruf
- Deutsch, Französisch und Englisch
- JSON-Export und -Import
