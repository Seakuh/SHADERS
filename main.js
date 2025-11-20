import * as THREE from 'three';
import { WebMidi } from 'webmidi';

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
            // Get all .glsl files in the directory
            const glslFiles = import.meta.glob('./*.glsl', { as: 'raw' });
            this.shaders = Object.keys(glslFiles).map(path => path.replace('./', ''));

            Logger.shader('Found shaders:', this.shaders);

            // Preload all shaders
            for (const [path, loader] of Object.entries(glslFiles)) {
                const name = path.replace('./', '');
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
            hue: { type: 'cc', value: 1 },                // CC1 - Hue rotation
            saturation: { type: 'cc', value: 2 },         // CC2 - Saturation
            shaderPrev: { type: 'cc', value: 43 },         // CC3 - Previous shader
            shaderNext: { type: 'cc', value: 44 },         // CC4 - Next shader
            zoom: { type: 'cc', value: 5 },               // CC5 - Zoom
            speed: { type: 'cc', value: 16 },             // CC16 - Speed
            mirror: { type: 'cc', value: 48 },            // CC60 - Mirror toggle (threshold 0.5)
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
            u_hue: 0.0,
            u_saturation: 1.0,
            u_zoom: 1.0,
            u_speed: 1.0,
            u_mirror: 0.0
        };

        // Current shader material
        this.material = null;
        this.mesh = null;

        // Time tracking for speed control
        this.baseTime = 0;

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
    }

    createShaderMaterial(fragmentShader) {
        // Wrap the user's fragment shader with our post-processing
        const wrappedFragmentShader = `
            uniform float iTime;
            uniform vec2 iResolution;
            uniform float iTimeDelta;
            uniform int iFrame;

            // Global controls
            uniform float u_hue;
            uniform float u_saturation;
            uniform float u_zoom;
            uniform float u_speed;
            uniform float u_mirror;

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

                // Apply zoom (scale from center)
                vec2 center = iResolution.xy * 0.5;
                fragCoord = (fragCoord - center) / u_zoom + center;

                // Apply mirror effect (horizontal flip at center)
                if (u_mirror > 0.5) {
                    if (fragCoord.x > center.x) {
                        fragCoord.x = center.x - (fragCoord.x - center.x);
                    }
                }

                vec4 color = vec4(0.0);

                // Call the user's mainImage function with modified coordinates
                mainImage(color, fragCoord);

                // Apply global color transformations
                vec3 hsl = rgb2hsl(color.rgb);

                // Apply hue rotation
                hsl.x = mod(hsl.x + u_hue / 360.0, 1.0);

                // Apply saturation adjustment
                hsl.y *= u_saturation;

                vec3 finalColor = hsl2rgb(hsl);

                gl_FragColor = vec4(finalColor, color.a);
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
                u_hue: { value: this.globalUniforms.u_hue },
                u_saturation: { value: this.globalUniforms.u_saturation },
                u_zoom: { value: this.globalUniforms.u_zoom },
                u_speed: { value: this.globalUniforms.u_speed },
                u_mirror: { value: this.globalUniforms.u_mirror }
            }
        });
    }

    loadShader(shaderContent) {
        try {
            // Remove old mesh
            if (this.mesh) {
                this.scene.remove(this.mesh);
                if (this.material) this.material.dispose();
            }

            // Create new material with shader
            this.material = this.createShaderMaterial(shaderContent);

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

    render() {
        if (!this.material) return;

        const deltaTime = this.clock.getDelta();
        const speed = this.globalUniforms.u_speed;

        // Update time with speed multiplier
        this.baseTime += deltaTime * speed;

        this.material.uniforms.iTime.value = this.baseTime;
        this.material.uniforms.iTimeDelta.value = deltaTime * speed;
        this.material.uniforms.iFrame.value++;

        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.renderer.setSize(width, height);

        if (this.material && this.material.uniforms.iResolution) {
            this.material.uniforms.iResolution.value.set(width, height);
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
        this.infoVisible = true;
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

        // Setup keyboard controls
        this.setupKeyboardControls();

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
        this.renderer.updateGlobalParameter(param, value);
        Logger.system(`Parameter ${param} = ${value.toFixed(2)}`);
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
            }
        });

        Logger.system('Keyboard controls: Arrow keys/N/P = change shader, H = toggle info, F = fullscreen');
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
