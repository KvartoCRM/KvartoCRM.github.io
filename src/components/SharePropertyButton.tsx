import { useState } from 'react'
import { Check, Link2, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { createSignedFileUrls, listCrmFiles } from '../lib/files'
import { flushOfflineFiles, getOfflineFileQueueCount } from '../lib/offlineFiles'
import { flushOfflineQueue, getOfflineQueueCount } from '../lib/offlineTransport'
import type { Property } from '../types'

const SharePropertyButton = ({ property }: { property: Property }) => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const share = async () => {
    if (!user) return
    setLoading(true); setError(''); setCopied(false)
    try {
      if (!navigator.onLine) throw new Error('Публичную ссылку можно создать после подключения к интернету')
      await flushOfflineQueue()
      await flushOfflineFiles(user.id)
      if (await getOfflineQueueCount(user.id)) throw new Error('Сначала дождитесь синхронизации изменений')
      if (await getOfflineFileQueueCount(user.id)) throw new Error('Сначала дождитесь загрузки фотографий')
      const files = await listCrmFiles({ userId: user.id, bucket: 'crm-images', propertyId: property.id })
      const urls = await createSignedFileUrls(files, 365 * 24 * 3600)
      const snapshot = {
        address: property.address, price: property.price, rooms: property.rooms, area: property.area,
        floor: property.floor, totalFloors: property.totalFloors, status: property.status,
        propertyType: property.propertyType, description: property.description, repair: property.repair,
        balcony: property.balcony, elevator: property.elevator, parking: property.parking,
        heating: property.heating, walls: property.walls,
        photos: files.flatMap(file => {
          const url = urls.get(file.storage_path)
          return url ? [{ url, name: file.name, category: file.category, primary: file.is_primary }] : []
        }),
        contact: { name: user.displayName || `${user.firstName} ${user.lastName}`.trim(), phone: user.phone, email: user.email, position: user.position },
      }
      const { data, error: saveError } = await supabase.from('property_shares').upsert({
        user_id: user.id, property_id: property.id, snapshot, active: true,
      }, { onConflict: 'user_id,property_id' }).select('slug').setHeader('x-lumicrm-network-only', 'true').single()
      if (saveError) throw saveError
      const url = `https://kvartocrm.github.io/p/${data.slug}`
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Не удалось создать ссылку')
    } finally {
      setLoading(false)
    }
  }

  return <div className="flex flex-col items-start gap-1"><button type="button" onClick={() => void share()} disabled={loading} className="lumi-control flex items-center gap-2 rounded-xl px-4 py-2 font-medium disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Link2 className="h-4 w-4" />}{loading ? 'Создаём…' : copied ? 'Ссылка скопирована' : 'Резюме объекта'}</button>{error && <span className="max-w-64 text-xs text-red-500">{error}</span>}</div>
}

export default SharePropertyButton
