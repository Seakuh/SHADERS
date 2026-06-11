import { defineConfig } from 'vite'
import { WebSocketServer } from 'ws'
import os from 'os'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// First non-internal IPv4 address, so phones on the same network can connect
function getLanAddress() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return 'localhost'
}

// Attaches a WebSocket relay to the dev server: every message from one
// client (phone or player) is forwarded to all other clients. Also serves
// /remote-info so the player page can render a QR code with the LAN URL.
function remoteControlPlugin() {
  return {
    name: 'shader-remote-control',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true })

      wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          const text = data.toString()
          for (const client of wss.clients) {
            if (client !== ws && client.readyState === 1) {
              client.send(text)
            }
          }
        })
      })

      // noServer + manual upgrade so we don't interfere with Vite's HMR socket
      server.httpServer.on('upgrade', (req, socket, head) => {
        if (req.url && req.url.split('?')[0] === '/remote-ws') {
          wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
        }
      })

      server.middlewares.use('/remote-info', (req, res) => {
        const port = server.config.server.port || 5173
        const url = `http://${getLanAddress()}:${port}${server.config.base}remote.html`
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ url }))
      })
    },
  }
}

export default defineConfig({
  plugins: [remoteControlPlugin()],
  base: '/shadertool/',
  server: {
    host: true, // listen on LAN so phones can reach the dev server
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        remote: resolve(__dirname, 'remote.html'),
      },
    },
  },
})
