import { useState } from 'react'
import { BellRing, Building2, Check, ChevronLeft, ChevronRight, LayoutDashboard, Palette, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const steps = [
  {
    icon: LayoutDashboard,
    title: 'Вся работа — в одном офисе',
    text: 'Объекты, клиенты, задачи, встречи, документы и аналитика синхронизируются между вашими устройствами.',
    points: ['Добавляйте собственников и покупателей', 'Связывайте объекты, файлы и историю контактов', 'Следите за ближайшими делами на дашборде'],
  },
  {
    icon: Building2,
    title: 'Начните с базы',
    text: 'Создайте первый объект или контакт и начните вести рабочую базу.',
    points: ['Объекты появляются сверху списка', 'Избранное и архив доступны на всех устройствах', 'Фото и документы доступны из карточек'],
  },
  {
    icon: Palette,
    title: 'Настройте KvartoCRM под себя',
    text: 'Выберите тему, плотность интерфейса, размер значков и положение навигации в разделе «Настройки».',
    points: ['Пять цветовых тем', 'Компактный и просторный режимы', 'Навигация слева или справа'],
  },
  {
    icon: BellRing,
    title: 'Не пропускайте важное',
    text: 'Разрешите уведомления на каждом нужном устройстве. Настроить их можно позже в любой момент.',
    points: ['Напоминания о задачах и встречах', 'Уведомления о новых заявках', 'Единый центр уведомлений'],
  },
]

const WelcomeModal = () => {
  const { user, completeOnboarding } = useAuth()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  if (!user || user.onboardingCompleted) return null

  const current = steps[step]
  const Icon = current.icon

  const finish = async () => {
    setSaving(true)
    await completeOnboarding()
    setSaving(false)
  }

  return (
    <div className="lumi-shell fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/65 p-2 backdrop-blur-sm sm:p-4">
      <div className="lumi-panel flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="lumi-gradient-button relative shrink-0 p-5 text-center sm:p-8">
          <button
            type="button"
            disabled={saving}
            onClick={() => void finish()}
            className="absolute right-4 top-4 rounded-lg bg-black/15 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-black/25 disabled:opacity-60"
          >
            Пропустить
          </button>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 sm:h-14 sm:w-14">
            <Icon className="h-7 w-7" />
          </div>
          <p className="mt-4 text-sm font-medium text-white/75">Шаг {step + 1} из {steps.length}</p>
          <h1 className="mt-2 pr-16 text-xl font-bold sm:pr-0 sm:text-3xl">{current.title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/80 sm:text-base">{current.text}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-8">
          <div className="grid gap-3 sm:grid-cols-3">
            {current.points.map(point => (
              <div key={point} className="lumi-panel-muted rounded-2xl border p-4">
                <Check className="lumi-accent-text mb-3 h-5 w-5" />
                <p className="lumi-muted-strong text-sm leading-5">{point}</p>
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="lumi-accent-soft mt-5 flex items-start gap-3 rounded-2xl p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm leading-6">Каждый пользователь видит только данные своего офиса.</p>
            </div>
          )}

          <div className="mt-7 flex items-center justify-between gap-3">
            <button type="button" disabled={step === 0} onClick={() => setStep(value => value - 1)} className="lumi-control inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:invisible">
              <ChevronLeft className="h-4 w-4" /> Назад
            </button>
            <div className="flex gap-2">
              {steps.map((_, index) => <span key={index} className={`h-2 rounded-full transition-all ${index === step ? 'lumi-accent-bg w-7' : 'lumi-control w-2'}`} />)}
            </div>
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => setStep(value => value + 1)} className="lumi-gradient-button inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold">
                Далее <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" disabled={saving} onClick={() => void finish()} className="lumi-gradient-button inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-60">
                <Users className="h-4 w-4" /> {saving ? 'Сохраняем…' : 'Начать работу'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default WelcomeModal
