# Shader MIDI Player

Ein interaktiver GLSL Shader Player mit vollständiger MIDI-Steuerung.

![Screenshot from 2025-06-03 12-41-13](https://github.com/user-attachments/assets/64f4b60e-689e-46ea-8f8f-e38edee09a5d)

FOR SCALAR AND THE UNIVERSE

## Features

- ✨ **Automatisches Shader-Loading**: Alle `.glsl` Dateien im Verzeichnis werden automatisch geladen
- 🎹 **Vollständige MIDI-Integration**: Steuere Shader und Parameter mit MIDI-Controllern
- 🎨 **Globale Farbmanipulation**: HSL, Saturation, Lightness und Monochrome-Effekte unabhängig vom Shader
- 🖥️ **Vollbild-Anzeige**: Nur der Shader wird angezeigt
- 📊 **Ausführliches Logging**: Alle MIDI-Events und Shader-Wechsel werden geloggt

## Installation

```bash
npm install
```

## Start

```bash
npm run dev
```

Der Server läuft auf `http://localhost:5173`

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
├── index.html          # HTML mit Fullscreen-Canvas
├── main.js             # Hauptanwendung
├── package.json        # Dependencies
├── *.glsl              # Deine Shader-Dateien
└── README.md           # Diese Datei
```

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

## Erweiterte Anpassungen

### MIDI-Mapping ändern

In `main.js` findest du die MIDI-Mappings in der `MIDIController` Klasse:

```javascript
this.mappings = {
    hue: { type: 'cc', value: 1 },                // CC1 - Hue rotation
    saturation: { type: 'cc', value: 2 },         // CC2 - Saturation
    shaderPrev: { type: 'cc', value: 3 },         // CC3 - Previous shader
    shaderNext: { type: 'cc', value: 4 },         // CC4 - Next shader
    zoom: { type: 'cc', value: 5 },               // CC5 - Zoom
    speed: { type: 'cc', value: 16 },             // CC16 - Speed
    mirror: { type: 'cc', value: 60 },            // CC60 - Mirror toggle
};
```

Passe die Werte an dein MIDI-Setup an.

## Build für Produktion

```bash
npm run build
```

Die optimierten Dateien werden in `dist/` erstellt.

## Lizenz

Frei verfügbar für persönliche und kommerzielle Projekte.
