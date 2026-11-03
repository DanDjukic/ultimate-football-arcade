# Ultimate Football Arcade 26

Ein Arcade-Fußballspiel für den Browser (HTML5, CSS, JavaScript, Canvas). Es braucht keine Installation, keine Anmeldung und keinen Server-Account.

## Starten

- **Computer:** `index.html` doppelklicken. Läuft in Chrome, Edge, Firefox oder Safari.
- **iPhone/iPad:** Den Ordner auf einen beliebigen statischen Webspace hochladen (z. B. GitHub Pages oder Netlify) und die Adresse in Safari öffnen. Für ein Vollbild-Erlebnis über „Teilen → Zum Home-Bildschirm“ hinzufügen.
  Alternativ im selben WLAN: Auf dem PC im Ordner `python -m http.server 8000` ausführen und am iPhone `http://<PC-IP>:8000` öffnen.

## Steuerung

| Aktion | Touch / Maus | Tastatur |
|---|---|---|
| Laufen | Joystick linke Bildschirmhälfte | WASD / Pfeiltasten |
| Schuss (halten = Kraft) | SCHUSS | Leertaste / K |
| Pass / Steilpass | PASS / STEILPASS | E / J · R / L |
| Sprint | SPRINT | Shift |
| Tackling (halten = Pressing) | TACKLING | F / I |
| Spielerwechsel | WECHSEL | Q / U |
| Pause | ❚❚ | P / Esc |

## Hinweise zur Umsetzung

- Die Grafik ist ein eigener 2.5D-Renderer mit echter 3D-Projektion auf Canvas, ohne Three.js. So läuft das Spiel auch auf älteren iPhones flüssig.
- Alle Spieler, Vereine, Logos und Porträts sind frei erfunden und werden im Code erzeugt.
- Die Drafts sind kostenlos und unbegrenzt. Sie nutzen den kryptografischen Zufallsgenerator des Browsers. Die angezeigten Wahrscheinlichkeiten werden exakt umgesetzt.
- Der Spielstand wird lokal im Browser gespeichert (LocalStorage). Beim Löschen der Browserdaten geht er verloren. Der Speicher reicht für mehrere zehntausend Karten.
- Die Stimme des Kommentators kommt von der Sprachausgabe des Geräts und kann in den Einstellungen abgeschaltet werden. Zusätzlich gibt es immer einen Text-Ticker.
- Transfermarkt und Käufer werden lokal vom Computer simuliert, es gibt keinen Online-Handel.
- Einige Regeln sind vereinfacht: Abseits wird bei der Ballabgabe geprüft, und das Vorteilsspiel gibt es nicht.
