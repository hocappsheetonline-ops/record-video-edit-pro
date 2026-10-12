import type { GuestRoom } from '@shared/ipc'
import type { StudioEngine } from './studio'

export interface GuestInfo {
  id: string
  name: string
  connected: boolean
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

/**
 * Phía studio của khách mời: nhận thông báo qua máy chủ báo hiệu, tạo kết nối WebRTC với từng khách
 * (gửi hình chương trình + âm thanh mix-minus, nhận webcam + micro của khách).
 */
export class GuestHub {
  private ws: WebSocket | null = null
  private peers = new Map<string, RTCPeerConnection>()
  private guests = new Map<string, GuestInfo>()

  constructor(
    private readonly engine: StudioEngine,
    private readonly room: GuestRoom,
    private readonly onChange: (guests: GuestInfo[]) => void,
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${this.room.port}/ws?role=host&room=${this.room.room}&key=${this.room.hostKey}`,
      )
      this.ws = ws
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('Không kết nối được máy chủ khách mời'))
      ws.onmessage = (event) => void this.onMessage(JSON.parse(String(event.data)))
    })
  }

  private emit() {
    this.onChange([...this.guests.values()])
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private async onMessage(msg: {
    type: string
    id?: string
    name?: string
    from?: string
    data?: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
  }) {
    if (msg.type === 'guest-joined' && msg.id) {
      this.guests.set(msg.id, { id: msg.id, name: msg.name ?? 'Khách', connected: false })
      this.engine.addGuest(msg.id, msg.name ?? 'Khách')
      this.emit()
      await this.call(msg.id)
    } else if (msg.type === 'guest-left' && msg.id) {
      this.drop(msg.id)
    } else if (msg.type === 'signal' && msg.from) {
      const pc = this.peers.get(msg.from)
      if (!pc || !msg.data) return
      if (msg.data.sdp) await pc.setRemoteDescription(msg.data.sdp)
      else if (msg.data.candidate)
        await pc.addIceCandidate(msg.data.candidate).catch(() => undefined)
    }
  }

  private async call(id: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.peers.set(id, pc)
    const feed = this.engine.guestFeed(id)
    pc.addTransceiver(feed.video ?? 'video', { direction: 'sendrecv' })
    pc.addTransceiver(feed.audio ?? 'audio', { direction: 'sendrecv' })
    pc.ontrack = (event) => {
      this.engine.addGuestTrack(id, event.track)
      const info = this.guests.get(id)
      if (info) {
        info.connected = true
        this.emit()
      }
    }
    pc.onicecandidate = (event) => {
      if (event.candidate)
        this.send({ type: 'signal', to: id, data: { candidate: event.candidate.toJSON() } })
    }
    await pc.setLocalDescription(await pc.createOffer())
    this.send({ type: 'signal', to: id, data: { sdp: pc.localDescription!.toJSON() } })
  }

  setOnStage(id: string, onStage: boolean) {
    this.engine.setOnStage(id, onStage)
    this.send({ type: 'stage', to: id, onStage })
    this.emit()
  }

  kick(id: string) {
    this.send({ type: 'kick', to: id })
    this.drop(id)
  }

  private drop(id: string) {
    this.peers.get(id)?.close()
    this.peers.delete(id)
    this.guests.delete(id)
    this.engine.removeParticipant(id)
    this.emit()
  }

  close() {
    for (const id of [...this.peers.keys()]) this.drop(id)
    this.ws?.close()
    this.ws = null
  }
}
