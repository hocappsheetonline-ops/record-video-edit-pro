import { create } from 'zustand'
import { lumora } from '../api'
import { useAppStore } from '../store/app'
import type { Job } from '../editor/jobs'

/** AI đang chạy bằng gì và đã sẵn sàng chưa: một chỗ duy nhất để mọi màn hình hỏi. */
export interface EngineState {
  /** Văn bản: Ollama trên máy, Claude, hoặc chưa có (chỉ hiểu theo từ khóa). */
  engine: 'ollama' | 'claude' | 'none'
  ready: boolean
  /** Tên model / lý do chưa sẵn sàng (mã, đổi thành chữ ở giao diện). */
  detail: string
  /** Mã lý do khi chưa sẵn sàng (để hiện hướng dẫn đúng). */
  problem?: 'offline' | 'no_model' | 'no_key' | 'missing_tools'
}

export interface SpeechState {
  /** Giọng nói: whisper.cpp + Piper trên máy, ElevenLabs, hoặc chưa có. */
  engine: 'local' | 'elevenlabs' | 'none'
  ready: boolean
  detail: string
  problem?: 'missing_tools' | 'no_key'
  /** Thiếu gì khi chạy trên máy (để liệt kê). */
  missing: ('whisper' | 'whisperModel' | 'piper' | 'piperVoice')[]
}

interface AiStatusState {
  text: EngineState
  speech: SpeechState
  checking: boolean
  checkedAt: number
  /** Kiểm tra lại (gọi khi mở bảng AI, đổi cài đặt, sau khi thiết lập). */
  refresh(): Promise<void>
}

const NONE_TEXT: EngineState = { engine: 'none', ready: false, detail: '', problem: 'no_key' }
const NONE_SPEECH: SpeechState = {
  engine: 'none',
  ready: false,
  detail: '',
  problem: 'no_key',
  missing: [],
}

let inFlight: Promise<void> | null = null

export const useAiStatus = create<AiStatusState>((set) => ({
  text: NONE_TEXT,
  speech: NONE_SPEECH,
  checking: false,
  checkedAt: 0,

  refresh() {
    if (inFlight) return inFlight
    // Xóa `inFlight` trong `.finally` (chạy sau khi gán) để lần kiểm tra không cần chờ gì
    // (chưa bật AI) không để lại promise cũ chặn các lần kiểm tra sau.
    inFlight = (async () => {
      set({ checking: true })
      try {
        const { settings, secrets } = useAppStore.getState()
        const api = lumora()
        let text: EngineState = NONE_TEXT
        if (settings?.localAi.enabled) {
          const { baseUrl, model } = settings.localAi
          try {
            const models = await api.listLocalModels(baseUrl)
            const has = models.some((m) => m === model || m.split(':')[0] === model.split(':')[0])
            text = has
              ? { engine: 'ollama', ready: true, detail: model }
              : { engine: 'ollama', ready: false, detail: model, problem: 'no_model' }
          } catch {
            text = { engine: 'ollama', ready: false, detail: model, problem: 'offline' }
          }
        } else if (secrets?.anthropic.state === 'saved')
          text = { engine: 'claude', ready: true, detail: 'Claude' }

        let speech: SpeechState = NONE_SPEECH
        if (settings?.localSpeech.enabled) {
          const { whisperModel, piperVoice } = settings.localSpeech
          try {
            const status = await api.localSpeechStatus()
            const missing: SpeechState['missing'] = []
            if (!status.whisper.installed) missing.push('whisper')
            if (!status.whisper.models.includes(whisperModel)) missing.push('whisperModel')
            if (!status.piper.installed) missing.push('piper')
            if (!status.piper.voices.includes(piperVoice)) missing.push('piperVoice')
            speech =
              missing.length === 0
                ? {
                    engine: 'local',
                    ready: true,
                    detail: `${whisperModel} · ${piperVoice}`,
                    missing,
                  }
                : {
                    engine: 'local',
                    ready: false,
                    detail: whisperModel,
                    problem: 'missing_tools',
                    missing,
                  }
          } catch {
            speech = {
              engine: 'local',
              ready: false,
              detail: whisperModel,
              problem: 'missing_tools',
              missing: ['whisper', 'piper'],
            }
          }
        } else if (secrets?.elevenlabs.state === 'saved')
          speech = { engine: 'elevenlabs', ready: true, detail: 'ElevenLabs', missing: [] }

        set({ text, speech, checkedAt: Date.now() })
      } finally {
        set({ checking: false })
      }
    })().finally(() => {
      inFlight = null
    })
    return inFlight
  },
}))

/** Việc AI đang chạy (nếu có) để hiện "AI đang làm gì". */
export function runningAiJob(jobs: Job[]): Job | undefined {
  return jobs.find((j) => j.status === 'running' && j.kind === 'ai')
}

/** Kiểm tra lại mỗi khi cài đặt / key đổi (Cài đặt bật tắt AI, nhập key…). */
let subscribed = false
export function watchAiStatus() {
  if (subscribed) return
  subscribed = true
  useAppStore.subscribe((s, prev) => {
    if (s.settings !== prev.settings || s.secrets !== prev.secrets)
      void useAiStatus.getState().refresh()
  })
}
