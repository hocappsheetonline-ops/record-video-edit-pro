import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Theme } from '@lumora/core'
import { Sidebar } from './components/Sidebar'
import { EditorPage } from './pages/EditorPage'
import { LivePage } from './pages/LivePage'
import { ProjectsPage } from './pages/ProjectsPage'
import { RecordPage } from './pages/RecordPage'
import { SettingsPage } from './pages/SettingsPage'
import { lumora } from './api'
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
  const showProject = useAppStore((s) => s.showProject)

  useEffect(() => {
    void init()
  }, [init])

  // Quay xong: mở ngay dự án vừa lưu.
  useEffect(() => lumora().onRecordingFinished((folder) => showProject(folder)), [showProject])

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
      <main
        className={`flex-1 ${page === 'editor' || page === 'live' ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        {page === 'record' && <RecordPage />}
        {page === 'projects' && <ProjectsPage />}
        {page === 'editor' && <EditorPage />}
        {page === 'live' && <LivePage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
