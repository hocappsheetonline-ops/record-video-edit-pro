import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { WebSocketServer, type WebSocket } from 'ws'

export interface SignalingOptions {
  guestHtml(room: string): string
  guestScript: string
  maxGuests?: number
}

interface Guest {
  id: string
  name: string
  socket: WebSocket
}

const token = (bytes: number) => randomBytes(bytes).toString('hex')

/** Tên khách: bỏ ký tự điều khiển, giới hạn độ dài. */
export function cleanName(value: unknown): string {
  const text =
    typeof value === 'string' ? [...value].filter((c) => c.charCodeAt(0) >= 32).join('') : ''
  return text.trim().slice(0, 40) || 'Khách'
}

/** Địa chỉ IPv4 trong mạng LAN để khách cùng mạng mở được link mời. */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n): n is NonNullable<typeof n> => !!n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address)
}

/**
 * Máy chủ nhỏ chạy trong app: phục vụ trang web cho khách mời và chuyển tin nhắn WebRTC
 * (SDP, ICE) giữa studio (host) và từng khách. Hình và tiếng đi thẳng giữa hai máy (P2P).
 */
export class SignalingServer {
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private host: WebSocket | null = null
  private guests = new Map<string, Guest>()
  private counter = 0
  room: string | null = null
  private hostKey: string | null = null
  port = 0

  constructor(private readonly options: SignalingOptions) {}

  async start(preferredPort = 47800, attempts = 20): Promise<number> {
    if (this.server) return this.port
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const match = /^\/join\/([a-f0-9]{16,64})$/.exec(url.pathname)
      if (match && match[1] === this.room) {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        })
        return res.end(this.options.guestHtml(match[1]))
      }
      if (url.pathname === '/guest.js') {
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-store',
        })
        return res.end(this.options.guestScript)
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Phòng không tồn tại hoặc đã đóng / Room not found')
    })
    const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 })
    server.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/ws')) return socket.destroy()
      wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, req))
    })
    for (let i = 0; i < attempts; i++) {
      const port = preferredPort === 0 ? 0 : preferredPort + i
      const ok = await new Promise<boolean>((resolve) => {
        server.once('error', () => resolve(false))
        server.listen(port, '0.0.0.0', () => resolve(true))
      })
      if (ok) {
        const address = server.address()
        this.port = typeof address === 'object' && address ? address.port : port
        this.server = server
        this.wss = wss
        return this.port
      }
    }
    throw new Error('Không mở được cổng cho khách mời')
  }

  openRoom(): { room: string; hostKey: string } {
    this.closeRoom()
    this.room = token(16)
    this.hostKey = token(24)
    return { room: this.room, hostKey: this.hostKey }
  }

  closeRoom(): void {
    for (const guest of this.guests.values()) {
      send(guest.socket, { type: 'host-left' })
      guest.socket.close()
    }
    this.guests.clear()
    this.host?.close()
    this.host = null
    this.room = null
    this.hostKey = null
  }

  inviteUrls(publicBase?: string): string[] {
    if (!this.room) return []
    const path = `/join/${this.room}`
    const urls = lanAddresses().map((ip) => `http://${ip}:${this.port}${path}`)
    urls.push(`http://127.0.0.1:${this.port}${path}`)
    if (publicBase) urls.unshift(`${publicBase.replace(/\/+$/, '')}${path}`)
    return urls
  }

  private onConnection(ws: WebSocket, req: IncomingMessage) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const role = url.searchParams.get('role')
    const room = url.searchParams.get('room')
    if (!this.room || room !== this.room) return ws.close(4004, 'room')
    if (role === 'host') {
      if (url.searchParams.get('key') !== this.hostKey) return ws.close(4003, 'key')
      this.host?.close()
      this.host = ws
      ws.on('message', (raw) => this.fromHost(raw.toString()))
      ws.on('close', () => {
        if (this.host === ws) this.host = null
      })
      // Báo cho host những khách đang chờ (nếu host kết nối lại).
      for (const g of this.guests.values())
        send(ws, { type: 'guest-joined', id: g.id, name: g.name })
      return
    }
    if (role !== 'guest') return ws.close(4000, 'role')
    if (this.guests.size >= (this.options.maxGuests ?? 8)) {
      send(ws, { type: 'full' })
      return ws.close(4029, 'full')
    }
    let guest: Guest | null = null
    ws.on('message', (raw) => {
      const msg = parse(raw.toString())
      if (!msg) return
      if (!guest && msg.type === 'hello') {
        this.counter += 1
        guest = { id: `g${this.counter}`, name: cleanName(msg.name), socket: ws }
        this.guests.set(guest.id, guest)
        send(ws, { type: 'welcome', id: guest.id })
        if (this.host) send(this.host, { type: 'guest-joined', id: guest.id, name: guest.name })
        return
      }
      if (guest && msg.type === 'signal' && this.host)
        send(this.host, { type: 'signal', from: guest.id, data: msg.data })
    })
    ws.on('close', () => {
      if (!guest) return
      this.guests.delete(guest.id)
      if (this.host) send(this.host, { type: 'guest-left', id: guest.id })
    })
  }

  private fromHost(raw: string) {
    const msg = parse(raw)
    if (!msg || typeof msg.to !== 'string') return
    const guest = this.guests.get(msg.to)
    if (!guest) return
    if (msg.type === 'signal') send(guest.socket, { type: 'signal', data: msg.data })
    else if (msg.type === 'stage')
      send(guest.socket, { type: 'stage', onStage: msg.onStage === true })
    else if (msg.type === 'kick') {
      send(guest.socket, { type: 'kicked' })
      guest.socket.close()
    }
  }

  async stop(): Promise<void> {
    this.closeRoom()
    this.wss?.close()
    const server = this.server
    this.server = null
    this.wss = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

function parse(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw)
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}
