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
        this.connected = false;

        // MIDI Mappings
        this.mappings = {
            shaderNext: { type: 'note', value: 60 },      // C4 - Next shader
            shaderPrev: { type: 'note', value: 59 },      // B3 - Previous shader
            hue: { type: 'cc', value: 1 },                // CC1 - Hue rotation
            saturation: { type: 'cc', value: 2 },         // CC2 - Saturation
            lightness: { type: 'cc', value: 3 },          // CC3 - Lightness
            monochrome: { type: 'cc', value: 4 },         // CC4 - Monochrome amount
        };
    }

    async init() {
        try {
            await WebMidi.enable();
            Logger.midi('WebMIDI enabled successfully');

            WebMidi.inputs.forEach((input, index) => {
                Logger.midi(`Input ${index}: ${input.name}`);
            });

            if (WebMidi.inputs.length > 0) {
                const input = WebMidi.inputs[0];
                this.connectToInput(input);
            } else {
                Logger.midi('No MIDI inputs found. Waiting for device...');
            }

            // Listen for new devices
            WebMidi.addListener('connected', (e) => {
                Logger.midi('Device connected:', e.port.name);
                if (e.port.type === 'input' && !this.connected) {
                    this.connectToInput(e.port);
                }
            });

            WebMidi.addListener('disconnected', (e) => {
                Logger.midi('Device disconnected:', e.port.name);
                this.connected = false;
                this.updateUI('midi-device', 'Not connected');
            });

        } catch (error) {
            Logger.midi('Error initializing MIDI:', error);
        }
    }

    connectToInput(input) {
        Logger.midi(`Connecting to: ${input.name}`);
        this.connected = true;
        this.updateUI('midi-device', input.name);

        // Listen to all note on messages
        input.addListener('noteon', (e) => {
            Logger.midi(`Note ON: ${e.note.name}${e.note.octave} (${e.note.number}) - Velocity: ${e.velocity}`);
            this.handleNoteOn(e.note.number);
        });

        // Listen to all note off messages
        input.addListener('noteoff', (e) => {
            Logger.midi(`Note OFF: ${e.note.name}${e.note.octave} (${e.note.number})`);
        });

        // Listen to control change messages
        input.addListener('controlchange', (e) => {
            Logger.midi(`CC: ${e.controller.number} = ${e.value} (raw: ${e.rawValue})`);
            this.handleCC(e.controller.number, e.value);
        });

        // Listen to pitch bend
        input.addListener('pitchbend', (e) => {
            Logger.midi(`Pitch Bend: ${e.value}`);
        });
    }

    handleNoteOn(note) {
        if (note === this.mappings.shaderNext.value) {
            this.onShaderChange('next');
        } else if (note === this.mappings.shaderPrev.value) {
            this.onShaderChange('prev');
        } else {
            // Map other notes to shader selection (0-127 MIDI notes to shader indices)
            this.onShaderChange('index', note);
        }
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
        } else if (cc === this.mappings.lightness.value) {
            this.onParameterChange('lightness', value);
            this.updateUI('light-value', value.toFixed(2));
        } else if (cc === this.mappings.monochrome.value) {
            this.onParameterChange('monochrome', value);
            this.updateUI('mono-value', value.toFixed(2));
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
            u_lightness: 1.0,
            u_monochrome: 0.0
        };

        // Current shader material
        this.material = null;
        this.mesh = null;

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

            // Global color controls
            uniform float u_hue;
            uniform float u_saturation;
            uniform float u_lightness;
            uniform float u_monochrome;

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
                vec4 color = vec4(0.0);

                // Call the user's mainImage function
                mainImage(color, gl_FragCoord.xy);

                // Apply global color transformations
                vec3 hsl = rgb2hsl(color.rgb);

                // Apply hue rotation
                hsl.x = mod(hsl.x + u_hue / 360.0, 1.0);

                // Apply saturation adjustment
                hsl.y *= u_saturation;

                // Apply lightness adjustment
                hsl.z *= u_lightness;

                vec3 finalColor = hsl2rgb(hsl);

                // Apply monochrome effect
                float gray = dot(finalColor, vec3(0.299, 0.587, 0.114));
                finalColor = mix(finalColor, vec3(gray), u_monochrome);

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
                u_lightness: { value: this.globalUniforms.u_lightness },
                u_monochrome: { value: this.globalUniforms.u_monochrome }
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

        const elapsedTime = this.clock.getElapsedTime();
        const deltaTime = this.clock.getDelta();

        this.material.uniforms.iTime.value = elapsedTime;
        this.material.uniforms.iTimeDelta.value = deltaTime;
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
