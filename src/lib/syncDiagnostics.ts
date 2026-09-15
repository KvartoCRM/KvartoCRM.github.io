import type { OfflineQueueIssue } from './offlineTransport'

const tableLabels: Record<string, string> = {
  clients: 'Контакт',
  properties: 'Объект',
  tasks: 'Задача',
  events: 'Событие',
  deals: 'Сделка',
  crm_files: 'Файл',
  monthly_plans: 'План',
}

export const describeQueueIssue = (issue: OfflineQueueIssue) => ({
  entity: tableLabels[issue.table] || 'Запись',
  reason: /HTTP 401|HTTP 403/.test(issue.lastError || '')
    ? 'Требуется повторный вход в аккаунт'
    : /HTTP 409/.test(issue.lastError || '')
      ? 'Данные изменились на другом устройстве'
      : /HTTP 4\d\d/.test(issue.lastError || '')
        ? 'Сервер отклонил данные записи'
        : /HTTP 5\d\d|timeout|abort|network|fetch/i.test(issue.lastError || '')
          ? 'Сервер временно не отвечает'
          : 'Отправка будет повторена',
})

export const isNetworkFailure = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const value = error as { message?: unknown; status?: unknown; name?: unknown }
  const status = Number(value.status)
  if (Number.isFinite(status) && status >= 500) return true
  if (Number.isFinite(status) && status >= 400) return false
  return /fetch|network|timeout|timed out|abort|failed to connect|load failed/i.test(
    [value.name, value.message].filter(Boolean).join(' '),
  )
}
