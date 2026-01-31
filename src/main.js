import * as THREE from 'three';
import { WebMidi } from 'webmidi';
import { VideoInputManager } from './VideoInputManager.js';
import { AudioInputManager } from './AudioInputManager.js';

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

        // MIDI Mappings
        this.mappings = {
            // -------------- FADER CONTROLS --------------
            vibrance: { type: 'cc', value: 0 },            // CC0 - Vibrance
            hue: { type: 'cc', value: 1 },                // CC1 - Hue rotation
            saturation: { type: 'cc', value: 2 },         // CC2 - Saturation
            grayscale: { type: 'cc', value: 3 },            // CC3 - Grayscale
            contrast: { type: 'cc', value: 4 },            // CC4 - Contrast
            brightness: { type: 'cc', value: 5 },            // CC5 - Brightness
            zoom: { type: 'cc', value: 6 },               // CC6 - Zoom
            videoMix: { type: 'cc', value: 7 },           // CC7 - Video mix amount
            speed: { type: 'cc', value: 16 },             // CC16 - Speed
            audioIntensity: { type: 'cc', value: 17 },    // CC17 - Audio intensity

            // -------------- AUDIO MODULATION --------------
            audioToHue: { type: 'cc', value: 23 },        // CC23 - Audio modulates Hue
            audioToSaturation: { type: 'cc', value: 24 }, // CC24 - Audio modulates Saturation
            audioToBrightness: { type: 'cc', value: 25 }, // CC25 - Audio modulates Brightness
            audioToZoom: { type: 'cc', value: 26 },       // CC26 - Audio modulates Zoom

            // -------------- SHADER NAVIGATION --------------
            shaderPrev: { type: 'cc', value: 43 },         // CC43 - Previous shader
            shaderNext: { type: 'cc', value: 44 },         // CC44 - Next shader
            mirror: { type: 'cc', value: 48 },            // CC48 - Mirror toggle (threshold 0.5)

            // -------------- EDIT MODE --------------
            editMode: { type: 'cc', value: 60 },          // CC60 - Toggle edit mode
            brushSize: { type: 'cc', value: 61 },         // CC61 - Brush size
        };
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
        if (cc === this.mappings.hue.value) {
            // Map 0-1 to 0-360 degrees
            const hue = value * 360;
            this.onParameterChange('hue', hue);
            this.updateUI('hue-value', hue.toFixed(1));
        } else if (cc === this.mappings.saturation.value) {
            this.onParameterChange('saturation', value);
            this.updateUI('sat-value', value.toFixed(2));
        } else if (cc === this.mappings.grayscale.value) {
            this.onParameterChange('grayscale', value);
            this.updateUI('gray-value', value.toFixed(2));
        } else if (cc === this.mappings.contrast.value) {
            // Map 0-1 to 0-2 for contrast range
            const contrast = value * 2.0;
            this.onParameterChange('contrast', contrast);
            this.updateUI('contrast-value', contrast.toFixed(2));
        } else if (cc === this.mappings.brightness.value) {
            // Map 0-1 to 0-2 for brightness range
            const brightness = value * 2.0;
            this.onParameterChange('brightness', brightness);
            this.updateUI('bright-value', brightness.toFixed(2));
        } else if (cc === this.mappings.vibrance.value) {
            this.onParameterChange('vibrance', value);
            this.updateUI('vib-value', value.toFixed(2));
        } else if (cc === this.mappings.shaderNext.value) {
            if (value > 0.5) {  // Trigger on values above threshold
                this.onShaderChange('next');
            }
        } else if (cc === this.mappings.shaderPrev.value) {
            if (value > 0.5) {  // Trigger on values above threshold
                this.onShaderChange('prev');
            }
        } else if (cc === this.mappings.zoom.value) {
            // Map 0-1 to 0.1-5.0 zoom range
            const zoom = 0.1 + value * 4.9;
            this.onParameterChange('zoom', zoom);
            this.updateUI('zoom-value', zoom.toFixed(2));
        } else if (cc === this.mappings.speed.value) {
            // Map 0-1 to 0-4 speed multiplier
            const speed = value * 4.0;
            this.onParameterChange('speed', speed);
            this.updateUI('speed-value', speed.toFixed(2));
        } else if (cc === this.mappings.mirror.value) {
            // Toggle mirror at 0.5 threshold
            const mirror = value > 0.5 ? 1.0 : 0.0;
            this.onParameterChange('mirror', mirror);
            this.updateUI('mirror-value', mirror > 0.5 ? 'ON' : 'OFF');
        } else if (cc === this.mappings.videoMix.value) {
            this.onParameterChange('videoMix', value);
            this.updateUI('video-mix-value', value.toFixed(2));
        } else if (cc === this.mappings.audioIntensity.value) {
            this.onParameterChange('audioIntensity', value);
            this.updateUI('audio-intensity-value', value.toFixed(2));
        } else if (cc === this.mappings.audioToHue.value) {
            this.onParameterChange('audioToHue', value);
        } else if (cc === this.mappings.audioToSaturation.value) {
            this.onParameterChange('audioToSaturation', value);
        } else if (cc === this.mappings.audioToBrightness.value) {
            this.onParameterChange('audioToBrightness', value);
        } else if (cc === this.mappings.audioToZoom.value) {
            this.onParameterChange('audioToZoom', value);
        } else if (cc === this.mappings.editMode.value) {
            // Toggle edit mode at 0.5 threshold
            if (value > 0.5) {
                this.onParameterChange('editModeToggle', true);
            }
        } else if (cc === this.mappings.brushSize.value) {
            // Map 0-1 to 5-200 brush size
            const brushSize = Math.round(5 + value * 195);
            this.onParameterChange('brushSize', brushSize);
            this.updateUI('brush-size-value', brushSize);
            const slider = document.getElementById('brush-size-slider');
            if (slider) slider.value = brushSize;
        }
    }

    updateUI(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
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
            u_audioToZoom: 0.0
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

            ${fragmentShader}

            void main() {
                vec2 fragCoord = gl_FragCoord.xy;

                // Calculate audio modulation (bass is most impactful)
                float audioMod = u_audioBass;

                // Apply zoom with audio modulation
                float dynamicZoom = u_zoom + (audioMod * u_audioToZoom * 2.0);
                vec2 center = iResolution.xy * 0.5;
                fragCoord = (fragCoord - center) / dynamicZoom + center;

                // Apply mirror effect (horizontal flip at center)
                if (u_mirror > 0.5) {
                    if (fragCoord.x > center.x) {
                        fragCoord.x = center.x - (fragCoord.x - center.x);
                    }
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
        this.videoManager = null;
        this.audioManager = null;
        this.infoVisible = true;

        // Edit mode state
        this.editMode = false;
        this.brushSize = 50;
        this.isDrawing = false;
        this.brushCursor = null;
        this.maskDirty = false; // Track if mask has been drawn on
    }

    async init() {
        Logger.system('Initializing Shader MIDI Player...');

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
        if (action === 'next') {
            this.shaderManager.nextShader();
        } else if (action === 'prev') {
            this.shaderManager.previousShader();
        } else if (action === 'index') {
            // Map MIDI note to shader index
            const maxShaders = this.shaderManager.shaders.length;
            const shaderIndex = Math.floor((data / 127) * maxShaders);
            this.shaderManager.setShaderByIndex(shaderIndex);
        }
        this.loadCurrentShader();
    }

    handleParameterChange(param, value) {
        // Handle edit mode toggle specially
        if (param === 'editModeToggle') {
            this.toggleEditMode();
            return;
        }

        // Handle brush size specially
        if (param === 'brushSize') {
            this.brushSize = value;
            this.updateBrushCursor();
            return;
        }

        this.renderer.updateGlobalParameter(param, value);
        Logger.system(`Parameter ${param} = ${typeof value === 'number' ? value.toFixed(2) : value}`);

        // Automatische Kamera-Aktivierung basierend auf audioToHue
        if (param === 'audioToHue') {
            this.handleAudioToHueChange(value);
        }
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

        // Setup mouse events for drawing
        const canvas = this.renderer.renderer.domElement;

        canvas.addEventListener('mousedown', (e) => {
            if (!this.editMode) return;
            // Save state before starting to draw
            this.renderer.saveToHistory();
            this.isDrawing = true;
            this.drawAtPosition(e.clientX, e.clientY, e.shiftKey);
        });

        canvas.addEventListener('mousemove', (e) => {
            // Update brush cursor position
            if (this.brushCursor && this.editMode) {
                this.brushCursor.style.left = (e.clientX - this.brushSize / 2) + 'px';
                this.brushCursor.style.top = (e.clientY - this.brushSize / 2) + 'px';
            }

            // Draw if mouse is down
            if (!this.editMode || !this.isDrawing) return;
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

        Logger.system('Edit mode initialized');
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

        // Update UI
        document.body.classList.toggle('edit-mode', this.editMode);
        this.updateUI('edit-mode-value', this.editMode ? 'ON' : 'OFF');

        // Update brush cursor
        this.updateBrushCursor();

        // Keep mask active if it has been drawn on
        // Only disable mask rendering if mask is clean
        if (!this.maskDirty) {
            this.renderer.setMaskActive(this.editMode);
        }
        // If mask is dirty, always keep it active

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
            }
        });

        Logger.system('Keyboard controls: Arrow keys/N/P = change shader, H = toggle info, F = fullscreen, E = edit mode');
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
    }
}

// ============================================
// Start the application
// ============================================
const app = new ShaderMIDIApp();
app.init();
