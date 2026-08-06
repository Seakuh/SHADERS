#!/usr/bin/env node
// ============================================
// Shadertool Bridge
// ============================================
// The browser cannot open UDP sockets and cannot talk to the NDI SDK, so
// this small companion process does both and speaks to the app over a
// local WebSocket:
//
//   OSC controller --UDP--> bridge --WS(json)----> browser
//   OSC controller <--UDP-- bridge <--WS(json)---- browser   (feedback)
//                           bridge <--WS(binary)-- browser   (RGBA frames)
//                             |
//                             +--NDI--> Resolume / OBS / vMix / ...
//
// Run with:  npm start   (from this directory)

import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import osc from 'osc';
import { WebSocketServer } from 'ws';

// ============================================
// Configuration
// ============================================

const { values: flags } = parseArgs({
    options: {
        'osc-in-port':  { type: 'string', default: process.env.OSC_IN_PORT  ?? '9000' },
        'osc-out-port': { type: 'string', default: process.env.OSC_OUT_PORT ?? '9001' },
        'osc-out-host': { type: 'string', default: process.env.OSC_OUT_HOST ?? '' },
        'ws-port':      { type: 'string', default: process.env.WS_PORT      ?? '9002' },
        'ndi-name':     { type: 'string', default: process.env.NDI_NAME     ?? 'Shadertool' },
        'no-ndi':       { type: 'boolean', default: false },
        help:           { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
});

if (flags.help) {
    console.log(`
Shadertool Bridge — OSC input + NDI output for the Shader MIDI Player

  --osc-in-port <n>    UDP port to receive OSC on           (default 9000)
  --osc-out-port <n>   UDP port to send OSC feedback to     (default 9001)
  --osc-out-host <ip>  Feedback target. Omit to reply to
                       whichever host last sent us OSC.
  --ws-port <n>        WebSocket port for the browser app   (default 9002)
  --ndi-name <name>    NDI source name                      (default Shadertool)
  --no-ndi             Run OSC only, skip the NDI sender
  -h, --help           Show this message
`);
    process.exit(0);
}

const config = {
    oscInPort: Number(flags['osc-in-port']),
    oscOutPort: Number(flags['osc-out-port']),
    oscOutHost: flags['osc-out-host'] || null,
    wsPort: Number(flags['ws-port']),
    ndiName: flags['ndi-name'],
    ndiEnabled: !flags['no-ndi'],
};

const log = (scope, ...args) => console.log(`[${scope}]`, ...args);

// ============================================
// Video frame protocol (browser -> bridge)
// ============================================

const FRAME_MAGIC = 0x4e444946; // "NDIF"
const FRAME_HEADER_BYTES = 32;

function parseFrame(buffer) {
    if (buffer.length < FRAME_HEADER_BYTES) return null;
    if (buffer.readUInt32LE(0) !== FRAME_MAGIC) return null;

    const width = buffer.readUInt32LE(4);
    const height = buffer.readUInt32LE(8);
    const lineStrideBytes = buffer.readUInt32LE(12);
    const frameRateN = buffer.readUInt32LE(16);
    const frameRateD = buffer.readUInt32LE(20);

    const expected = lineStrideBytes * height;
    if (width === 0 || height === 0 || buffer.length - FRAME_HEADER_BYTES < expected) return null;

    return {
        width,
        height,
        lineStrideBytes,
        frameRateN: frameRateN || 30000,
        frameRateD: frameRateD || 1000,
        data: buffer.subarray(FRAME_HEADER_BYTES, FRAME_HEADER_BYTES + expected),
    };
}

// ============================================
// NDI sender
// ============================================

class NDISender {
    constructor(name) {
        this.name = name;
        this.grandi = null;
        this.sender = null;
        this.available = false;
        this.unavailableReason = 'not initialised';
        this.inFlight = false;
        this.framesSent = 0;
        this.framesDropped = 0;
        this.lastLoggedResolution = '';
    }

    async init() {
        try {
            this.grandi = await import('grandi');
        } catch (error) {
            this.unavailableReason =
                'grandi (NDI bindings) not installed — run `npm install` in bridge/';
            log('NDI', this.unavailableReason);
            return;
        }

        try {
            if (!this.grandi.isSupportedCPU()) {
                this.unavailableReason = 'NDI is not supported on this CPU/platform';
                log('NDI', this.unavailableReason);
                return;
            }
            this.sender = await this.grandi.send({
                name: this.name,
                // We pace frames ourselves from the browser's render loop;
                // letting NDI clock them would throttle the whole pipeline.
                clockVideo: false,
                clockAudio: false,
            });
            this.available = true;
            this.unavailableReason = null;
            log('NDI', `${this.grandi.version()}`);
            log('NDI', `Sending as "${this.sender.sourceName()}"`);
        } catch (error) {
            this.unavailableReason = `NDI sender failed: ${error.message}`;
            log('NDI', this.unavailableReason);
        }
    }

    send(frame) {
        if (!this.available || !this.sender) return;

        // One frame in flight at a time. Queueing would only add latency: a
        // late frame is worth less than the next fresh one.
        if (this.inFlight) {
            this.framesDropped++;
            return;
        }

        const resolution = `${frame.width}x${frame.height}`;
        if (resolution !== this.lastLoggedResolution) {
            log('NDI', `Frame format: ${resolution} @ ${(frame.frameRateN / frame.frameRateD).toFixed(0)}fps RGBA`);
            this.lastLoggedResolution = resolution;
        }

        this.inFlight = true;
        this.sender
            .video({
                xres: frame.width,
                yres: frame.height,
                frameRateN: frame.frameRateN,
                frameRateD: frame.frameRateD,
                pictureAspectRatio: frame.width / frame.height,
                fourCC: this.grandi.FourCC.RGBA,
                frameFormatType: this.grandi.FrameType.Progressive,
                lineStrideBytes: frame.lineStrideBytes,
                // The buffer is a view into the WebSocket message, which ws
                // may recycle; the SDK reads it asynchronously, so copy.
                data: Buffer.from(frame.data),
            })
            .then(() => { this.framesSent++; })
            .catch((error) => { log('NDI', `send failed: ${error.message}`); })
            .finally(() => { this.inFlight = false; });
    }

    status() {
        return {
            available: this.available,
            name: this.sender ? this.sender.sourceName() : this.name,
            reason: this.unavailableReason,
            framesSent: this.framesSent,
            framesDropped: this.framesDropped,
            connections: this.available && this.sender ? this.sender.connections() : 0,
        };
    }

    destroy() {
        if (this.sender) {
            try { this.sender.destroy(); } catch { /* shutting down anyway */ }
            this.sender = null;
        }
        if (this.grandi) {
            try { this.grandi.destroy(); } catch { /* shutting down anyway */ }
        }
    }
}

// ============================================
// OSC transport
// ============================================

class OSCTransport {
    constructor({ inPort, outPort, outHost, onMessage }) {
        this.inPort = inPort;
        this.outPort = outPort;
        this.fixedOutHost = outHost;
        this.lastSenderHost = null;
        this.onMessage = onMessage;
        this.ready = false;
        this.messagesIn = 0;
        this.messagesOut = 0;

        this.port = new osc.UDPPort({
            localAddress: '0.0.0.0',
            localPort: inPort,
            metadata: true,
        });

        this.port.on('ready', () => {
            this.ready = true;
            log('OSC', `Listening on UDP 0.0.0.0:${inPort}`);
            log('OSC', this.fixedOutHost
                ? `Feedback to ${this.fixedOutHost}:${outPort}`
                : `Feedback to the last sender's host on port ${outPort}`);
        });

        this.port.on('message', (message, timeTag, info) => {
            this.messagesIn++;
            if (info && info.address) this.lastSenderHost = info.address;
            // Hand plain JS values to the app; types stay on the wire.
            const args = (message.args || []).map(arg =>
                (arg && typeof arg === 'object' && 'value' in arg) ? arg.value : arg
            );
            this.onMessage(message.address, args);
        });

        this.port.on('error', (error) => {
            log('OSC', `error: ${error.message}`);
        });

        this.port.open();
    }

    get outHost() {
        return this.fixedOutHost || this.lastSenderHost;
    }

    send(address, args) {
        const host = this.outHost;
        if (!this.ready || !host) return;
        try {
            this.port.send({ address, args: args || [] }, host, this.outPort);
            this.messagesOut++;
        } catch (error) {
            log('OSC', `send failed: ${error.message}`);
        }
    }

    status() {
        return {
            inPort: this.inPort,
            outPort: this.outPort,
            outHost: this.outHost,
            messagesIn: this.messagesIn,
            messagesOut: this.messagesOut,
        };
    }

    destroy() {
        try { this.port.close(); } catch { /* shutting down anyway */ }
    }
}

// ============================================
// Wire everything together
// ============================================

const ndi = new NDISender(config.ndiName);
if (config.ndiEnabled) {
    await ndi.init();
} else {
    ndi.unavailableReason = 'disabled with --no-ndi';
    log('NDI', ndi.unavailableReason);
}

const httpServer = createServer((req, res) => {
    // A plain health endpoint makes it easy to check the bridge is alive.
    if (req.url === '/status') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ osc: oscTransport.status(), ndi: ndi.status() }, null, 2));
        return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Shadertool bridge is running. Connect the app to this port over WebSocket.\n');
});

const wss = new WebSocketServer({ server: httpServer });
const clients = new Set();

const oscTransport = new OSCTransport({
    inPort: config.oscInPort,
    outPort: config.oscOutPort,
    outHost: config.oscOutHost,
    onMessage: (address, args) => {
        broadcast({ type: 'osc', address, args });
    },
});

function broadcast(message) {
    const payload = JSON.stringify(message);
    for (const client of clients) {
        if (client.readyState === client.OPEN) client.send(payload);
    }
}

function sendStatus(client) {
    const payload = JSON.stringify({
        type: 'status',
        osc: oscTransport.status(),
        ndi: ndi.status(),
    });
    if (client) {
        if (client.readyState === client.OPEN) client.send(payload);
    } else {
        for (const c of clients) {
            if (c.readyState === c.OPEN) c.send(payload);
        }
    }
}

wss.on('connection', (socket, request) => {
    clients.add(socket);
    log('WS', `App connected (${request.socket.remoteAddress}) — ${clients.size} client(s)`);
    sendStatus(socket);

    socket.on('message', (data, isBinary) => {
        if (isBinary) {
            const frame = parseFrame(data);
            if (frame) {
                ndi.send(frame);
            } else {
                log('WS', 'Discarded malformed video frame');
            }
            return;
        }

        let message;
        try {
            message = JSON.parse(data.toString());
        } catch {
            return;
        }

        if (message.type === 'osc-out') {
            oscTransport.send(message.address, message.args);
        } else if (message.type === 'hello') {
            sendStatus(socket);
        } else if (message.type === 'status') {
            sendStatus(socket);
        }
    });

    socket.on('close', () => {
        clients.delete(socket);
        log('WS', `App disconnected — ${clients.size} client(s)`);
    });

    socket.on('error', (error) => {
        log('WS', `socket error: ${error.message}`);
    });
});

httpServer.listen(config.wsPort, () => {
    log('WS', `Listening on ws://127.0.0.1:${config.wsPort}`);
    log('BRIDGE', 'Ready. Open the shader app and it will connect automatically.');
});

// Periodic status keeps the app's overlay (NDI receiver count, OSC counters)
// current without the app having to poll.
const statusTimer = setInterval(() => {
    if (clients.size > 0) sendStatus();
}, 2000);

function shutdown() {
    log('BRIDGE', 'Shutting down...');
    clearInterval(statusTimer);
    for (const client of clients) client.close();
    wss.close();
    httpServer.close();
    oscTransport.destroy();
    ndi.destroy();
    setTimeout(() => process.exit(0), 200);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
