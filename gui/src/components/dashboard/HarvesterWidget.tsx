import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Sprout, Clock, Gift, RefreshCw, Zap } from 'lucide-react'
import type { HarvesterStatusResponse, HarvesterTickEvent, HarvesterClaimedEvent } from '@/lib/types'

export function HarvesterWidget() {
  const [status, setStatus] = useState<HarvesterStatusResponse | null>(null)
  const [countdown, setCountdown] = useState<string>('')
  const [claiming, setClaiming] = useState(false)
  const [lastEvent, setLastEvent] = useState<string | null>(null)

  // Fetch initial status
  const fetchStatus = useCallback(async () => {
    try {
      const s = await invoke<HarvesterStatusResponse>('get_harvester_status')
      setStatus(s)
    } catch (e) {
      console.error('Failed to fetch harvester status:', e)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Listen for tick events
  useEffect(() => {
    const unlistenTick = listen<HarvesterTickEvent>('harvester-tick', (event) => {
      const { secondsUntilNext, enabled, lastClaimAt, totalClaims } = event.payload
      setStatus(prev => ({
        enabled,
        lastClaimAt: lastClaimAt ?? prev?.lastClaimAt ?? null,
        nextClaimAt: prev?.nextClaimAt ?? null,
        secondsUntilNext,
        totalClaims,
      }))
    })

    const unlistenClaimed = listen<HarvesterClaimedEvent>('harvester-claimed', (event) => {
      const p = event.payload
      setLastEvent(`${p.username}: $${p.rewardAmount.toFixed(2)} claimed! (streak: ${p.loginStreak})`)
      fetchStatus()
      setTimeout(() => setLastEvent(null), 8000)
    })

    return () => {
      unlistenTick.then(u => u())
      unlistenClaimed.then(u => u())
    }
  }, [fetchStatus])

  // Format countdown
  useEffect(() => {
    if (status == null) return

    const updateCountdown = () => {
      const secs = status.secondsUntilNext
      if (secs <= 0) {
        setCountdown('Ready!')
        return
      }

      const h = Math.floor(secs / 3600)
      const m = Math.floor((secs % 3600) / 60)
      const s = secs % 60
      setCountdown(`${h}h ${m}m ${s}s`)
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [status])

  // Local countdown decrement
  useEffect(() => {
    if (!status || status.secondsUntilNext <= 0) return

    const timer = setInterval(() => {
      setStatus(prev => {
        if (!prev || prev.secondsUntilNext <= 0) return prev
        return { ...prev, secondsUntilNext: prev.secondsUntilNext - 1 }
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [status?.enabled, status?.secondsUntilNext])

  const forceClaim = async () => {
    setClaiming(true)
    try {
      const msg = await invoke<string>('force_claim_reward')
      setLastEvent(msg)
      fetchStatus()
      setTimeout(() => setLastEvent(null), 5000)
    } catch (e) {
      setLastEvent(`Error: ${e}`)
      setTimeout(() => setLastEvent(null), 5000)
    } finally {
      setClaiming(false)
    }
  }

  if (!status) {
    return (
      <div className="card">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-foreground-muted" />
          <span className="text-sm text-foreground-muted">Loading harvester...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sprout className="w-5 h-5 text-emerald-400" />
          <h3 className="font-semibold">Harvester</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400`}>
            Always On
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Force claim button */}
          <button
            onClick={forceClaim}
            disabled={claiming}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 text-xs font-medium transition-colors disabled:opacity-50"
            title="Force claim reward now"
          >
            {claiming ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Claim Now
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-background">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3.5 h-3.5 text-foreground-muted" />
            <span className="text-xs text-foreground-muted">Next Claim</span>
          </div>
          <div className={`text-sm font-mono font-semibold ${
            countdown === 'Ready!' ? 'text-emerald-400' : 'text-foreground'
          }`}>
            {countdown}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-background">
          <div className="flex items-center gap-1.5 mb-1">
            <Gift className="w-3.5 h-3.5 text-foreground-muted" />
            <span className="text-xs text-foreground-muted">Total Claims</span>
          </div>
          <div className="text-sm font-semibold text-foreground">
            {status.totalClaims}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-background">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3.5 h-3.5 text-foreground-muted" />
            <span className="text-xs text-foreground-muted">Last Claim</span>
          </div>
          <div className="text-xs font-medium text-foreground-muted">
            {status.lastClaimAt 
              ? new Date(status.lastClaimAt).toLocaleTimeString() 
              : 'Never'}
          </div>
        </div>
      </div>

      {/* Event notification */}
      {lastEvent && (
        <div className="mt-3 p-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs text-center">
          {lastEvent}
        </div>
      )}
    </div>
  )
}
