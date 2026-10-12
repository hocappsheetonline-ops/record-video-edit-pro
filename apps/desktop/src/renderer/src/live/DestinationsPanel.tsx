import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isValidServer, PLATFORM_SERVERS, PLATFORMS, type Platform } from '@lumora/core'
import { useLiveStore } from './store'

const input = 'w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm'

export function DestinationsPanel() {
  const { t } = useTranslation()
  const config = useLiveStore((s) => s.config)
  const secrets = useLiveStore((s) => s.secrets)
  const phase = useLiveStore((s) => s.phase)
  const status = useLiveStore((s) => s.status)
  const setConfig = useLiveStore((s) => s.setConfig)
  const setSecret = useLiveStore((s) => s.setSecret)
  const [platform, setPlatform] = useState<Platform>('youtube')
  const [name, setName] = useState('')
  const [server, setServer] = useState(PLATFORM_SERVERS.youtube)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!config) return null
  const locked = phase !== 'idle'

  const add = async () => {
    if (!isValidServer(server)) return setError(t('live.dest.badServer'))
    const id = `d${Date.now().toString(36)}`
    await setConfig({
      destinations: [
        ...config.destinations,
        {
          id,
          platform,
          name: name.trim() || t(`live.platforms.${platform}`),
          server: server.trim(),
          enabled: true,
        },
      ],
    })
    if (key.trim()) await setSecret(`stream:${id}`, key.trim())
    setName('')
    setKey('')
    setError(null)
  }

  return (
    <div className="flex flex-col gap-4" data-testid="destinations-panel">
      {config.destinations.length === 0 && (
        <p className="text-sm text-muted">{t('live.dest.empty')}</p>
      )}
      <ul className="flex flex-col gap-2">
        {config.destinations.map((d) => {
          const state = status?.destinations[d.id]
          return (
            <li
              key={d.id}
              className="rounded-lg border border-border p-3 text-sm"
              data-testid="destination"
            >
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    checked={d.enabled}
                    disabled={locked}
                    onChange={(e) =>
                      void setConfig({
                        destinations: config.destinations.map((x) =>
                          x.id === d.id ? { ...x, enabled: e.target.checked } : x,
                        ),
                      })
                    }
                  />
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-muted">{t(`live.platforms.${d.platform}`)}</span>
                </label>
                {state && (
                  <span
                    data-testid={`dest-state-${d.id}`}
                    className={`text-xs ${state.state === 'live' ? 'text-success' : state.state === 'error' ? 'text-danger' : 'text-muted'}`}
                    title={state.message}
                  >
                    {t(`live.dest.states.${state.state}`)}
                  </span>
                )}
              </div>
              <div className="mt-1 truncate font-mono text-xs text-muted">{d.server}</div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className={secrets?.streamKeys[d.id] ? 'text-success' : 'text-amber-400'}>
                  {secrets?.streamKeys[d.id] ? t('live.dest.keySaved') : t('live.dest.keyMissing')}
                </span>
                <button
                  type="button"
                  disabled={locked}
                  className="text-danger hover:underline disabled:opacity-40"
                  onClick={() =>
                    void setConfig({
                      destinations: config.destinations.filter((x) => x.id !== d.id),
                    })
                  }
                >
                  {t('live.dest.remove')}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
        <h4 className="text-sm font-medium">{t('live.dest.add')}</h4>
        <select
          className={input}
          value={platform}
          data-testid="dest-platform"
          onChange={(e) => {
            const p = e.target.value as Platform
            setPlatform(p)
            setServer(PLATFORM_SERVERS[p])
          }}
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {t(`live.platforms.${p}`)}
            </option>
          ))}
        </select>
        <input
          className={input}
          placeholder={t('live.dest.name')}
          value={name}
          data-testid="dest-name"
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={input}
          placeholder="rtmp://…"
          value={server}
          data-testid="dest-server"
          onChange={(e) => setServer(e.target.value)}
        />
        <input
          className={input}
          type="password"
          placeholder={t('live.dest.key')}
          value={key}
          data-testid="dest-key"
          onChange={(e) => setKey(e.target.value)}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="button"
          data-testid="dest-add"
          disabled={locked}
          onClick={() => void add()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {t('live.dest.addButton')}
        </button>
      </div>
    </div>
  )
}
