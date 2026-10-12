import { useTranslation } from 'react-i18next'
import { PageHeader } from '../components/PageHeader'

export function ProjectsPage() {
  const { t } = useTranslation()
  return (
    <div className="p-8">
      <PageHeader title={t('projects.title')} description={t('projects.description')} />
      <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-sm text-muted">
        {t('projects.empty')}
      </p>
    </div>
  )
}
