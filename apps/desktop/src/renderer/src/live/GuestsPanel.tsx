import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveStore } from './store'

function GuestVideo({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const engine = useLiveStore((s) => s.engine)
  useEffect(() => {
    const video = engine?.videoOf(id)
    const box = ref.current
    if (!video || !box) return
    video.className = 'h-full w-full rounded-md bg-black object-cover'
    video.dataset.testid = `guest-video-${id}`
    box.appendChild(video)
    return () => {
      if (video.parentElement === box) box.removeChild(video)
    }
  }, [engine, id])
  return <div ref={ref} className="aspect-video w-28 shrink-0" />
}

export function GuestsPanel() {
  const { t } = useTranslation()
  const room = useLiveStore((s) => s.room)
  const guests = useLiveStore((s) => s.guests)
  const stage = useLiveStore((s) => s.stage)
  const { openRoom, closeRoom, setGuestStage, kickGuest } = useLiveStore.getState()

  if (!room) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('live.guests.intro')}</p>
        <button
          type="button"
          data-testid="open-room"
          onClick={() => void openRoom()}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg"
        >
          {t('live.guests.open')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="guests-panel">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{t('live.guests.links')}</span>
        {room.inviteUrls.map((url, i) => (
          <div key={url} className="flex items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs"
              data-testid={i === room.inviteUrls.length - 1 ? 'invite-link-local' : 'invite-link'}
            >
              {url}
            </code>
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={() => void navigator.clipboard?.writeText(url)}
            >
              {t('live.guests.copy')}
            </button>
          </div>
        ))}
        <p className="text-xs text-muted">{t('live.guests.lanHint')}</p>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-medium">
          {t('live.guests.backstage', { count: guests.length })}
        </h4>
        {guests.length === 0 && <p className="text-xs text-muted">{t('live.guests.none')}</p>}
        <ul className="flex flex-col gap-2">
          {guests.map((g) => (
            <li
              key={g.id}
              className="flex items-center gap-3 rounded-lg border border-border p-2"
              data-testid="guest"
            >
              <GuestVideo id={g.id} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{g.name}</div>
                <div className="text-xs text-muted">
                  {stage[g.id]
                    ? t('live.guests.onStage')
                    : g.connected
                      ? t('live.guests.ready')
                      : t('live.guests.connecting')}
                </div>
                <div className="mt-1 flex gap-2 text-xs">
                  <button
                    type="button"
                    data-testid={`guest-stage-${g.id}`}
                    className="text-accent hover:underline"
                    onClick={() => setGuestStage(g.id, !stage[g.id])}
                  >
                    {stage[g.id] ? t('live.guests.offStage') : t('live.guests.toStage')}
                  </button>
                  <button
                    type="button"
                    className="text-danger hover:underline"
                    onClick={() => kickGuest(g.id)}
                  >
                    {t('live.guests.kick')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => void closeRoom()}
        className="self-start text-sm text-danger hover:underline"
      >
        {t('live.guests.close')}
      </button>
    </div>
  )
}
