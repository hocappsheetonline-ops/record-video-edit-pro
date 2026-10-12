/**
 * Trang web cho khách mời (mở bằng trình duyệt, không cần cài app): xem trước webcam/micro,
 * nhập tên, vào phòng chờ, rồi kết nối WebRTC với studio. Khách nhận lại hình chương trình
 * và âm thanh của những người khác (không có tiếng của chính mình).
 */
export function guestHtml(room: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Lumora — Tham gia livestream</title>
<style>
  :root { color-scheme: dark; --bg:#0b0b10; --surface:#14141c; --border:#2a2a38; --text:#ececf1; --muted:#9a9aad; --accent:#8b5cf6; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 "Segoe UI",system-ui,sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 24px 16px; display:flex; flex-direction:column; gap:16px; }
  h1 { font-size: 22px; margin: 0; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px; }
  .row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  video { width:100%; border-radius:10px; background:#000; aspect-ratio:16/9; object-fit:cover; }
  label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--muted); flex:1; min-width:180px; }
  input, select { background:#1c1c27; color:var(--text); border:1px solid var(--border); border-radius:8px; padding:8px 10px; font:inherit; }
  button { background:var(--accent); color:#fff; border:0; border-radius:10px; padding:10px 18px; font:inherit; font-weight:600; cursor:pointer; }
  button.secondary { background:#1c1c27; border:1px solid var(--border); }
  button:disabled { opacity:.5; cursor:default; }
  #status { color: var(--muted); }
  #status.live { color: #f87171; font-weight: 600; }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
  .hidden { display:none !important; }
</style>
</head>
<body>
<main data-room="${room}">
  <h1>Lumora Live</h1>
  <section class="card" id="setup">
    <div class="grid">
      <video id="preview" autoplay muted playsinline></video>
      <div style="display:flex;flex-direction:column;gap:12px">
        <label>Tên hiển thị / Your name<input id="name" maxlength="40" placeholder="Nguyễn Văn A" /></label>
        <label>Webcam<select id="camera"></select></label>
        <label>Micro<select id="mic"></select></label>
        <button id="join" disabled>Vào phòng chờ / Join</button>
        <div id="error" style="color:#f87171"></div>
      </div>
    </div>
  </section>
  <section class="card hidden" id="room">
    <div class="row" style="justify-content:space-between;margin-bottom:12px">
      <span id="status">Đang kết nối…</span>
      <div class="row">
        <button class="secondary" id="toggle-mic">Tắt micro</button>
        <button class="secondary" id="toggle-cam">Tắt webcam</button>
        <button class="secondary" id="leave">Rời phòng</button>
      </div>
    </div>
    <video id="program" autoplay playsinline></video>
    <p style="color:var(--muted);font-size:13px">Đây là hình đang phát của chương trình. / This is the live program.</p>
  </section>
</main>
<script src="/guest.js"></script>
</body>
</html>`
}

export const GUEST_SCRIPT = String.raw`(() => {
  const $ = (id) => document.getElementById(id)
  const room = document.querySelector('main').dataset.room
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }]
  let local = null
  let ws = null
  let pc = null
  const text = {
    waiting: 'Bạn đang ở phòng chờ. Host sẽ đưa bạn lên sóng. / Waiting in the green room.',
    onStage: '● Bạn đang LÊN SÓNG / You are LIVE',
    kicked: 'Host đã mời bạn rời phòng. / You were removed by the host.',
    ended: 'Buổi phát đã kết thúc. / The stream has ended.',
    full: 'Phòng đã đủ người. / The room is full.',
    lost: 'Mất kết nối. / Connection lost.',
  }
  const setStatus = (message, live) => {
    $('status').textContent = message
    $('status').className = live ? 'live' : ''
    document.body.dataset.state = live ? 'on-stage' : message === text.waiting ? 'waiting' : 'other'
  }

  async function openMedia() {
    const camera = $('camera').value
    const mic = $('mic').value
    if (local) local.getTracks().forEach((t) => t.stop())
    local = await navigator.mediaDevices.getUserMedia({
      video: camera ? { deviceId: { exact: camera } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: mic ? { deviceId: { exact: mic }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
    })
    $('preview').srcObject = local
    if (pc) {
      for (const t of pc.getTransceivers()) {
        const track = local.getTracks().find((x) => x.kind === t.receiver.track.kind)
        if (track) await t.sender.replaceTrack(track)
      }
    }
  }

  async function listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices()
    for (const [kind, select] of [['videoinput', $('camera')], ['audioinput', $('mic')]]) {
      select.innerHTML = ''
      devices.filter((d) => d.kind === kind).forEach((d, i) => {
        const option = document.createElement('option')
        option.value = d.deviceId
        option.textContent = d.label || kind + ' ' + (i + 1)
        select.appendChild(option)
      })
    }
  }

  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg))
  }

  function ensurePeer() {
    if (pc) return pc
    pc = new RTCPeerConnection({ iceServers: ICE })
    const program = new MediaStream()
    $('program').srcObject = program
    pc.ontrack = (event) => {
      program.addTrack(event.track)
      $('program').play().catch(() => {})
    }
    pc.onicecandidate = (event) => {
      if (event.candidate) send({ type: 'signal', data: { candidate: event.candidate.toJSON() } })
    }
    return pc
  }

  async function onSignal(data) {
    const peer = ensurePeer()
    if (data.sdp) {
      await peer.setRemoteDescription(data.sdp)
      if (data.sdp.type === 'offer') {
        for (const t of peer.getTransceivers()) {
          const track = local.getTracks().find((x) => x.kind === t.receiver.track.kind)
          if (track) {
            await t.sender.replaceTrack(track)
            t.direction = 'sendrecv'
          }
        }
        await peer.setLocalDescription(await peer.createAnswer())
        send({ type: 'signal', data: { sdp: peer.localDescription.toJSON() } })
      }
    } else if (data.candidate) {
      await peer.addIceCandidate(data.candidate).catch(() => {})
    }
  }

  function leave(message) {
    if (ws) ws.onclose = null
    ws && ws.close()
    pc && pc.close()
    pc = null
    ws = null
    setStatus(message || text.ended, false)
  }

  $('join').onclick = () => {
    const name = $('name').value.trim()
    if (!name) return $('name').focus()
    localStorage.setItem('lumora.guest.name', name)
    $('setup').classList.add('hidden')
    $('room').classList.remove('hidden')
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(scheme + '://' + location.host + '/ws?role=guest&room=' + room)
    ws.onopen = () => send({ type: 'hello', name })
    ws.onclose = () => setStatus(text.lost, false)
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'welcome') setStatus(text.waiting, false)
      else if (msg.type === 'signal') onSignal(msg.data).catch((e) => console.error(e))
      else if (msg.type === 'stage') setStatus(msg.onStage ? text.onStage : text.waiting, msg.onStage)
      else if (msg.type === 'kicked') leave(text.kicked)
      else if (msg.type === 'host-left') leave(text.ended)
      else if (msg.type === 'full') leave(text.full)
    }
  }
  $('leave').onclick = () => leave(text.ended)
  $('toggle-mic').onclick = () => {
    const track = local && local.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    $('toggle-mic').textContent = track.enabled ? 'Tắt micro' : 'Bật micro'
  }
  $('toggle-cam').onclick = () => {
    const track = local && local.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    $('toggle-cam').textContent = track.enabled ? 'Tắt webcam' : 'Bật webcam'
  }
  $('camera').onchange = () => openMedia().catch((e) => ($('error').textContent = e.message))
  $('mic').onchange = () => openMedia().catch((e) => ($('error').textContent = e.message))
  $('name').value = localStorage.getItem('lumora.guest.name') || ''

  openMedia()
    .then(listDevices)
    .then(() => ($('join').disabled = false))
    .catch((e) => ($('error').textContent = 'Không mở được webcam/micro: ' + e.message))
})()`
