import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  ScrollText,
  RefreshCw,
  Filter,
  Crosshair,
  Shield,
  Users,
  TrendingDown,
  Gift,
  Zap,
} from 'lucide-react'
import { activityStore } from '@/lib/activityStore'
import type { AutomationLogEntry } from '@/lib/types'

const MODULE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  sniper: {
    label: 'Sniper',
    icon: <Crosshair className="w-4 h-4" />,
    color: 'text-amber-400',
  },
  sentinel: {
    label: 'Sentinel',
    icon: <Shield className="w-4 h-4" />,
    color: 'text-emerald-400',
  },
  mirror: {
    label: 'Mirror',
    icon: <Users className="w-4 h-4" />,
    color: 'text-purple-400',
  },
  dipbuyer: {
    label: 'Dip Buyer',
    icon: <TrendingDown className="w-4 h-4" />,
    color: 'text-cyan-400',
  },
  harvester: {
    label: 'Harvester',
    icon: <Gift className="w-4 h-4" />,
    color: 'text-yellow-400',
  },
}

export function AutomationLogPage() {
  const [dbEntries, setDbEntries] = useState<AutomationLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [moduleFilter, setModuleFilter] = useState<string | null>(null)

  const liveActivities = useSyncExternalStore(
    activityStore.subscribeActivities,
    activityStore.getActivities,
  )

  const fetchLog = useCallback(async () => {
    try {
      const entries = await invoke<AutomationLogEntry[]>('get_automation_log', {
        module: moduleFilter,
        limit: 200,
      })
      setDbEntries(entries)
    } catch (e) {
      console.error('Failed to fetch automation log:', e)
    } finally {
      setLoading(false)
    }
  }, [moduleFilter])

  useEffect(() => {
    fetchLog()
    const interval = setInterval(fetchLog, 15000)
    return () => clearInterval(interval)
  }, [fetchLog])

  const modules = ['sniper', 'sentinel', 'mirror', 'dipbuyer', 'harvester']

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20">
            <ScrollText className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Automation Log</h1>
            <p className="text-sm text-foreground-muted">
              Centralized feed of all automated actions
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setLoading(true)
            fetchLog()
          }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Live Session Activity (in-memory) */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold">Live Activity (This Session)</h2>
          <span className="text-xs text-foreground-muted bg-background-tertiary px-2 py-0.5 rounded">
            {liveActivities.length}
          </span>
        </div>

        {liveActivities.length === 0 ? (
          <div className="text-center py-6 text-foreground-muted">
            <Zap className="w-6 h-6 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No automation events this session yet.</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {liveActivities.slice(0, 20).map((item) => {
              const meta = MODULE_META[item.type] || {
                label: item.type,
                icon: <Zap className="w-4 h-4" />,
                color: 'text-zinc-400',
              }
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-background text-sm"
                >
                  <span className={meta.color}>{meta.icon}</span>
                  <span className="font-medium text-foreground">{item.title}</span>
                  <span className="text-foreground-muted flex-1 truncate">
                    {item.description}
                  </span>
                  <span className="text-xs text-foreground-muted whitespace-nowrap">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Module Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-foreground-muted" />
        <button
          onClick={() => setModuleFilter(null)}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            moduleFilter === null
              ? 'bg-indigo-600 text-white'
              : 'bg-zinc-800 text-foreground-muted hover:bg-zinc-700'
          }`}
        >
          All
        </button>
        {modules.map((mod) => {
          const meta = MODULE_META[mod]
          return (
            <button
              key={mod}
              onClick={() => setModuleFilter(mod)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                moduleFilter === mod
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-foreground-muted hover:bg-zinc-700'
              }`}
            >
              {meta?.icon}
              {meta?.label || mod}
            </button>
          )
        })}
      </div>

      {/* Persistent DB Log */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <ScrollText className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold">Persistent Log</h2>
          <span className="text-xs text-foreground-muted bg-background-tertiary px-2 py-0.5 rounded">
            {dbEntries.length} entries
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-foreground-muted" />
          </div>
        ) : dbEntries.length === 0 ? (
          <div className="text-center py-12 text-foreground-muted">
            <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              {moduleFilter
                ? `No ${MODULE_META[moduleFilter]?.label || moduleFilter} entries yet.`
                : 'No automation entries yet. Enable a strategy to get started.'}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {dbEntries.map((entry) => {
              const meta = MODULE_META[entry.module] || {
                label: entry.module,
                icon: <Zap className="w-4 h-4" />,
                color: 'text-zinc-400',
              }
              let details: Record<string, unknown> = {}
              try {
                details = JSON.parse(entry.details)
              } catch {
                // ignore
              }

              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background hover:bg-background-tertiary transition-colors"
                >
                  <span className={meta.color}>{meta.icon}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${meta.color} bg-opacity-20`}
                    style={{
                      backgroundColor:
                        meta.color === 'text-amber-400'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : meta.color === 'text-emerald-400'
                            ? 'rgba(52, 211, 153, 0.15)'
                            : meta.color === 'text-purple-400'
                              ? 'rgba(192, 132, 252, 0.15)'
                              : meta.color === 'text-cyan-400'
                                ? 'rgba(34, 211, 238, 0.15)'
                                : 'rgba(250, 204, 21, 0.15)',
                    }}
                  >
                    {meta.label}
                  </span>
                  <span className="font-medium text-foreground">
                    {entry.action} ${entry.symbol}
                  </span>
                  <span className="text-foreground-muted text-sm">{entry.coinName}</span>
                  <span className="text-emerald-400 text-sm">
                    ${entry.amountUsd.toFixed(2)}
                  </span>
                  {details.sellerUsername ? (
                    <span className="text-foreground-muted text-xs">
                      seller: @{String(details.sellerUsername)}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-foreground-muted whitespace-nowrap">
                    {entry.createdAt
                      ? new Date(entry.createdAt).toLocaleString()
                      : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
