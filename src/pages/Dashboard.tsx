import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Archive,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  FileText,
  FileDown,
  Heart,
  Home,
  Image,
  LogOut,
  Menu,
  Phone,
  Settings,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { completeOverviewItem } from '../lib/crm'
import { syncNativeReminders } from '../lib/nativeReminders'
import { printCurrentPage } from '../lib/print'
import { preloadCoreRoutes, preloadRoute } from '../lib/routeLoaders'
import { desktopNavigationGroups, isNavigationItemActive } from '../lib/navigation'
import { useCrmOverview } from '../hooks/useCrmOverview'
import BrandLogo from '../components/BrandLogo'
import ThemeSwitcher from '../components/ThemeSwitcher'
import InstallAppButton from '../components/InstallAppButton'
import NotificationCenter from '../components/NotificationCenter'
import OfflineSyncStatus from '../components/OfflineSyncStatus'
import GlobalSearch from '../components/GlobalSearch'
import ProfileMenu from '../components/ProfileMenu'
import WorkspaceRefreshButton from '../components/WorkspaceRefreshButton'

const DashboardAnalytics = lazy(() => import('../components/DashboardAnalytics'))

interface DashboardProps {
  children?: ReactNode
}

const navigationIcons: Record<string, typeof Home> = {
  '/': Home,
  '/work': CheckSquare,
  '/deals': BriefcaseBusiness,
  '/contacts': Users,
  '/properties': Building2,
  '/documents': FileText,
  '/gallery': Image,
  '/favorites': Star,
  '/archive': Archive,
  '/trash': Trash2,
  '/settings': Settings,
}

const formatDate = (value?: string) => {
  if (!value) return 'Без срока'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

const Dashboard = ({ children }: DashboardProps) => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isHome = location.pathname === '/'
  const { data, loading, error, reload } = useCrmOverview(isHome)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [dashboardMode, setDashboardMode] = useState<'sale' | 'rent' | 'mortgage'>('sale')
  const [analyticsReady, setAnalyticsReady] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!isHome) return
    const idleWindow = window as Window & { requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number; cancelIdleCallback?: (handle: number) => void }
    const show = () => setAnalyticsReady(true)
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(show, { timeout: 2200 })
      return () => idleWindow.cancelIdleCallback?.(handle)
    }
    const handle = window.setTimeout(show, 1200)
    return () => window.clearTimeout(handle)
  }, [isHome])

  useEffect(() => {
    const idleWindow = window as Window & { requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number; cancelIdleCallback?: (handle: number) => void }
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => preloadCoreRoutes(), { timeout: 3500 })
      return () => idleWindow.cancelIdleCallback?.(handle)
    }
    const handle = window.setTimeout(() => preloadCoreRoutes(), 1800)
    return () => window.clearTimeout(handle)
  }, [])

  useEffect(() => {
    if (!user) return
    const sync = () => void syncNativeReminders(user.id).catch(() => undefined)
    sync()
    window.addEventListener('lumicrm:data-synced', sync)
    window.addEventListener('lumicrm:remote-data-changed', sync)
    window.addEventListener('online', sync)
    return () => {
      window.removeEventListener('lumicrm:data-synced', sync)
      window.removeEventListener('lumicrm:remote-data-changed', sync)
      window.removeEventListener('online', sync)
    }
  }, [user])

  const agenda = useMemo(() => {
    const tasks = data.tasks.map(task => ({
      id: task.id,
      kind: 'task' as const,
      title: task.title,
      date: task.dueDate,
      subtitle: `${task.priority === 'high' ? 'Высокий приоритет' : 'Задача'}${task.dueTime ? ` в ${task.dueTime.slice(0, 5)}` : ''}`,
    }))
    const events = data.events.map(event => ({
      id: event.id,
      kind: 'event' as const,
      eventType: event.type,
      title: event.title,
      date: event.eventDate,
      subtitle: event.eventTime
        ? `${event.type === 'call' ? 'Звонок' : 'Встреча'} в ${event.eventTime.slice(0, 5)}`
        : event.type === 'call' ? 'Звонок' : 'Встреча',
    }))

    return [...tasks, ...events]
      .sort((a, b) => (a.date ?? '9999-12-31').localeCompare(b.date ?? '9999-12-31'))
      .slice(0, 8)
  }, [data.events, data.tasks])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleComplete = async (kind: 'task' | 'event', id: string) => {
    if (!user) return
    setCompletingId(id)
    try {
      await completeOverviewItem(kind, id, user.id)
      await reload()
    } finally {
      setCompletingId(null)
    }
  }

  const stats = [
    { label: 'Собственники', value: data.owners, icon: Users, color: 'from-blue-500 to-cyan-500' },
    { label: 'Покупатели', value: data.buyers, icon: Heart, color: 'from-pink-500 to-rose-500' },
    { label: 'Объекты', value: data.properties, icon: Building2, color: 'from-violet-500 to-purple-500' },
    { label: 'Активные сделки', value: data.activeDeals, icon: BriefcaseBusiness, color: 'from-amber-500 to-orange-500' },
  ]

  const chartConfig = {
    sale: { firstKey: 'sellers', secondKey: 'buyers', firstLabel: 'Собственники', secondLabel: 'Покупатели', firstColor: '#f43f5e', secondColor: '#22c55e' },
    rent: { firstKey: 'landlords', secondKey: 'tenants', firstLabel: 'Арендодатели', secondLabel: 'Арендаторы', firstColor: '#8b5cf6', secondColor: '#06b6d4' },
    mortgage: { firstKey: 'mortgageLeads', secondKey: 'buyers', firstLabel: 'Ипотечные заявки', secondLabel: 'Все покупатели', firstColor: '#f59e0b', secondColor: '#22c55e' },
  }[dashboardMode]
  const currentAnalytics = data.analytics.months[data.analytics.months.length - 1]
  const currentContacts = currentAnalytics
    ? Number(currentAnalytics[chartConfig.firstKey as keyof typeof currentAnalytics]) + Number(currentAnalytics[chartConfig.secondKey as keyof typeof currentAnalytics])
    : 0
  const currentObjects = currentAnalytics
    ? dashboardMode === 'rent' ? currentAnalytics.rentProperties : currentAnalytics.saleProperties
    : 0

  const renderHome = () => (
    <div className="space-y-6">
      <div>
        <div>
          <p className="lumi-accent-text mb-1 text-sm font-medium">Ваш офис недвижимости</p>
          <h1 className="lumi-text text-3xl font-bold">
            Добро пожаловать, {user?.firstName || 'в ваш офис'}
          </h1>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-900/60 bg-red-950/30 p-4 text-red-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Данные временно недоступны</p>
            <p className="mt-1 text-sm text-red-300/80">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="lumi-panel lumi-showcase rounded-2xl border p-5 transition-opacity"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="lumi-muted text-sm">{stat.label}</p>
                  <p className="lumi-text mt-2 text-3xl font-bold">{loading ? '—' : stat.value}</p>
                </div>
                <div className={`lumi-showcase-icon rounded-2xl bg-gradient-to-br ${stat.color} p-3`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <section className="lumi-panel lumi-showcase overflow-hidden rounded-2xl border">
        <div className="lumi-border flex flex-col border-b sm:flex-row">
          {([
            ['sale', 'Купля-продажа'],
            ['rent', 'Аренда'],
            ['mortgage', 'Заявки на ипотеку'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setDashboardMode(mode)}
              className={`px-6 py-4 text-sm font-semibold uppercase tracking-wide transition ${dashboardMode === mode ? 'lumi-accent-bg' : 'lumi-nav-item'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="lumi-kpi-grid grid grid-cols-2 gap-px lg:grid-cols-3">
          {[
            ['Новые контакты за месяц', currentContacts],
            ['Новые объекты за месяц', currentObjects],
            ['Активные сделки', data.activeDeals],
            ['Итоговая сумма закрытых сделок', `${data.analytics.totalDealVolume.toLocaleString('ru-RU')} ₽`],
            ['Приход агентства', `${data.analytics.totalAgencyIncome.toLocaleString('ru-RU')} ₽`],
            ['Доход агента', `${data.analytics.totalAgentIncome.toLocaleString('ru-RU')} ₽`],
          ].map(([label, value]) => (
            <div key={String(label)} className="px-5 py-4">
              <p className="lumi-muted text-xs uppercase tracking-wide">{label}</p>
              <p className="lumi-text mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {data.analytics.incompleteFinanceDeals > 0 && (
          <div className="border-t border-amber-500/25 bg-amber-500/10 px-5 py-3 text-sm text-amber-300">
            Финансы не заполнены у закрытых сделок: {data.analytics.incompleteFinanceDeals}. Откройте их в разделе «Сделки» и укажите приход агентства и доход агента.
          </div>
        )}

        {analyticsReady
          ? <Suspense fallback={<div className="lumi-muted p-8 text-center">Загружаем аналитику…</div>}><DashboardAnalytics analytics={data.analytics} config={chartConfig} /></Suspense>
          : <div className="lumi-muted p-8 text-center">Аналитика появится после загрузки основных данных…</div>}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="lumi-panel lumi-showcase rounded-2xl border p-6 xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="lumi-text text-xl font-semibold">Ближайшие дела</h2>
              <p className="lumi-muted mt-1 text-sm">Задачи, звонки и встречи в одной ленте</p>
            </div>
            <Link to="/calendar" className="lumi-accent-text text-sm font-medium">К календарю</Link>
          </div>

          <div className="space-y-3">
            {!loading && agenda.length === 0 && (
              <div className="lumi-border lumi-muted rounded-xl border border-dashed py-10 text-center">
                Ближайших дел пока нет
              </div>
            )}
            {agenda.map(item => {
              const Icon = item.kind === 'task'
                ? CheckSquare
                : item.eventType === 'call' ? Phone : CalendarDays
              return (
                <div key={`${item.kind}-${item.id}`} className="lumi-panel-muted flex items-center gap-4 rounded-xl border p-4">
                  <div className="lumi-accent-soft rounded-xl p-2.5">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="lumi-text truncate font-medium">{item.title}</p>
                    <p className="lumi-muted mt-1 text-sm">{item.subtitle} · {formatDate(item.date)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleComplete(item.kind, item.id)}
                    disabled={completingId === item.id}
                    title="Отметить выполненным"
                    className="rounded-lg p-2 text-gray-500 transition hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        <section className="lumi-panel lumi-showcase rounded-2xl border p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="lumi-text text-xl font-semibold">Новые объекты</h2>
              <p className="lumi-muted mt-1 text-sm">Последние записи базы</p>
            </div>
            <Link to="/properties" className="lumi-accent-text text-sm font-medium">Все</Link>
          </div>
          <div className="space-y-3">
            {!loading && data.recentProperties.length === 0 && (
              <div className="lumi-border lumi-muted rounded-xl border border-dashed py-10 text-center">
                Объектов пока нет
              </div>
            )}
            {data.recentProperties.map(property => (
              <button
                type="button"
                key={property.id}
                onClick={() => navigate(`/properties/${property.id}`)}
                className="lumi-panel-muted w-full rounded-xl border p-4 text-left transition"
              >
                <p className="lumi-text truncate font-medium">{property.address}</p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="lumi-muted">{property.status}</span>
                  <span className="lumi-muted-strong font-medium">
                    {property.price ? `${property.price.toLocaleString('ru-RU')} ₽` : 'Цена не указана'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )

  return (
    <div className="lumi-shell flex h-screen">
      <aside
        className={`lumi-sidebar hidden shrink-0 flex-col md:flex ${user?.preferences.navigationPosition === 'right' ? 'order-2 border-l' : 'order-1 border-r'}`}
        style={{ width: user?.preferences.density === 'compact' ? '14rem' : user?.preferences.density === 'spacious' ? '18rem' : '16rem' }}
      >
        <div className="p-6">
          <Link to="/" className="flex items-center gap-3">
            <BrandLogo />
          </Link>
          <p className="lumi-muted mt-3 text-xs uppercase tracking-[0.18em]">Ваш офис недвижимости</p>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {desktopNavigationGroups.map(group => (
            <section key={group.id}>
              <p className="lumi-muted mb-1 px-4 text-[0.65rem] font-semibold uppercase tracking-[0.16em]">{group.label}</p>
              <div className="space-y-1">
                {group.items.map(item => {
                  const Icon = navigationIcons[item.id]
                  const active = isNavigationItemActive(location.pathname, item)
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => navigate(item.id)}
                      onPointerEnter={() => preloadRoute(item.id)}
                      onFocus={() => preloadRoute(item.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm transition ${active ? 'lumi-nav-item-active font-medium' : 'lumi-nav-item'}`}
                    >
                      <Icon className="shrink-0" style={{ width: 'var(--lumi-nav-icon-size)', height: 'var(--lumi-nav-icon-size)' }} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </nav>
        <div className="lumi-border border-t p-4">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-red-400 transition hover:bg-red-500/10"
          >
            <LogOut className="h-5 w-5" />
            Выйти
          </button>
        </div>
      </aside>

      <main className={`flex min-w-0 flex-1 flex-col overflow-hidden ${user?.preferences.navigationPosition === 'right' ? 'order-1' : 'order-2'}`}>
        <header className="lumi-header relative z-[60] flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur md:px-8 md:py-4 2xl:flex-nowrap">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="lumi-control order-1 inline-flex rounded-xl p-2.5 md:hidden"
            aria-label="Открыть главное меню"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="order-3 w-full min-w-0 md:order-none md:max-w-md 2xl:flex-1"><GlobalSearch /></div>
          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 md:order-none xl:gap-3">
            <OfflineSyncStatus />
            <WorkspaceRefreshButton />
            <InstallAppButton compact />
            <button type="button" onClick={() => void printCurrentPage()} className="lumi-control hidden rounded-xl p-2.5 sm:inline-flex" title="Сохранить страницу как PDF"><FileDown className="h-5 w-5" /></button>
            <span className="hidden sm:block"><ThemeSwitcher /></span>
            <NotificationCenter />
            <ProfileMenu />
          </div>
        </header>

        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 pb-8 md:p-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${location.pathname}${location.search}`}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            >
              {isHome ? renderHome() : children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {mobileMenuOpen && (
        <motion.div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true" aria-label="Главное меню">
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} type="button" className="absolute inset-0 bg-black/65" onClick={() => setMobileMenuOpen(false)} aria-label="Закрыть главное меню" />
          <motion.aside
            initial={reduceMotion ? false : { x: '-100%' }}
            animate={{ x: 0 }}
            exit={reduceMotion ? undefined : { x: '-100%' }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="lumi-sidebar absolute inset-y-0 left-0 flex w-[min(88vw,20rem)] flex-col border-r shadow-2xl"
          >
            <div className="lumi-border flex items-center justify-between border-b px-5 py-4">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3">
                <BrandLogo />
              </Link>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="lumi-control rounded-xl p-2.5" aria-label="Закрыть главное меню"><X className="h-5 w-5" /></button>
            </div>
            <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {desktopNavigationGroups.map(group => (
                <section key={group.id}>
                  <p className="lumi-muted mb-1 px-4 text-[0.65rem] font-semibold uppercase tracking-[0.16em]">{group.label}</p>
                  <div className="space-y-1">
                    {group.items.map(item => {
                      const Icon = navigationIcons[item.id]
                      const active = isNavigationItemActive(location.pathname, item)
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => { setMobileMenuOpen(false); navigate(item.id) }}
                          onPointerEnter={() => preloadRoute(item.id)}
                          onFocus={() => preloadRoute(item.id)}
                          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${active ? 'lumi-nav-item-active font-medium' : 'lumi-nav-item'}`}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </nav>
            <div className="lumi-border border-t p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <button type="button" onClick={() => void handleLogout()} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-red-400 transition hover:bg-red-500/10"><LogOut className="h-5 w-5" />Выйти</button>
            </div>
          </motion.aside>
        </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}

export default Dashboard
