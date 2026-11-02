import { supabase } from './supabase'
import { buildWorkspaceSearchResults, normalizeSearchTerm, type WorkspaceSearchRow } from './workspaceSearchMapping'

export { buildWorkspaceSearchResults, normalizeSearchTerm, type WorkspaceSearchResult } from './workspaceSearchMapping'

export const searchWorkspace = async (userId: string, rawTerm: string) => {
  const term = normalizeSearchTerm(rawTerm)
  if (term.length < 2) return []
  const pattern = `%${term}%`
  const settled = await Promise.allSettled([
    supabase.from('properties').select('id,address,price,status').eq('user_id', userId).is('deleted_at', null).ilike('address', pattern).limit(6),
    supabase.from('clients').select('id,first_name,last_name,middle_name,phone,email,type,roles').is('merged_into', null).eq('user_id', userId).is('deleted_at', null).or(`first_name.ilike.${pattern},last_name.ilike.${pattern},middle_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`).limit(8),
    supabase.from('tasks').select('id,title,description,due_date').eq('user_id', userId).is('deleted_at', null).or(`title.ilike.${pattern},description.ilike.${pattern}`).limit(5),
    supabase.from('events').select('id,title,type,event_date,location').eq('user_id', userId).is('deleted_at', null).or(`title.ilike.${pattern},location.ilike.${pattern}`).limit(5),
    supabase.from('deals').select('id,notes,status,price').eq('user_id', userId).is('deleted_at', null).ilike('notes', pattern).limit(4),
  ])
  const collections = settled.map(result => result.status === 'fulfilled' && !result.value.error
    ? (result.value.data || []) as WorkspaceSearchRow[]
    : [])
  return buildWorkspaceSearchResults(collections)
}
