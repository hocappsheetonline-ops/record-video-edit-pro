import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../components/PageHeader'

export function ComingSoonPage({ section, phase }: { section: 'editor' | 'live'; phase: string }) {
  const { t } = useTranslation()
  return (
    <div className="p-8">
      <PageHeader title={t(`${section}.title`)} description={t(`${section}.description`)} />
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-surface p-6 text-sm text-muted">
        <Sparkles size={18} aria-hidden />
        {t('comingSoon', { phase: `${t('phase')} ${phase}` })}
      </div>
    </div>
  )
}
