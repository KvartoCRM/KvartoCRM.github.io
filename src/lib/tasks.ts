import type { Task, TaskStatus } from '../types'
import { moveToTrash } from './trash'
import { mapTaskRow, nextRecurringDate, taskFromInput, withoutMissingTaskColumn, type TaskUpsertInput } from './taskMapping'
import { supabase } from './supabase'
import { fetchAllRows } from './pagination'

export const fetchTasks = async (userId: string): Promise<Task[]> => {
  const { data, error } = await fetchAllRows(() => supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('due_time', { ascending: true, nullsFirst: false }))
  if (error) throw error
  return (data || []).map(mapTaskRow)
}

const writeTask = async (userId: string, id: string, source: Record<string, unknown>, taskId?: string) => {
  let payload = source
  const targetId = taskId || id
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = taskId
      ? await supabase.from('tasks').update(payload).eq('id', taskId).eq('user_id', userId).select('id, user_id').maybeSingle()
      : await supabase.from('tasks').insert({ ...payload, id, user_id: userId }).select('id, user_id').maybeSingle()
    if (!result.error && result.data?.id === targetId && result.data.user_id === userId) return
    if (!result.error) throw new Error('Сервер не подтвердил сохранение задачи')
    const compatiblePayload = withoutMissingTaskColumn(payload, result.error)
    if (!compatiblePayload) throw result.error
    payload = compatiblePayload
  }
  throw new Error('Схема задач не поддерживает сохранение')
}

const confirmTask = async (userId: string, id: string) => {
  const { data, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Сервер не подтвердил сохранение задачи')
}

export const saveTask = async (userId: string, input: TaskUpsertInput, taskId?: string, newTaskId?: string) => {
  const id = taskId || newTaskId || crypto.randomUUID()
  const payload = {
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    due_date: input.dueDate || null,
    due_time: input.dueTime || null,
    smart_criteria: input.smartCriteria,
    eisenhower_quadrant: input.eisenhowerQuadrant,
    recurrence_rule: input.recurrenceRule || 'none',
    parent_task_id: input.parentTaskId || null,
    subtasks: input.subtasks || [],
    is_completed: input.status === 'done',
    completed_at: input.status === 'done' ? new Date().toISOString() : null,
  }
  await writeTask(userId, id, payload, taskId)
  await confirmTask(userId, id)
  return { id, input }
}

export const setTaskStatus = async (userId: string, task: Task, status: TaskStatus) => {
  const completedAt = status === 'done' ? new Date().toISOString() : null
  const { data, error } = await supabase
    .from('tasks')
    .update({ status, is_completed: status === 'done', completed_at: completedAt })
    .eq('id', task.id)
    .eq('user_id', userId)
    .select('id, user_id')
    .maybeSingle()
  if (error) throw error
  if (data?.id !== task.id || data.user_id !== userId) throw new Error('Сервер не подтвердил изменение статуса задачи')
  await confirmTask(userId, task.id)
  if (status === 'done' && task.recurrenceRule && task.recurrenceRule !== 'none') {
    const nextDueDate = nextRecurringDate(task.dueDate, task.recurrenceRule)
    await writeTask(userId, crypto.randomUUID(), {
      title: task.title,
      description: task.description || null,
      status: 'todo',
      priority: task.priority,
      due_date: nextDueDate || null,
      due_time: task.dueTime || null,
      smart_criteria: task.smartCriteria || {},
      eisenhower_quadrant: task.eisenhowerQuadrant || 'plan',
      recurrence_rule: task.recurrenceRule,
      parent_task_id: task.parentTaskId || task.id,
      subtasks: (task.subtasks || []).map(item => ({ ...item, id: crypto.randomUUID(), completed: false })),
      is_completed: false,
      completed_at: null,
    })
  }
  return { task, status, completedAt }
}

export const postponeTask = async (userId: string, task: Task, dueDate: string, dueTime: string) => {
  const { data, error } = await supabase
    .from('tasks')
    .update({ due_date: dueDate, due_time: dueTime })
    .eq('id', task.id)
    .eq('user_id', userId)
    .select('id, user_id')
    .maybeSingle()
  if (error) throw error
  if (data?.id !== task.id || data.user_id !== userId) throw new Error('Сервер не подтвердил перенос задачи')
  await confirmTask(userId, task.id)
  return { task, dueDate, dueTime }
}

export const trashTask = async (userId: string, taskId: string) => {
  await moveToTrash('tasks', taskId, userId)
  return taskId
}

export const makeSavedTask = (userId: string, id: string, input: TaskUpsertInput, previous?: Task) => taskFromInput(userId, id, input, previous)
