import QRCode from 'qrcode';
import { WS_PATH, PARAMS, PARAM_BY_NAME } from './remote/protocol.js';

// ============================================
// Remote Control Manager
// ============================================
// Connects the player to the WebSocket relay so phones can control
// shader parameters. Acts like a second MIDIController: incoming
// messages are translated into the same handleShaderChange /
// handleParameterChange calls, and the full state is broadcast back
// so all connected phones stay in sync (including changes made via
// MIDI or keyboard).
export class RemoteControlManager {
    constructor(app) {
        this.app = app;
        this.ws = null;
        this.connected = false;
        this.broadcastTimer = null;

        // Normalized (0-1) parameter state, mirrors what the phones display
        this.normState = {};
        for (const p of PARAMS) {
            this.normState[p.name] = p.defaultNorm;
        }
    }

    init() {
        this.connect();
        this.setupPairingInfo();
    }

    connect() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        try {
            this.ws = new WebSocket(`${proto}://${location.host}${WS_PATH}`);
        } catch (error) {
            console.log('[REMOTE] WebSocket unavailable:', error);
            return;
        }

        this.ws.addEventListener('open', () => {
            this.connected = true;
            console.log('[REMOTE] Connected to relay');
            this.scheduleBroadcast();
        });

        this.ws.addEventListener('message', (event) => {
            try {
                this.handleMessage(JSON.parse(event.data));
            } catch (error) {
                console.log('[REMOTE] Invalid message:', error);
            }
        });

        this.ws.addEventListener('close', () => {
            this.connected = false;
            // Relay may not exist (e.g. static hosting) - keep retrying quietly
            setTimeout(() => this.connect(), 3000);
        });

        this.ws.addEventListener('error', () => {
            this.ws.close();
        });
    }

    handleMessage(msg) {
        if (msg.type === 'param') {
            const def = PARAM_BY_NAME.get(msg.name);
            if (!def) return;
            const norm = Math.min(1, Math.max(0, Number(msg.value) || 0));
            this.app.handleParameterChange(def.name, def.toScaled(norm));
        } else if (msg.type === 'shader') {
            this.app.handleShaderChange(msg.action, msg.index);
        } else if (msg.type === 'editMode') {
            this.app.handleParameterChange('editModeToggle', true);
        } else if (msg.type === 'requestState') {
            this.scheduleBroadcast();
        }
    }

    // Called from the app whenever a parameter changes, regardless of
    // source (remote, MIDI, keyboard), so phones always reflect reality.
    onLocalParamChange(param, scaledValue) {
        const def = PARAM_BY_NAME.get(param);
        if (!def) return;

        this.normState[param] = def.toNorm(scaledValue);

        // Keep the desktop info overlay in sync (MIDI does this itself,
        // but remote-originated changes need it here)
        if (def.uiId) {
            const element = document.getElementById(def.uiId);
            if (element) element.textContent = def.fmt(scaledValue);
        }

        this.scheduleBroadcast();
    }

    // Debounced full-state broadcast (sliders fire fast)
    scheduleBroadcast() {
        if (this.broadcastTimer) return;
        this.broadcastTimer = setTimeout(() => {
            this.broadcastTimer = null;
            this.broadcastState();
        }, 50);
    }

    broadcastState() {
        if (!this.connected || this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.send(JSON.stringify({
            type: 'state',
            shaders: this.app.shaderManager.shaders,
            currentIndex: this.app.shaderManager.currentIndex,
            params: this.normState,
            editMode: this.app.editMode
        }));
    }

    // Fetch the LAN URL from the server and render a QR code in the
    // info overlay. Fails silently on static hosting (no /remote-info).
    async setupPairingInfo() {
        try {
            const response = await fetch('/remote-info');
            if (!response.ok) return;
            const info = await response.json();
            if (!info.url) return;

            const section = document.getElementById('remote-section');
            const urlElement = document.getElementById('remote-url');
            const canvas = document.getElementById('remote-qr');

            if (urlElement) urlElement.textContent = info.url;
            if (canvas) {
                await QRCode.toCanvas(canvas, info.url, { width: 140, margin: 1 });
            }
            if (section) section.style.display = 'block';

            console.log('[REMOTE] Control page:', info.url);
        } catch (error) {
            // No relay server available - remote control disabled
        }
    }
}
