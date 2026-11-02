import type { Property } from '../types'
import { mapClientRow } from './propertyMapping'
import { rankPropertyBuyers, type BuyerMatch } from './propertyMatching'
import { supabase } from './supabase'

export const fetchPropertyMatches = async (userId: string, property: Property): Promise<BuyerMatch[]> => {
  const [requirements, clients, details] = await Promise.all([
    supabase.from('client_requirements').select('*').eq('user_id', userId).eq('purpose', property.listingType || 'sale'),
    supabase.from('clients').select('*').is('merged_into', null).eq('user_id', userId).is('deleted_at', null),
    supabase.from('property_details').select('*').eq('user_id', userId).eq('property_id', property.id).maybeSingle(),
  ])
  const error = requirements.error || clients.error || details.error
  if (error) throw error
  return rankPropertyBuyers(property, details.data || {}, requirements.data || [], (clients.data || []).map(mapClientRow))
}
