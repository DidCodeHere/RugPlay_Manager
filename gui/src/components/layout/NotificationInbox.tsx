import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, X, Shield, Crosshair, Banknote, AlertTriangle, ArrowRightLeft, Trash2 } from 'lucide-react'
import { listen } from '@tauri-apps/api/event'

export interface InboxNotification {
  id: number
  type: 'sentinel' | 'sniper' | 'harvester' | 'trade' | 'risk' | 'mirror'
  title: string
  description: string
  timestamp: number
  read: boolean
}

const TYPE_ICONS: Record<InboxNotification['type'], React.ReactNode> = {
  sentinel: <Shield className="w-4 h-4 text-emerald-400" />,
  sniper: <Crosshair className="w-4 h-4 text-amber-400" />,
  harvester: <Banknote className="w-4 h-4 text-blue-400" />,
  trade: <ArrowRightLeft className="w-4 h-4 text-purple-400" />,
  risk: <AlertTriangle className="w-4 h-4 text-rose-400" />,
  mirror: <ArrowRightLeft className="w-4 h-4 text-cyan-400" />,
}

export function NotificationInbox() {
  const [notifications, setNotifications] = useState<InboxNotification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)

  const unreadCount = notifications.filter(n => !n.read).length

  const addNotification = useCallback((type: InboxNotification['type'], title: string, description: string) => {
    idRef.current += 1
    setNotifications(prev => [
      { id: idRef.current, type, title, description, timestamp: Date.now(), read: false },
      ...prev,
    ].slice(0, 50)) // Keep last 50
  }, [])

  // Listen for all events
  useEffect(() => {
    const unlisteners: (() => void)[] = []

    listen<{ sentinelId: number; symbol: string; reason: string; triggerType: string }>(
      'sentinel-triggered',
      (event) => {
        const p = event.payload
        const typeLabel = p.triggerType === 'stop_loss' ? 'Stop Loss' : p.triggerType === 'take_profit' ? 'Take Profit' : 'Trailing Stop'
        addNotification('sentinel', `${typeLabel} — $${p.symbol}`, p.reason)
      }
    ).then(u => unlisteners.push(u))

    listen<{ symbol: string; buyAmountUsd: number; price: number }>(
      'sniper-triggered',
      (event) => {
        const p = event.payload
        addNotification('sniper', `Sniped $${p.symbol}`, `$${p.buyAmountUsd.toFixed(2)} at $${p.price.toFixed(8)}`)
      }
    ).then(u => unlisteners.push(u))

    listen<{ username: string; rewardAmount: number; loginStreak: number }>(
      'harvester-claimed',
      (event) => {
        const p = event.payload
        addNotification('harvester', `Reward Claimed`, `$${p.rewardAmount.toFixed(2)} for ${p.username} (streak: ${p.loginStreak})`)
      }
    ).then(u => unlisteners.push(u))

    listen<{ tradeType: string; symbol: string; amount: number; newPrice: number; success: boolean; error?: string }>(
      'trade-executed',
      (event) => {
        const p = event.payload
        if (p.success) {
          addNotification('trade', `${p.tradeType} $${p.symbol}`, `$${p.amount.toFixed(2)} @ $${p.newPrice.toFixed(8)}`)
        } else {
          addNotification('trade', `Trade Failed — $${p.symbol}`, p.error || 'Unknown error')
        }
      }
    ).then(u => unlisteners.push(u))

    return () => { unlisteners.forEach(u => u()) }
  }, [addNotification])

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Mark all as read when opened
  const handleOpen = () => {
    setIsOpen(!isOpen)
    if (!isOpen) {
      // Mark all as read after a short delay
      setTimeout(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      }, 500)
    }
  }

  const clearAll = () => {
    setNotifications([])
  }

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60_000) return 'Just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg hover:bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold px-1 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-background-secondary border border-background-tertiary rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-background-tertiary">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-1 rounded hover:bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
                  title="Clear all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-foreground-muted">
                <Bell className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-background-tertiary/50 hover:bg-background-tertiary/30 transition-colors ${
                    !n.read ? 'bg-blue-500/5' : ''
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {TYPE_ICONS[n.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{n.title}</span>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                    </div>
                    <p className="text-xs text-foreground-muted truncate">{n.description}</p>
                    <p className="text-[10px] text-foreground-muted mt-0.5">{formatTime(n.timestamp)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
