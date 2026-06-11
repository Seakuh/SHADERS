// ============================================
// Remote Control Protocol
// ============================================
// Shared between the player (RemoteControlManager) and the phone
// control page (remote.js). All parameter values travel over the
// WebSocket as normalized 0-1 floats; toScaled() converts them to
// the ranges handleParameterChange() expects (same ranges the MIDI
// mappings use), toNorm() converts back for state broadcasts.
//
// Message types:
//   { type: 'param', name, value }            remote -> player (value normalized 0-1)
//   { type: 'shader', action, index? }        remote -> player ('next' | 'prev' | 'setIndex')
//   { type: 'editMode' }                      remote -> player (toggle)
//   { type: 'requestState' }                  remote -> player
//   { type: 'state', shaders, currentIndex,
//     params, editMode }                      player -> remotes (params normalized 0-1)

export const WS_PATH = '/remote-ws';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export const PARAMS = [
    // -------------- MAIN FADERS --------------
    { name: 'vibrance',           label: 'Vibrance',        group: 'main',   defaultNorm: 0,        toScaled: v => v,                       toNorm: v => clamp01(v),               uiId: 'vib-value',             fmt: v => v.toFixed(2) },
    { name: 'hue',                label: 'Hue',             group: 'main',   defaultNorm: 0,        toScaled: v => v * 360,                 toNorm: v => clamp01(v / 360),         uiId: 'hue-value',             fmt: v => v.toFixed(1) },
    { name: 'saturation',         label: 'Saturation',      group: 'main',   defaultNorm: 1,        toScaled: v => v,                       toNorm: v => clamp01(v),               uiId: 'sat-value',             fmt: v => v.toFixed(2) },
    { name: 'grayscale',          label: 'Grayscale',       group: 'main',   defaultNorm: 0,        toScaled: v => v,                       toNorm: v => clamp01(v),               uiId: 'gray-value',            fmt: v => v.toFixed(2) },
    { name: 'contrast',           label: 'Contrast',        group: 'main',   defaultNorm: 0.5,      toScaled: v => v * 2.0,                 toNorm: v => clamp01(v / 2.0),         uiId: 'contrast-value',        fmt: v => v.toFixed(2) },
    { name: 'brightness',         label: 'Brightness',      group: 'main',   defaultNorm: 0.5,      toScaled: v => v * 2.0,                 toNorm: v => clamp01(v / 2.0),         uiId: 'bright-value',          fmt: v => v.toFixed(2) },
    { name: 'zoom',               label: 'Zoom',            group: 'main',   defaultNorm: 0.9 / 4.9, toScaled: v => 0.1 + v * 4.9,          toNorm: v => clamp01((v - 0.1) / 4.9), uiId: 'zoom-value',            fmt: v => v.toFixed(2) },
    { name: 'speed',              label: 'Speed',           group: 'main',   defaultNorm: 0.25,     toScaled: v => v * 4.0,                 toNorm: v => clamp01(v / 4.0),         uiId: 'speed-value',           fmt: v => v.toFixed(2) },
    { name: 'videoMix',           label: 'Video Mix',       group: 'main',   defaultNorm: 0,        toScaled: v => v,                       toNorm: v => clamp01(v),               uiId: 'video-mix-value',       fmt: v => v.toFixed(2) },

    // -------------- AUDIO --------------
    { name: 'audioIntensity',     label: 'Audio Intensity', group: 'audio',  defaultNorm: 0,        toScaled: v => v,                       toNorm: v => clamp01(v),               uiId: 'audio-intensity-value', fmt: v => v.toFixed(2) },
    { name: 'audioToHue',         label: 'Audio → Hue',     group: 'audio',  defaultNorm: 0,        toScaled: v => v,                       toNorm: v => clamp01(v),               uiId: null,                    fmt: v => v.toFixed(2) },
    { name: 'audioToSaturation',  label: 'Audio → Sat',     group: 'audio',  defaultNorm: 0,        toScaled: v => v,                       toNorm: v => clamp01(v),               uiId: null,                    fmt: v => v.toFixed(2) },
    { name: 'audioToBrightness',  label: 'Audio → Bright',  group: 'audio',  defaultNorm: 0,        toScaled: v => v,                       toNorm: v => clamp01(v),               uiId: null,                    fmt: v => v.toFixed(2) },
    { name: 'audioToZoom',        label: 'Audio → Zoom',    group: 'audio',  defaultNorm: 0,        toScaled: v => v,                       toNorm: v => clamp01(v),               uiId: null,                    fmt: v => v.toFixed(2) },

    // -------------- MIRROR --------------
    { name: 'mirror',             label: 'Mirror',          group: 'mirror', defaultNorm: 0,        toScaled: v => (v > 0.5 ? 1.0 : 0.0),   toNorm: v => (v > 0.5 ? 1 : 0),        uiId: 'mirror-value',          fmt: v => (v > 0.5 ? 'ON' : 'OFF'), toggle: true },
    { name: 'mirrorSplit',        label: 'Mirror Shift',    group: 'mirror', defaultNorm: 0.5,      toScaled: v => v,                       toNorm: v => clamp01(v),               uiId: 'mirror-split-value',    fmt: v => v.toFixed(2) },
    { name: 'mirrorSegments',     label: 'Segments',        group: 'mirror', defaultNorm: 0,        toScaled: v => Math.round(2 + v * 30),  toNorm: v => clamp01((v - 2) / 30),    uiId: 'mirror-segments-value', fmt: v => String(Math.round(v)) },
];

export const PARAM_BY_NAME = new Map(PARAMS.map(p => [p.name, p]));
