// ============================================
// Parameter Registry
// ============================================
// Single source of truth for every controllable parameter.
// MIDI (CC -> normalised 0..1) and OSC (address -> native value) both
// resolve through this table, so the two control surfaces stay in sync
// by construction instead of by copy-paste.
//
// Fields:
//   name    - parameter key, matches the u_<name> shader uniform
//   cc      - MIDI CC number (null = not directly CC-addressable)
//   min/max - native value range
//   def     - default / startup value
//   step    - if set, native values are quantised to this (integers)
//   ui      - id of the DOM element showing the value
//   digits  - decimals used when formatting for the UI
//   toggle  - value is 0.0 / 1.0, displayed as OFF / ON
//   osc     - extra OSC address aliases (all params also answer to
//             /param/<name>, /<name> and the normalised variants)

export const PARAMS = [
    // -------------- FADER CONTROLS --------------
    { name: 'vibrance',       cc: 0,  min: 0,   max: 1,   def: 0,   ui: 'vib-value',             digits: 2 },
    { name: 'hue',            cc: 1,  min: 0,   max: 360, def: 0,   ui: 'hue-value',             digits: 1 },
    { name: 'saturation',     cc: 2,  min: 0,   max: 1,   def: 1,   ui: 'sat-value',             digits: 2 },
    { name: 'grayscale',      cc: 3,  min: 0,   max: 1,   def: 0,   ui: 'gray-value',            digits: 2 },
    { name: 'contrast',       cc: 4,  min: 0,   max: 2,   def: 1,   ui: 'contrast-value',        digits: 2 },
    { name: 'brightness',     cc: 5,  min: 0,   max: 2,   def: 1,   ui: 'bright-value',          digits: 2 },
    { name: 'zoom',           cc: 6,  min: 0.1, max: 5,   def: 1,   ui: 'zoom-value',            digits: 2 },
    { name: 'videoMix',       cc: 7,  min: 0,   max: 1,   def: 0,   ui: 'video-mix-value',       digits: 2 },
    { name: 'speed',          cc: 16, min: 0,   max: 4,   def: 1,   ui: 'speed-value',           digits: 2 },
    { name: 'audioIntensity', cc: 17, min: 0,   max: 1,   def: 0,   ui: 'audio-intensity-value', digits: 2 },

    // -------------- AUDIO MODULATION --------------
    { name: 'audioToHue',        cc: 23, min: 0, max: 1, def: 0, digits: 2 },
    { name: 'audioToSaturation', cc: 24, min: 0, max: 1, def: 0, digits: 2 },
    { name: 'audioToBrightness', cc: 25, min: 0, max: 1, def: 0, digits: 2 },
    { name: 'audioToZoom',       cc: 26, min: 0, max: 1, def: 0, digits: 2 },

    // -------------- GEOMETRY --------------
    { name: 'mirror', cc: 48, min: 0, max: 1, def: 0, ui: 'mirror-value', toggle: true },

    // Reachable over MIDI only while edit mode + mirror are active (CC0 / CC1),
    // but always directly addressable over OSC.
    { name: 'mirrorSplit',    cc: null, min: 0,    max: 1,   def: 0.5, ui: 'mirror-split-value',    digits: 2 },
    { name: 'mirrorSegments', cc: null, min: 2,    max: 32,  def: 2,   ui: 'mirror-segments-value', step: 1 },
    { name: 'verticalShift',  cc: null, min: -0.5, max: 0.5, def: 0,   digits: 3 },

    // -------------- EDIT MODE --------------
    { name: 'brushSize', cc: 61, min: 5, max: 200, def: 50, ui: 'brush-size-value', step: 1 },
];

export const PARAM_BY_NAME = new Map(PARAMS.map(p => [p.name, p]));

export const PARAM_BY_CC = new Map(
    PARAMS.filter(p => p.cc !== null && p.cc !== undefined).map(p => [p.cc, p])
);

// Trigger-style MIDI CCs: momentary, fire when the value crosses 0.5.
export const TRIGGER_CCS = {
    shaderPrev: 43,
    shaderNext: 44,
    editMode: 60,
};

// ============================================
// Value helpers
// ============================================

export function clampParam(param, value) {
    return Math.min(param.max, Math.max(param.min, value));
}

/** Quantise + clamp a native value into the parameter's legal range. */
export function normaliseValue(param, value) {
    let v = clampParam(param, value);
    if (param.step) v = Math.round(v / param.step) * param.step;
    if (param.toggle) v = v > 0.5 ? 1.0 : 0.0;
    return v;
}

/** 0..1 -> native range. This is the MIDI path. */
export function fromNorm(param, norm) {
    if (param.toggle) return norm > 0.5 ? 1.0 : 0.0;
    return normaliseValue(param, param.min + norm * (param.max - param.min));
}

/** native range -> 0..1. Used for OSC feedback to motorised/visual surfaces. */
export function toNorm(param, value) {
    if (param.max === param.min) return 0;
    return (clampParam(param, value) - param.min) / (param.max - param.min);
}

/** Human-readable value for the info overlay. */
export function formatValue(param, value) {
    if (param.toggle) return value > 0.5 ? 'ON' : 'OFF';
    if (param.step === 1) return String(Math.round(value));
    return value.toFixed(param.digits ?? 2);
}

// ============================================
// OSC address resolution
// ============================================

/**
 * Canonical key for an address segment: case- and separator-insensitive, so
 * /param/audioToHue, /audio-to-hue and /AUDIO_TO_HUE all reach the same
 * parameter. OSC layout editors disagree wildly on naming conventions.
 */
export function canonicalKey(segment) {
    return segment.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const PARAM_BY_KEY = new Map(PARAMS.map(p => [canonicalKey(p.name), p]));

/**
 * Resolve an OSC address to { param, normalised }.
 * Accepted forms:
 *   /param/hue          -> native value (0..360)
 *   /hue                -> native value
 *   /param/hue/norm     -> normalised 0..1
 *   /hue/norm           -> normalised 0..1
 * Returns null when the address is not a parameter address.
 */
export function resolveParamAddress(address) {
    const segments = address.split('/').filter(Boolean);
    if (segments.length === 0) return null;

    if (canonicalKey(segments[0]) === 'param') segments.shift();
    if (segments.length === 0) return null;

    let normalised = false;
    const last = canonicalKey(segments[segments.length - 1]);
    if (segments.length > 1 && (last === 'norm' || last === 'normalized' || last === 'normalised')) {
        normalised = true;
        segments.pop();
    }

    if (segments.length !== 1) return null;

    const param = PARAM_BY_KEY.get(canonicalKey(segments[0]));
    return param ? { param, normalised } : null;
}

/** Canonical outbound OSC address for a parameter. */
export function oscAddress(param) {
    return `/param/${param.name}`;
}
