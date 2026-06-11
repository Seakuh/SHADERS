// Production server: serves the built dist/ folder and runs the same
// WebSocket relay the dev server provides, so the phone remote works
// with `npm run build && npm run serve` (no Vite needed at the gig).
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
import os from 'os';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8080;
const BASE = '/shadertool/';
const DIST = new URL('./dist/', import.meta.url).pathname;

const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.glsl': 'text/plain',
    '.woff2': 'font/woff2',
};

function getLanAddress() {
    for (const interfaces of Object.values(os.networkInterfaces())) {
        for (const iface of interfaces || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const server = http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];

    if (url === '/remote-info') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ url: `http://${getLanAddress()}:${PORT}${BASE}remote.html` }));
        return;
    }

    if (url === '/' || url === BASE.slice(0, -1)) {
        res.writeHead(302, { Location: BASE });
        res.end();
        return;
    }

    if (!url.startsWith(BASE)) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    let filePath = url.slice(BASE.length) || 'index.html';
    if (filePath.endsWith('/')) filePath += 'index.html';

    // Prevent path traversal
    const fullPath = normalize(join(DIST, filePath));
    if (!fullPath.startsWith(normalize(DIST))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    try {
        const content = await readFile(fullPath);
        res.setHeader('Content-Type', MIME[extname(fullPath)] || 'application/octet-stream');
        res.end(content);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
});

// WebSocket relay: forward every message to all other clients
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        const text = data.toString();
        for (const client of wss.clients) {
            if (client !== ws && client.readyState === 1) {
                client.send(text);
            }
        }
    });
});

server.on('upgrade', (req, socket, head) => {
    if (req.url && req.url.split('?')[0] === '/remote-ws') {
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else {
        socket.destroy();
    }
});

server.listen(PORT, () => {
    console.log(`Shader player:  http://${getLanAddress()}:${PORT}${BASE}`);
    console.log(`Phone remote:   http://${getLanAddress()}:${PORT}${BASE}remote.html`);
});
