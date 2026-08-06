// ============================================
// OSC Controller
// ============================================
// Browsers cannot open UDP sockets, so OSC arrives via the local bridge
// (see bridge/server.js) over a WebSocket. This class speaks the bridge
// protocol, maps OSC addresses onto the shared parameter registry, and
// mirrors state changes back out so controller surfaces stay in sync.

import { PARAMS, resolveParamAddress, oscAddress, fromNorm, toNorm, normaliseValue, canonicalKey } from './params.js';

const RECONNECT_DELAY_MS = 2000;

export class OSCController {
    /**
     * @param {object} handlers
     * @param {(action: string, data?: any) => void} handlers.onShaderChange
     * @param {(param: string, value: number) => void} handlers.onParameterChange
     * @param {(action: string, data?: any) => void} handlers.onCommand
     */
    constructor(handlers, options = {}) {
        this.onShaderChange = handlers.onShaderChange;
        this.onParameterChange = handlers.onParameterChange;
        this.onCommand = handlers.onCommand;

        this.url = options.url || defaultBridgeUrl();
        this.socket = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.shouldReconnect = true;
        this.statusElement = null;
        this.lastEventElement = null;
        this.log = options.log || (() => {});

        // Bridge status as last reported (OSC ports, NDI state).
        this.bridgeStatus = null;
        this.onBridgeStatus = options.onBridgeStatus || (() => {});

        // Feedback is suppressed while applying an inbound message so a
        // controller does not receive an echo of its own move.
        this.suppressFeedback = false;
    }

    init() {
        this.statusElement = document.getElementById('osc-status');
        this.lastEventElement = document.getElementById('last-osc-event');
        this.connect();
    }

    connect() {
        if (this.socket) return;

        this.setStatus('connecting...');
        let socket;
        try {
            socket = new WebSocket(this.url);
        } catch (error) {
            this.log(`Bridge connection failed: ${error.message}`);
            this.scheduleReconnect();
            return;
        }

        socket.binaryType = 'arraybuffer';
        this.socket = socket;

        socket.addEventListener('open', () => {
            this.connected = true;
            this.log(`Bridge connected: ${this.url}`);
            this.setStatus('connected');
            this.send({ type: 'hello', role: 'app' });
        });

        socket.addEventListener('message', (event) => {
            if (typeof event.data !== 'string') return;
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            this.handleBridgeMessage(msg);
        });

        socket.addEventListener('close', () => {
            const wasConnected = this.connected;
            this.connected = false;
            this.socket = null;
            if (wasConnected) this.log('Bridge disconnected');
            this.setStatus('offline');
            this.scheduleReconnect();
        });

        socket.addEventListener('error', () => {
            // 'close' always follows; reconnect is handled there.
            socket.close();
        });
    }

    scheduleReconnect() {
        if (!this.shouldReconnect || this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, RECONNECT_DELAY_MS);
    }

    send(message) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }

    /** Raw binary passthrough, used by the NDI output for video frames. */
    sendBinary(buffer) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(buffer);
            return true;
        }
        return false;
    }

    get bufferedAmount() {
        return this.socket ? this.socket.bufferedAmount : 0;
    }

    handleBridgeMessage(msg) {
        if (msg.type === 'osc') {
            this.handleOSC(msg.address, msg.args || []);
        } else if (msg.type === 'status') {
            this.bridgeStatus = msg;
            this.onBridgeStatus(msg);
            this.setStatus(describeStatus(msg));
        } else if (msg.type === 'error') {
            this.log(`Bridge error: ${msg.message}`);
        }
    }

    // ============================================
    // OSC dispatch
    // ============================================

    handleOSC(address, args) {
        const first = args.length > 0 ? args[0] : undefined;
        this.showLastEvent(`${address} ${args.map(formatArg).join(' ')}`.trim());

        this.suppressFeedback = true;
        try {
            if (!this.dispatch(address, args, first)) {
                this.log(`Unhandled OSC address: ${address}`);
            }
        } finally {
            this.suppressFeedback = false;
        }
    }

    dispatch(address, args, first) {
        const segments = address.split('/').filter(Boolean);
        const head = segments.length > 0 ? canonicalKey(segments[0]) : '';

        // ---- parameters: /param/<name>, /<name>, /<name>/norm ----
        const resolved = resolveParamAddress(address);
        if (resolved) {
            const raw = toNumber(first);
            if (raw === null) return true;   // address known, payload unusable
            const value = resolved.normalised
                ? fromNorm(resolved.param, raw)
                : normaliseValue(resolved.param, raw);
            this.onParameterChange(resolved.param.name, value);
            return true;
        }

        // ---- shader navigation ----
        if (head === 'shader') {
            return this.dispatchShader(segments.slice(1), args, first);
        }

        // ---- mask / edit tooling ----
        if (head === 'mask' || head === 'edit') {
            return this.dispatchEdit(head, segments.slice(1), args, first);
        }

        // ---- perspective corner pinning ----
        if (head === 'persp' || head === 'perspective') {
            return this.dispatchPerspective(segments.slice(1), args);
        }

        // ---- NDI output control ----
        if (head === 'ndi') {
            return this.dispatchNDI(segments.slice(1), args, first);
        }

        // ---- misc top-level commands ----
        switch (head) {
            case 'sync':
            case 'refresh':
                this.sendFullState();
                return true;
            case 'fullscreen':
                if (isBang(first)) this.onCommand('toggleFullscreen');
                return true;
            case 'info':
                if (isBang(first)) this.onCommand('toggleInfo');
                return true;
            default:
                return false;
        }
    }

    dispatchShader(rest, args, first) {
        const action = rest.length > 0 ? canonicalKey(rest[0]) : '';
        switch (action) {
            case 'next':
                if (isBang(first)) this.onShaderChange('next');
                return true;
            case 'prev':
            case 'previous':
                if (isBang(first)) this.onShaderChange('prev');
                return true;
            case 'index': {
                const raw = toNumber(first);
                if (raw === null) return true;
                // Integers select directly; a 0..1 float scans the whole set.
                if (Number.isInteger(raw) && raw > 1) {
                    this.onShaderChange('absoluteIndex', raw);
                } else if (raw > 0 && raw < 1) {
                    this.onShaderChange('fraction', raw);
                } else {
                    this.onShaderChange('absoluteIndex', Math.round(raw));
                }
                return true;
            }
            case 'fraction': {
                const raw = toNumber(first);
                if (raw !== null) this.onShaderChange('fraction', raw);
                return true;
            }
            case 'name': {
                if (typeof first === 'string') this.onShaderChange('name', first);
                return true;
            }
            case 'list':
                this.onCommand('listShaders');
                return true;
            default:
                return false;
        }
    }

    dispatchEdit(head, rest, args, first) {
        const action = rest.length > 0 ? canonicalKey(rest[0]) : '';

        if (head === 'edit') {
            switch (action) {
                case 'mode':
                case 'toggle': {
                    const raw = toNumber(first);
                    if (action === 'toggle' || raw === null) {
                        if (isBang(first)) this.onCommand('toggleEditMode');
                    } else {
                        this.onCommand('setEditMode', raw > 0.5);
                    }
                    return true;
                }
                case 'tool':
                    if (typeof first === 'string') this.onCommand('setEditTool', first);
                    return true;
                case 'brush':
                    this.onCommand('setEditTool', 'brush');
                    return true;
                case 'polygon':
                    this.onCommand('setEditTool', 'polygon');
                    return true;
                default:
                    return false;
            }
        }

        // head === 'mask'
        switch (action) {
            case 'clear':
                if (isBang(first)) this.onCommand('clearMask');
                return true;
            case 'undo':
                if (isBang(first)) this.onCommand('undoMask');
                return true;
            case 'invert':
                if (isBang(first)) this.onCommand('invertMask');
                return true;
            default:
                return false;
        }
    }

    dispatchPerspective(rest, args) {
        const action = rest.length > 0 ? canonicalKey(rest[0]) : '';
        if (action === 'reset') {
            this.onCommand('resetPerspective');
            return true;
        }
        if (['tl', 'tr', 'bl', 'br'].includes(action)) {
            const x = toNumber(args[0]);
            const y = toNumber(args[1]);
            if (x !== null && y !== null) {
                this.onCommand('setPerspectiveCorner', { corner: action, x, y });
            }
            return true;
        }
        return false;
    }

    dispatchNDI(rest, args, first) {
        const action = rest.length > 0 ? canonicalKey(rest[0]) : '';
        switch (action) {
            case 'enable':
            case 'enabled': {
                const raw = toNumber(first);
                this.onCommand('setNDIEnabled', raw === null ? true : raw > 0.5);
                return true;
            }
            case 'disable':
                this.onCommand('setNDIEnabled', false);
                return true;
            case 'fps': {
                const raw = toNumber(first);
                if (raw !== null) this.onCommand('setNDIFps', raw);
                return true;
            }
            case 'resolution': {
                const w = toNumber(args[0]);
                const h = toNumber(args[1]);
                if (w !== null && h !== null) this.onCommand('setNDIResolution', { width: w, height: h });
                return true;
            }
            default:
                return false;
        }
    }

    // ============================================
    // Outbound feedback
    // ============================================

    /** Mirror a parameter change back to connected OSC clients. */
    sendParameter(param, value) {
        if (this.suppressFeedback || !this.connected) return;
        this.emit(oscAddress(param), [{ type: 'f', value }]);
        this.emit(`${oscAddress(param)}/norm`, [{ type: 'f', value: toNorm(param, value) }]);
    }

    sendShaderState(name, index, total) {
        if (!this.connected) return;
        this.emit('/shader/name', [{ type: 's', value: name }]);
        this.emit('/shader/index', [{ type: 'i', value: index }]);
        this.emit('/shader/count', [{ type: 'i', value: total }]);
    }

    sendEditState(active) {
        if (!this.connected) return;
        this.emit('/edit/mode', [{ type: 'f', value: active ? 1 : 0 }]);
    }

    /**
     * Push the complete current state, e.g. after a controller sends /sync.
     * Echo suppression must be lifted here: /sync arrives as an inbound
     * message, and the whole point is to reply to the sender.
     */
    sendFullState() {
        const previous = this.suppressFeedback;
        this.suppressFeedback = false;
        try {
            this.onCommand('requestFullState');
        } finally {
            this.suppressFeedback = previous;
        }
    }

    emit(address, args) {
        this.send({ type: 'osc-out', address, args });
    }

    // ============================================
    // UI
    // ============================================

    setStatus(text) {
        if (this.statusElement) this.statusElement.textContent = text;
    }

    showLastEvent(text) {
        if (this.lastEventElement) this.lastEventElement.textContent = `OSC: ${text}`;
    }
}

// ============================================
// Helpers
// ============================================

function defaultBridgeUrl() {
    const override = new URLSearchParams(window.location.search).get('bridge');
    if (override) return override;
    // The bridge always runs on the artist's own machine, even when the app
    // itself is served from a remote host.
    return 'ws://127.0.0.1:9002';
}

function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/**
 * True when an argument should fire a momentary action. Bare OSC bangs carry
 * no arguments at all; buttons typically send 1 on press and 0 on release, and
 * a release must not re-trigger.
 */
function isBang(value) {
    if (value === undefined || value === null) return true;
    const num = toNumber(value);
    return num === null ? true : num > 0.5;
}

function formatArg(value) {
    return typeof value === 'number' ? value.toFixed(3).replace(/\.?0+$/, '') : String(value);
}

function describeStatus(status) {
    const parts = [];
    if (status.osc) parts.push(`OSC in :${status.osc.inPort}`);
    if (status.osc && status.osc.outHost) parts.push(`out ${status.osc.outHost}:${status.osc.outPort}`);
    if (status.ndi) parts.push(status.ndi.available ? `NDI "${status.ndi.name}"` : 'NDI n/a');
    return parts.length ? parts.join(' | ') : 'connected';
}

export { PARAMS };
