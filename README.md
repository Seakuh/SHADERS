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
| **Note C4 (60)** | Nächster Shader | Wechselt zum nächsten Shader in der Liste |
| **Note B3 (59)** | Vorheriger Shader | Wechselt zum vorherigen Shader |
| **Note 0-127** | Direktwahl | Beliebige Note mappt proportional auf Shader-Index |

### Globale Farbparameter

| MIDI CC | Parameter | Wertebereich | Funktion |
|---------|-----------|--------------|----------|
| **CC 1** | Hue | 0-360° | Verschiebt den Farbton |
| **CC 2** | Saturation | 0.0-1.0 | Steuert die Farbsättigung |
| **CC 3** | Lightness | 0.0-1.0 | Steuert die Helligkeit |
| **CC 4** | Monochrome | 0.0-1.0 | Mischt zu Graustufen (0=Farbe, 1=Grau) |

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

## Globale Farbeffekte

Alle Shader werden automatisch mit einem Post-Processing-Wrapper versehen, der folgende Effekte ermöglicht:

1. **Hue Rotation**: Verschiebt alle Farben im Farbkreis
2. **Saturation**: Verstärkt oder reduziert die Farbintensität
3. **Lightness**: Macht das Bild heller oder dunkler
4. **Monochrome**: Konvertiert zu Graustufen

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
    shaderNext: { type: 'note', value: 60 },      // C4
    shaderPrev: { type: 'note', value: 59 },      // B3
    hue: { type: 'cc', value: 1 },                // CC1
    saturation: { type: 'cc', value: 2 },         // CC2
    lightness: { type: 'cc', value: 3 },          // CC3
    monochrome: { type: 'cc', value: 4 },         // CC4
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
