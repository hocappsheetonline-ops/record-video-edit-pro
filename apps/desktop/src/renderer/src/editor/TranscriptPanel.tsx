import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Eraser, RotateCcw, Scissors, Timer } from 'lucide-react'
import {
  cutAllFillers,
  cutAllGaps,
  cutPhrase,
  cutTranscriptWords,
  findPhrase,
  outputToSource,
  removeSourceRanges,
  restoreSourceRange,
  restoreTranscriptWords,
  sourceToOutput,
  transcriptStats,
  transcriptTokens,
  type TranscriptToken,
} from '@lumora/core'
import { lumora } from '../api'
import { aiErrorText } from './ai-errors'
import { runJob } from './jobs'
import { useEditorStore } from './store'
import { Toggle } from './ui'

const button =
  'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50'

type WordToken = Extract<TranscriptToken, { kind: 'word' }>
type GapToken = Extract<TranscriptToken, { kind: 'gap' }>

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

/** Chỉ số từ của phần tử (từ hoặc ô khoảng lặng) chứa `node`, hoặc null. */
function indexOf(node: Node | null, root: HTMLElement): number | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement
  const hit = el?.closest<HTMLElement>('[data-index]')
  if (!hit || !root.contains(hit)) return null
  const n = Number(hit.dataset.index)
  return Number.isFinite(n) ? n : null
}

/**
 * Chỉnh sửa bằng văn bản (kiểu Descript): lời thoại hiện thành chữ; chọn chữ rồi bấm Delete (hoặc
 * nút Cắt) để cắt đoạn video + tiếng tương ứng; từ đệm (ờ, à, ừm…) được tô màu, khoảng lặng dài hiện
 * thành ô ⋯ để bấm xóa; "Bỏ mọi từ đệm" / "Rút ngắn mọi khoảng lặng" làm một lần cho cả video.
 * Phần đã cắt hiện gạch ngang, bấm để khôi phục.
 */
export function TranscriptPanel() {
  const { t } = useTranslation()
  const edit = useEditorStore((s) => s.edit)
  const folder = useEditorStore((s) => s.folder)
  const transcript = useEditorStore((s) => s.transcript)
  const time = useEditorStore((s) => s.time)
  const change = useEditorStore((s) => s.change)
  const setTime = useEditorStore((s) => s.setTime)
  const [selected, setSelected] = useState<number[]>([])
  const [anchor, setAnchor] = useState<number | null>(null)
  const [showCut, setShowCut] = useState(true)
  const [phrase, setPhrase] = useState('')
  const [phraseResult, setPhraseResult] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ kind: 'fillers' | 'gaps'; count: number } | null>(null)
  const textRef = useRef<HTMLDivElement>(null)

  const language = edit?.captions.language || transcript?.language || ''
  const tokens = useMemo(
    () => (transcript && edit ? transcriptTokens(transcript.words, edit.clips, language) : []),
    [transcript, edit, language],
  )
  const stats = useMemo(() => transcriptStats(tokens), [tokens])
  // Từ đang được nói tại đầu phát (thời gian xuất → thời gian nguồn).
  const currentSource = useMemo(() => {
    if (!edit) return null
    const hit = outputToSource(edit.clips, time)
    return hit ? hit.source : null
  }, [edit, time])
  const phraseHits = useMemo(
    () => (transcript && phrase.trim() ? findPhrase(transcript.words, phrase).flat() : []),
    [transcript, phrase],
  )
  const phraseSet = useMemo(() => new Set(phraseHits), [phraseHits])
  if (!edit || !folder) return null

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await runJob(t('transcript.job'), () =>
        lumora().transcribe(folder, edit.captions.language || ''),
      )
      useEditorStore.getState().setTranscript(result)
    } catch (e) {
      setError(aiErrorText(t, e))
    } finally {
      setBusy(false)
    }
  }

  const words = transcript?.words ?? []
  const selectedSet = new Set(selected)
  const selectedWords = selected.filter((i) => {
    const tok = tokens.find((x) => x.kind === 'word' && x.index === i)
    return tok !== undefined
  })
  const selectedKept = selectedWords.filter((i) =>
    tokens.some((x) => x.kind === 'word' && x.index === i && !x.cut),
  )
  const selectedCut = selectedWords.filter((i) =>
    tokens.some((x) => x.kind === 'word' && x.index === i && x.cut),
  )

  const cutWords = (indices: number[]) => {
    if (indices.length === 0) return
    change((e) => ({ ...e, clips: cutTranscriptWords(e.clips, words, indices) }))
    setSelected([])
    setDone(null)
  }
  const restoreWords = (indices: number[]) => {
    if (indices.length === 0) return
    change((e) => ({ ...e, clips: restoreTranscriptWords(e.clips, words, indices) }))
    setSelected([])
    setDone(null)
  }
  const toggleGap = (gap: GapToken) => {
    change((e) => ({
      ...e,
      clips: gap.cut
        ? restoreSourceRange(e.clips, { start: gap.start, end: gap.end })
        : removeSourceRanges(e.clips, [{ start: gap.start, end: gap.end }]),
    }))
    setDone(null)
  }
  const removeFillers = () => {
    const result = cutAllFillers(edit.clips, words, language)
    if (result.count > 0) change((e) => ({ ...e, clips: result.clips }))
    setDone({ kind: 'fillers', count: result.count })
    setSelected([])
  }
  const shortenGaps = () => {
    const result = cutAllGaps(edit.clips, words)
    if (result.count > 0) change((e) => ({ ...e, clips: result.clips }))
    setDone({ kind: 'gaps', count: result.count })
    setSelected([])
  }
  const cutByPhrase = () => {
    const result = cutPhrase(edit.clips, words, phrase)
    if (result.count > 0) change((e) => ({ ...e, clips: result.clips }))
    setPhraseResult(result.count)
    setDone(null)
  }

  /** Các từ nằm trong vùng bôi đen (kéo chuột) của trình duyệt, nếu có. */
  const nativeSelection = (): number[] => {
    const root = textRef.current
    const sel = window.getSelection()
    if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) return []
    const a = indexOf(sel.anchorNode, root)
    const b = indexOf(sel.focusNode, root)
    if (a === null || b === null) return []
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    return Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
  }

  const onWordClick = (tok: WordToken, ev: MouseEvent) => {
    if (tok.cut) {
      restoreWords([tok.index])
      return
    }
    // Đưa đầu phát tới từ (nếu từ còn trên timeline).
    const at = sourceToOutput(edit.clips, tok.start)
    if (at !== null) setTime(at)
    if (ev.shiftKey && anchor !== null) {
      const lo = Math.min(anchor, tok.index)
      const hi = Math.max(anchor, tok.index)
      setSelected(Array.from({ length: hi - lo + 1 }, (_, k) => lo + k))
      return
    }
    if (ev.ctrlKey || ev.metaKey) {
      setSelected(
        selectedSet.has(tok.index)
          ? selected.filter((i) => i !== tok.index)
          : [...selected, tok.index],
      )
      setAnchor(tok.index)
      return
    }
    setSelected(selectedSet.has(tok.index) && selected.length === 1 ? [] : [tok.index])
    setAnchor(tok.index)
  }

  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
    ev.preventDefault()
    // Không để phím tắt toàn cục của timeline (Delete = xóa mục đang chọn) chạy theo.
    ev.stopPropagation()
    const dragged = nativeSelection()
    const target = dragged.length > 0 ? dragged : selectedKept
    const keep = target.filter((i) =>
      tokens.some((x) => x.kind === 'word' && x.index === i && !x.cut),
    )
    cutWords(keep)
    window.getSelection()?.removeAllRanges()
  }

  // Chia đoạn văn theo cờ `paragraph` của từ (sau khoảng nghỉ dài).
  const paragraphs: TranscriptToken[][] = []
  for (const tok of tokens) {
    if (tok.kind === 'word' && tok.paragraph) paragraphs.push([])
    if (paragraphs.length === 0) paragraphs.push([])
    paragraphs[paragraphs.length - 1]!.push(tok)
  }

  return (
    <div className="flex flex-col gap-3" data-testid="transcript-panel">
      <p className="text-xs text-muted">{t('transcript.intro')}</p>
      {!transcript ? (
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          data-testid="transcript-generate"
          className={`${button} justify-center bg-accent text-white hover:bg-accent/90`}
        >
          {busy ? t('transcript.generating') : t('transcript.generate')}
        </button>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span data-testid="transcript-stats">
              {t('transcript.stats', {
                words: stats.words - stats.cutWords,
                fillers: stats.fillers,
                gaps: stats.gaps,
              })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              data-testid="transcript-remove-fillers"
              disabled={stats.fillers === 0}
              onClick={removeFillers}
            >
              <Eraser size={14} aria-hidden />
              {t('transcript.removeFillers', { count: stats.fillers })}
            </button>
            <button
              type="button"
              className={button}
              data-testid="transcript-cut-silences"
              disabled={stats.gaps === 0}
              onClick={shortenGaps}
            >
              <Timer size={14} aria-hidden />
              {t('transcript.shortenGaps', { count: stats.gaps })}
            </button>
          </div>
          {done && (
            <p className="text-xs text-muted" data-testid="transcript-done">
              {done.count === 0
                ? t('transcript.nothingToCut')
                : t(done.kind === 'fillers' ? 'transcript.fillersDone' : 'transcript.gapsDone', {
                    count: done.count,
                  })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={button}
              data-testid="transcript-cut-selection"
              disabled={selectedKept.length === 0}
              onClick={() => cutWords(selectedKept)}
            >
              <Scissors size={14} aria-hidden />
              {t('transcript.cutSelected', { count: selectedKept.length })}
            </button>
            <button
              type="button"
              className={button}
              data-testid="transcript-restore-selection"
              disabled={selectedCut.length === 0}
              onClick={() => restoreWords(selectedCut)}
            >
              <RotateCcw size={14} aria-hidden />
              {t('transcript.restoreSelected', { count: selectedCut.length })}
            </button>
          </div>
          <Toggle
            label={t('transcript.showCut')}
            checked={showCut}
            onChange={setShowCut}
            testId="transcript-show-cut"
          />
          <div
            ref={textRef}
            tabIndex={0}
            role="textbox"
            aria-multiline
            aria-readonly
            aria-label={t('transcript.textLabel')}
            data-testid="transcript-text"
            onKeyDown={onKeyDown}
            className="max-h-[50vh] select-text overflow-y-auto rounded-lg border border-border bg-surface p-3 text-sm leading-7 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {paragraphs.map((para, pi) => (
              <p key={pi} className={pi > 0 ? 'mt-3' : ''}>
                {para.map((tok) => {
                  if (tok.kind === 'gap') {
                    if (tok.cut && !showCut) return null
                    return (
                      <button
                        key={`g${tok.index}`}
                        type="button"
                        data-testid="transcript-gap"
                        data-index={tok.index}
                        data-cut={tok.cut || undefined}
                        data-tooltip={tok.cut ? t('transcript.restoreGap') : t('transcript.cutGap')}
                        aria-label={
                          tok.cut
                            ? t('transcript.gapCut', { s: seconds(tok.durationMs) })
                            : t('transcript.gap', { s: seconds(tok.durationMs) })
                        }
                        onClick={() => toggleGap(tok)}
                        className={`mx-0.5 inline-flex select-none items-center rounded-md border px-1.5 text-[11px] leading-5 align-middle ${
                          tok.cut
                            ? 'border-dashed border-border text-muted/60 line-through'
                            : 'border-sky-500/40 bg-sky-500/10 text-sky-500 hover:bg-sky-500/20'
                        }`}
                      >
                        ⋯ {seconds(tok.durationMs)}
                      </button>
                    )
                  }
                  if (tok.cut && !showCut) return null
                  const isSelected = selectedSet.has(tok.index)
                  const isCurrent =
                    currentSource !== null &&
                    !tok.cut &&
                    currentSource >= tok.start &&
                    currentSource <= tok.end
                  const isPhrase = phraseSet.has(tok.index) && !tok.cut
                  return (
                    <span
                      key={tok.index}
                      role="button"
                      tabIndex={-1}
                      data-testid="transcript-word"
                      data-index={tok.index}
                      data-cut={tok.cut || undefined}
                      data-filler={tok.filler || undefined}
                      data-selected={isSelected || undefined}
                      data-current={isCurrent || undefined}
                      aria-pressed={isSelected}
                      onClick={(ev) => onWordClick(tok, ev)}
                      className={`cursor-pointer rounded px-0.5 ${
                        tok.cut
                          ? 'text-muted/60 line-through decoration-red-400/70 hover:bg-surface-2'
                          : isSelected
                            ? 'bg-accent text-white'
                            : isPhrase
                              ? 'bg-rose-500/20 ring-1 ring-rose-500/40'
                              : tok.filler
                                ? 'bg-amber-400/25 text-amber-600 dark:text-amber-300'
                                : 'hover:bg-surface-2'
                      } ${isCurrent ? 'underline decoration-accent decoration-2 underline-offset-4' : ''}`}
                    >
                      {tok.text}
                    </span>
                  )
                })}
              </p>
            ))}
          </div>
          <p className="text-[11px] text-muted">{t('transcript.hint')}</p>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted" htmlFor="transcript-phrase">
              {t('transcript.phrase')}
            </label>
            <div className="flex gap-2">
              <input
                id="transcript-phrase"
                value={phrase}
                data-testid="transcript-phrase"
                onChange={(e) => {
                  setPhrase(e.target.value)
                  setPhraseResult(null)
                }}
                placeholder={t('transcript.phrasePlaceholder')}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                className={button}
                data-testid="transcript-cut-phrase"
                disabled={phraseHits.length === 0}
                onClick={cutByPhrase}
              >
                <Scissors size={14} aria-hidden />
                {t('transcript.cutPhrase')}
              </button>
            </div>
            {phrase.trim() && phraseResult === null && (
              <p className="text-xs text-muted" data-testid="transcript-phrase-matches">
                {phraseHits.length === 0
                  ? t('transcript.phraseNone')
                  : t('transcript.phraseMatches', { count: findPhrase(words, phrase).length })}
              </p>
            )}
            {phraseResult !== null && (
              <p className="text-xs text-muted" data-testid="transcript-phrase-done">
                {phraseResult === 0
                  ? t('transcript.phraseNone')
                  : t('transcript.phraseDone', { count: phraseResult })}
              </p>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="text-xs text-red-500" data-testid="transcript-error">
          {error}
        </p>
      )}
    </div>
  )
}
