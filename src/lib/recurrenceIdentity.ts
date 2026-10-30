// One successor per source occurrence, independent of retries and later moves.
export async function recurrenceId(userId: string, taskId: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`kvarto:recurrence:v1:${userId}:${taskId}`)))
  bytes[6] = (bytes[6] & 15) | 80
  bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes.slice(0,16)].map(b => b.toString(16).padStart(2,'0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
