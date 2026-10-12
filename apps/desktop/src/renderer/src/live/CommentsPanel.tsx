import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveStore } from './store'

const input = 'w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm'

export function CommentsPanel() {
  const { t } = useTranslation()
  const config = useLiveStore((s) => s.config)
  const secrets = useLiveStore((s) => s.secrets)
  const comments = useLiveStore((s) => s.comments)
  const featuredId = useLiveStore((s) => s.featuredId)
  const running = useLiveStore((s) => s.commentsRunning)
  const error = useLiveStore((s) => s.commentError)
  const { setConfig, setSecret, toggleComments, feature } = useLiveStore.getState()
  const [ytKey, setYtKey] = useState('')
  const [fbToken, setFbToken] = useState('')
  if (!config) return null

  const start = async () => {
    if (ytKey) await setSecret('youtube-api-key', ytKey)
    if (fbToken) await setSecret('facebook-token', fbToken)
    setYtKey('')
    setFbToken('')
    const platforms: ('youtube' | 'facebook')[] = []
    if (config.youtubeVideoId) platforms.push('youtube')
    if (config.facebookVideoId) platforms.push('facebook')
    await toggleComments(platforms)
  }

  return (
    <div className="flex flex-col gap-4" data-testid="comments-panel">
      <div className="flex flex-col gap-2 text-sm">
        <span className="font-medium">YouTube</span>
        <input
          className={input}
          placeholder={t('live.comments.ytVideo')}
          defaultValue={config.youtubeVideoId}
          data-testid="yt-video"
          onBlur={(e) => void setConfig({ youtubeVideoId: e.target.value })}
        />
        <input
          className={input}
          type="password"
          placeholder={secrets?.youtubeApiKey ? t('live.comments.saved') : t('live.comments.ytKey')}
          value={ytKey}
          data-testid="yt-key"
          onChange={(e) => setYtKey(e.target.value)}
        />
        <span className="font-medium">Facebook</span>
        <input
          className={input}
          placeholder={t('live.comments.fbVideo')}
          defaultValue={config.facebookVideoId}
          onBlur={(e) => void setConfig({ facebookVideoId: e.target.value })}
        />
        <input
          className={input}
          type="password"
          placeholder={
            secrets?.facebookToken ? t('live.comments.saved') : t('live.comments.fbToken')
          }
          value={fbToken}
          onChange={(e) => setFbToken(e.target.value)}
        />
        <button
          type="button"
          data-testid="comments-toggle"
          onClick={() => void (running ? toggleComments([]) : start())}
          className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg"
        >
          {running ? t('live.comments.stop') : t('live.comments.start')}
        </button>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      {featuredId && (
        <button
          type="button"
          onClick={() => feature(null)}
          className="self-start text-xs text-accent hover:underline"
        >
          {t('live.comments.hide')}
        </button>
      )}
      <ul className="flex flex-col gap-2" data-testid="comments-list">
        {[...comments].reverse().map((c) => (
          <li
            key={c.id}
            className={`rounded-lg border p-2 text-sm ${featuredId === c.id ? 'border-accent bg-accent/10' : 'border-border'}`}
            data-testid="comment"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-xs font-semibold ${c.platform === 'youtube' ? 'text-red-400' : 'text-blue-400'}`}
              >
                {c.author}
              </span>
              <button
                type="button"
                data-testid="comment-feature"
                className="text-xs text-accent hover:underline"
                onClick={() => feature(featuredId === c.id ? null : c)}
              >
                {featuredId === c.id ? t('live.comments.hide') : t('live.comments.show')}
              </button>
            </div>
            <p>{c.text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
