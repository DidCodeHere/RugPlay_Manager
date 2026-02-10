// Persistent activity store — survives component unmount/remount
// Stores both dashboard activities and sniper log entries

import type { ActivityItem } from '@/components/dashboard/ActivityFeed'
import type { SniperTriggeredEvent } from '@/lib/types'

type Listener = () => void

const MAX_ACTIVITIES = 50
const MAX_SNIPE_LOG = 50

let activities: ActivityItem[] = []
let snipeLog: SniperTriggeredEvent[] = []
let activityIdCounter = 0
let activityListeners: Listener[] = []
let snipeListeners: Listener[] = []

function notifyActivityListeners() {
  activityListeners.forEach((fn) => fn())
}

function notifySnipeListeners() {
  snipeListeners.forEach((fn) => fn())
}

export const activityStore = {
  getActivities: () => activities,
  addActivity: (item: Omit<ActivityItem, 'id'>) => {
    // Deduplicate: skip if last entry has same title and was added within 500ms
    if (activities.length > 0) {
      const last = activities[0]
      if (last.title === item.title && Math.abs(last.timestamp - item.timestamp) < 500) {
        return
      }
    }
    activityIdCounter += 1
    activities = [{ ...item, id: activityIdCounter }, ...activities].slice(0, MAX_ACTIVITIES)
    notifyActivityListeners()
  },
  subscribeActivities: (listener: Listener): (() => void) => {
    activityListeners.push(listener)
    return () => {
      activityListeners = activityListeners.filter((l) => l !== listener)
    }
  },

  getSnipeLog: () => snipeLog,
  addSnipe: (entry: SniperTriggeredEvent) => {
    // Deduplicate: skip if latest entry is same symbol within 500ms
    if (snipeLog.length > 0 && snipeLog[0].symbol === entry.symbol) {
      return
    }
    snipeLog = [entry, ...snipeLog].slice(0, MAX_SNIPE_LOG)
    notifySnipeListeners()
  },
  loadSnipeHistory: (entries: SniperTriggeredEvent[]) => {
    if (snipeLog.length > 0) return // don't overwrite live entries
    snipeLog = entries.slice(0, MAX_SNIPE_LOG)
    notifySnipeListeners()
  },
  subscribeSnipeLog: (listener: Listener): (() => void) => {
    snipeListeners.push(listener)
    return () => {
      snipeListeners = snipeListeners.filter((l) => l !== listener)
    }
  },
}
