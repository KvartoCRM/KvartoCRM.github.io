import type { ComponentProps } from 'react'
import { useAuth } from '../context/AuthContext'
import QuickCallComposer from './QuickCallComposer'

export default function QuickCallForm(props: ComponentProps<typeof QuickCallComposer>) {
  const { user } = useAuth()
  return user ? <QuickCallComposer key={`${user.id}:${props.scheduledEvent?.id || props.contact?.id || 'new'}`} {...props} /> : null
}
