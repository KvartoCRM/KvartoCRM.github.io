export type WorkspaceSearchResult = {
  id: string
  label: string
  subtitle: string
  group: string
  route: string
  kind: 'property' | 'client' | 'task' | 'event' | 'deal'
}

export type WorkspaceSearchRow = Record<string, unknown>

export const normalizeSearchTerm = (value: string) => value.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim()

export const buildWorkspaceSearchResults = (collections: WorkspaceSearchRow[][]): WorkspaceSearchResult[] => {
  const rows = (index: number) => collections[index] || []
  return [
    ...rows(0).map(property => ({
      id: String(property.id),
      label: String(property.address || 'Объект без адреса'),
      subtitle: property.price ? `${Number(property.price).toLocaleString('ru-RU')} ₽ · ${String(property.status || 'Объект')}` : String(property.status || 'Объект'),
      group: 'Объекты',
      route: `/properties/${String(property.id)}`,
      kind: 'property' as const,
    })),
    ...rows(1).map(client => {
      const roles = Array.isArray(client.roles) ? client.roles : []
      const isTenant = roles.includes('tenant')
      const isLandlord = roles.includes('landlord')
      const isBuyer = client.type === 'buyer'
      return {
        id: String(client.id),
        label: [client.last_name, client.first_name, client.middle_name].filter(Boolean).join(' ') || 'Без имени',
        subtitle: String(client.phone || client.email || 'Контакт'),
        group: isBuyer ? (isTenant ? 'Арендаторы' : 'Покупатели') : (isLandlord ? 'Арендодатели' : 'Собственники'),
        route: `/contacts?client=${String(client.id)}`,
        kind: 'client' as const,
      }
    }),
    ...rows(2).map(task => ({
      id: String(task.id),
      label: String(task.title || 'Задача'),
      subtitle: task.due_date ? `Срок: ${new Date(`${String(task.due_date)}T00:00:00`).toLocaleDateString('ru-RU')}` : String(task.description || 'Задача'),
      group: 'Задачи',
      route: '/tasks',
      kind: 'task' as const,
    })),
    ...rows(3).map(event => ({
      id: String(event.id),
      label: String(event.title || 'Событие'),
      subtitle: `${event.type === 'call' ? 'Звонок' : 'Встреча'} · ${new Date(`${String(event.event_date)}T00:00:00`).toLocaleDateString('ru-RU')}`,
      group: 'Календарь',
      route: '/calendar',
      kind: 'event' as const,
    })),
    ...rows(4).map(deal => ({
      id: String(deal.id),
      label: String(deal.notes || 'Сделка'),
      subtitle: `${String(deal.status || 'Статус не указан')} · ${deal.price ? `${Number(deal.price).toLocaleString('ru-RU')} ₽` : 'цена не указана'}`,
      group: 'Сделки',
      route: '/deals',
      kind: 'deal' as const,
    })),
  ].slice(0, 24)
}
