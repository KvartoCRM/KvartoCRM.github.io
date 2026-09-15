import { supabase } from './supabase'
import { fetchAllRows } from './pagination'
import { inferContactRoles, type ContactRole } from './contactRoles'
import { mapClientRow } from './propertyMapping'
import { moveToTrash } from './trash'
import type { Client } from '../types'
import type { ContactInput } from './contactRecordMapping'
import { addPropertyOwner } from './properties'
import { recordPropertyHistory } from './propertyHistory'
import { buildPropertyHistoryChange } from './propertyHistoryMapping'

export type { ContactInput } from './contactRecordMapping'

export type { ContactRole } from './contactRoles'

export type ContactSummary = {
  id: string
  firstName: string
  lastName: string
  middleName: string
  phone: string
  email: string
  roles: ContactRole[]
  source?: string
  nextContactDate?: string
  isFavorite: boolean
}

export type ClientRequirementRecord = Record<string, unknown> & {
  id: string
  client_id: string
  purpose: 'sale' | 'rent'
}

export type BuyerRequirementInput = Record<string, unknown> & {
  purpose: 'sale' | 'rent'
}

export type OwnerPropertyInput = {
  mode: 'sale' | 'rent'
  propertyId?: string
  propertyAddress?: string
  newPropertyId?: string
  primaryOwnerId?: string
}

const contactPayload = (input: ContactInput) => ({
  type: input.type,
  first_name: input.firstName.trim(),
  last_name: input.lastName.trim(),
  middle_name: input.middleName?.trim() || null,
  phone: input.phone.trim(),
  email: input.email?.trim() || null,
  property_type: input.propertyType,
  preferred_districts: input.preferredDistricts,
  mortgage_status: input.mortgageStatus,
  payment_method: input.paymentMethod,
  budget: input.budget,
  rooms: input.rooms,
  source: input.source,
  first_contact_date: input.firstContactDate,
  last_contact_date: input.lastContactDate,
  next_contact_at: input.nextContactDate,
  birth_date: input.birthDate,
  birthday_reminder: input.birthdayReminder,
  contact_comment: input.contactComment,
  roles: input.roles,
  status: input.status,
  lead_temperature: input.leadTemperature,
  description: input.description,
  tags: input.tags,
  updated_at: new Date().toISOString(),
})

export const fetchContactRecords = async (userId: string): Promise<Client[]> => {
  const { data, error } = await fetchAllRows(() => supabase
    .from('clients')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false }))
  if (error) throw error
  return (data || []).map(mapClientRow)
}

export const fetchClientRequirement = async (userId: string, clientId: string, purpose: 'sale' | 'rent') => {
  const { data, error } = await supabase
    .from('client_requirements')
    .select('*')
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .eq('purpose', purpose)
    .maybeSingle()
  if (error) throw error
  return data as ClientRequirementRecord | null
}

export const saveContact = async (userId: string, input: ContactInput, contactId?: string, newContactId?: string) => {
  const id = contactId || newContactId || crypto.randomUUID()
  const payload = contactPayload(input)
  const result = contactId
    ? await supabase.from('clients').update(payload).eq('id', contactId).eq('user_id', userId)
    : await supabase.from('clients').insert({ ...payload, id, user_id: userId, is_favorite: false })
  if (result.error) throw result.error
  return id
}

export const saveBuyerApplication = async (
  userId: string,
  input: ContactInput,
  requirement: BuyerRequirementInput,
  contactId?: string,
  newContactId?: string,
  requirementId?: string,
) => {
  const id = await saveContact(userId, input, contactId, newContactId)
  const { error } = await supabase.from('client_requirements').upsert({
    ...requirement,
    id: requirementId || crypto.randomUUID(),
    user_id: userId,
    client_id: id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id,purpose' })
  if (error) throw error
  return id
}

export const saveOwnerRecord = async (
  userId: string,
  input: ContactInput,
  property: OwnerPropertyInput,
  contactId?: string,
  newContactId?: string,
) => {
  const id = await saveContact(userId, input, contactId, newContactId)
  const address = property.propertyAddress?.trim()
  if (property.propertyId) {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (!property.primaryOwnerId) payload.owner_id = id
    if (address) payload.address = address
    const { error } = await supabase.from('properties').update(payload).eq('id', property.propertyId).eq('user_id', userId)
    if (error) throw error
    await addPropertyOwner(userId, property.propertyId, id, !property.primaryOwnerId)
  } else if (address) {
    const createdPropertyId = property.newPropertyId || crypto.randomUUID()
    const { error } = await supabase.from('properties').insert({
      id: createdPropertyId,
      user_id: userId,
      owner_id: id,
      address,
      status: 'available',
      listing_type: property.mode,
      work_stream: 'active',
      tags: [],
      is_favorite: false,
    })
    if (error) throw error
    await addPropertyOwner(userId, createdPropertyId, id, true)
    try {
      await recordPropertyHistory(userId, createdPropertyId, buildPropertyHistoryChange(undefined, { price: null, status: 'available' }), 'contact')
    } catch (historyError) {
      console.warn('Property history update failed:', historyError)
    }
  }
  return id
}

export const setContactFavorite = async (userId: string, contact: Client) => {
  const isFavorite = !contact.isFavorite
  const { error } = await supabase.from('clients').update({ is_favorite: isFavorite }).eq('id', contact.id).eq('user_id', userId)
  if (error) throw error
  return { id: contact.id, isFavorite }
}

export const trashContact = async (userId: string, contactId: string) => {
  await moveToTrash('clients', contactId, userId)
  return contactId
}

export const fetchContactSummaries = async (userId: string): Promise<ContactSummary[]> => {
  // Reuse the complete client snapshot used by role pages and the dashboard.
  // A second projection created a separate IndexedDB cache entry that could
  // remain empty while the rest of the application already had fresh clients.
  const clients = await fetchContactRecords(userId)
  return clients.map(client => ({
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    middleName: client.middleName || '',
    phone: client.phone,
    email: client.email || '',
    roles: inferContactRoles(client as unknown as Record<string, unknown>),
    source: client.source,
    nextContactDate: client.nextContactDate,
    isFavorite: client.isFavorite,
  }))
}
