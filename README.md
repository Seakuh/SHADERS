# Shader MIDI Player

Ein interaktiver GLSL Shader Player mit vollständiger MIDI-Steuerung.

![Screenshot from 2025-06-03 12-41-13](https://github.com/user-attachments/assets/64f4b60e-689e-46ea-8f8f-e38edee09a5d)

FOR SCALAR AND THE UNIVERSE

> 📖 **Einsteiger-Handbuch für OSC & NDI:** [HANDBUCH.md](HANDBUCH.md)

## Features

- ✨ **Automatisches Shader-Loading**: Alle `.glsl` Dateien im Verzeichnis werden automatisch geladen
- 🎹 **Vollständige MIDI-Integration**: Steuere Shader und Parameter mit MIDI-Controllern
- 🎛️ **OSC-Eingang**: Vollwertige Alternative zu MIDI — jeder Parameter, jeder Shader, jedes Kommando
- 📡 **NDI-Ausgang**: Der Shader-Output geht als NDI-Quelle ins Netzwerk (Resolume, OBS, vMix, TouchDesigner)
- 🎨 **Globale Farbmanipulation**: HSL, Saturation, Lightness und Monochrome-Effekte unabhängig vom Shader
- 🖥️ **Vollbild-Anzeige**: Nur der Shader wird angezeigt
- 📊 **Ausführliches Logging**: Alle MIDI-Events und Shader-Wechsel werden geloggt

## Installation

```bash
npm install
npm run bridge:install    # nur nötig für OSC / NDI
```

## Start

```bash
npm run dev
```

Der Server läuft auf `http://localhost:5173`

Für OSC und NDI zusätzlich in einem zweiten Terminal:

```bash
npm run bridge
```

## MIDI Mapping

### Shader-Steuerung

| MIDI Event | Funktion | Details |
|------------|----------|---------|
| **Note 0-127** | Shader-Auswahl | Beliebige Note mappt proportional auf Shader-Index |
| **CC 43** | Vorheriger Shader | Werte > 64 triggern Shader-Wechsel |
| **CC 44** | Nächster Shader | Werte > 64 triggern Shader-Wechsel |

### Globale Parameter

| MIDI CC | Parameter | Wertebereich | Funktion |
|---------|-----------|--------------|----------|
| **CC 0** | Vibrance | 0.0-1.0 | Vibrance-Effekt |
| **CC 1** | Hue | 0-360° | Verschiebt den Farbton |
| **CC 2** | Saturation | 0.0-1.0 | Steuert die Farbsättigung |
| **CC 3** | Grayscale | 0.0-1.0 | Schwarz-Weiß-Effekt |
| **CC 4** | Contrast | 0.0-2.0 | Kontrast |
| **CC 5** | Brightness | 0.0-2.0 | Helligkeit |
| **CC 6** | Zoom | 0.1-5.0 | Zoomt den Shader (1.0 = normal) |
| **CC 7** | Video Mix | 0.0-1.0 | Mischt Webcam/Video ein |
| **CC 16** | Speed | 0-4x | Geschwindigkeit der Animation |
| **CC 17** | Audio Intensity | 0.0-1.0 | Master-Audio-Intensität |

### Audio-Modulation (Audio → Parameter)

| MIDI CC | Parameter | Funktion |
|---------|-----------|----------|
| **CC 23** | Audio → Hue | Bass moduliert Farbton (0-360°) |
| **CC 24** | Audio → Saturation | Bass moduliert Sättigung |
| **CC 25** | Audio → Brightness | Bass moduliert Helligkeit |
| **CC 26** | Audio → Zoom | Bass moduliert Zoom-Effekt |

### Shader-Navigation

| MIDI CC | Parameter | Funktion |
|---------|-----------|----------|
| **CC 43** | Previous Shader | Vorheriger Shader (> 64 = Trigger) |
| **CC 44** | Next Shader | Nächster Shader (> 64 = Trigger) |
| **CC 48** | Mirror | Horizontale Spiegelung (> 64 = AN) |

## OSC & NDI (die Bridge)

Browser können weder UDP-Sockets öffnen noch mit dem NDI-SDK sprechen. Beides
übernimmt ein kleiner lokaler Begleitprozess in `bridge/`:

```
OSC-Controller  ──UDP 9000──▶  Bridge  ──WS 9002──▶  Browser
OSC-Controller  ◀──UDP 9001──  Bridge  ◀──WS 9002──  Browser   (Feedback)
                                Bridge  ◀──WS 9002──  Browser   (RGBA-Frames)
                                  │
                                  └──NDI──▶  Resolume / OBS / vMix / ...
```

Start:

```bash
npm run bridge
```

Die App verbindet sich automatisch und zeigt oben links `OSC Bridge: ...`.
Läuft die Bridge nicht, funktioniert alles andere unverändert weiter — MIDI,
Tastatur und Maus sind davon völlig unabhängig.

### Bridge-Optionen

| Flag | Default | Bedeutung |
|------|---------|-----------|
| `--osc-in-port <n>` | 9000 | UDP-Port für eingehendes OSC |
| `--osc-out-port <n>` | 9001 | UDP-Port für Feedback |
| `--osc-out-host <ip>` | *letzter Absender* | Fixes Feedback-Ziel |
| `--ws-port <n>` | 9002 | WebSocket-Port für die App |
| `--ndi-name <name>` | `Shadertool` | Name der NDI-Quelle |
| `--no-ndi` | – | Nur OSC, kein NDI |

```bash
npm run bridge -- --osc-in-port 8000 --ndi-name "Vartakt Visuals"
```

Status jederzeit prüfbar unter `http://127.0.0.1:9002/status`.

## OSC-Mapping

Alle Adressen sind gegenüber Groß-/Kleinschreibung und Trennzeichen tolerant:
`/param/audioToHue`, `/audio-to-hue` und `/AUDIO_TO_HUE` sind identisch.

### Parameter

Jeder Parameter ist auf drei Wegen erreichbar:

| Form | Beispiel | Wert |
|------|----------|------|
| `/param/<name>` | `/param/hue 240` | **Nativer** Wertebereich |
| `/<name>` | `/hue 240` | Kurzform, ebenfalls nativ |
| `/param/<name>/norm` | `/param/hue/norm 0.66` | Normalisiert 0.0–1.0 |

Der native Bereich ist der Vorteil gegenüber MIDI: statt 128 Stufen bekommst du
echte Fließkommawerte.

| Parameter | Nativer Bereich | MIDI-Äquivalent |
|-----------|-----------------|-----------------|
| `vibrance` | 0.0 – 1.0 | CC 0 |
| `hue` | 0 – 360 | CC 1 |
| `saturation` | 0.0 – 1.0 | CC 2 |
| `grayscale` | 0.0 – 1.0 | CC 3 |
| `contrast` | 0.0 – 2.0 | CC 4 |
| `brightness` | 0.0 – 2.0 | CC 5 |
| `zoom` | 0.1 – 5.0 | CC 6 |
| `videoMix` | 0.0 – 1.0 | CC 7 |
| `speed` | 0.0 – 4.0 | CC 16 |
| `audioIntensity` | 0.0 – 1.0 | CC 17 |
| `audioToHue` | 0.0 – 1.0 | CC 23 |
| `audioToSaturation` | 0.0 – 1.0 | CC 24 |
| `audioToBrightness` | 0.0 – 1.0 | CC 25 |
| `audioToZoom` | 0.0 – 1.0 | CC 26 |
| `mirror` | 0 / 1 | CC 48 |
| `brushSize` | 5 – 200 | CC 61 |
| `mirrorSplit` | 0.0 – 1.0 | CC 0 (nur in Edit+Mirror) |
| `mirrorSegments` | 2 – 32 | CC 1 (nur in Edit+Mirror) |
| `verticalShift` | -0.5 – 0.5 | CC 3 (nur in Edit) |

Die letzten drei sind über MIDI nur in bestimmten Modi erreichbar — über OSC
immer direkt.

### Shader

| Adresse | Argument | Funktion |
|---------|----------|----------|
| `/shader/next` | – | Nächster Shader |
| `/shader/prev` | – | Vorheriger Shader |
| `/shader/index` | int | Exakter Index |
| `/shader/fraction` | 0.0–1.0 | Fader über die ganze Liste |
| `/shader/name` | string | Nach Dateinamen (mit oder ohne `.glsl`) |
| `/shader/list` | – | Liste in die Browser-Konsole |

### Edit-Mode, Maske, Perspektive

| Adresse | Argument | Funktion |
|---------|----------|----------|
| `/edit/mode` | 0/1 | Edit-Mode an/aus |
| `/edit/toggle` | – | Umschalten |
| `/edit/tool` | `brush` / `polygon` | Werkzeug wählen |
| `/mask/clear` | – | Maske löschen |
| `/mask/undo` | – | Letzten Schritt zurück |
| `/mask/invert` | – | Maske invertieren |
| `/persp/tl` .. `/persp/br` | x y (0–1) | Eckpunkt setzen |
| `/persp/reset` | – | Perspektive zurücksetzen |

### Ausgabe & System

| Adresse | Argument | Funktion |
|---------|----------|----------|
| `/ndi/enable` | 0/1 | NDI-Ausgang an/aus |
| `/ndi/fps` | 1–60 | Ziel-Framerate |
| `/ndi/resolution` | w h | Auflösung, z. B. `1920 1080` |
| `/fullscreen` | – | Vollbild umschalten |
| `/info` | – | Overlay umschalten |
| `/sync` | – | Kompletten Zustand zurücksenden |

### Feedback

Jede Änderung — egal ob per MIDI, Maus, Tastatur oder OSC — wird als OSC
zurückgeschickt, sowohl nativ (`/param/hue 240`) als auch normalisiert
(`/param/hue/norm 0.667`). Damit bleiben Motorfader und TouchOSC-Layouts
synchron. `/sync` fordert den kompletten Zustand an, z. B. beim Verbinden.

Eingehende Nachrichten werden nicht zurückgespiegelt, damit ein Controller
seine eigene Bewegung nicht als Echo zurückbekommt.

## NDI-Ausgang

Im Overlay: **Start NDI Output**, dazu Auflösung (Default 1280×720) und
Framerate (Default 30). Die Quelle heißt `<RECHNERNAME> (Shadertool)` und
erscheint automatisch in Resolume, OBS (via DistroAV), vMix, TouchDesigner
oder dem NDI Studio Monitor.

Technisch: Der Canvas wird per `blitFramebuffer` aufgelöst, skaliert und
gleichzeitig vertikal gespiegelt (OpenGL rendert bottom-up, NDI erwartet
top-down), dann asynchron über Pixel Buffer Objects mit Fences ausgelesen. Der
Renderloop wartet dadurch nie auf die GPU — die Frames kommen ein bis zwei
Frames verzögert an, was im Videosignal unsichtbar ist.

Ein paar Hinweise:

- **Bandbreite**: Die Frames gehen unkomprimiert über den lokalen Socket.
  1280×720@30 sind ca. 110 MB/s, 1920×1080@30 ca. 250 MB/s. Bei Aussetzern
  Auflösung oder Framerate reduzieren; bei Überlastung werden Frames
  verworfen statt Latenz aufzubauen.
- **WebGL2** ist Voraussetzung. Ohne WebGL2 zeigt das Overlay `unavailable`.
- **Nur der Shader-Canvas** landet im NDI-Signal, nicht das Info-Overlay.

## Tastatursteuerung

| Taste | Funktion |
|-------|----------|
| **→ / N** | Nächster Shader |
| **← / P** | Vorheriger Shader |
| **H** | Info-Overlay ein/aus |
| **F** | Vollbild ein/aus |

## Shader-Format

Die Shader müssen im **Shadertoy-Format** geschrieben sein:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Dein Shader-Code hier
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.5, 1.0);
}
```

### Verfügbare Uniforms

- `iTime` - Zeit in Sekunden seit Start
- `iResolution` - Bildschirmauflösung (vec2)
- `iTimeDelta` - Zeit seit letztem Frame
- `iFrame` - Frame-Nummer

## Globale Effekte

Alle Shader werden automatisch mit einem Post-Processing-Wrapper versehen, der folgende Effekte ermöglicht:

1. **Speed**: Steuert die Animations-Geschwindigkeit (0-4x, iTime wird multipliziert)
2. **Zoom**: Vergrößert/verkleinert den Shader vom Zentrum aus (0.1-5.0x)
3. **Mirror**: Spiegelt die rechte Hälfte horizontal zur linken
4. **Hue Rotation**: Verschiebt alle Farben im Farbkreis (0-360°)
5. **Saturation**: Verstärkt oder reduziert die Farbintensität (0-1)

Diese Effekte sind **unabhängig vom Shader** und können via MIDI in Echtzeit gesteuert werden.

## Logging

Die Anwendung loggt alle wichtigen Events in der Browser-Konsole:

- `[MIDI]` - MIDI-Events (Note On/Off, CC-Werte, Pitch Bend)
- `[SHADER]` - Shader-Wechsel und Ladevorgänge
- `[SYSTEM]` - System-Events (Resize, Initialisierung)

Beispiel:
```
[12:34:56] [MIDI] Note ON: C4 (60) - Velocity: 0.787
[12:34:56] [SHADER] Switched to: sunset.glsl
[12:34:57] [MIDI] CC: 1 = 0.5 (raw: 64)
[12:34:57] [SYSTEM] Parameter hue = 180.00
```

## MIDI-Setup

1. Verbinde deinen MIDI-Controller mit dem Computer
2. Starte die Anwendung
3. Die App verbindet sich automatisch mit dem ersten verfügbaren MIDI-Input
4. Der verbundene Controller wird im Info-Overlay angezeigt

Wenn kein MIDI-Controller verfügbar ist, funktionieren die Tastatursteuerung und automatische Shader-Wiedergabe weiterhin.

## Projekt-Struktur

```
SHADERS/
├── index.html              # HTML mit Fullscreen-Canvas
├── src/
│   ├── main.js             # Hauptanwendung
│   ├── params.js           # Parameter-Registry (MIDI + OSC teilen sie sich)
│   ├── OSCController.js    # OSC-Eingang und -Feedback
│   ├── NDIOutput.js        # Frame-Capture für NDI
│   ├── AudioInputManager.js
│   └── VideoInputManager.js
├── bridge/
│   ├── server.js           # OSC-UDP- und NDI-Begleitprozess
│   └── package.json        # Eigene Dependencies (native NDI-Bindings)
├── shaders/*.glsl          # Deine Shader-Dateien
├── package.json            # Dependencies
└── README.md               # Diese Datei
```

Die Bridge hat bewusst ein eigenes `package.json`: Die NDI-Bindings sind ein
natives Modul und haben im Static-Build der Web-App nichts zu suchen.

## Troubleshooting

### MIDI funktioniert nicht
- Stelle sicher, dass dein Browser MIDI-Zugriff erlaubt
- Überprüfe die Browser-Konsole auf Fehlermeldungen
- Chrome/Edge haben die beste WebMIDI-Unterstützung

### Shader wird nicht geladen
- Überprüfe, dass die `.glsl` Datei die `mainImage` Funktion enthält
- Schaue in die Browser-Konsole für Shader-Compile-Fehler
- Stelle sicher, dass die Datei im SHADERS-Verzeichnis liegt

### Performance-Probleme
- Manche Shader sind sehr rechenintensiv
- Versuche die Browser-Auflösung zu reduzieren
- Schließe andere Browser-Tabs

### OSC kommt nicht an
- Läuft die Bridge? `npm run bridge`, Status unter `http://127.0.0.1:9002/status`
- Zeigt das Overlay `OSC Bridge: offline`, erreicht die App die Bridge nicht
- Sendet der Controller wirklich auf UDP-Port 9000?
- Firewall prüfen, wenn der Controller auf einem anderen Gerät läuft
  (z. B. Tablet mit TouchOSC) — die Bridge lauscht auf `0.0.0.0`
- Unbekannte Adressen werden in der Browser-Konsole als
  `Unhandled OSC address` geloggt

### NDI-Quelle taucht nicht auf
- Ist der NDI-Ausgang im Overlay aktiviert?
- Zeigt der Status `unavailable`, fehlt WebGL2 im Browser
- Meldet die Bridge `grandi ... not installed`: `npm run bridge:install`
- NDI arbeitet mit mDNS-Discovery — Sender und Empfänger müssen im selben
  Subnetz sein

### Bridge-Verbindung wird vom Browser blockiert
Wird die App über HTTPS ausgeliefert, blockieren manche Browser die
Verbindung zu `ws://127.0.0.1`. Am einfachsten lokal über `npm run dev`
arbeiten. Ein abweichender Bridge-Port lässt sich per Query-Parameter setzen:
`?bridge=ws://127.0.0.1:9500`

## Erweiterte Anpassungen

### MIDI-Mapping und Parameter ändern

MIDI und OSC teilen sich eine gemeinsame Registry in `src/params.js`. Ein
Eintrag definiert CC-Nummer, Wertebereich, Default und die Anzeige im Overlay —
und legt damit gleichzeitig die OSC-Adresse fest:

```javascript
{ name: 'hue', cc: 1, min: 0, max: 360, def: 0, ui: 'hue-value', digits: 1 },
```

CC-Nummer ändern, Bereich erweitern oder einen neuen Parameter ergänzen: Es
gibt nur diese eine Stelle. MIDI, OSC, OSC-Feedback und Overlay ziehen
automatisch nach.

Momentane Trigger (kein Wert, nur Auslöser) stehen darunter in `TRIGGER_CCS`:

```javascript
export const TRIGGER_CCS = {
    shaderPrev: 43,
    shaderNext: 44,
    editMode: 60,
};
```

## Build für Produktion

```bash
npm run build
```

Die optimierten Dateien werden in `dist/` erstellt.

## Lizenz

Frei verfügbar für persönliche und kommerzielle Projekte.
