export type ClientType = 'buyer' | 'seller'
export type PropertyStatus = 'available' | 'reserved' | 'sold' | 'archived'
export type TaskStatus = 'todo' | 'inprogress' | 'done'
export type Priority = 'low' | 'medium' | 'high'

export interface Client {
  id: string
  userId: string
  type: ClientType
  firstName: string
  lastName: string
  middleName?: string
  phone: string
  email?: string
  propertyType?: string
  preferredDistricts?: string[]
  mortgageStatus?: boolean
  paymentMethod?: string
  budget?: number
  rooms?: number
  tags: string[]
  isFavorite: boolean
  createdAt: string
  updatedAt: string
  photos: GalleryItem[]
  documents: Document[]
  notes: Note[]
  source?: string
  firstContactDate?: string
  lastContactDate?: string
  nextContactDate?: string
  birthDate?: string
  birthdayReminder?: boolean
  contactComment?: string
  roles?: string[]
  status?: string
  leadTemperature?: 'cold' | 'warm' | 'inbound' | 'hot'
  description?: string
}

export type Owner = Client & { type: 'seller' }
export type Buyer = Client & { type: 'buyer' }

export interface Property {
  id: string
  userId: string
  address: string
  price: number | null | undefined
  rooms: number | null | undefined
  area: number | null | undefined
  floor: number | null | undefined
  totalFloors: number | null | undefined
  status: PropertyStatus
  listingType?: 'sale' | 'rent'
  ownerId?: string
  tags: string[]
  isFavorite: boolean
  createdAt: string
  updatedAt: string
  photos: GalleryItem[]
  documents: Document[]
  notes: Note[]
  description?: string
  propertyType?: string
  sourceUrl?: string
  constructionYear?: number
  repair?: string
  balcony?: boolean
  elevator?: boolean
  parking?: boolean
  heating?: string
  walls?: string
  coverUrl?: string
  workStream?: 'active' | 'cold'
  deletedAt?: string
}

export interface Deal {
  accounting?: import('../lib/businessAccounting').Accounting
  responsibleName?: string
  nextAction?: string
  nextActionAt?: string
  id: string
  userId?: string
  propertyId: string
  buyerId?: string
  buyerIds?: string[]
  ownerId?: string
  ownerIds?: string[]
  price: number | undefined
  agencyIncome?: number
  agentIncome?: number
  expenses?: number
  stage?: 'preparation' | 'documents' | 'approval' | 'registration' | 'settlement' | 'completed' | 'lost'
  lossReason?: string
  checklist?: Array<{ id: string; title: string; completed: boolean }>
  status: 'pending' | 'active' | 'closed' | 'cancelled'
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Note {
  id: string
  content: string
  createdAt: string
  author?: string
}

export interface Comment {
  id: string
  entityType: 'owner' | 'buyer' | 'property' | 'task' | 'meeting' | 'call' | 'deal'
  entityId: string
  content: string
  createdAt: string
  author: string
}

export interface Task {
  id: string
  userId?: string
  title: string
  description?: string
  status: TaskStatus
  priority: Priority
  dueDate?: string
  dueTime?: string
  isFavorite: boolean
  createdAt: string
  isCompleted: boolean
  completedAt?: string
  category?: string
  project?: string
  smartCriteria?: { stopOnContact?: boolean; timeZone?: string; clientId?: string; propertyId?: string; specific?: string; measurable?: string; achievable?: string; relevant?: string; timeBound?: string }
  eisenhowerQuadrant?: 'do' | 'plan' | 'delegate' | 'eliminate'
  recurrenceRule?: 'none' | 'daily' | 'weekly' | 'monthly'
  parentTaskId?: string
  subtasks?: Array<{ id: string; title: string; completed: boolean }>
  deletedAt?: string
}

export interface Event {
  durationMinutes?: number
  timeZone?: string
  startsAt?: string
  updatedAt?: string
  id: string
  userId: string
  type: 'meeting' | 'call'
  title: string
  eventDate: string
  eventTime?: string
  location?: string
  notes?: string
  relatedClientId?: string
  relatedClientType?: 'owner' | 'buyer'
  relatedPropertyId?: string
  isFavorite: boolean
  createdAt: string
  isCompleted: boolean
}

// Legacy local-store shapes kept until the remaining screens are migrated to Supabase.
export interface Meeting {
  id: string
  userId?: string
  title: string
  date: string
  time?: string
  location?: string
  description?: string
  isFavorite: boolean
  isCompleted: boolean
  createdAt: string
}

export interface Call {
  id: string
  userId?: string
  title: string
  date: string
  time?: string
  phone?: string
  description?: string
  isFavorite: boolean
  isCompleted: boolean
  createdAt: string
}

export interface Folder {
  id: string
  name: string
  parentId?: string
  type: 'gallery' | 'documents'
  createdAt: string
}

export interface GalleryItem {
  id: string
  name: string
  url: string
  folderId?: string
  propertyId?: string
  ownerId?: string
  buyerId?: string
  isFavorite: boolean
  createdAt: string
}

export interface Document {
  id: string
  name: string
  url: string
  folderId?: string
  propertyId?: string
  ownerId?: string
  buyerId?: string
  type: string
  createdAt: string
}

export interface Goal {
  id: string
  title: string
  description?: string
  priority: Priority
  dueDate: string
  isCompleted: boolean
  type: 'showings' | 'deals' | 'calls' | 'custom'
  target: number
  current: number
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  firstName: string
  lastName: string
  middleName?: string
  phone: string
  email: string
  position: string
  darkMode: boolean
  notifications: boolean
  meetingReminders: boolean
}

export interface CrmActivity {
  id: string
  userId: string
  clientId?: string
  propertyId?: string
  type: 'call' | 'message' | 'meeting' | 'note' | 'follow_up'
  status: 'planned' | 'completed' | 'cancelled'
  title: string
  occurredAt?: string
  dueAt?: string
  outcome?: string
  notes?: string
  source?: string
  createdAt: string
}
