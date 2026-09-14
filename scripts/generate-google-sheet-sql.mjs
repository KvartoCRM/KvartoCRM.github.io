import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const DOCUMENT_ID = '1vDq1UT5GiDb2h8pmDh47PEZTgVzFrgwhWm5MmqhSP9o'
const SHEETS = [
  { name: 'Холодные звонки', gid: '0', kind: 'lead', temperature: 'cold', clientType: 'seller' },
  // «Холодные звонки (копия)» — архивная копия 27 строк этого листа, не импортируем повторно.
  { name: 'Тёпые звонки', gid: '382810404', kind: 'lead', temperature: 'warm', clientType: 'seller' },
  { name: 'Входящие звонки', gid: '194164375', kind: 'lead', temperature: 'inbound', clientType: 'seller' },
  { name: 'Встречи', gid: '1768192617', kind: 'meeting', temperature: 'warm', clientType: 'seller' },
  { name: 'Планирование', gid: '426231194', kind: 'task' },
  { name: 'Подбор', gid: '586036728', kind: 'lead', temperature: 'warm', clientType: 'buyer' },
]

const argumentValue = name => process.argv.find(argument => argument.startsWith(`${name}=`))?.slice(name.length + 1)
const userId = argumentValue('--user-id')
const outputPath = path.resolve(argumentValue('--output') || 'tmp/lumicrm-google-import.sql')
const importYear = Number(argumentValue('--year') || new Date().getFullYear())

if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
  throw new Error('Укажите UUID владельца: --user-id=<uuid>')
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }

  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

async function loadSheet(sheet) {
  const url = `https://docs.google.com/spreadsheets/d/${DOCUMENT_ID}/export?format=csv&gid=${sheet.gid}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Не удалось прочитать лист «${sheet.name}»: HTTP ${response.status}`)
  const table = parseCsv(await response.text())
  const headers = (table.shift() || []).map(value => String(value).trim())
  const rows = table
    .map((values, index) => ({
      rowNumber: index + 2,
      values: values.map(value => String(value).trim()),
    }))
    .filter(row => row.values.some(value => value && value !== '—' && value !== 'м²'))
  return { ...sheet, headers, rows }
}

function cleanText(value) {
  const text = String(value ?? '').trim()
  return text === '—' ? '' : text
}

function normalizeIdentityText(value) {
  return cleanText(value).toLowerCase().replaceAll('ё', 'е').replace(/[^a-zа-я0-9]+/gi, '')
}

function normalizeAddress(value) {
  return cleanText(value)
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\b(г|город)\.?\s*курск\b/gi, '')
    .replace(/\b(улица|ул)\.?\s*/gi, '')
    .replace(/\b(дом|д)\.?\s*/gi, '')
    .replace(/\b(квартира|кв)\.?\s*/gi, 'кв')
    .replace(/[^a-zа-я0-9/]+/gi, '')
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length]
}

function addressesLikelySame(left, right) {
  const normalizedLeft = normalizeAddress(left)
  const normalizedRight = normalizeAddress(right)
  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true
  const leftNumber = normalizedLeft.replace(/\D/g, '')
  const rightNumber = normalizedRight.replace(/\D/g, '')
  return leftNumber === rightNumber
    && normalizedLeft.length >= 5
    && normalizedRight.length >= 5
    && editDistance(normalizedLeft, normalizedRight) <= 1
}

function mergeText(...values) {
  const lines = values.flatMap(value => cleanText(value).split(/\r?\n/)).map(line => line.trim()).filter(Boolean)
  return [...new Set(lines)].join('\n') || null
}

function normalizePhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 10) digits = `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`
  return digits
}

function splitName(value) {
  const parts = cleanText(value).split(/\s+/).filter(Boolean)
  return { firstName: parts[0] || 'Без имени', lastName: parts.slice(1).join(' ') }
}

function parseNumber(value) {
  const parsed = Number.parseFloat(cleanText(value).replace(/[^\d,.-]/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function parseMoney(value) {
  const digits = cleanText(value).replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

function parseRooms(value) {
  const match = cleanText(value).match(/(\d+)\s*[-–]?\s*к/i)
  return match ? Number(match[1]) : null
}

function parseFloor(value) {
  const [floor, totalFloors] = cleanText(value).split('/').map(part => Number.parseInt(part, 10))
  return {
    floor: Number.isFinite(floor) ? floor : null,
    totalFloors: Number.isFinite(totalFloors) ? totalFloors : null,
  }
}

function parseDate(value) {
  const match = cleanText(value).match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/)
  if (!match) return null
  let year = match[3] ? Number(match[3]) : importYear
  if (year < 100) year += 2000
  return `${year}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`
}

function toTimestamp(dateValue, timeValue = '12:00') {
  const date = parseDate(dateValue)
  if (!date) return null
  const timeMatch = cleanText(timeValue).match(/(\d{1,2}):(\d{2})/)
  const time = timeMatch ? `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}:00` : '12:00:00'
  return `${date}T${time}+03:00`
}

function compact(values) {
  return values.map(cleanText).filter(Boolean).join('\n') || null
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function uuid(value) {
  const hex = hash(value)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function fingerprint(sheetName, rowNumber, values) {
  return hash(`${DOCUMENT_ID}|${sheetName}|${rowNumber}|${JSON.stringify(values)}`)
}

function sql(value) {
  if (value === null || value === undefined || value === '') return 'null'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return `'${String(value).replaceAll("'", "''")}'`
}

function json(value) {
  return `${sql(JSON.stringify(value))}::jsonb`
}

function rowObject(headers, values) {
  return Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, values[index] || '']))
}

const sheetData = []
for (const sheet of SHEETS) sheetData.push(await loadSheet(sheet))

const clients = new Map()
const clientLookup = new Map()
const properties = new Map()
const tasks = []
const events = []
const activities = []
const requirements = new Map()
const importRows = []

function ensureClient({ sheet, row, type, name, phone, address, source, contactMethod, temperature, status, description, nextContact }) {
  const normalizedPhone = normalizePhone(phone)
  const phoneKey = normalizedPhone ? `phone:${normalizedPhone}` : ''
  const nameAddressKey = normalizeIdentityText(name) && normalizeAddress(address)
    ? `name-address:${normalizeIdentityText(name)}|${normalizeAddress(address)}`
    : ''
  const fallbackKey = `row:${sheet.name}:${row.rowNumber}`
  let existing = (phoneKey && clientLookup.get(phoneKey)) || (nameAddressKey && clientLookup.get(nameAddressKey))
  if (!existing && normalizeIdentityText(name) && normalizeAddress(address)) {
    const linkedProperty = [...properties.values()].find(property => addressesLikelySame(property.address, address))
    const candidate = linkedProperty ? clients.get(linkedProperty.ownerId) : null
    if (candidate && normalizeIdentityText(`${candidate.firstName || ''}${candidate.lastName || ''}`) === normalizeIdentityText(name)) {
      existing = candidate
    }
  }
  const id = existing?.id || uuid(`client|${phoneKey || nameAddressKey || fallbackKey}`)
  const parsedName = splitName(name)
  const role = type === 'buyer' ? 'buyer' : 'seller'
  const client = {
    id,
    type,
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
    phone: normalizedPhone || existing?.phone || cleanText(phone) || `unknown-${hash(fallbackKey).slice(0, 12)}`,
    source: cleanText(source) || existing?.source || null,
    contactMethod: cleanText(contactMethod) || existing?.contactMethod || null,
    temperature: temperature || existing?.temperature || null,
    status: cleanText(status) || existing?.status || null,
    description: mergeText(existing?.description, description),
    nextContact: nextContact || existing?.nextContact || null,
    roles: [...new Set([...(existing?.roles || []), role])],
  }
  clients.set(id, client)
  if (phoneKey) clientLookup.set(phoneKey, client)
  if (nameAddressKey) clientLookup.set(nameAddressKey, client)
  return client
}

function ensureProperty({ client, address, propertyType, sourceUrl, area, floorText, price, description }) {
  const cleanAddress = cleanText(address)
  if (!cleanAddress) return null
  const key = normalizeAddress(cleanAddress)
  if (!key) return null
  const matchingKey = properties.has(key) ? key : [...properties.keys()].find(existingKey => addressesLikelySame(existingKey, key))
  if (matchingKey) {
    const existing = properties.get(matchingKey)
    existing.ownerId ||= client?.type === 'seller' ? client.id : null
    existing.propertyType ||= cleanText(propertyType) || null
    existing.sourceUrl ||= cleanText(sourceUrl) || null
    existing.area ||= parseNumber(area)
    existing.price ||= parseMoney(price)
    existing.description = mergeText(existing.description, description)
    return existing
  }
  const floor = parseFloor(floorText)
  const property = {
    id: uuid(`property|${key}`),
    ownerId: client?.type === 'seller' ? client.id : null,
    address: cleanAddress,
    propertyType: cleanText(propertyType) || null,
    sourceUrl: cleanText(sourceUrl) || null,
    rooms: parseRooms(propertyType),
    area: parseNumber(area),
    floor: floor.floor,
    totalFloors: floor.totalFloors,
    price: parseMoney(price),
    description: cleanText(description) || null,
  }
  properties.set(key, property)
  return property
}

for (const sheet of sheetData) {
  for (const row of sheet.rows) {
    const values = row.values
    const rowFingerprint = fingerprint(sheet.name, row.rowNumber, values)
    let entityType
    let entityId

    if (sheet.kind === 'task') {
      const statusText = cleanText(values[7]).toLowerCase()
      const resultText = cleanText(values[19]).toLowerCase()
      const completed = /^(выполнено|готово|сделано)$/.test(statusText) || /^(выполнено|готово|сделано)$/.test(resultText)
      const inProgress = /в работе|процесс/.test(statusText)
      const priorityText = (values[6] || '').toLowerCase()
      const task = {
        id: uuid(`task|${rowFingerprint}`),
        title: cleanText(values[2]) || 'Задача из Google Sheets',
        description: compact([values[3], values[8], values[5] ? `Время: ${values[5]}` : '']),
        category: cleanText(values[1]) || null,
        dueDate: parseDate(values[4]),
        priority: priorityText.includes('выс') ? 'high' : priorityText.includes('низ') ? 'low' : 'medium',
        status: completed ? 'done' : inProgress ? 'inprogress' : 'todo',
        completed,
        externalKey: `google:${rowFingerprint}`,
      }
      tasks.push(task)
      entityType = 'task'
      entityId = task.id
    } else if (sheet.kind === 'meeting') {
      const client = ensureClient({
        sheet,
        row,
        type: sheet.clientType,
        name: values[2],
        phone: values[3],
        address: values[4],
        source: values[7],
        contactMethod: 'Встреча',
        temperature: sheet.temperature,
        status: 'Встреча',
        description: values[11],
      })
      const property = ensureProperty({
        client,
        address: values[4],
        sourceUrl: values[5],
        price: values[6],
        description: values[11],
        keyHint: rowFingerprint,
      })
      const event = {
        id: uuid(`event|${rowFingerprint}`),
        title: `Встреча: ${cleanText(values[2]) || cleanText(values[4]) || 'без названия'}`,
        eventDate: parseDate(values[0]) || `${importYear}-01-01`,
        eventTime: cleanText(values[1]) || null,
        location: cleanText(values[4]) || null,
        notes: compact([values[8], values[10], values[11]]),
        outcome: cleanText(values[9]) || null,
        clientId: client.id,
        propertyId: property?.id || null,
        externalKey: `google:${rowFingerprint}`,
      }
      events.push(event)
      activities.push({
        id: uuid(`activity|${rowFingerprint}`),
        clientId: client.id,
        propertyId: property?.id || null,
        type: 'meeting',
        title: `Встреча: ${cleanText(values[2]) || 'контакт'}`,
        occurredAt: toTimestamp(values[0], values[1]),
        outcome: cleanText(values[9]) || null,
        notes: compact([values[8], values[10], values[11]]),
        source: cleanText(values[7]) || 'Google Sheets',
        externalKey: `google:${rowFingerprint}:activity`,
        metadata: { sheet: sheet.name, source_row: row.rowNumber },
      })
      entityType = 'event'
      entityId = event.id
    } else {
      const client = ensureClient({
        sheet,
        row,
        type: sheet.clientType,
        name: values[4],
        phone: values[5],
        address: values[6],
        source: values[2],
        contactMethod: values[3],
        temperature: sheet.temperature,
        status: values[1],
        description: compact([values[16], values[18]]),
        nextContact: toTimestamp(values[13]),
      })
      const property = sheet.clientType === 'seller' ? ensureProperty({
        client,
        address: values[6],
        propertyType: values[7],
        sourceUrl: values[8],
        area: values[9],
        floorText: values[10],
        price: values[11],
        description: compact([values[15], values[16]]),
        keyHint: rowFingerprint,
      }) : null
      const method = (values[3] || '').toLowerCase()
      const activity = {
        id: uuid(`activity|${rowFingerprint}`),
        clientId: client.id,
        propertyId: property?.id || null,
        type: method.includes('сообщ') ? 'message' : 'call',
        title: `${method.includes('сообщ') ? 'Сообщение' : 'Звонок'}: ${cleanText(values[4]) || client.phone}`,
        occurredAt: toTimestamp(values[12] || values[0]),
        dueAt: toTimestamp(values[13]),
        outcome: cleanText(values[15]) || null,
        notes: compact([values[16], values[17], values[18]]),
        source: cleanText(values[2]) || 'Google Sheets',
        externalKey: `google:${rowFingerprint}`,
        metadata: { sheet: sheet.name, source_row: row.rowNumber, original: values },
      }
      activities.push(activity)
      if (sheet.clientType === 'buyer') {
        requirements.set(client.id, {
          id: uuid(`requirement|${client.id}|sale`),
          clientId: client.id,
          requestType: cleanText(values[1]) || null,
          propertyType: cleanText(values[7]) || 'Квартира',
          priceMax: parseMoney(values[11]),
          totalAreaMin: parseNumber(values[9]),
          rooms: parseRooms(values[7]) ? [parseRooms(values[7])] : [],
          locations: cleanText(values[6]) ? [cleanText(values[6])] : [],
          objectCriteria: { source_link: cleanText(values[8]), excluded: cleanText(values[7]) },
          privateNotes: compact([values[16], values[18]]),
        })
      }
      entityType = 'activity'
      entityId = activity.id
    }

    importRows.push({
      id: uuid(`import-row|${rowFingerprint}`),
      fingerprint: rowFingerprint,
      sheetName: sheet.name,
      sourceRowNumber: row.rowNumber,
      entityType,
      entityId,
      rawData: rowObject(sheet.headers, values),
    })
  }
}

const importId = uuid(`import|${DOCUMENT_ID}`)
const lines = [
  '-- Generated by scripts/generate-google-sheet-sql.mjs',
  '-- Idempotent import of the owner Google Sheet into KvartoCRM.',
  'begin;',
  '',
  `insert into public.profiles (id, first_name, position) values (${sql(userId)}::uuid, 'Владелец', 'Риэлтор') on conflict (id) do nothing;`,
  `insert into public.crm_imports (id, user_id, source_document_id, status, imported_rows, skipped_rows, finished_at) values (${sql(importId)}::uuid, ${sql(userId)}::uuid, ${sql(DOCUMENT_ID)}, 'completed', ${importRows.length}, 0, now()) on conflict (id) do update set status = 'completed', imported_rows = excluded.imported_rows, finished_at = now(), error_message = null;`,
  '',
]

for (const client of clients.values()) {
  lines.push(`insert into public.clients (id, user_id, type, first_name, last_name, phone, source, contact_method, lead_temperature, status, description, next_contact_at, roles, updated_at) values (${sql(client.id)}::uuid, ${sql(userId)}::uuid, ${sql(client.type)}, ${sql(client.firstName)}, ${sql(client.lastName || ' ')}, ${sql(client.phone)}, ${sql(client.source)}, ${sql(client.contactMethod)}, ${sql(client.temperature)}, ${sql(client.status)}, ${sql(client.description)}, ${sql(client.nextContact)}::timestamptz, array[${client.roles.map(sql).join(', ')}]::text[], now()) on conflict (id) do update set first_name = excluded.first_name, last_name = excluded.last_name, source = excluded.source, contact_method = excluded.contact_method, lead_temperature = excluded.lead_temperature, status = excluded.status, description = excluded.description, next_contact_at = excluded.next_contact_at, roles = excluded.roles, updated_at = now();`)
}

for (const property of properties.values()) {
  lines.push(`insert into public.properties (id, user_id, owner_id, address, property_type, source_url, rooms, area, floor, total_floors, price, description, status, listing_type, updated_at) values (${sql(property.id)}::uuid, ${sql(userId)}::uuid, ${sql(property.ownerId)}::uuid, ${sql(property.address)}, ${sql(property.propertyType)}, ${sql(property.sourceUrl)}, ${sql(property.rooms)}, ${sql(property.area)}, ${sql(property.floor)}, ${sql(property.totalFloors)}, ${sql(property.price)}, ${sql(property.description)}, 'available', 'sale', now()) on conflict (id) do update set address = excluded.address, property_type = excluded.property_type, source_url = excluded.source_url, rooms = excluded.rooms, area = excluded.area, floor = excluded.floor, total_floors = excluded.total_floors, price = excluded.price, description = excluded.description, updated_at = now();`)
}

for (const task of tasks) {
  lines.push(`insert into public.tasks (id, user_id, title, description, category, project, due_date, priority, status, is_completed, completed_at, external_key) values (${sql(task.id)}::uuid, ${sql(userId)}::uuid, ${sql(task.title)}, ${sql(task.description)}, ${sql(task.category)}, ${sql(task.category)}, ${sql(task.dueDate)}::date, ${sql(task.priority)}, ${sql(task.status)}, ${sql(task.completed)}, ${task.completed ? 'now()' : 'null'}, ${sql(task.externalKey)}) on conflict (id) do update set title = excluded.title, description = excluded.description, category = excluded.category, project = excluded.project, due_date = excluded.due_date, priority = excluded.priority, status = excluded.status, is_completed = excluded.is_completed, external_key = excluded.external_key;`)
}

for (const event of events) {
  lines.push(`insert into public.events (id, user_id, type, title, event_date, event_time, location, notes, outcome, related_client_id, related_client_type, related_property_id, external_key) values (${sql(event.id)}::uuid, ${sql(userId)}::uuid, 'meeting', ${sql(event.title)}, ${sql(event.eventDate)}::date, ${sql(event.eventTime)}::time, ${sql(event.location)}, ${sql(event.notes)}, ${sql(event.outcome)}, ${sql(event.clientId)}::uuid, 'owner', ${sql(event.propertyId)}::uuid, ${sql(event.externalKey)}) on conflict (id) do update set title = excluded.title, event_date = excluded.event_date, event_time = excluded.event_time, location = excluded.location, notes = excluded.notes, outcome = excluded.outcome, related_client_id = excluded.related_client_id, related_property_id = excluded.related_property_id, external_key = excluded.external_key;`)
}

for (const activity of activities) {
  lines.push(`insert into public.crm_activities (id, user_id, client_id, property_id, type, status, title, occurred_at, due_at, outcome, notes, source, external_key, metadata, updated_at) values (${sql(activity.id)}::uuid, ${sql(userId)}::uuid, ${sql(activity.clientId)}::uuid, ${sql(activity.propertyId)}::uuid, ${sql(activity.type)}, 'completed', ${sql(activity.title)}, ${sql(activity.occurredAt)}::timestamptz, ${sql(activity.dueAt)}::timestamptz, ${sql(activity.outcome)}, ${sql(activity.notes)}, ${sql(activity.source)}, ${sql(activity.externalKey)}, ${json(activity.metadata)}, now()) on conflict (id) do update set client_id = excluded.client_id, property_id = excluded.property_id, type = excluded.type, title = excluded.title, occurred_at = excluded.occurred_at, due_at = excluded.due_at, outcome = excluded.outcome, notes = excluded.notes, source = excluded.source, metadata = excluded.metadata, updated_at = now();`)
}

for (const requirement of requirements.values()) {
  lines.push(`insert into public.client_requirements (id, user_id, client_id, purpose, request_type, property_type, price_max, total_area_min, rooms, locations, object_criteria, private_notes, updated_at) values (${sql(requirement.id)}::uuid, ${sql(userId)}::uuid, ${sql(requirement.clientId)}::uuid, 'sale', ${sql(requirement.requestType)}, ${sql(requirement.propertyType)}, ${sql(requirement.priceMax)}, ${sql(requirement.totalAreaMin)}, array[${requirement.rooms.join(', ')}]::integer[], ${json(requirement.locations)}, ${json(requirement.objectCriteria)}, ${sql(requirement.privateNotes)}, now()) on conflict (client_id, purpose) do update set request_type = excluded.request_type, property_type = excluded.property_type, price_max = excluded.price_max, total_area_min = excluded.total_area_min, rooms = excluded.rooms, locations = excluded.locations, object_criteria = excluded.object_criteria, private_notes = excluded.private_notes, updated_at = now();`)
}

for (const row of importRows) {
  lines.push(`insert into public.crm_import_rows (id, import_id, user_id, source_document_id, sheet_name, source_row_number, fingerprint, entity_type, entity_id, raw_data) values (${sql(row.id)}::uuid, ${sql(importId)}::uuid, ${sql(userId)}::uuid, ${sql(DOCUMENT_ID)}, ${sql(row.sheetName)}, ${row.sourceRowNumber}, ${sql(row.fingerprint)}, ${sql(row.entityType)}, ${sql(row.entityId)}::uuid, ${json(row.rawData)}) on conflict (user_id, fingerprint) do nothing;`)
}

lines.push('', 'commit;', '')
await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, lines.join('\n'), 'utf8')

console.table(sheetData.map(sheet => ({ sheet: sheet.name, rows: sheet.rows.length })))
console.log(`SQL подготовлен: ${outputPath}`)
console.log(`Клиентов: ${clients.size}; объектов: ${properties.size}; задач: ${tasks.length}; событий: ${events.length}; активностей: ${activities.length}; исходных строк: ${importRows.length}.`)
