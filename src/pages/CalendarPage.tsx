import { useState } from 'react'
import MeetingsPage from './MeetingsPage'


const CalendarPage = () => {
  const [activeTab, setActiveTab] = useState<'meetings' | 'calls'>('meetings')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Календарь</h1>
      </div>
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('meetings')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'meetings' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300'
          }`}
        >
          Встречи
        </button>
        <button
          onClick={() => setActiveTab('calls')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'calls' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300'
          }`}
        >
          План звонков
        </button>
      </div>
      {activeTab === 'meetings' ? <MeetingsPage key="meetings" /> : <MeetingsPage key="calls" eventType="call" />}
    </div>
  )
}

export default CalendarPage
