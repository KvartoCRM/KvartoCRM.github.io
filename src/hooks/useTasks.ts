import { useMutation, useQuery } from '@tanstack/react-query'
import type { Task, TaskStatus } from '../types'
import { crmQueryKeys, queryClient } from '../lib/queryClient'
import { fetchTasks, makeSavedTask, postponeTask, saveTask, setTaskStatus, trashTask } from '../lib/tasks'
import type { TaskUpsertInput } from '../lib/taskMapping'

type TaskContext = { previous?: Task[] }

export const useTasks = (userId?: string) => {
  const queryKey = crmQueryKeys.tasks(userId || 'anonymous')
  const query = useQuery<Task[]>({
    queryKey,
    queryFn: () => fetchTasks(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const beginOptimisticUpdate = async (updater: (tasks: Task[]) => Task[]): Promise<TaskContext> => {
    await queryClient.cancelQueries({ queryKey })
    const previous = queryClient.getQueryData<Task[]>(queryKey)
    queryClient.setQueryData<Task[]>(queryKey, current => updater(current || []))
    return { previous }
  }
  const restore = (context?: TaskContext) => {
    if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
  }
  const refreshRelated = async () => {
    await Promise.all([
      // Keep the optimistic task visible. An immediate refetch can finish from
      // stale device cache while a slow mobile response is still completing.
      queryClient.invalidateQueries({ queryKey, refetchType: 'none' }),
      userId ? queryClient.invalidateQueries({ queryKey: crmQueryKeys.overview(userId) }) : Promise.resolve(),
    ])
  }

  const saveMutation = useMutation({
    mutationFn: ({ input, taskId, id }: { input: TaskUpsertInput; taskId?: string; id: string }) => saveTask(userId!, input, taskId, id),
    onMutate: async ({ input, taskId, id }) => beginOptimisticUpdate(tasks => {
        const previous = tasks.find(task => task.id === taskId)
        const next = makeSavedTask(userId!, id, input, previous)
        return previous ? tasks.map(task => task.id === taskId ? next : task) : [...tasks, next]
      }),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  const statusMutation = useMutation({
    mutationFn: ({ task, status }: { task: Task; status: TaskStatus }) => setTaskStatus(userId!, task, status),
    onMutate: ({ task, status }) => beginOptimisticUpdate(tasks => tasks.map(item => item.id === task.id ? {
      ...item,
      status,
      isCompleted: status === 'done',
      completedAt: status === 'done' ? new Date().toISOString() : undefined,
    } : item)),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  const postponeMutation = useMutation({
    mutationFn: ({ task, dueDate, dueTime }: { task: Task; dueDate: string; dueTime: string }) => postponeTask(userId!, task, dueDate, dueTime),
    onMutate: ({ task, dueDate, dueTime }) => beginOptimisticUpdate(tasks => tasks.map(item => item.id === task.id ? { ...item, dueDate, dueTime } : item)),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  const trashMutation = useMutation({
    mutationFn: (taskId: string) => trashTask(userId!, taskId),
    onMutate: taskId => beginOptimisticUpdate(tasks => tasks.filter(task => task.id !== taskId)),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  return {
    ...query,
    saveTask: (input: TaskUpsertInput, taskId?: string) => saveMutation.mutateAsync({ input, taskId, id: taskId || crypto.randomUUID() }),
    updateStatus: statusMutation.mutateAsync,
    postpone: postponeMutation.mutateAsync,
    removeTask: trashMutation.mutateAsync,
    mutationPending: saveMutation.isPending || statusMutation.isPending || postponeMutation.isPending || trashMutation.isPending,
  }
}
