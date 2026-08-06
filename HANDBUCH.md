# Handbuch: OSC & NDI

Kurzanleitung für alle, die den Shader-Player mit OSC steuern oder das Bild
per NDI weitergeben wollen. Kein Vorwissen nötig — einfach der Reihe nach.

---

## Was ist neu?

**OSC-Eingang.** Du kannst den Player jetzt mit OSC steuern statt mit MIDI.
Also z. B. mit TouchOSC auf dem Tablet, mit Chataigne, Vezér, TouchDesigner
oder allem anderen, das OSC sendet. Alles was MIDI kann, kann OSC auch —
und ein bisschen mehr.

**NDI-Ausgang.** Das Bild geht als NDI-Quelle ins Netzwerk. Damit siehst du
den Shader direkt in Resolume, OBS, vMix oder TouchDesigner — ohne
Bildschirmaufnahme, ohne Kabel, in voller Qualität.

MIDI, Tastatur und Maus funktionieren weiter wie bisher. Es geht nichts
verloren.

---

## Was du brauchst

- Den Rechner, auf dem der Shader-Player läuft
- Für OSC: ein Gerät oder Programm, das OSC sendet
- Für NDI: ein Programm, das NDI empfängt (Resolume, OBS, vMix …)

OSC und NDI laufen über ein kleines Hilfsprogramm, die **Bridge**. Warum?
Ein Browser darf von sich aus weder OSC empfangen noch NDI senden. Die
Bridge macht beides für ihn. Sie läuft auf deinem eigenen Rechner.

---

## Einmalig einrichten

Terminal im Projektordner öffnen, dann:

```bash
npm install
npm run bridge:install
```

Das war's. Musst du nur einmal machen.

---

## Jedes Mal starten

Du brauchst **zwei Terminals**.

**Terminal 1** — der Player:

```bash
npm run dev
```

Dann im Browser öffnen, was dort steht (meistens
`http://localhost:5173/shadertool/`).

**Terminal 2** — die Bridge:

```bash
npm run bridge
```

Es erscheint etwa:

```
[NDI] Sending as "DEIN-RECHNER (Shadertool)"
[OSC] Listening on UDP 0.0.0.0:9000
[WS]  Listening on ws://127.0.0.1:9002
```

Im Browser steht oben links jetzt **OSC Bridge: OSC in :9000 | NDI …**
statt `offline`. Damit läuft alles.

> Wenn du nur MIDI benutzt, kannst du Terminal 2 einfach weglassen. Der
> Player läuft ohne Bridge ganz normal weiter.

---

## OSC benutzen

### Einstellen

In deiner OSC-App als Ziel eintragen:

| Feld | Wert |
|------|------|
| Host / IP | die IP des Rechners mit dem Player (lokal: `127.0.0.1`) |
| Port (senden) | `9000` |
| Port (empfangen) | `9001` |

Die IP deines Rechners findest du mit `ip addr` (Linux) bzw. `ifconfig`
(Mac). Tablet und Rechner müssen im selben WLAN sein.

### Die wichtigsten Befehle

Farbe und Bild:

| Adresse | Wert | Was passiert |
|---------|------|--------------|
| `/hue` | 0 – 360 | Farbton drehen |
| `/saturation` | 0 – 1 | Farbsättigung |
| `/brightness` | 0 – 2 | Helligkeit |
| `/contrast` | 0 – 2 | Kontrast |
| `/grayscale` | 0 – 1 | Richtung Schwarzweiß |
| `/vibrance` | 0 – 1 | Farben kräftiger |
| `/zoom` | 0.1 – 5 | Rein- und rauszoomen |
| `/speed` | 0 – 4 | Geschwindigkeit (0 = eingefroren) |
| `/mirror` | 0 oder 1 | Spiegelung an/aus |

Shader wechseln:

| Adresse | Wert | Was passiert |
|---------|------|--------------|
| `/shader/next` | – | Nächster Shader |
| `/shader/prev` | – | Vorheriger Shader |
| `/shader/fraction` | 0 – 1 | Mit einem Fader durch alle Shader |
| `/shader/name` | z. B. `forest` | Bestimmten Shader laden |

Ton und Video:

| Adresse | Wert | Was passiert |
|---------|------|--------------|
| `/audioIntensity` | 0 – 1 | Wie stark der Ton wirkt |
| `/audioToHue` | 0 – 1 | Bass steuert den Farbton |
| `/audioToBrightness` | 0 – 1 | Bass steuert die Helligkeit |
| `/audioToZoom` | 0 – 1 | Bass steuert den Zoom |
| `/videoMix` | 0 – 1 | Webcam/Video einblenden |

Die vollständige Liste steht in der `README.md`.

### Zwei nützliche Kniffe

**Fader mit 0 bis 1.** Viele Controller senden nur Werte von 0 bis 1. Hänge
dann einfach `/norm` an:

```
/hue/norm 0.5     →  entspricht  /hue 180
/zoom/norm 1.0    →  entspricht  /zoom 5
```

**Schreibweise ist egal.** Diese drei Adressen sind identisch:

```
/audioToHue     /audio-to-hue     /AUDIO_TO_HUE
```

### Alles bleibt synchron

Jede Änderung wird zurückgeschickt — egal ob du sie per OSC, MIDI, Maus oder
Tastatur gemacht hast. Deine Fader im TouchOSC-Layout springen also mit.

Wenn du frisch verbindest und alle aktuellen Werte willst, sende einmal:

```
/sync
```

---

## NDI benutzen

1. Im Browser oben links auf **Start NDI Output** klicken.
2. Daneben Auflösung und Bildrate wählen. Standard ist 1280×720 mit 30 fps —
   das passt fast immer.
3. In Resolume / OBS / vMix die NDI-Quelle auswählen. Sie heißt
   **`DEIN-RECHNER (Shadertool)`**.

Fertig. Der Knopf heißt jetzt **Stop NDI Output**, darunter siehst du, wie
viele Programme gerade zuschauen.

### Gut zu wissen

- Nur der Shader landet im NDI-Bild. Das Info-Fenster oben links **nicht** —
  es stört also nicht.
- Höhere Auflösung heißt deutlich mehr Datenlast. Wenn das Bild ruckelt:
  erst auf 1280×720 zurück, dann auf 25 fps.
- Bei Überlastung lässt der Player lieber einzelne Bilder aus, als eine
  Verzögerung aufzubauen. Das Bild bleibt dadurch immer aktuell.

### NDI per OSC steuern

| Adresse | Wert | Was passiert |
|---------|------|--------------|
| `/ndi/enable` | 0 oder 1 | Ausgang an/aus |
| `/ndi/fps` | 1 – 60 | Bildrate |
| `/ndi/resolution` | z. B. `1920 1080` | Auflösung |

---

## Wenn etwas nicht geht

**Oben links steht `offline`.**
Die Bridge läuft nicht. Terminal 2 prüfen und `npm run bridge` starten.

**Die Bridge läuft, aber OSC kommt nicht an.**
- Sendet dein Controller wirklich auf Port **9000**?
- Ist die IP richtig? Bei einem Tablet die IP des Rechners, nicht `127.0.0.1`.
- Sind beide Geräte im selben WLAN?
- Firewall prüfen — Port 9000 (UDP) muss offen sein.

**Ein bestimmter OSC-Befehl macht nichts.**
Browser-Konsole öffnen (F12). Steht dort `Unhandled OSC address`, stimmt die
Adresse nicht. Ein Tippfehler reicht schon.

**Die NDI-Quelle taucht nirgends auf.**
- Ist der Ausgang im Browser wirklich eingeschaltet?
- Steht dort `unavailable`, kann dein Browser kein WebGL2. Chrome benutzen.
- Meldet die Bridge etwas mit `grandi ... not installed`, einmal
  `npm run bridge:install` laufen lassen.
- Empfänger und Sender müssen im selben Netz sein.

**Läuft überhaupt alles?**
Im Browser aufrufen: `http://127.0.0.1:9002/status`. Dort steht der aktuelle
Zustand von OSC und NDI.

---

## Kurzfassung zum Ausdrucken

```
Einrichten (einmal)     npm install
                        npm run bridge:install

Starten (jedes Mal)     Terminal 1:  npm run dev
                        Terminal 2:  npm run bridge

OSC senden an           Port 9000
OSC empfangen auf       Port 9001
Status ansehen          http://127.0.0.1:9002/status

NDI-Quelle heißt        DEIN-RECHNER (Shadertool)
NDI einschalten         Knopf "Start NDI Output" oben links

Alle Werte abfragen     /sync
```
