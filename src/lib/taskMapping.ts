import type { Priority, Task, TaskStatus } from '../types'

export type TaskQuadrant = NonNullable<Task['eisenhowerQuadrant']>
export type TaskSmartCriteria = NonNullable<Task['smartCriteria']>

export type TaskUpsertInput = {
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  completedAt?: string | null
  dueDate?: string
  dueTime?: string
  smartCriteria: TaskSmartCriteria
  eisenhowerQuadrant: TaskQuadrant
  recurrenceRule?: NonNullable<Task['recurrenceRule']>
  parentTaskId?: string
  subtasks?: NonNullable<Task['subtasks']>
}

type CloudTaskRow = Record<string, unknown>

export const withoutMissingTaskColumn = (payload: Record<string, unknown>, error: { code?: string; message?: string } | null) => {
  if (error?.code !== 'PGRST204') return null
  const column = error.message?.match(/Could not find the '([^']+)' column/)?.[1]
  if (!column || !(column in payload)) return null
  const next = { ...payload }
  delete next[column]
  return next
}

export const mapTaskRow = (row: CloudTaskRow): Task => ({
  id: String(row.id),
  userId: typeof row.user_id === 'string' ? row.user_id : undefined,
  title: typeof row.title === 'string' ? row.title : '',
  description: typeof row.description === 'string' ? row.description : undefined,
  status: row.status === 'inprogress' || row.status === 'done' ? row.status : 'todo',
  priority: row.priority === 'low' || row.priority === 'high' ? row.priority : 'medium',
  dueDate: typeof row.due_date === 'string' ? row.due_date : undefined,
  dueTime: typeof row.due_time === 'string' ? row.due_time : undefined,
  isFavorite: Boolean(row.is_favorite),
  isCompleted: Boolean(row.is_completed),
  createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  completedAt: typeof row.completed_at === 'string' ? row.completed_at : undefined,
  smartCriteria: row.smart_criteria && typeof row.smart_criteria === 'object' ? row.smart_criteria as TaskSmartCriteria : {},
  eisenhowerQuadrant: row.eisenhower_quadrant === 'do' || row.eisenhower_quadrant === 'delegate' || row.eisenhower_quadrant === 'eliminate'
    ? row.eisenhower_quadrant
    : 'plan',
  recurrenceRule: row.recurrence_rule === 'daily' || row.recurrence_rule === 'weekly' || row.recurrence_rule === 'monthly' ? row.recurrence_rule : 'none',
  parentTaskId: typeof row.parent_task_id === 'string' ? row.parent_task_id : undefined,
  subtasks: Array.isArray(row.subtasks) ? row.subtasks.flatMap((item, index) => item && typeof item === 'object'
    ? [{ id: typeof (item as Record<string, unknown>).id === 'string' ? String((item as Record<string, unknown>).id) : `subtask-${index}`, title: typeof (item as Record<string, unknown>).title === 'string' ? String((item as Record<string, unknown>).title) : '', completed: Boolean((item as Record<string, unknown>).completed) }]
    : []).filter(item => item.title) : [],
  deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : undefined,
})

export const taskFromInput = (userId: string, id: string, input: TaskUpsertInput, previous?: Task): Task => ({
  ...previous,
  id,
  userId,
  title: input.title,
  description: input.description || undefined,
  status: input.status,
  priority: input.priority,
  dueDate: input.dueDate,
  dueTime: input.dueTime,
  isFavorite: previous?.isFavorite ?? false,
  isCompleted: input.status === 'done',
  createdAt: previous?.createdAt || new Date().toISOString(),
  completedAt: input.status === 'done' ? previous?.completedAt || new Date().toISOString() : undefined,
  smartCriteria: input.smartCriteria,
  eisenhowerQuadrant: input.eisenhowerQuadrant,
  recurrenceRule: input.recurrenceRule || 'none',
  parentTaskId: input.parentTaskId || previous?.parentTaskId,
  subtasks: input.subtasks || [],
})

export const nextRecurringDate = (dueDate: string | undefined, recurrence: NonNullable<Task['recurrenceRule']>, now = new Date()) => {
  if (recurrence === 'none') return undefined
  const source = dueDate ? new Date(`${dueDate}T12:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  if (Number.isNaN(source.getTime())) return undefined
  if (recurrence === 'daily') source.setDate(source.getDate() + 1)
  if (recurrence === 'weekly') source.setDate(source.getDate() + 7)
  if (recurrence === 'monthly') source.setMonth(source.getMonth() + 1)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${source.getFullYear()}-${pad(source.getMonth() + 1)}-${pad(source.getDate())}`
}
