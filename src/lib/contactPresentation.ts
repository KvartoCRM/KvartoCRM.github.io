type Person = { firstName?: string; lastName?: string; middleName?: string }

// Historical placeholders are hidden in the UI; stored records remain untouched.
export const displayNamePart = (value?: string) => /^(none|null|undefined)$/i.test(value?.trim() || '') ? '' : value?.trim() || ''
export const contactName = (person: Person) => [person.firstName, person.lastName, person.middleName].map(displayNamePart).filter(Boolean).join(' ') || 'Без имени'
export const contactInitials = (person: Person) => [person.firstName, person.lastName].map(displayNamePart).filter(Boolean).map(value => value[0]).join('').toUpperCase() || '?'
export const contactStatus = (value?: string) => ({ new: 'Новый', active: 'В работе', meeting: 'Назначена встреча', contract: 'Договор', closed: 'Сделка закрыта', rejected: 'Отказ' }[value || ''] || value || 'Не указан')
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
