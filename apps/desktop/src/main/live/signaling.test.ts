import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { cleanName, SignalingServer } from './signaling'

let server: SignalingServer
beforeEach(async () => {
  server = new SignalingServer({
    guestHtml: (room) => `<html>${room}</html>`,
    guestScript: 'console.log(1)',
    maxGuests: 2,
  })
  await server.start(0)
})
afterEach(() => server.stop())

/** Client WebSocket nhỏ để test: gom tin nhắn nhận được. */
async function connect(query: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?${query}`)
  const messages: Record<string, unknown>[] = []
  let closedCode: number | null = null
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))
  ws.on('close', (code) => (closedCode = code))
  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
    ws.once('close', resolve)
  })
  const next = async (type: string) => {
    for (let i = 0; i < 100; i++) {
      const found = messages.find((m) => m.type === type)
      if (found) {
        messages.splice(messages.indexOf(found), 1)
        return found
      }
      await new Promise((r) => setTimeout(r, 20))
    }
    throw new Error(`không nhận được ${type}`)
  }
  return {
    ws,
    messages,
    next,
    closed: () => closedCode,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
  }
}

const waitClosed = async (client: { closed(): number | null }) => {
  for (let i = 0; i < 100 && client.closed() === null; i++)
    await new Promise((r) => setTimeout(r, 20))
  return client.closed()
}

describe('SignalingServer', () => {
  it('phục vụ trang khách đúng phòng, phòng sai thì 404', async () => {
    const { room } = server.openRoom()
    const ok = await fetch(`http://127.0.0.1:${server.port}/join/${room}`)
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe(`<html>${room}</html>`)
    expect((await fetch(`http://127.0.0.1:${server.port}/join/${'0'.repeat(32)}`)).status).toBe(404)
    expect(await (await fetch(`http://127.0.0.1:${server.port}/guest.js`)).text()).toBe(
      'console.log(1)',
    )
    expect(
      server.inviteUrls().some((u) => u === `http://127.0.0.1:${server.port}/join/${room}`),
    ).toBe(true)
  })

  it('chuyển tin nhắn giữa host và khách; lên sóng, mời ra', async () => {
    const { room, hostKey } = server.openRoom()
    const host = await connect(`role=host&room=${room}&key=${hostKey}`)
    const guest = await connect(`role=guest&room=${room}`)
    guest.send({ type: 'hello', name: ' Lan\u0007 ' })
    expect(await guest.next('welcome')).toEqual({ type: 'welcome', id: 'g1' })
    expect(await host.next('guest-joined')).toEqual({ type: 'guest-joined', id: 'g1', name: 'Lan' })

    host.send({ type: 'signal', to: 'g1', data: { sdp: 'offer' } })
    expect(await guest.next('signal')).toEqual({ type: 'signal', data: { sdp: 'offer' } })
    guest.send({ type: 'signal', data: { sdp: 'answer' } })
    expect(await host.next('signal')).toEqual({
      type: 'signal',
      from: 'g1',
      data: { sdp: 'answer' },
    })

    host.send({ type: 'stage', to: 'g1', onStage: true })
    expect(await guest.next('stage')).toEqual({ type: 'stage', onStage: true })

    host.send({ type: 'kick', to: 'g1' })
    expect(await guest.next('kicked')).toEqual({ type: 'kicked' })
    expect(await host.next('guest-left')).toEqual({ type: 'guest-left', id: 'g1' })
  })

  it('từ chối sai khóa host, sai phòng và khi phòng đầy', async () => {
    const { room } = server.openRoom()
    expect(await waitClosed(await connect(`role=host&room=${room}&key=wrong`))).toBe(4003)
    expect(await waitClosed(await connect(`role=guest&room=nope`))).toBe(4004)
    const a = await connect(`role=guest&room=${room}`)
    a.send({ type: 'hello', name: 'A' })
    await a.next('welcome')
    const b = await connect(`role=guest&room=${room}`)
    b.send({ type: 'hello', name: 'B' })
    await b.next('welcome')
    const c = await connect(`role=guest&room=${room}`)
    expect(await waitClosed(c)).toBe(4029)
  })

  it('đóng phòng thì báo cho khách', async () => {
    const { room } = server.openRoom()
    const guest = await connect(`role=guest&room=${room}`)
    guest.send({ type: 'hello', name: 'A' })
    await guest.next('welcome')
    server.closeRoom()
    expect(await guest.next('host-left')).toEqual({ type: 'host-left' })
  })

  it('cleanName', () => {
    expect(cleanName('')).toBe('Khách')
    expect(cleanName('x'.repeat(100))).toHaveLength(40)
    expect(cleanName(5)).toBe('Khách')
  })
})
