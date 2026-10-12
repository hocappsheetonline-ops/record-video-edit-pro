import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Theme } from '@lumora/core'
import { Sidebar } from './components/Sidebar'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { SettingsPage } from './pages/SettingsPage'
import { useAppStore } from './store/app'

function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function App() {
  const { i18n } = useTranslation()
  const ready = useAppStore((s) => s.ready)
  const page = useAppStore((s) => s.page)
  const settings = useAppStore((s) => s.settings)
  const init = useAppStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (!settings) return
    void i18n.changeLanguage(settings.language)
    document.documentElement.lang = settings.language
    document.documentElement.dataset.theme = resolveTheme(settings.theme)
  }, [settings, i18n])

  if (!ready) return <div className="h-full bg-bg" />

  return (
    <div className="flex h-full bg-bg text-text">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {page === 'record' && <ComingSoonPage section="record" phase="1" />}
        {page === 'projects' && <ProjectsPage />}
        {page === 'editor' && <ComingSoonPage section="editor" phase="2" />}
        {page === 'live' && <ComingSoonPage section="live" phase="4" />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
