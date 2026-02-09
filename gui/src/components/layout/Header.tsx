import { useState, useEffect, useCallback } from 'react'
import { LogOut, User, Shield, Timer } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { buildImageUrl } from '@/lib/utils'
import { NotificationInbox } from './NotificationInbox'
import type { UserProfile, MonitorStatusResponse, SentinelTickEvent, PortfolioSummary } from '@/lib/types'

interface HarvesterTickPayload {
  enabled: boolean
  secondsUntilNext: number
  lastClaimAt: string | null
  totalClaims: number
  profilesCount?: number
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Claim now!'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

interface HeaderProps {
  user: UserProfile
  onLogout: () => void
}

export function Header({ user, onLogout }: HeaderProps) {
  const imageUrl = buildImageUrl(user.image)
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatusResponse | null>(null)
  const [lastTick, setLastTick] = useState<SentinelTickEvent | null>(null)
  const [harvesterTick, setHarvesterTick] = useState<HarvesterTickPayload | null>(null)
  const [liveBalance, setLiveBalance] = useState<number>(user.balance)

  // Fetch live balance from API
  const fetchBalance = useCallback(async () => {
    try {
      const summary = await invoke<PortfolioSummary>('get_portfolio_summary')
      setLiveBalance(summary.balance)
    } catch {
      // Silently fail — keep last known balance
    }
  }, [])

  // Poll balance every 15s + on mount
  useEffect(() => {
    fetchBalance()
    const interval = setInterval(fetchBalance, 15_000)
    return () => clearInterval(interval)
  }, [fetchBalance])

  // Refresh balance immediately when trades/harvester events occur
  useEffect(() => {
    const unlisteners: (() => void)[] = []

    listen('trade-executed', () => {
      setTimeout(fetchBalance, 1000) // small delay for server to settle
    }).then(u => unlisteners.push(u))

    listen('harvester-claimed', () => {
      setTimeout(fetchBalance, 1000)
    }).then(u => unlisteners.push(u))

    listen('sniper-triggered', () => {
      setTimeout(fetchBalance, 1000)
    }).then(u => unlisteners.push(u))

    listen('sentinel-triggered', () => {
      setTimeout(fetchBalance, 1000)
    }).then(u => unlisteners.push(u))

    return () => { unlisteners.forEach(u => u()) }
  }, [fetchBalance])

  // Poll monitor status
  useEffect(() => {
    let mounted = true

    const fetchStatus = async () => {
      try {
        const status = await invoke<MonitorStatusResponse>('get_sentinel_monitor_status')
        if (mounted) setMonitorStatus(status)
      } catch {
        // Monitor may not be ready yet
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 15000) // refresh every 15s

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  // Listen for sentinel tick events
  useEffect(() => {
    const unlisten = listen<SentinelTickEvent>('sentinel-tick', (event) => {
      setLastTick(event.payload)
      setMonitorStatus(prev => prev ? { ...prev, status: event.payload.status } : prev)
    })

    return () => { unlisten.then(u => u()) }
  }, [])

  // Listen for harvester tick events
  useEffect(() => {
    const unlisten = listen<HarvesterTickPayload>('harvester-tick', (event) => {
      setHarvesterTick(event.payload)
    })

    return () => { unlisten.then(u => u()) }
  }, [])

  // Local countdown that decrements every second between harvester ticks
  const [localCountdown, setLocalCountdown] = useState<number | null>(null)

  useEffect(() => {
    if (harvesterTick) {
      setLocalCountdown(harvesterTick.secondsUntilNext)
    }
  }, [harvesterTick])

  useEffect(() => {
    if (localCountdown === null || localCountdown <= 0) return
    const timer = setInterval(() => {
      setLocalCountdown(prev => (prev !== null && prev > 0) ? prev - 1 : 0)
    }, 1000)
    return () => clearInterval(timer)
  }, [localCountdown])

  const statusColor = monitorStatus?.status === 'Running' 
    ? 'bg-emerald-400' 
    : monitorStatus?.status === 'Paused' 
      ? 'bg-amber-400' 
      : 'bg-zinc-500'

  const statusTitle = monitorStatus
    ? `Sentinel Monitor: ${monitorStatus.status}${lastTick ? ` • ${lastTick.activeCount} active, ${lastTick.checked} checked` : ''}`
    : 'Sentinel Monitor: Connecting...'

  return (
    <header className="h-14 lg:h-16 border-b border-background-tertiary bg-background-secondary px-3 lg:px-6 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 lg:gap-4 min-w-0">
        <h1 className="text-base lg:text-xl font-bold text-foreground whitespace-nowrap">
          RugPlay Manager
        </h1>
        {/* Sentinel Monitor Status Indicator */}
        <div className="flex items-center gap-1.5 lg:gap-2 shrink-0" title={statusTitle}>
          <Shield className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-foreground-muted" />
          <div className={`w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full ${statusColor} ${monitorStatus?.status === 'Running' ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-foreground-muted hidden md:inline">
            {monitorStatus?.status || '...'}
          </span>
        </div>
        {/* Harvester Countdown (always on for all profiles) */}
        {localCountdown !== null && (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-background-tertiary shrink-0"
            title={`Reward countdown${harvesterTick ? ` • ${harvesterTick.totalClaims} claims across ${harvesterTick.profilesCount ?? 1} profile(s)` : ''}`}
          >
            <Timer className="w-3.5 h-3.5 text-amber-400" />
            <span className={`text-xs font-medium ${localCountdown <= 0 ? 'text-buy' : 'text-foreground-muted'}`}>
              {localCountdown <= 0 ? '🎁 Claim now!' : `Next in ${formatCountdown(localCountdown)}`}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 lg:gap-4 shrink-0">
        {/* Notification Inbox */}
        <NotificationInbox />

        {/* Balance display */}
        <div className="text-right">
          <div className="text-[10px] lg:text-xs text-foreground-muted">Balance</div>
          <div className="text-sm lg:text-lg font-semibold text-buy">
            ${liveBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* User menu */}
        <div className="flex items-center gap-2 lg:gap-3">
          <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-background-tertiary flex items-center justify-center">
            {imageUrl ? (
              <img 
                src={imageUrl} 
                alt={user.username}
                className="w-7 h-7 lg:w-8 lg:h-8 rounded-full"
              />
            ) : (
              <User className="w-4 h-4 text-foreground-muted" />
            )}
          </div>
          
          <span className="text-sm font-medium text-foreground hidden md:inline">
            {user.username}
          </span>

          <button
            onClick={onLogout}
            className="p-1.5 lg:p-2 rounded hover:bg-background-tertiary text-foreground-muted hover:text-sell transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
