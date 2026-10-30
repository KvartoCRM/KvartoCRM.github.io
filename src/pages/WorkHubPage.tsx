import TodayWorkspace from '../components/TodayWorkspace'
import { lazy, Suspense } from 'react'
import { CalendarDays, CheckSquare, Clock3, Phone } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { routeLoaders } from '../lib/routeLoaders'

const CalendarPage = lazy(routeLoaders.calendar)
const TasksPage = lazy(routeLoaders.tasks)
const CallsPage = lazy(routeLoaders.calls)
const MonthlyPlanPage = lazy(routeLoaders.plan)

type WorkView = 'today' | 'calendar' | 'tasks' | 'calls' | 'plan'

const workViews: Array<{ id: WorkView; label: string; icon: typeof Clock3 }> = [
  { id: 'today', label: 'Сегодня', icon: Clock3 },
  { id: 'calendar', label: 'Календарь', icon: CalendarDays },
  { id: 'tasks', label: 'Задачи', icon: CheckSquare },
  { id: 'calls', label: 'Звонки', icon: Phone },
  { id: 'plan', label: 'План', icon: CalendarDays },
]

const WorkHubPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get('view') as WorkView | null
  const activeView = workViews.some(view => view.id === requestedView) ? requestedView! : 'today'

  const content = activeView === 'today' ? <TodayWorkspace />
    : activeView === 'calendar' ? <CalendarPage />
      : activeView === 'tasks' ? <TasksPage />
        : activeView === 'calls' ? <CallsPage />
          : <MonthlyPlanPage />

  return (
    <div className="space-y-6">
      <div>
        <p className="lumi-accent-text text-sm font-semibold">Единый рабочий центр</p>
        <h1 className="lumi-text mt-1 text-3xl font-bold">Дела</h1>
        <p className="lumi-muted mt-2">Сегодняшний фокус, календарь, задачи, звонки и план в одном разделе.</p>
      </div>
      <div className="lumi-panel flex flex-wrap gap-2 rounded-2xl border p-2" role="tablist" aria-label="Разделы рабочих дел">
        {workViews.map(view => {
          const Icon = view.icon
          return <button key={view.id} type="button" role="tab" aria-selected={activeView === view.id} onClick={() => setSearchParams(view.id === 'today' ? {} : { view: view.id })} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold sm:flex-none sm:px-4 ${activeView === view.id ? 'lumi-nav-item-active' : 'lumi-nav-item'}`}><Icon className="h-4 w-4" />{view.label}</button>
        })}
      </div>
      <Suspense fallback={<div className="lumi-muted py-20 text-center">Загружаем раздел…</div>}>{content}</Suspense>
    </div>
  )
}

export default WorkHubPage
