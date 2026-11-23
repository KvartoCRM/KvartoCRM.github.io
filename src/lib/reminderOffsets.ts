/** The due-time notification is always included; advance reminders are opt-in. */
export const taskReminderOffsets = (value: unknown): number[] => [
  ...[1440, 60, 5].filter(minutes => Array.isArray(value) && value.includes(minutes)),
  0,
]
