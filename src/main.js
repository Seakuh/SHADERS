import * as THREE from 'three';
import { WebMidi } from 'webmidi';
import { VideoInputManager } from './VideoInputManager.js';
import { AudioInputManager } from './AudioInputManager.js';
import { OSCController } from './OSCController.js';
import { NDIOutput } from './NDIOutput.js';
import {
    PARAMS,
    PARAM_BY_CC,
    PARAM_BY_NAME,
    TRIGGER_CCS,
    fromNorm,
    formatValue,
    normaliseValue,
} from './params.js';
// ============================================
// MIDI
// ============================================

// ============================================
// Logger
// ============================================
class Logger {
    static log(category, message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [${category}]`, message, data || '');
    }

    static midi(message, data) {
        this.log('MIDI', message, data);
    }

    static shader(message, data) {
        this.log('SHADER', message, data);
    }

    static system(message, data) {
        this.log('SYSTEM', message, data);
    }

    static osc(message, data) {
        this.log('OSC', message, data);
    }

    static ndi(message, data) {
        this.log('NDI', message, data);
    }
}

// ============================================
// Shader Manager
// ============================================
class ShaderManager {
    constructor() {
        this.shaders = [];
        this.currentIndex = 0;
        this.loadedShaders = new Map();
    }

    async loadShaderList() {
        try {
            // Get all shader files in the shaders directory
            const glslFiles = import.meta.glob('../shaders/*.{glsl,glsln,gsls}', { as: 'raw' });
            this.shaders = Object.keys(glslFiles).map(path => path.replace('../shaders/', ''));

            Logger.shader('Found shaders:', this.shaders);

            // Preload all shaders
            for (const [path, loader] of Object.entries(glslFiles)) {
                const name = path.replace('../shaders/', '');
                const content = await loader();
                this.loadedShaders.set(name, content);
                Logger.shader(`Loaded: ${name}`);
            }

            return this.shaders.length > 0;
        } catch (error) {
            Logger.shader('Error loading shaders:', error);
            return false;
        }
    }

    getCurrentShader() {
        if (this.shaders.length === 0) return null;
        const name = this.shaders[this.currentIndex];
        return {
            name,
            content: this.loadedShaders.get(name)
        };
    }

    nextShader() {
        if (this.shaders.length === 0) return null;
        this.currentIndex = (this.currentIndex + 1) % this.shaders.length;
        Logger.shader(`Switched to: ${this.shaders[this.currentIndex]}`);
        return this.getCurrentShader();
    }

    previousShader() {
        if (this.shaders.length === 0) return null;
        this.currentIndex = (this.currentIndex - 1 + this.shaders.length) % this.shaders.length;
        Logger.shader(`Switched to: ${this.shaders[this.currentIndex]}`);
        return this.getCurrentShader();
    }

    setShaderByIndex(index) {
        if (index >= 0 && index < this.shaders.length) {
            this.currentIndex = index;
            Logger.shader(`Switched to: ${this.shaders[this.currentIndex]}`);
            return this.getCurrentShader();
        }
        return null;
    }
}

// ============================================
// MIDI Controller
// ============================================
class MIDIController {
    constructor(onShaderChange, onParameterChange) {
        this.onShaderChange = onShaderChange;
        this.onParameterChange = onParameterChange;
        this.currentInput = null;
        this.selector = null;

        // MIDI mappings are derived from the shared parameter registry
        // (src/params.js) so MIDI and OSC can never drift apart.
        this.mappings = {};
        for (const param of PARAMS) {
            if (param.cc !== null && param.cc !== undefined) {
                this.mappings[param.name] = { type: 'cc', value: param.cc };
            }
        }
        for (const [name, cc] of Object.entries(TRIGGER_CCS)) {
            this.mappings[name] = { type: 'cc', value: cc };
        }

        // Track mirror and edit mode state for CC0/CC1 mode switching
        this.mirrorActive = false;
        this.editModeActive = false;
    }

    async init() {
        try {
            this.selector = document.getElementById('midi-selector');

            await WebMidi.enable();
            Logger.midi('WebMIDI enabled successfully');

            // Update device list
            this.updateDeviceList();

            // Setup selector change handler
            if (this.selector) {
                this.selector.addEventListener('change', (e) => {
                    const inputId = e.target.value;
                    if (inputId) {
                        const input = WebMidi.getInputById(inputId);
                        if (input) {
                            this.connectToInput(input);
                        }
                    }
                });
            }

            // Auto-connect to first device if available
            if (WebMidi.inputs.length > 0) {
                this.connectToInput(WebMidi.inputs[0]);
            } else {
                Logger.midi('No MIDI inputs found. Connect a device...');
            }

            // Listen for new devices
            WebMidi.addListener('connected', (e) => {
                Logger.midi('Device connected:', e.port.name);
                if (e.port.type === 'input') {
                    this.updateDeviceList();
                    // Auto-connect if no device is connected
                    if (!this.currentInput) {
                        this.connectToInput(e.port);
                    }
                }
            });

            WebMidi.addListener('disconnected', (e) => {
                Logger.midi('Device disconnected:', e.port.name);
                if (e.port.type === 'input') {
                    this.updateDeviceList();
                    // If current device was disconnected, clear it
                    if (this.currentInput && this.currentInput.id === e.port.id) {
                        this.currentInput = null;
                        this.showLastMidiEvent('Device disconnected');
                    }
                }
            });

        } catch (error) {
            Logger.midi('Error initializing MIDI:', error);
            console.error('MIDI Error:', error);
        }
    }

    updateDeviceList() {
        if (!this.selector) return;

        const inputs = WebMidi.inputs;
        Logger.midi(`Available devices: ${inputs.length}`);

        // Clear and populate selector
        this.selector.innerHTML = '';

        if (inputs.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No MIDI devices';
            this.selector.appendChild(option);
        } else {
            inputs.forEach((input, index) => {
                const option = document.createElement('option');
                option.value = input.id;
                option.textContent = `${index + 1}: ${input.name}`;
                this.selector.appendChild(option);
                Logger.midi(`  [${index}] ${input.name} (${input.id})`);
            });

            // Select current device if exists
            if (this.currentInput) {
                this.selector.value = this.currentInput.id;
            }
        }
    }

    connectToInput(input) {
        // Disconnect from previous input
        if (this.currentInput) {
            Logger.midi(`Disconnecting from: ${this.currentInput.name}`);
            this.currentInput.removeListener();
        }

        Logger.midi(`Connecting to: ${input.name}`);
        this.currentInput = input;

        // Update selector
        if (this.selector) {
            this.selector.value = input.id;
        }

        this.showLastMidiEvent(`Connected to: ${input.name}`);

        // Listen to all note on messages
        input.addListener('noteon', (e) => {
            const msg = `Note ON: ${e.note.name}${e.note.octave} (${e.note.number}) Vel: ${e.rawVelocity}`;
            Logger.midi(msg);
            this.showLastMidiEvent(msg);
            this.handleNoteOn(e.note.number);
        });

        // Listen to all note off messages
        input.addListener('noteoff', (e) => {
            const msg = `Note OFF: ${e.note.name}${e.note.octave} (${e.note.number})`;
            Logger.midi(msg);
            this.showLastMidiEvent(msg);
        });

        // Listen to control change messages
        input.addListener('controlchange', (e) => {
            const msg = `CC${e.controller.number} = ${e.rawValue}/127 (${e.value.toFixed(2)})`;
            Logger.midi(msg);
            this.showLastMidiEvent(msg);
            this.handleCC(e.controller.number, e.value);
        });

        // Listen to pitch bend
        input.addListener('pitchbend', (e) => {
            const msg = `Pitch Bend: ${e.value.toFixed(2)}`;
            Logger.midi(msg);
            this.showLastMidiEvent(msg);
        });

        Logger.midi(`Now listening to: ${input.name}`);
    }

    showLastMidiEvent(message) {
        const element = document.getElementById('last-midi-event');
        if (element) {
            element.textContent = `Last: ${message}`;
        }
    }

    handleNoteOn(note) {
        // Map notes 0-127 to shader selection
        this.onShaderChange('index', note);
    }

    handleCC(cc, value) {
        // Edit mode re-purposes a few faders. These overrides run first so the
        // normal registry mapping never sees the CC.
        if (this.editModeActive && this.mirrorActive) {
            if (cc === this.mappings.vibrance.value) {
                // CC0 -> Source shift (where to sample the mirror from)
                this.applyParam('mirrorSplit', value);
                return;
            } else if (cc === this.mappings.hue.value) {
                // CC1 -> Mirror segments (2 to 32 slices for kaleidoscope)
                this.applyParam('mirrorSegments', value);
                return;
            }
        }

        // In edit mode, CC3 controls vertical shift
        if (this.editModeActive && cc === this.mappings.grayscale.value) {
            // Map 0-1 to -0.5 to 0.5 (shift range)
            this.applyParam('verticalShift', value);
            return;
        }

        // Momentary triggers fire once, on the way past the halfway point.
        if (cc === TRIGGER_CCS.shaderNext) {
            if (value > 0.5) this.onShaderChange('next');
            return;
        }
        if (cc === TRIGGER_CCS.shaderPrev) {
            if (value > 0.5) this.onShaderChange('prev');
            return;
        }
        if (cc === TRIGGER_CCS.editMode) {
            if (value > 0.5) this.onParameterChange('editModeToggle', true);
            return;
        }

        const param = PARAM_BY_CC.get(cc);
        if (param) this.applyParam(param.name, value);
    }

    /** Convert a normalised MIDI value into the parameter's native range. */
    applyParam(name, normalisedValue) {
        const param = PARAM_BY_NAME.get(name);
        if (!param) return;
        this.onParameterChange(param.name, fromNorm(param, normalisedValue));
    }

    setEditModeActive(active) {
        this.editModeActive = active;
    }
}

// ============================================
// Shader Renderer
// ============================================
class ShaderRenderer {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.clock = new THREE.Clock();

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        // Post-processing uniforms (global effects)
        this.globalUniforms = {
            u_vibrance: 0.0,
            u_hue: 0.0,
            u_saturation: 1.0,
            u_grayscale: 0.0,
            u_contrast: 1.0,
            u_brightness: 1.0,
            u_zoom: 1.0,
            u_speed: 1.0,
            u_mirror: 0.0,
            u_videoMix: 0.0,
            u_audioIntensity: 0.0,
            u_audioToHue: 0.0,
            u_audioToSaturation: 0.0,
            u_audioToBrightness: 0.0,
            u_audioToZoom: 0.0,
            u_mirrorSplit: 0.5,  // Default: no shift (centered)
            u_mirrorSegments: 2,
            // Screen coords: (0,0) = top-left, (1,1) = bottom-right
            u_perspTL: { x: 0.0, y: 0.0 },
            u_perspTR: { x: 1.0, y: 0.0 },
            u_perspBL: { x: 0.0, y: 1.0 },
            u_perspBR: { x: 1.0, y: 1.0 },
            u_perspActive: false,
            u_verticalShift: 0.0  // Vertical image shift (-1 to 1)
        };

        // Video and audio textures
        this.videoTexture = null;
        this.audioData = null;

        // Mask texture for edit mode
        this.maskCanvas = null;
        this.maskCtx = null;
        this.maskTexture = null;
        this.maskHistory = []; // History for undo
        this.maxHistory = 10; // Max history entries
        this.initMaskCanvas();

        // Current shader material
        this.material = null;
        this.mesh = null;

        // Time tracking for speed control
        this.baseTime = 0;

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());

        // Store reference to app for resize handler
        this.app = null;
    }

    setApp(app) {
        this.app = app;
    }

    initMaskCanvas() {
        // Create offscreen canvas for mask
        this.maskCanvas = document.createElement('canvas');
        this.maskCanvas.width = window.innerWidth;
        this.maskCanvas.height = window.innerHeight;
        this.maskCtx = this.maskCanvas.getContext('2d');

        // Initialize with white (fully visible)
        this.clearMask();

        // Create THREE.js texture from canvas
        this.maskTexture = new THREE.CanvasTexture(this.maskCanvas);
        this.maskTexture.minFilter = THREE.LinearFilter;
        this.maskTexture.magFilter = THREE.LinearFilter;

        Logger.system('Mask canvas initialized');
    }

    saveToHistory() {
        if (!this.maskCtx) return;
        // Save current state to history
        const imageData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        this.maskHistory.push(imageData);
        // Limit history size
        if (this.maskHistory.length > this.maxHistory) {
            this.maskHistory.shift();
        }
        Logger.system(`Mask saved to history (${this.maskHistory.length}/${this.maxHistory})`);
    }

    undoMask() {
        if (!this.maskCtx || this.maskHistory.length === 0) {
            Logger.system('No history to undo');
            return false;
        }
        // Restore last state from history
        const imageData = this.maskHistory.pop();
        this.maskCtx.putImageData(imageData, 0, 0);
        if (this.maskTexture) {
            this.maskTexture.needsUpdate = true;
        }
        Logger.system(`Mask restored from history (${this.maskHistory.length} remaining)`);
        return true;
    }

    clearMask() {
        if (!this.maskCtx) return;
        // Save current state before clearing
        this.saveToHistory();
        this.maskCtx.fillStyle = 'white';
        this.maskCtx.fillRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        if (this.maskTexture) {
            this.maskTexture.needsUpdate = true;
        }
    }

    invertMask() {
        if (!this.maskCtx) return;
        const imageData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];       // R
            data[i + 1] = 255 - data[i + 1]; // G
            data[i + 2] = 255 - data[i + 2]; // B
        }
        this.maskCtx.putImageData(imageData, 0, 0);
        if (this.maskTexture) {
            this.maskTexture.needsUpdate = true;
        }
    }

    drawOnMask(x, y, brushSize, erase = true) {
        if (!this.maskCtx) return;

        // Convert screen coordinates to canvas coordinates
        const canvasX = (x / window.innerWidth) * this.maskCanvas.width;
        // Flip Y coordinate to match shader UV (shader flips Y, so we need to flip here too)
        const canvasY = (1.0 - y / window.innerHeight) * this.maskCanvas.height;

        this.maskCtx.beginPath();
        this.maskCtx.arc(canvasX, canvasY, brushSize / 2, 0, Math.PI * 2);
        this.maskCtx.fillStyle = erase ? 'black' : 'white';
        this.maskCtx.fill();

        if (this.maskTexture) {
            this.maskTexture.needsUpdate = true;
        }
    }

    createShaderMaterial(fragmentShader) {
        // Wrap the user's fragment shader with our post-processing
        const wrappedFragmentShader = `
            uniform float iTime;
            uniform vec2 iResolution;
            uniform float iTimeDelta;
            uniform int iFrame;

            // Global controls
            uniform float u_vibrance;
            uniform float u_hue;
            uniform float u_saturation;
            uniform float u_grayscale;
            uniform float u_contrast;
            uniform float u_brightness;
            uniform float u_zoom;
            uniform float u_speed;
            uniform float u_mirror;
            uniform float u_videoMix;
            uniform float u_audioIntensity;
            uniform float u_audioToHue;
            uniform float u_audioToSaturation;
            uniform float u_audioToBrightness;
            uniform float u_audioToZoom;
            uniform float u_mirrorSplit;
            uniform float u_mirrorSegments;

            // Perspective transform corners (normalized 0-1)
            uniform vec2 u_perspTL;  // Top-left
            uniform vec2 u_perspTR;  // Top-right
            uniform vec2 u_perspBL;  // Bottom-left
            uniform vec2 u_perspBR;  // Bottom-right
            uniform bool u_perspActive;
            uniform float u_verticalShift;  // Vertical image shift

            // Video and audio
            uniform sampler2D u_videoTexture;
            uniform bool u_hasVideo;
            uniform float u_audioBass;
            uniform float u_audioMid;
            uniform float u_audioTreble;

            // Mask for edit mode
            uniform sampler2D u_maskTexture;
            uniform bool u_hasMask;

            // RGB to HSL conversion
            vec3 rgb2hsl(vec3 color) {
                float maxc = max(max(color.r, color.g), color.b);
                float minc = min(min(color.r, color.g), color.b);
                float l = (maxc + minc) / 2.0;

                if (maxc == minc) {
                    return vec3(0.0, 0.0, l);
                }

                float delta = maxc - minc;
                float s = l > 0.5 ? delta / (2.0 - maxc - minc) : delta / (maxc + minc);

                float h;
                if (color.r == maxc) {
                    h = (color.g - color.b) / delta + (color.g < color.b ? 6.0 : 0.0);
                } else if (color.g == maxc) {
                    h = (color.b - color.r) / delta + 2.0;
                } else {
                    h = (color.r - color.g) / delta + 4.0;
                }
                h /= 6.0;

                return vec3(h, s, l);
            }

            // HSL to RGB conversion
            vec3 hsl2rgb(vec3 hsl) {
                float h = hsl.x;
                float s = hsl.y;
                float l = hsl.z;

                float c = (1.0 - abs(2.0 * l - 1.0)) * s;
                float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
                float m = l - c / 2.0;

                vec3 rgb;
                if (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
                else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
                else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
                else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
                else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
                else rgb = vec3(c, 0.0, x);

                return rgb + m;
            }

            // Check if point is inside a quad using cross products
            float crossSign(vec2 a, vec2 b, vec2 p) {
                return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
            }

            bool pointInQuad(vec2 p, vec2 tl, vec2 tr, vec2 br, vec2 bl) {
                // Check if point is on the same side of all edges
                float d1 = crossSign(tl, tr, p);
                float d2 = crossSign(tr, br, p);
                float d3 = crossSign(br, bl, p);
                float d4 = crossSign(bl, tl, p);

                bool hasNeg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0) || (d4 < 0.0);
                bool hasPos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0) || (d4 > 0.0);

                return !(hasNeg && hasPos);
            }

            ${fragmentShader}

            void main() {
                vec2 fragCoord = gl_FragCoord.xy;
                vec2 screenUV = fragCoord / iResolution.xy;

                // Calculate audio modulation (bass is most impactful)
                float audioMod = u_audioBass;

                // Apply zoom with audio modulation
                float dynamicZoom = u_zoom + (audioMod * u_audioToZoom * 2.0);
                vec2 center = iResolution.xy * 0.5;
                fragCoord = (fragCoord - center) / dynamicZoom + center;

                // Apply vertical shift
                fragCoord.y += u_verticalShift * iResolution.y;

                // Apply perspective transformation first
                bool outsidePerspective = false;
                if (u_perspActive) {
                    // Screen UV: (0,0) = bottom-left in WebGL, but our corners use (0,0) = top-left
                    // So we need to flip Y for the check
                    vec2 checkUV = vec2(screenUV.x, 1.0 - screenUV.y);

                    // Check if screen point is inside the perspective quad
                    if (!pointInQuad(checkUV, u_perspTL, u_perspTR, u_perspBR, u_perspBL)) {
                        outsidePerspective = true;
                    }

                    // Bilinear interpolation for perspective correction
                    // Map from screen position to texture position
                    vec2 uv = fragCoord / iResolution.xy;
                    // Flip Y to match our screen coordinate system
                    float screenY = 1.0 - uv.y;

                    // Interpolate: top edge at screenY=0, bottom edge at screenY=1
                    vec2 topInterp = mix(u_perspTL, u_perspTR, uv.x);
                    vec2 bottomInterp = mix(u_perspBL, u_perspBR, uv.x);
                    vec2 perspUV = mix(topInterp, bottomInterp, screenY);

                    // Convert back to shader coords (flip Y back)
                    perspUV.y = 1.0 - perspUV.y;

                    fragCoord = perspUV * iResolution.xy;
                }

                // Apply mirror/kaleidoscope effect (always from center)
                if (u_mirror > 0.5) {
                    // Convert to centered coordinates
                    vec2 centered = fragCoord - center;

                    if (u_mirrorSegments > 2.0) {
                        // Kaleidoscope mode: mirror in circular segments
                        float angle = atan(centered.y, centered.x);
                        float radius = length(centered);

                        // Calculate segment angle based on number of segments
                        float segmentAngle = 3.14159265 * 2.0 / u_mirrorSegments;

                        // Fold angle into first segment
                        angle = mod(angle, segmentAngle);

                        // Mirror within segment (creates kaleidoscope effect)
                        if (angle > segmentAngle * 0.5) {
                            angle = segmentAngle - angle;
                        }

                        // Convert back to cartesian
                        centered = vec2(cos(angle), sin(angle)) * radius;
                    } else {
                        // Simple mirror from center
                        // CC0 shifts the source horizontally (where to sample from)
                        float sourceShift = (u_mirrorSplit - 0.5) * center.x * 2.0;

                        // Mirror: right side shows flipped left side
                        if (centered.x > 0.0) {
                            centered.x = -centered.x;
                        }

                        // Apply source shift
                        centered.x = centered.x + sourceShift;
                    }

                    fragCoord = centered + center;
                }

                vec4 color = vec4(0.0);

                // Call the user's mainImage function with modified coordinates
                mainImage(color, fragCoord);

                vec3 finalColor = color.rgb;

                // Apply brightness with audio modulation
                float dynamicBrightness = u_brightness + (audioMod * u_audioToBrightness);
                finalColor *= dynamicBrightness;

                // Apply contrast
                finalColor = (finalColor - 0.5) * u_contrast + 0.5;

                // Apply global color transformations via HSL
                vec3 hsl = rgb2hsl(finalColor);

                // Apply hue rotation with audio modulation
                float dynamicHue = u_hue + (audioMod * u_audioToHue * 360.0);
                hsl.x = mod(hsl.x + dynamicHue / 360.0, 1.0);

                // Apply saturation adjustment with audio modulation
                float dynamicSaturation = u_saturation + (audioMod * u_audioToSaturation);
                hsl.y *= clamp(dynamicSaturation, 0.0, 2.0);

                // Apply vibrance (boost less saturated colors more)
                float satBoost = (1.0 - hsl.y) * u_vibrance;
                hsl.y = clamp(hsl.y + satBoost, 0.0, 1.0);

                finalColor = hsl2rgb(hsl);

                // Apply grayscale
                float gray = dot(finalColor, vec3(0.299, 0.587, 0.114));
                finalColor = mix(finalColor, vec3(gray), u_grayscale);

                // Mix with video texture if available
                if (u_hasVideo && u_videoMix > 0.0) {
                    vec2 videoUV = gl_FragCoord.xy / iResolution.xy;
                    videoUV.y = 1.0 - videoUV.y; // Flip Y coordinate
                    vec3 videoColor = texture2D(u_videoTexture, videoUV).rgb;
                    finalColor = mix(finalColor, videoColor, u_videoMix);
                }

                // Apply mask if active
                float maskAlpha = 1.0;
                if (u_hasMask) {
                    vec2 maskUV = gl_FragCoord.xy / iResolution.xy;
                    maskUV.y = 1.0 - maskUV.y; // Flip Y coordinate
                    maskAlpha = texture2D(u_maskTexture, maskUV).r;
                }

                // Black outside perspective area
                if (outsidePerspective) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }

                gl_FragColor = vec4(finalColor * maskAlpha, color.a * maskAlpha);
            }
        `;

        const vertexShader = `
            void main() {
                gl_Position = vec4(position, 1.0);
            }
        `;

        return new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader: wrappedFragmentShader,
            uniforms: {
                iTime: { value: 0 },
                iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                iTimeDelta: { value: 0 },
                iFrame: { value: 0 },
                u_vibrance: { value: this.globalUniforms.u_vibrance },
                u_hue: { value: this.globalUniforms.u_hue },
                u_saturation: { value: this.globalUniforms.u_saturation },
                u_grayscale: { value: this.globalUniforms.u_grayscale },
                u_contrast: { value: this.globalUniforms.u_contrast },
                u_brightness: { value: this.globalUniforms.u_brightness },
                u_zoom: { value: this.globalUniforms.u_zoom },
                u_speed: { value: this.globalUniforms.u_speed },
                u_mirror: { value: this.globalUniforms.u_mirror },
                u_videoMix: { value: this.globalUniforms.u_videoMix },
                u_audioIntensity: { value: this.globalUniforms.u_audioIntensity },
                u_audioToHue: { value: this.globalUniforms.u_audioToHue },
                u_audioToSaturation: { value: this.globalUniforms.u_audioToSaturation },
                u_audioToBrightness: { value: this.globalUniforms.u_audioToBrightness },
                u_audioToZoom: { value: this.globalUniforms.u_audioToZoom },
                u_mirrorSplit: { value: this.globalUniforms.u_mirrorSplit },
                u_mirrorSegments: { value: this.globalUniforms.u_mirrorSegments },
                // Screen coords: (0,0) = top-left, (1,1) = bottom-right
                u_perspTL: { value: new THREE.Vector2(0.0, 0.0) },
                u_perspTR: { value: new THREE.Vector2(1.0, 0.0) },
                u_perspBL: { value: new THREE.Vector2(0.0, 1.0) },
                u_perspBR: { value: new THREE.Vector2(1.0, 1.0) },
                u_perspActive: { value: false },
                u_verticalShift: { value: 0.0 },
                u_videoTexture: { value: null },
                u_hasVideo: { value: false },
                u_audioBass: { value: 0.0 },
                u_audioMid: { value: 0.0 },
                u_audioTreble: { value: 0.0 },
                u_maskTexture: { value: this.maskTexture },
                u_hasMask: { value: false }
            }
        });
    }

    loadShader(shaderContent) {
        try {
            // Save current state
            const hadVideo = this.material ? this.material.uniforms.u_hasVideo.value : false;
            const hadMask = this.material ? this.material.uniforms.u_hasMask.value : false;

            // Remove old mesh
            if (this.mesh) {
                this.scene.remove(this.mesh);
                if (this.material) this.material.dispose();
            }

            // Create new material with shader
            this.material = this.createShaderMaterial(shaderContent);

            // Restore video texture if available
            if (this.videoTexture) {
                this.material.uniforms.u_videoTexture.value = this.videoTexture;
                this.material.uniforms.u_hasVideo.value = hadVideo;
            }

            // Restore mask texture
            if (this.maskTexture) {
                this.material.uniforms.u_maskTexture.value = this.maskTexture;
                this.material.uniforms.u_hasMask.value = hadMask;
            }

            // Restore perspective if it was active
            const hadPersp = this.globalUniforms.u_perspActive;
            if (hadPersp) {
                this.material.uniforms.u_perspTL.value.set(this.globalUniforms.u_perspTL.x, this.globalUniforms.u_perspTL.y);
                this.material.uniforms.u_perspTR.value.set(this.globalUniforms.u_perspTR.x, this.globalUniforms.u_perspTR.y);
                this.material.uniforms.u_perspBL.value.set(this.globalUniforms.u_perspBL.x, this.globalUniforms.u_perspBL.y);
                this.material.uniforms.u_perspBR.value.set(this.globalUniforms.u_perspBR.x, this.globalUniforms.u_perspBR.y);
                this.material.uniforms.u_perspActive.value = true;
            }

            // Create fullscreen quad
            const geometry = new THREE.PlaneGeometry(2, 2);
            this.mesh = new THREE.Mesh(geometry, this.material);
            this.scene.add(this.mesh);

            Logger.shader('Shader loaded successfully');
            return true;
        } catch (error) {
            Logger.shader('Error loading shader:', error);
            return false;
        }
    }

    updateGlobalParameter(param, value) {
        this.globalUniforms[`u_${param}`] = value;
        if (this.material && this.material.uniforms[`u_${param}`]) {
            this.material.uniforms[`u_${param}`].value = value;
        }
    }

    setVideoTexture(texture) {
        this.videoTexture = texture;
        if (this.material) {
            this.material.uniforms.u_videoTexture.value = texture;
            this.material.uniforms.u_hasVideo.value = texture !== null;
        }
    }

    setAudioData(audioDataGetter) {
        this.audioData = audioDataGetter;
    }

    setMaskActive(active) {
        if (this.material) {
            this.material.uniforms.u_hasMask.value = active;
        }
    }

    updateMaskTexture() {
        if (this.maskTexture) {
            this.maskTexture.needsUpdate = true;
        }
        if (this.material && this.material.uniforms.u_maskTexture) {
            this.material.uniforms.u_maskTexture.value = this.maskTexture;
        }
    }

    setPerspectiveActive(active) {
        if (this.material && this.material.uniforms.u_perspActive) {
            this.material.uniforms.u_perspActive.value = active;
        }
    }

    render() {
        if (!this.material) return;

        const deltaTime = this.clock.getDelta();
        const speed = this.globalUniforms.u_speed;

        // Update time with speed multiplier
        this.baseTime += deltaTime * speed;

        this.material.uniforms.iTime.value = this.baseTime;
        this.material.uniforms.iTimeDelta.value = deltaTime * speed;
        this.material.uniforms.iFrame.value++;

        // Update audio data if available
        if (this.audioData) {
            const data = this.audioData();
            this.material.uniforms.u_audioBass.value = data.bass * this.globalUniforms.u_audioIntensity;
            this.material.uniforms.u_audioMid.value = data.mid * this.globalUniforms.u_audioIntensity;
            this.material.uniforms.u_audioTreble.value = data.treble * this.globalUniforms.u_audioIntensity;
        }

        // Update video texture if available
        if (this.videoTexture && this.videoTexture.image && this.videoTexture.image.readyState === 4) {
            this.videoTexture.needsUpdate = true;
        }

        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.renderer.setSize(width, height);

        if (this.material && this.material.uniforms.iResolution) {
            this.material.uniforms.iResolution.value.set(width, height);
        }

        // Resize mask canvas
        if (this.maskCanvas) {
            // Save current mask content
            const imageData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);

            // Resize canvas
            this.maskCanvas.width = width;
            this.maskCanvas.height = height;

            // Clear with white
            this.maskCtx.fillStyle = 'white';
            this.maskCtx.fillRect(0, 0, width, height);

            // Try to restore mask content (scaled)
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageData.width;
            tempCanvas.height = imageData.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(imageData, 0, 0);
            this.maskCtx.drawImage(tempCanvas, 0, 0, width, height);

            if (this.maskTexture) {
                this.maskTexture.needsUpdate = true;
            }
        }

        // Resize perspective grid canvas (via app reference)
        if (this.app && this.app.perspGridCanvas) {
            this.app.perspGridCanvas.width = width;
            this.app.perspGridCanvas.height = height;
        }

        Logger.system('Window resized:', { width, height });
    }
}

// ============================================
// Main Application
// ============================================
class ShaderMIDIApp {
    constructor() {
        this.shaderManager = new ShaderManager();
        this.renderer = new ShaderRenderer();
        this.midiController = null;
        this.oscController = null;
        this.ndiOutput = null;
        this.videoManager = null;
        this.audioManager = null;
        this.infoVisible = true;

        // Current native value of every registry parameter, so OSC clients
        // can ask for a full state dump at any time.
        this.paramState = new Map(PARAMS.map(p => [p.name, p.def]));

        // Edit mode state
        this.editMode = false;
        this.brushSize = 50;
        this.isDrawing = false;
        this.brushCursor = null;
        this.maskDirty = false; // Track if mask has been drawn on

        // Perspective handles
        this.perspectiveHandles = [];
        // Screen coordinates: (0,0) = top-left, (1,1) = bottom-right
        this.perspectiveCorners = {
            tl: { x: 0.0, y: 0.0 },
            tr: { x: 1.0, y: 0.0 },
            bl: { x: 0.0, y: 1.0 },
            br: { x: 1.0, y: 1.0 }
        };
        this.activePerspHandle = null;
        this.perspectiveDirty = false;

        // Perspective grid overlay
        this.perspGridCanvas = null;
        this.perspGridCtx = null;
        this.showPerspGrid = false;

        // Edit tool selection: 'brush' or 'polygon'
        this.currentEditTool = 'brush';

        // Polygon tool state
        this.polygonPoints = [];
        this.polygonPointElements = [];
        this.polygonPreview = null;
    }

    async init() {
        Logger.system('Initializing Shader MIDI Player...');

        // Set app reference on renderer for resize handling
        this.renderer.setApp(this);

        // Load shaders
        const shadersLoaded = await this.shaderManager.loadShaderList();
        if (!shadersLoaded) {
            Logger.system('No shaders found!');
            return;
        }

        // Load initial shader
        this.loadCurrentShader();

        // Initialize MIDI
        this.midiController = new MIDIController(
            (action, data) => this.handleShaderChange(action, data),
            (param, value) => this.handleParameterChange(param, value)
        );
        await this.midiController.init();

        // Initialize OSC (via the local bridge) as a full peer of MIDI
        this.oscController = new OSCController(
            {
                onShaderChange: (action, data) => this.handleShaderChange(action, data),
                onParameterChange: (param, value) => this.handleParameterChange(param, value),
                onCommand: (action, data) => this.handleCommand(action, data),
            },
            {
                log: (message) => Logger.osc(message),
                onBridgeStatus: (status) => this.handleBridgeStatus(status),
            }
        );
        this.oscController.init();

        // Initialize NDI output (frames go out through the same bridge)
        const osc = this.oscController;
        this.ndiOutput = new NDIOutput(
            this.renderer.renderer,
            {
                sendBinary: (buffer) => osc.sendBinary(buffer),
                get bufferedAmount() { return osc.bufferedAmount; },
            },
            { log: (message) => Logger.ndi(message) }
        );
        this.ndiOutput.init();
        this.setupOutputControls();

        // Initialize Video Manager
        this.videoManager = new VideoInputManager((texture) => {
            this.renderer.setVideoTexture(texture);
            Logger.system('Video texture updated');
        });
        this.videoManager.init();

        // Initialize Audio Manager
        this.audioManager = new AudioInputManager((audioDataGetter) => {
            this.renderer.setAudioData(audioDataGetter);
            Logger.system('Audio data source updated');
        });
        this.audioManager.init();

        // Setup keyboard controls
        this.setupKeyboardControls();

        // Setup edit mode
        this.setupEditMode();

        // Start render loop
        this.animate();

        Logger.system('Initialization complete!');
    }

    loadCurrentShader() {
        const shader = this.shaderManager.getCurrentShader();
        if (shader) {
            this.renderer.loadShader(shader.content);
            this.updateUI('current-shader', shader.name);
        }
    }

    handleShaderChange(action, data) {
        const total = this.shaderManager.shaders.length;

        if (action === 'next') {
            this.shaderManager.nextShader();
        } else if (action === 'prev') {
            this.shaderManager.previousShader();
        } else if (action === 'index') {
            // Map MIDI note to shader index
            const shaderIndex = Math.floor((data / 127) * total);
            this.shaderManager.setShaderByIndex(shaderIndex);
        } else if (action === 'absoluteIndex') {
            // OSC: exact index, no scaling
            this.shaderManager.setShaderByIndex(Math.max(0, Math.min(total - 1, Math.round(data))));
        } else if (action === 'fraction') {
            // OSC: 0..1 scans the whole set, for faders
            const shaderIndex = Math.min(total - 1, Math.floor(data * total));
            this.shaderManager.setShaderByIndex(Math.max(0, shaderIndex));
        } else if (action === 'name') {
            const index = this.shaderManager.shaders.findIndex(
                name => name.toLowerCase() === data.toLowerCase()
                    || name.replace(/\.[^.]+$/, '').toLowerCase() === data.toLowerCase()
            );
            if (index === -1) {
                Logger.shader(`No shader named "${data}"`);
                return;
            }
            this.shaderManager.setShaderByIndex(index);
        }

        this.loadCurrentShader();

        if (this.oscController) {
            this.oscController.sendShaderState(
                this.shaderManager.shaders[this.shaderManager.currentIndex] || '',
                this.shaderManager.currentIndex,
                total
            );
        }
    }

    handleBridgeStatus(status) {
        const element = document.getElementById('ndi-receivers');
        if (element && status.ndi) {
            element.textContent = status.ndi.available
                ? `${status.ndi.connections} receiver(s)`
                : (status.ndi.reason || 'unavailable');
        }
    }

    setupOutputControls() {
        const toggle = document.getElementById('ndi-toggle');
        const resolution = document.getElementById('ndi-resolution');
        const fps = document.getElementById('ndi-fps');

        if (toggle) {
            toggle.addEventListener('click', () => {
                const enabled = this.ndiOutput.setEnabled(!this.ndiOutput.enabled);
                toggle.textContent = enabled ? 'Stop NDI Output' : 'Start NDI Output';
                toggle.classList.toggle('active', enabled);
            });
        }

        if (resolution) {
            resolution.addEventListener('change', (e) => {
                if (e.target.value === 'auto') {
                    this.ndiOutput.setAutoResolution(true);
                } else {
                    const [width, height] = e.target.value.split('x').map(Number);
                    this.ndiOutput.setResolution(width, height);
                }
            });
        }

        if (fps) {
            fps.addEventListener('change', (e) => {
                this.ndiOutput.setFps(Number(e.target.value));
            });
        }
    }

    /**
     * Single entry point for every control surface (MIDI, OSC, UI widgets).
     * `value` is always in the parameter's native range.
     */
    handleParameterChange(param, value) {
        // Handle edit mode toggle specially
        if (param === 'editModeToggle') {
            this.toggleEditMode();
            return;
        }

        const definition = PARAM_BY_NAME.get(param);
        if (definition) {
            value = normaliseValue(definition, value);
            this.paramState.set(param, value);
        }

        // Handle brush size specially
        if (param === 'brushSize') {
            this.brushSize = value;
            this.updateBrushCursor();
            const slider = document.getElementById('brush-size-slider');
            if (slider) slider.value = value;
            this.reflectParameter(definition, value);
            return;
        }

        // Mirror doubles as a mode switch for the edit-mode fader overrides.
        if (param === 'mirror' && this.midiController) {
            this.midiController.mirrorActive = value > 0.5;
        }

        this.renderer.updateGlobalParameter(param, value);
        Logger.system(`Parameter ${param} = ${typeof value === 'number' ? value.toFixed(2) : value}`);

        this.reflectParameter(definition, value);

        // Automatische Kamera-Aktivierung basierend auf audioToHue
        if (param === 'audioToHue') {
            this.handleAudioToHueChange(value);
        }
    }

    /** Update the info overlay and echo the change to OSC listeners. */
    reflectParameter(definition, value) {
        if (!definition) return;
        if (definition.ui) this.updateUI(definition.ui, formatValue(definition, value));
        if (this.oscController) this.oscController.sendParameter(definition, value);
    }

    /**
     * Commands that are not simple parameters — OSC's equivalent of the
     * keyboard shortcuts and buttons.
     */
    handleCommand(action, data) {
        switch (action) {
            case 'toggleEditMode':
                this.toggleEditMode();
                break;
            case 'setEditMode':
                if (this.editMode !== data) this.toggleEditMode();
                break;
            case 'setEditTool':
                if (this.editMode) this.setEditTool(data === 'polygon' ? 'polygon' : 'brush');
                break;
            case 'clearMask':
                this.renderer.clearMask();
                this.maskDirty = false;
                this.renderer.setMaskActive(this.editMode);
                Logger.system('Mask cleared');
                break;
            case 'undoMask':
                if (this.renderer.undoMask()) {
                    this.maskDirty = this.renderer.maskHistory.length > 0;
                }
                break;
            case 'invertMask':
                this.renderer.saveToHistory();
                this.renderer.invertMask();
                this.maskDirty = true;
                this.renderer.setMaskActive(true);
                Logger.system('Mask inverted');
                break;
            case 'resetPerspective':
                this.resetPerspective();
                break;
            case 'setPerspectiveCorner':
                this.setPerspectiveCorner(data.corner, data.x, data.y);
                break;
            case 'toggleFullscreen':
                this.toggleFullscreen();
                break;
            case 'toggleInfo':
                this.toggleInfo();
                break;
            case 'setNDIEnabled':
                if (this.ndiOutput) this.ndiOutput.setEnabled(data);
                break;
            case 'setNDIFps':
                if (this.ndiOutput) this.ndiOutput.setFps(data);
                break;
            case 'setNDIResolution':
                if (this.ndiOutput) this.ndiOutput.setResolution(data.width, data.height);
                break;
            case 'listShaders':
                Logger.shader('Shaders:', this.shaderManager.shaders);
                break;
            case 'requestFullState':
                this.broadcastFullState();
                break;
            default:
                Logger.system(`Unknown command: ${action}`);
        }
    }

    /** Push every parameter and the current shader out over OSC. */
    broadcastFullState() {
        if (!this.oscController) return;
        for (const param of PARAMS) {
            const value = this.paramState.has(param.name)
                ? this.paramState.get(param.name)
                : param.def;
            this.oscController.sendParameter(param, value);
        }
        this.oscController.sendShaderState(
            this.shaderManager.shaders[this.shaderManager.currentIndex] || '',
            this.shaderManager.currentIndex,
            this.shaderManager.shaders.length
        );
        this.oscController.sendEditState(this.editMode);
        Logger.osc('Full state sent');
    }

    /** Move one perspective corner. Coordinates are normalised 0..1. */
    setPerspectiveCorner(corner, x, y) {
        if (!this.perspectiveCorners[corner]) return;
        this.perspectiveCorners[corner] = {
            x: Math.min(1, Math.max(0, x)),
            y: Math.min(1, Math.max(0, y)),
        };
        this.perspectiveDirty = true;
        this.updatePerspectiveUniforms();
        this.updatePerspectiveHandlePositions();
        Logger.system(`Perspective ${corner} = ${x.toFixed(3)}, ${y.toFixed(3)}`);
    }

    /** Sync the draggable handle elements to the current corner values. */
    updatePerspectiveHandlePositions() {
        this.perspectiveHandles.forEach(handle => {
            const corner = this.perspectiveCorners[handle.dataset.corner];
            if (!corner) return;
            handle.style.left = `${corner.x * window.innerWidth}px`;
            handle.style.top = `${corner.y * window.innerHeight}px`;
            handle.style.right = 'auto';
            handle.style.bottom = 'auto';
        });
        if (this.showPerspGrid) this.drawPerspectiveGrid();
    }

    async handleAudioToHueChange(audioToHueValue) {
        // Schwellenwert für Kamera-Aktivierung (z.B. 0.48)
        const cameraThreshold = 0.48;
        const thresholdRange = 0.05; // Bereich um den Schwellenwert

        // Prüfe ob audioToHue im Bereich für Kamera-Aktivierung ist
        const isInCameraRange = Math.abs(audioToHueValue - cameraThreshold) < thresholdRange;

        if (isInCameraRange && this.videoManager) {
            // Aktiviere Kamera wenn noch nicht aktiv
            if (this.videoManager.currentSource === 'none' || this.videoManager.currentSource === 'file') {
                // Verwende erste verfügbare Kamera oder bereits ausgewählte
                let deviceToUse = this.videoManager.currentDeviceId;
                if (!deviceToUse && this.videoManager.availableDevices.length > 0) {
                    // Suche nach Logitech-Kamera, sonst erste verfügbare
                    const logitechDevice = this.videoManager.availableDevices.find(
                        d => d.label && d.label.toLowerCase().includes('logitech')
                    );
                    deviceToUse = logitechDevice ? logitechDevice.deviceId : this.videoManager.availableDevices[0].deviceId;
                }
                
                Logger.system(`AudioToHue ${audioToHueValue.toFixed(2)} → Aktiviere Kamera`);
                await this.videoManager.handleCameraChange(deviceToUse || 'default');
                // Update UI selector
                if (this.videoManager.cameraSelector && deviceToUse) {
                    this.videoManager.cameraSelector.value = deviceToUse;
                }
            }

            // Berechne videoMix basierend auf audioToHue
            // Je näher am Schwellenwert, desto stärker die Überblendung
            const distanceFromThreshold = Math.abs(audioToHueValue - cameraThreshold);
            const blendStrength = 1.0 - (distanceFromThreshold / thresholdRange);
            const videoMix = Math.max(0.0, Math.min(1.0, blendStrength));

            this.renderer.updateGlobalParameter('videoMix', videoMix);
            this.updateUI('video-mix-value', videoMix.toFixed(2));
            Logger.system(`Video Mix automatisch auf ${videoMix.toFixed(2)} gesetzt`);
        } else if (!isInCameraRange && this.videoManager && 
                   this.videoManager.currentSource !== 'none' && 
                   this.videoManager.currentSource !== 'file') {
            // Reduziere videoMix außerhalb des optimalen Bereichs
            const distanceFromThreshold = Math.abs(audioToHueValue - cameraThreshold);
            const blendStrength = Math.max(0.0, 1.0 - ((distanceFromThreshold - thresholdRange) / thresholdRange));
            const videoMix = Math.max(0.0, Math.min(1.0, blendStrength));
            
            this.renderer.updateGlobalParameter('videoMix', videoMix);
            this.updateUI('video-mix-value', videoMix.toFixed(2));
            
            // Deaktiviere Kamera nur wenn sehr weit entfernt
            if (distanceFromThreshold > thresholdRange * 1.5) {
                Logger.system(`AudioToHue ${audioToHueValue.toFixed(2)} → Deaktiviere Kamera`);
                await this.videoManager.handleCameraChange('none');
                this.renderer.updateGlobalParameter('videoMix', 0.0);
                this.updateUI('video-mix-value', '0.00');
                // Update UI selector
                if (this.videoManager.cameraSelector) {
                    this.videoManager.cameraSelector.value = 'none';
                }
            }
        }
    }

    setupEditMode() {
        // Get brush cursor element
        this.brushCursor = document.getElementById('brush-cursor');

        // Setup perspective grid overlay
        this.perspGridCanvas = document.getElementById('persp-grid-overlay');
        if (this.perspGridCanvas) {
            this.perspGridCanvas.width = window.innerWidth;
            this.perspGridCanvas.height = window.innerHeight;
            this.perspGridCtx = this.perspGridCanvas.getContext('2d');
        }

        // Setup polygon preview SVG
        this.polygonPreview = document.getElementById('polygon-preview');

        // Setup tool selection buttons
        const brushToolBtn = document.getElementById('tool-brush');
        const polygonToolBtn = document.getElementById('tool-polygon');

        if (brushToolBtn) {
            brushToolBtn.addEventListener('click', () => this.setEditTool('brush'));
        }
        if (polygonToolBtn) {
            polygonToolBtn.addEventListener('click', () => this.setEditTool('polygon'));
        }

        // Setup polygon buttons
        const polygonCloseBtn = document.getElementById('polygon-close-btn');
        const polygonCancelBtn = document.getElementById('polygon-cancel-btn');

        if (polygonCloseBtn) {
            polygonCloseBtn.addEventListener('click', () => this.closePolygon());
        }
        if (polygonCancelBtn) {
            polygonCancelBtn.addEventListener('click', () => this.cancelPolygon());
        }

        // Setup brush size slider
        const brushSlider = document.getElementById('brush-size-slider');
        if (brushSlider) {
            brushSlider.addEventListener('input', (e) => {
                this.brushSize = parseInt(e.target.value);
                this.updateUI('brush-size-value', this.brushSize);
                this.updateBrushCursor();
            });
        }

        // Setup clear mask button
        const clearButton = document.getElementById('clear-mask-button');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                this.renderer.clearMask();
                this.maskDirty = false;
                this.renderer.setMaskActive(this.editMode);
                Logger.system('Mask cleared');
            });
        }

        // Setup invert mask button
        const invertButton = document.getElementById('invert-mask-button');
        if (invertButton) {
            invertButton.addEventListener('click', () => {
                this.renderer.saveToHistory();
                this.renderer.invertMask();
                Logger.system('Mask inverted');
            });
        }

        // Setup undo button
        const undoButton = document.getElementById('undo-mask-button');
        if (undoButton) {
            undoButton.addEventListener('click', () => {
                if (this.renderer.undoMask()) {
                    this.maskDirty = this.renderer.maskHistory.length > 0;
                }
            });
        }

        // Setup reset perspective button
        const resetPerspButton = document.getElementById('reset-persp-button');
        if (resetPerspButton) {
            resetPerspButton.addEventListener('click', () => {
                this.resetPerspective();
            });
        }

        // Setup mouse events for drawing
        const canvas = this.renderer.renderer.domElement;

        canvas.addEventListener('mousedown', (e) => {
            if (!this.editMode) return;
            // Don't draw if dragging a perspective handle
            if (this.activePerspHandle) return;

            // Handle based on current tool
            if (this.currentEditTool === 'polygon') {
                this.handlePolygonClick(e.clientX, e.clientY);
                return;
            }

            // Brush tool
            // Save state before starting to draw
            this.renderer.saveToHistory();
            this.isDrawing = true;
            this.drawAtPosition(e.clientX, e.clientY, e.shiftKey);
        });

        canvas.addEventListener('mousemove', (e) => {
            // Update brush cursor position
            if (this.brushCursor && this.editMode && this.currentEditTool === 'brush') {
                this.brushCursor.style.left = (e.clientX - this.brushSize / 2) + 'px';
                this.brushCursor.style.top = (e.clientY - this.brushSize / 2) + 'px';
            }

            // Update polygon preview line
            if (this.editMode && this.currentEditTool === 'polygon' && this.polygonPoints.length > 0) {
                this.updatePolygonPreview(e.clientX, e.clientY);
            }

            // Draw if mouse is down (brush tool only)
            if (!this.editMode || !this.isDrawing || this.currentEditTool !== 'brush') return;
            this.drawAtPosition(e.clientX, e.clientY, e.shiftKey);
        });

        canvas.addEventListener('mouseup', () => {
            this.isDrawing = false;
        });

        canvas.addEventListener('mouseleave', () => {
            this.isDrawing = false;
        });

        // Touch support
        canvas.addEventListener('touchstart', (e) => {
            if (!this.editMode) return;
            e.preventDefault();
            // Save state before starting to draw
            this.renderer.saveToHistory();
            this.isDrawing = true;
            const touch = e.touches[0];
            this.drawAtPosition(touch.clientX, touch.clientY, false);
        });

        canvas.addEventListener('touchmove', (e) => {
            if (!this.editMode || !this.isDrawing) return;
            e.preventDefault();
            const touch = e.touches[0];
            this.drawAtPosition(touch.clientX, touch.clientY, false);
        });

        canvas.addEventListener('touchend', () => {
            this.isDrawing = false;
        });

        // Setup perspective handles
        this.setupPerspectiveHandles();

        Logger.system('Edit mode initialized');
    }

    setupPerspectiveHandles() {
        const handleSize = 40;
        const corners = ['tl', 'tr', 'bl', 'br'];
        const positions = {
            tl: { left: '50px', top: '50px' },
            tr: { right: '50px', top: '50px' },
            bl: { left: '50px', bottom: '50px' },
            br: { right: '50px', bottom: '50px' }
        };

        corners.forEach(corner => {
            const handle = document.createElement('div');
            handle.id = `persp-handle-${corner}`;
            handle.className = 'persp-handle';
            handle.style.cssText = `
                position: fixed;
                width: ${handleSize}px;
                height: ${handleSize}px;
                border: 3px solid white;
                border-radius: 50%;
                background: transparent;
                cursor: move;
                z-index: 9998;
                display: none;
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
            `;

            // Position
            if (positions[corner].left) handle.style.left = positions[corner].left;
            if (positions[corner].right) handle.style.right = positions[corner].right;
            if (positions[corner].top) handle.style.top = positions[corner].top;
            if (positions[corner].bottom) handle.style.bottom = positions[corner].bottom;

            handle.dataset.corner = corner;

            // Drag events
            handle.addEventListener('mousedown', (e) => this.startPerspectiveDrag(e, corner, handle));

            document.body.appendChild(handle);
            this.perspectiveHandles.push(handle);
        });

        // Global mouse events for dragging
        document.addEventListener('mousemove', (e) => this.onPerspectiveDrag(e));
        document.addEventListener('mouseup', () => this.stopPerspectiveDrag());
    }

    startPerspectiveDrag(e, corner, handle) {
        if (!this.editMode) return;
        e.preventDefault();
        e.stopPropagation();
        this.activePerspHandle = { corner, handle };
        handle.style.borderColor = '#f80';

        // Show perspective grid
        this.showPerspectiveGrid(true);
    }

    onPerspectiveDrag(e) {
        if (!this.activePerspHandle || !this.editMode) return;

        const { corner, handle } = this.activePerspHandle;
        const handleSize = 40;

        // Update handle position
        const x = e.clientX - handleSize / 2;
        const y = e.clientY - handleSize / 2;

        handle.style.left = x + 'px';
        handle.style.top = y + 'px';
        handle.style.right = 'auto';
        handle.style.bottom = 'auto';

        // Update perspective corner (normalized 0-1)
        // Y is NOT flipped here - shader handles the flip
        const normX = e.clientX / window.innerWidth;
        const normY = e.clientY / window.innerHeight;

        this.perspectiveCorners[corner] = { x: normX, y: normY };
        this.perspectiveDirty = true;

        // Update shader uniforms
        this.updatePerspectiveUniforms();

        // Update grid while dragging
        if (this.showPerspGrid) {
            this.drawPerspectiveGrid();
        }
    }

    stopPerspectiveDrag() {
        if (this.activePerspHandle) {
            this.activePerspHandle.handle.style.borderColor = 'white';
            this.activePerspHandle = null;

            // Hide perspective grid
            this.showPerspectiveGrid(false);
        }
    }

    showPerspectiveGrid(show) {
        this.showPerspGrid = show;
        if (this.perspGridCanvas) {
            this.perspGridCanvas.style.display = show ? 'block' : 'none';
            if (show) {
                this.drawPerspectiveGrid();
            }
        }
    }

    drawPerspectiveGrid() {
        if (!this.perspGridCtx || !this.perspGridCanvas) return;

        const ctx = this.perspGridCtx;
        const w = this.perspGridCanvas.width;
        const h = this.perspGridCanvas.height;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Get corner positions in screen space (coords are already screen-based: 0,0 = top-left)
        const c = this.perspectiveCorners;
        const tl = { x: c.tl.x * w, y: c.tl.y * h };
        const tr = { x: c.tr.x * w, y: c.tr.y * h };
        const bl = { x: c.bl.x * w, y: c.bl.y * h };
        const br = { x: c.br.x * w, y: c.br.y * h };

        // Draw grid lines
        ctx.strokeStyle = 'rgba(255, 136, 0, 0.6)';
        ctx.lineWidth = 1;

        const gridLines = 8; // Number of grid divisions

        // Draw horizontal lines (interpolated between left and right edges)
        for (let i = 0; i <= gridLines; i++) {
            const t = i / gridLines;
            // Left edge point
            const leftX = tl.x + (bl.x - tl.x) * t;
            const leftY = tl.y + (bl.y - tl.y) * t;
            // Right edge point
            const rightX = tr.x + (br.x - tr.x) * t;
            const rightY = tr.y + (br.y - tr.y) * t;

            ctx.beginPath();
            ctx.moveTo(leftX, leftY);
            ctx.lineTo(rightX, rightY);
            ctx.stroke();
        }

        // Draw vertical lines (interpolated between top and bottom edges)
        for (let i = 0; i <= gridLines; i++) {
            const t = i / gridLines;
            // Top edge point
            const topX = tl.x + (tr.x - tl.x) * t;
            const topY = tl.y + (tr.y - tl.y) * t;
            // Bottom edge point
            const bottomX = bl.x + (br.x - bl.x) * t;
            const bottomY = bl.y + (br.y - bl.y) * t;

            ctx.beginPath();
            ctx.moveTo(topX, topY);
            ctx.lineTo(bottomX, bottomY);
            ctx.stroke();
        }

        // Draw outer border thicker
        ctx.strokeStyle = 'rgba(255, 136, 0, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tl.x, tl.y);
        ctx.lineTo(tr.x, tr.y);
        ctx.lineTo(br.x, br.y);
        ctx.lineTo(bl.x, bl.y);
        ctx.closePath();
        ctx.stroke();
    }

    // ============================================
    // Edit Tool Selection
    // ============================================
    setEditTool(tool) {
        this.currentEditTool = tool;

        // Update button styles
        const brushBtn = document.getElementById('tool-brush');
        const polygonBtn = document.getElementById('tool-polygon');
        const brushSettings = document.getElementById('brush-settings');
        const polygonSettings = document.getElementById('polygon-settings');

        if (brushBtn) brushBtn.classList.toggle('active', tool === 'brush');
        if (polygonBtn) polygonBtn.classList.toggle('active', tool === 'polygon');

        if (brushSettings) brushSettings.style.display = tool === 'brush' ? 'block' : 'none';
        if (polygonSettings) polygonSettings.style.display = tool === 'polygon' ? 'block' : 'none';

        // Update body class for cursor
        document.body.classList.toggle('polygon-mode', tool === 'polygon');

        // Clear polygon points when switching away
        if (tool !== 'polygon') {
            this.cancelPolygon();
        }

        Logger.system(`Edit tool: ${tool}`);
    }

    // ============================================
    // Polygon Tool Methods
    // ============================================
    handlePolygonClick(x, y) {
        // Check if clicking near first point to close polygon
        if (this.polygonPoints.length >= 3) {
            const first = this.polygonPoints[0];
            const dist = Math.sqrt((x - first.x) ** 2 + (y - first.y) ** 2);
            if (dist < 20) {
                this.closePolygon();
                return;
            }
        }

        // Add new point
        this.polygonPoints.push({ x, y });

        // Create visual point marker
        const pointEl = document.createElement('div');
        pointEl.className = 'polygon-point' + (this.polygonPoints.length === 1 ? ' first' : '');
        pointEl.style.left = x + 'px';
        pointEl.style.top = y + 'px';
        document.body.appendChild(pointEl);
        this.polygonPointElements.push(pointEl);

        // Update UI
        this.updateUI('polygon-points-count', this.polygonPoints.length);

        // Update preview
        this.updatePolygonPreview(x, y);

        Logger.system(`Polygon point added: ${this.polygonPoints.length}`);
    }

    updatePolygonPreview(mouseX, mouseY) {
        if (!this.polygonPreview || this.polygonPoints.length === 0) return;

        // Build SVG path
        let pathD = '';
        this.polygonPoints.forEach((p, i) => {
            pathD += (i === 0 ? 'M' : 'L') + p.x + ',' + p.y + ' ';
        });

        // Add line to mouse position
        pathD += 'L' + mouseX + ',' + mouseY;

        // Create/update path element
        this.polygonPreview.innerHTML = `
            <path d="${pathD}" fill="none" stroke="rgba(255,136,0,0.8)" stroke-width="2" stroke-dasharray="5,5"/>
            ${this.polygonPoints.length >= 3 ? `
                <line x1="${mouseX}" y1="${mouseY}" x2="${this.polygonPoints[0].x}" y2="${this.polygonPoints[0].y}"
                      stroke="rgba(0,255,0,0.5)" stroke-width="2" stroke-dasharray="3,3"/>
            ` : ''}
        `;
    }

    closePolygon() {
        if (this.polygonPoints.length < 3) {
            Logger.system('Need at least 3 points to close polygon');
            return;
        }

        // Save history before drawing
        this.renderer.saveToHistory();

        // Draw the polygon on mask (as black = erase/cut out)
        this.drawPolygonOnMask(this.polygonPoints, true);

        // Update mask state BEFORE cleaning up visuals
        this.maskDirty = true;
        this.renderer.setMaskActive(true);
        this.renderer.updateMaskTexture();

        // Clean up visuals
        this.clearPolygonVisuals();
        this.polygonPoints = [];

        this.updateUI('polygon-points-count', '0');
        Logger.system('Polygon closed and applied to mask');
    }

    cancelPolygon() {
        this.clearPolygonVisuals();
        this.polygonPoints = [];
        this.updateUI('polygon-points-count', '0');
        Logger.system('Polygon cancelled');
    }

    clearPolygonVisuals() {
        // Remove point markers
        this.polygonPointElements.forEach(el => el.remove());
        this.polygonPointElements = [];

        // Clear preview
        if (this.polygonPreview) {
            this.polygonPreview.innerHTML = '';
        }
    }

    drawPolygonOnMask(points, erase = true) {
        if (!this.renderer.maskCtx || points.length < 3) return;

        const ctx = this.renderer.maskCtx;
        const canvas = this.renderer.maskCanvas;

        // Convert screen coordinates to canvas coordinates
        // Flip Y to match shader UV sampling (same as drawOnMask)
        const canvasPoints = points.map(p => ({
            x: (p.x / window.innerWidth) * canvas.width,
            y: (1.0 - p.y / window.innerHeight) * canvas.height
        }));

        // Draw filled polygon
        ctx.beginPath();
        ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
        for (let i = 1; i < canvasPoints.length; i++) {
            ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = erase ? 'black' : 'white';
        ctx.fill();

        // Update texture
        if (this.renderer.maskTexture) {
            this.renderer.maskTexture.needsUpdate = true;
        }
    }

    updatePerspectiveHandles() {
        const show = this.editMode;
        this.perspectiveHandles.forEach(handle => {
            handle.style.display = show ? 'block' : 'none';
        });

        // Keep perspective active if it was modified
        if (this.perspectiveDirty) {
            this.renderer.setPerspectiveActive(true);
        }
    }

    updatePerspectiveUniforms() {
        if (!this.renderer.material) return;

        const c = this.perspectiveCorners;

        // Update shader uniforms
        this.renderer.material.uniforms.u_perspTL.value.set(c.tl.x, c.tl.y);
        this.renderer.material.uniforms.u_perspTR.value.set(c.tr.x, c.tr.y);
        this.renderer.material.uniforms.u_perspBL.value.set(c.bl.x, c.bl.y);
        this.renderer.material.uniforms.u_perspBR.value.set(c.br.x, c.br.y);

        // Store in globalUniforms for shader reload
        this.renderer.globalUniforms.u_perspTL = { x: c.tl.x, y: c.tl.y };
        this.renderer.globalUniforms.u_perspTR = { x: c.tr.x, y: c.tr.y };
        this.renderer.globalUniforms.u_perspBL = { x: c.bl.x, y: c.bl.y };
        this.renderer.globalUniforms.u_perspBR = { x: c.br.x, y: c.br.y };
        this.renderer.globalUniforms.u_perspActive = true;

        this.renderer.setPerspectiveActive(true);
    }

    resetPerspective() {
        // Screen coordinates: (0,0) = top-left, (1,1) = bottom-right
        this.perspectiveCorners = {
            tl: { x: 0.0, y: 0.0 },
            tr: { x: 1.0, y: 0.0 },
            bl: { x: 0.0, y: 1.0 },
            br: { x: 1.0, y: 1.0 }
        };
        this.perspectiveDirty = false;

        // Reset handle positions
        const positions = {
            tl: { left: '50px', top: '50px', right: 'auto', bottom: 'auto' },
            tr: { left: 'auto', top: '50px', right: '50px', bottom: 'auto' },
            bl: { left: '50px', top: 'auto', right: 'auto', bottom: '50px' },
            br: { left: 'auto', top: 'auto', right: '50px', bottom: '50px' }
        };

        this.perspectiveHandles.forEach(handle => {
            const corner = handle.dataset.corner;
            const pos = positions[corner];
            handle.style.left = pos.left;
            handle.style.top = pos.top;
            handle.style.right = pos.right;
            handle.style.bottom = pos.bottom;
        });

        // Reset globalUniforms (screen coords: 0,0 = top-left)
        this.renderer.globalUniforms.u_perspTL = { x: 0.0, y: 0.0 };
        this.renderer.globalUniforms.u_perspTR = { x: 1.0, y: 0.0 };
        this.renderer.globalUniforms.u_perspBL = { x: 0.0, y: 1.0 };
        this.renderer.globalUniforms.u_perspBR = { x: 1.0, y: 1.0 };
        this.renderer.globalUniforms.u_perspActive = false;

        // Reset shader uniforms
        if (this.renderer.material) {
            this.renderer.material.uniforms.u_perspTL.value.set(0.0, 0.0);
            this.renderer.material.uniforms.u_perspTR.value.set(1.0, 0.0);
            this.renderer.material.uniforms.u_perspBL.value.set(0.0, 1.0);
            this.renderer.material.uniforms.u_perspBR.value.set(1.0, 1.0);
        }

        this.renderer.setPerspectiveActive(false);
        Logger.system('Perspective reset');
    }

    drawAtPosition(x, y, restore) {
        // erase = true (black) to hide, restore = false (white) to show
        // Shift key = restore (paint white to show again)
        this.renderer.drawOnMask(x, y, this.brushSize, !restore);
        this.maskDirty = true;
        this.renderer.setMaskActive(true);
    }

    toggleEditMode() {
        this.editMode = !this.editMode;

        // Update MIDI controller edit mode state
        if (this.midiController) {
            this.midiController.setEditModeActive(this.editMode);
        }

        // Update UI
        document.body.classList.toggle('edit-mode', this.editMode);
        this.updateUI('edit-mode-value', this.editMode ? 'ON' : 'OFF');

        // Update brush cursor
        this.updateBrushCursor();

        // Show/hide perspective handles
        this.updatePerspectiveHandles();

        // Reset to brush tool and cancel any polygon when exiting edit mode
        if (!this.editMode) {
            this.setEditTool('brush');
            this.cancelPolygon();
            this.showPerspectiveGrid(false);
        }

        // Keep mask active if it has been drawn on
        // Only disable mask rendering if mask is clean
        if (!this.maskDirty) {
            this.renderer.setMaskActive(this.editMode);
        }
        // If mask is dirty, always keep it active

        if (this.oscController) this.oscController.sendEditState(this.editMode);

        Logger.system(`Edit mode: ${this.editMode ? 'ON' : 'OFF'}`);
    }

    updateBrushCursor() {
        if (!this.brushCursor) return;
        this.brushCursor.style.width = this.brushSize + 'px';
        this.brushCursor.style.height = this.brushSize + 'px';
    }

    setupKeyboardControls() {
        window.addEventListener('keydown', (e) => {
            switch(e.key.toLowerCase()) {
                case 'arrowright':
                case 'n':
                    this.handleShaderChange('next');
                    break;
                case 'arrowleft':
                case 'p':
                    this.handleShaderChange('prev');
                    break;
                case 'h':
                    this.toggleInfo();
                    break;
                case 'f':
                    this.toggleFullscreen();
                    break;
                case 'e':
                    this.toggleEditMode();
                    break;
                case 'c':
                    if (this.editMode) {
                        this.renderer.clearMask();
                        this.maskDirty = false;
                        this.renderer.setMaskActive(this.editMode);
                        Logger.system('Mask cleared');
                    }
                    break;
                case 'i':
                    if (this.editMode) {
                        this.renderer.saveToHistory();
                        this.renderer.invertMask();
                        Logger.system('Mask inverted');
                    }
                    break;
                case 'z':
                    if (this.editMode) {
                        if (this.renderer.undoMask()) {
                            this.maskDirty = this.renderer.maskHistory.length > 0;
                        }
                    }
                    break;
                case 'b':
                    // Switch to brush tool
                    if (this.editMode) {
                        this.setEditTool('brush');
                    }
                    break;
                case 'g':
                    // Switch to polygon tool
                    if (this.editMode) {
                        this.setEditTool('polygon');
                    }
                    break;
                case 'enter':
                    // Close polygon
                    if (this.editMode && this.currentEditTool === 'polygon') {
                        this.closePolygon();
                    }
                    break;
                case 'escape':
                    // Cancel polygon or exit edit mode
                    if (this.editMode && this.currentEditTool === 'polygon' && this.polygonPoints.length > 0) {
                        this.cancelPolygon();
                    } else if (this.editMode) {
                        this.toggleEditMode();
                    }
                    break;
            }
        });

        Logger.system('Keyboard: N/P=shader, H=info, F=fullscreen, E=edit, B=brush, G=polygon');
    }

    toggleInfo() {
        this.infoVisible = !this.infoVisible;
        const info = document.getElementById('info');
        if (info) {
            info.classList.toggle('hidden', !this.infoVisible);
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    updateUI(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.renderer.render();
        // Must run while this frame is still in the drawing buffer.
        if (this.ndiOutput) this.ndiOutput.capture();
    }
}

// ============================================
// Start the application
// ============================================
const app = new ShaderMIDIApp();
// Exposed for console debugging and automated checks.
window.__shaderApp = app;
app.init();
