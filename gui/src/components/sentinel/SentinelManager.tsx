import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { 
  Shield, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Power, 
  PowerOff,
  TrendingDown,
  TrendingUp,
  Activity,
  AlertTriangle,
  ShieldAlert,
  Zap,
  Settings,
  X,
  CheckCircle2,
  Scan,
  Radio,
  Pause,
  Play,
  ArrowDownRight,
  ArrowUpRight,
  Search,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { SentinelForm } from './SentinelForm.tsx'
import { SentinelDetailModal } from './SentinelDetailModal.tsx'
import { buildImageUrl } from '@/lib/utils'
import type { SentinelConfig, CoinHolding, AppSettings, MonitorStatusResponse, SentinelTriggeredEvent, TradeExecutedEvent, TransactionRecord, TransactionListResponse } from '@/lib/types'

interface SentinelManagerProps {
  holdings?: CoinHolding[]
  onCoinClick?: (symbol: string) => void
  initialSearch?: string
}

interface SentinelCheckResult {
  checked: number
  triggered: number
  sold: string[]
  errors: string[]
  syncedRemoved: number
  syncedAdded: number
}

const DEFAULT_SENTINEL_SETTINGS = {
  stopLossPct: 10,
  takeProfitPct: 50,
  trailingStopPct: null as number | null,
  sellPercentage: 100,
}

export function SentinelManager({ holdings: externalHoldings = [], onCoinClick, initialSearch = '' }: SentinelManagerProps) {
  const [sentinels, setSentinels] = useState<SentinelConfig[]>([])
  const [liveHoldings, setLiveHoldings] = useState<CoinHolding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedHolding, setSelectedHolding] = useState<CoinHolding | null>(null)
  const [creatingBulk, setCreatingBulk] = useState(false)
  const [editingSentinel, setEditingSentinel] = useState<SentinelConfig | null>(null)
  const [detailSentinel, setDetailSentinel] = useState<SentinelConfig | null>(null)
  const [checkRunning, setCheckRunning] = useState(false)
  const [checkResult, setCheckResult] = useState<SentinelCheckResult | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [globalPaused, setGlobalPaused] = useState(false)
  const [applyingAll, setApplyingAll] = useState(false)
  const [togglingAll, setTogglingAll] = useState(false)
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatusResponse | null>(null)
  const [triggerNotifications, setTriggerNotifications] = useState<SentinelTriggeredEvent[]>([])
  const [tradeNotifications, setTradeNotifications] = useState<TradeExecutedEvent[]>([])

  // Search, sort and filter state
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [sortField, setSortField] = useState<'symbol' | 'entryPrice' | 'stopLossPct' | 'takeProfitPct' | 'sellPercentage' | 'status'>('symbol')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'triggered'>('all')

  useEffect(() => {
    if (initialSearch) setSearchQuery(initialSearch)
  }, [initialSearch])

  // Use external holdings as initial seed, but always prefer live data
  const holdings = liveHoldings.length > 0 ? liveHoldings : externalHoldings

  const fetchLiveHoldings = useCallback(async () => {
    try {
      const data = await invoke<{ coinHoldings: CoinHolding[] }>('get_portfolio')
      setLiveHoldings(data.coinHoldings)
    } catch (e) {
      console.error('Failed to fetch live holdings for sentinel:', e)
    }
  }, [])

  const getSettings = useCallback(async (): Promise<AppSettings['sentinelDefaults']> => {
    // Try backend first
    try {
      const backendSettings = await invoke<AppSettings | null>('get_app_settings')
      if (backendSettings?.sentinelDefaults) {
        return backendSettings.sentinelDefaults
      }
    } catch {
      // Backend not available
    }
    // Fallback to localStorage
    try {
      const stored = localStorage.getItem('rugplay_settings')
      if (stored) {
        const settings = JSON.parse(stored) as AppSettings
        return settings.sentinelDefaults
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
    return DEFAULT_SENTINEL_SETTINGS
  }, [])

  const getBlacklist = useCallback(async (): Promise<string[]> => {
    // Try backend first
    try {
      const backendSettings = await invoke<AppSettings | null>('get_app_settings')
      if (backendSettings) {
        return backendSettings.blacklistedCoins || []
      }
    } catch {
      // Backend not available
    }
    // Fallback to localStorage
    try {
      const stored = localStorage.getItem('rugplay_settings')
      if (stored) {
        const settings = JSON.parse(stored) as AppSettings
        return settings.blacklistedCoins || []
      }
    } catch (e) {
      console.error('Failed to load blacklist:', e)
    }
    return []
  }, [])

  const fetchSentinels = useCallback(async () => {
    try {
      setError(null)
      const data = await invoke<SentinelConfig[]>('list_sentinels')
      setSentinels(data)
    } catch (e) {
      setError(`Failed to load sentinels: ${e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchSentinels(), fetchLiveHoldings()])
  }, [fetchSentinels, fetchLiveHoldings])

  // Auto-check on mount: sync sentinels with portfolio + run price check
  const runAutoCheck = useCallback(async () => {
    try {
      const defaults = await getSettings()
      const blacklist = await getBlacklist()
      const syncResult = await invoke<SentinelCheckResult>('sync_sentinels', {
        blacklist,
        defaultStopLossPct: defaults.stopLossPct,
        defaultTakeProfitPct: defaults.takeProfitPct,
        defaultTrailingStopPct: defaults.trailingStopPct,
        defaultSellPercentage: defaults.sellPercentage,
      })
      
      if (syncResult.syncedRemoved > 0 || syncResult.syncedAdded > 0) {
        setSyncMessage(`Synced: ${syncResult.syncedAdded} added, ${syncResult.syncedRemoved} removed`)
        setTimeout(() => setSyncMessage(null), 5000)
      }

      // 2. Run sentinel price check
      const checkResult = await invoke<SentinelCheckResult>('run_sentinel_check')
      if (checkResult.triggered > 0) {
        setCheckResult(checkResult)
      }

      // 3. Refresh sentinel list AND live holdings
      await refreshAll()
    } catch (e) {
      console.error('Auto-check failed:', e)
    }
  }, [refreshAll, getSettings, getBlacklist])

  useEffect(() => {
    fetchSentinels()
    fetchLiveHoldings()
  }, [fetchSentinels, fetchLiveHoldings])

  // Run auto-check after sentinels are loaded
  useEffect(() => {
    if (!loading && sentinels.length >= 0) {
      runAutoCheck()
    }
  }, [loading, runAutoCheck])

  // Listen for sentinel-triggered events from background monitor
  useEffect(() => {
    const unlistenTrigger = listen<SentinelTriggeredEvent>('sentinel-triggered', (event) => {
      setTriggerNotifications(prev => [event.payload, ...prev].slice(0, 10))
      refreshAll()
    })

    const unlistenTrade = listen<TradeExecutedEvent>('trade-executed', (event) => {
      if (event.payload.reason.startsWith('Sentinel')) {
        setTradeNotifications(prev => [event.payload, ...prev].slice(0, 10))
        refreshAll()
      }
    })

    return () => {
      unlistenTrigger.then(u => u())
      unlistenTrade.then(u => u())
    }
  }, [refreshAll])

  // Fetch monitor status
  useEffect(() => {
    let mounted = true

    const fetchMonitorStatus = async () => {
      try {
        const status = await invoke<MonitorStatusResponse>('get_sentinel_monitor_status')
        if (mounted) setMonitorStatus(status)
      } catch {
        // Monitor may not be initialized yet
      }
    }

    fetchMonitorStatus()
    const interval = setInterval(fetchMonitorStatus, 10000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const handlePauseMonitor = async () => {
    try {
      await invoke('pause_sentinel_monitor')
      setMonitorStatus(prev => prev ? { ...prev, status: 'Paused', isPaused: true } : prev)
    } catch (e) {
      setError(`Failed to pause monitor: ${e}`)
    }
  }

  const handleResumeMonitor = async () => {
    try {
      await invoke('resume_sentinel_monitor')
      setMonitorStatus(prev => prev ? { ...prev, status: 'Running', isPaused: false } : prev)
    } catch (e) {
      setError(`Failed to resume monitor: ${e}`)
    }
  }

  const handleManualCheck = async () => {
    setCheckRunning(true)
    setCheckResult(null)
    setError(null)

    try {
      // Sync first, then check prices
      const defaults = await getSettings()
      const blacklist = await getBlacklist()
      await invoke<SentinelCheckResult>('sync_sentinels', {
        blacklist,
        defaultStopLossPct: defaults.stopLossPct,
        defaultTakeProfitPct: defaults.takeProfitPct,
        defaultTrailingStopPct: defaults.trailingStopPct,
        defaultSellPercentage: defaults.sellPercentage,
      })

      const result = await invoke<SentinelCheckResult>('run_sentinel_check')
      setCheckResult(result)
      await refreshAll()
    } catch (e) {
      setError(`Sentinel check failed: ${e}`)
    } finally {
      setCheckRunning(false)
    }
  }

  const handleToggle = async (id: number, isActive: boolean) => {
    try {
      await invoke('toggle_sentinel', { sentinelId: id, isActive: !isActive })
      setSentinels(prev => 
        prev.map(s => s.id === id ? { ...s, isActive: !isActive } : s)
      )
    } catch (e) {
      setError(`Failed to toggle sentinel: ${e}`)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this sentinel?')) return
    
    try {
      await invoke('delete_sentinel', { sentinelId: id })
      setSentinels(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      setError(`Failed to delete sentinel: ${e}`)
    }
  }

  const handleCreateSuccess = () => {
    setShowForm(false)
    setSelectedHolding(null)
    fetchSentinels()
  }

  const handleSaveEdit = async () => {
    if (!editingSentinel) return
    try {
      await invoke('update_sentinel', {
        sentinelId: editingSentinel.id,
        stopLossPct: editingSentinel.stopLossPct,
        takeProfitPct: editingSentinel.takeProfitPct,
        trailingStopPct: editingSentinel.trailingStopPct,
        sellPercentage: editingSentinel.sellPercentage,
      })
      setSentinels(prev => prev.map(s => s.id === editingSentinel.id ? editingSentinel : s))
      setEditingSentinel(null)
    } catch (e) {
      setError(`Failed to update sentinel: ${e}`)
    }
  }

  const handleToggleAll = async () => {
    const newActive = globalPaused // if currently paused, we're resuming
    setTogglingAll(true)
    setError(null)
    try {
      const count = await invoke<number>('toggle_all_sentinels', { isActive: newActive })
      setGlobalPaused(!newActive)
      setSyncMessage(`${newActive ? 'Resumed' : 'Paused'} ${count} sentinels`)
      setTimeout(() => setSyncMessage(null), 5000)
      await fetchSentinels()
    } catch (e) {
      setError(`Failed to toggle all sentinels: ${e}`)
    } finally {
      setTogglingAll(false)
    }
  }

  const handleApplyToAll = async () => {
    if (!editingSentinel) return
    setApplyingAll(true)
    setError(null)
    try {
      const count = await invoke<number>('update_all_sentinels', {
        stopLossPct: editingSentinel.stopLossPct,
        takeProfitPct: editingSentinel.takeProfitPct,
        trailingStopPct: editingSentinel.trailingStopPct,
        sellPercentage: editingSentinel.sellPercentage,
      })
      setSyncMessage(`Applied settings to ${count} sentinels`)
      setTimeout(() => setSyncMessage(null), 5000)
      setEditingSentinel(null)
      await fetchSentinels()
    } catch (e) {
      setError(`Failed to apply settings to all: ${e}`)
    } finally {
      setApplyingAll(false)
    }
  }

  // Only count coins as protected if they have an active, non-triggered sentinel
  const protectedSymbols = new Set(
    sentinels
      .filter(s => s.isActive && s.triggeredAt === null)
      .map(s => s.symbol)
  )
  const [blacklistArr, setBlacklistArr] = useState<string[]>([])
  useEffect(() => {
    getBlacklist().then(setBlacklistArr)
  }, [getBlacklist])
  const blacklist = new Set(blacklistArr)
  const unprotectedHoldings = holdings.filter(
    h => !protectedSymbols.has(h.symbol) && !blacklist.has(h.symbol)
  )

  const handleBulkCreate = async () => {
    if (unprotectedHoldings.length === 0) return
    
    const defaults = await getSettings()
    setCreatingBulk(true)
    setError(null)

    try {
      for (const holding of unprotectedHoldings) {
        await invoke('create_sentinel', {
          request: {
            symbol: holding.symbol,
            stopLossPct: defaults.stopLossPct,
            takeProfitPct: defaults.takeProfitPct,
            trailingStopPct: defaults.trailingStopPct,
            sellPercentage: defaults.sellPercentage,
            entryPrice: holding.avgPurchasePrice,
          }
        })
      }
      await fetchSentinels()
    } catch (e) {
      setError(`Failed to create sentinels: ${e}`)
    } finally {
      setCreatingBulk(false)
    }
  }

  const formatPercent = (val: number | null) => {
    if (val === null) return '-'
    return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
  }

  const formatPrice = (price: number) => {
    if (price < 0.0001) return `$${price.toExponential(2)}`
    if (price < 0.01) return `$${price.toFixed(6)}`
    if (price < 1) return `$${price.toFixed(4)}`
    return `$${price.toFixed(2)}`
  }

  // Transaction tooltip state
  const [tooltipSymbol, setTooltipSymbol] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [tooltipTxs, setTooltipTxs] = useState<TransactionRecord[]>([])
  const [tooltipLoading, setTooltipLoading] = useState(false)
  const txCache = useRef<Record<string, TransactionRecord[]>>({})
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRowMouseEnter = useCallback((symbol: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top })

    hoverTimer.current = setTimeout(async () => {
      if (txCache.current[symbol]) {
        setTooltipTxs(txCache.current[symbol])
        setTooltipSymbol(symbol)
        return
      }
      setTooltipLoading(true)
      setTooltipSymbol(symbol)
      try {
        const resp = await invoke<TransactionListResponse>('get_transactions', {
          page: 1, limit: 100, tradeType: null, search: symbol,
        })
        const filtered = resp.transactions.filter(tx => tx.symbol === symbol)
        txCache.current[symbol] = filtered
        setTooltipTxs(filtered)
      } catch {
        setTooltipTxs([])
      } finally {
        setTooltipLoading(false)
      }
    }, 350)
  }, [])

  const handleRowMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setTooltipSymbol(null)
    setTooltipLoading(false)
  }, [])

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-0.5" />
      : <ChevronDown className="w-3 h-3 inline ml-0.5" />
  }

  const getStatusKey = (s: SentinelConfig) => {
    if (s.triggeredAt) return 'triggered'
    if (s.isActive) return 'active'
    return 'paused'
  }

  const filteredSentinels = sentinels
    .filter(s => {
      if (searchQuery && !s.symbol.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (statusFilter !== 'all' && getStatusKey(s) !== statusFilter) return false
      return true
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortField) {
        case 'symbol':
          return dir * a.symbol.localeCompare(b.symbol)
        case 'entryPrice':
          return dir * (a.entryPrice - b.entryPrice)
        case 'stopLossPct':
          return dir * ((a.stopLossPct ?? -Infinity) - (b.stopLossPct ?? -Infinity))
        case 'takeProfitPct':
          return dir * ((a.takeProfitPct ?? -Infinity) - (b.takeProfitPct ?? -Infinity))
        case 'sellPercentage':
          return dir * (a.sellPercentage - b.sellPercentage)
        case 'status': {
          const order = { active: 0, paused: 1, triggered: 2 }
          return dir * (order[getStatusKey(a)] - order[getStatusKey(b)])
        }
        default:
          return 0
      }
    })

  const activeSentinels = sentinels.filter(s => s.isActive)
  const triggeredSentinels = sentinels.filter(s => s.triggeredAt !== null)
  const nonTriggeredSentinels = sentinels.filter(s => s.triggeredAt === null)
  // Derive global pause: if we have sentinels but none are active (excluding triggered ones)
  const isEffectivelyPaused = nonTriggeredSentinels.length > 0 && nonTriggeredSentinels.every(s => !s.isActive)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Sentinel</h1>
            <p className="text-sm text-foreground-muted">
              Stop-Loss, Take-Profit & Trailing Stops
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sentinels.length > 0 && (
            <button
              onClick={handleToggleAll}
              disabled={togglingAll}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                isEffectivelyPaused || globalPaused
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
              title={isEffectivelyPaused || globalPaused ? 'Resume all sentinels' : 'Pause all sentinel actions'}
            >
              {togglingAll ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isEffectivelyPaused || globalPaused ? (
                <Power className="w-4 h-4" />
              ) : (
                <PowerOff className="w-4 h-4" />
              )}
              {isEffectivelyPaused || globalPaused ? 'Resume All' : 'Stop All'}
            </button>
          )}
          <button
            onClick={handleManualCheck}
            disabled={checkRunning}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
            title="Run sentinel check now"
          >
            {checkRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Scan className="w-4 h-4" />
            )}
            Check Now
          </button>
          <button
            onClick={fetchSentinels}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Sentinel
          </button>
        </div>
      </div>

      {/* Global paused warning */}
      {(isEffectivelyPaused || globalPaused) && sentinels.length > 0 && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-rose-500/20 border border-rose-500/30">
          <div className="flex items-center gap-3">
            <PowerOff className="w-5 h-5 text-rose-400" />
            <div>
              <p className="font-medium text-rose-400">Sentinel Paused</p>
              <p className="text-sm text-foreground-muted">
                All sentinel actions are stopped. No stop-losses, take-profits, or trailing stops will execute.
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleAll}
            disabled={togglingAll}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors disabled:opacity-50"
          >
            Resume
          </button>
        </div>
      )}

      {/* Sync message */}
      {syncMessage && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/20 text-blue-400 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          {syncMessage}
        </div>
      )}

      {/* Check result */}
      {checkResult && (
        <div className={`p-4 rounded-lg ${checkResult.triggered > 0 ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-emerald-500/20 border border-emerald-500/30'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`font-medium ${checkResult.triggered > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                Sentinel Check Complete
              </p>
              <p className="text-sm text-foreground-muted mt-1">
                Checked {checkResult.checked} sentinels • {checkResult.triggered} triggered
                {checkResult.syncedRemoved > 0 && ` • ${checkResult.syncedRemoved} removed (sold)`}
                {checkResult.syncedAdded > 0 && ` • ${checkResult.syncedAdded} auto-added`}
              </p>
              {checkResult.sold.length > 0 && (
                <div className="mt-2 space-y-1">
                  {checkResult.sold.map((s, i) => (
                    <p key={i} className="text-sm text-amber-300">• {s}</p>
                  ))}
                </div>
              )}
              {checkResult.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {checkResult.errors.map((e, i) => (
                    <p key={i} className="text-sm text-sell">• {e}</p>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setCheckResult(null)} className="p-1 hover:bg-background-tertiary rounded">
              <X className="w-4 h-4 text-foreground-muted" />
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Monitor Status Card */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${monitorStatus?.status === 'Running' ? 'bg-emerald-500/20' : monitorStatus?.status === 'Paused' ? 'bg-amber-500/20' : 'bg-zinc-500/20'}`}>
                <Radio className={`w-5 h-5 ${monitorStatus?.status === 'Running' ? 'text-emerald-400' : monitorStatus?.status === 'Paused' ? 'text-amber-400' : 'text-zinc-400'}`} />
              </div>
              <div>
                <p className="text-sm text-foreground-muted">Monitor</p>
                <p className="text-xl font-bold">{monitorStatus?.status || '...'}</p>
              </div>
            </div>
            <button
              onClick={monitorStatus?.isPaused ? handleResumeMonitor : handlePauseMonitor}
              className={`p-2 rounded-lg transition-colors ${monitorStatus?.isPaused ? 'hover:bg-emerald-500/20 text-emerald-400' : 'hover:bg-amber-500/20 text-amber-400'}`}
              title={monitorStatus?.isPaused ? 'Resume Monitor' : 'Pause Monitor'}
            >
              {monitorStatus?.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-foreground-muted">Active Sentinels</p>
              <p className="text-xl font-bold">{activeSentinels.length}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-foreground-muted">Total Sentinels</p>
              <p className="text-xl font-bold">{sentinels.length}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-foreground-muted">Triggered</p>
              <p className="text-xl font-bold">{triggeredSentinels.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Live Trigger Notifications */}
      {(triggerNotifications.length > 0 || tradeNotifications.length > 0) && (
        <div className="card border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="font-medium text-amber-400">Recent Sentinel Activity</h3>
            </div>
            <button
              onClick={() => { setTriggerNotifications([]); setTradeNotifications([]) }}
              className="text-xs text-foreground-muted hover:text-foreground"
            >
              Clear
            </button>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {triggerNotifications.map((n, i) => (
              <div key={`trigger-${i}`} className="flex items-center gap-2 text-sm p-2 rounded bg-background-tertiary/50">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  n.triggerType === 'stop_loss' ? 'bg-sell/20 text-sell' :
                  n.triggerType === 'take_profit' ? 'bg-buy/20 text-buy' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {n.triggerType === 'stop_loss' ? 'SL' : n.triggerType === 'take_profit' ? 'TP' : 'TS'}
                </span>
                <span className="font-medium">${n.symbol}</span>
                <span className="text-foreground-muted">—</span>
                <span className="text-foreground-muted truncate">{n.reason}</span>
              </div>
            ))}
            {tradeNotifications.map((n, i) => (
              <div key={`trade-${i}`} className="flex items-center gap-2 text-sm p-2 rounded bg-background-tertiary/50">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${n.success ? 'bg-buy/20 text-buy' : 'bg-sell/20 text-sell'}`}>
                  {n.success ? 'SOLD' : 'FAIL'}
                </span>
                <span className="font-medium">${n.symbol}</span>
                <span className="text-foreground-muted">—</span>
                <span className="text-foreground-muted truncate">
                  {n.success ? `${n.tradeType} @ $${n.newPrice.toFixed(6)}` : n.error}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-sell/20 text-sell">
          {error}
        </div>
      )}

      {/* Unprotected Holdings Warning */}
      {unprotectedHoldings.length > 0 && (
        <div className="card border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-amber-400">Unprotected Holdings</h2>
                <p className="text-sm text-foreground-muted">
                  {unprotectedHoldings.length} holdings without active sentinels
                </p>
              </div>
            </div>
            <button
              onClick={handleBulkCreate}
              disabled={creatingBulk}
              className="btn-primary flex items-center gap-2 bg-amber-500 hover:bg-amber-600"
            >
              {creatingBulk ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Protect All
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {unprotectedHoldings.map((holding) => (
              <button
                key={holding.symbol}
                onClick={() => {
                  setSelectedHolding(holding)
                  setShowForm(true)
                }}
                className="px-3 py-1.5 rounded-lg bg-background-tertiary hover:bg-background-secondary flex items-center gap-2 text-sm transition-colors"
              >
                {buildImageUrl(holding.icon) ? (
                  <img
                    src={buildImageUrl(holding.icon)!}
                    alt={holding.symbol}
                    className="w-5 h-5 rounded-full"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                ) : (
                  <span className="text-xs font-bold">{holding.symbol.substring(0, 2)}</span>
                )}
                <span className="font-medium">{holding.symbol}</span>
                <span className="text-foreground-muted">{formatPrice(holding.value)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sentinels List */}
      <div className="card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold">All Sentinels</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input
              type="text"
              placeholder="Search coins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9 pr-3 py-1.5 text-sm w-full"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-background-tertiary rounded"
              >
                <X className="w-3.5 h-3.5 text-foreground-muted" />
              </button>
            )}
          </div>
        </div>

        {/* Status filter tabs */}
        {sentinels.length > 0 && (
          <div className="flex items-center gap-1 mb-4 p-1 bg-background-tertiary/50 rounded-lg w-fit">
            {(['all', 'active', 'paused', 'triggered'] as const).map((tab) => {
              const count = tab === 'all' ? sentinels.length
                : tab === 'active' ? sentinels.filter(s => s.isActive && !s.triggeredAt).length
                : tab === 'paused' ? sentinels.filter(s => !s.isActive && !s.triggeredAt).length
                : triggeredSentinels.length
              return (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    statusFilter === tab
                      ? 'bg-background-secondary text-foreground shadow-sm'
                      : 'text-foreground-muted hover:text-foreground'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  <span className="ml-1.5 text-foreground-muted">{count}</span>
                </button>
              )
            })}
          </div>
        )}

        {sentinels.length === 0 ? (
          <div className="text-center py-12 text-foreground-muted">
            <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No sentinels configured</p>
            <p className="text-sm mb-4">Set up stop-loss or take-profit on your holdings</p>
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary"
            >
              Create Sentinel
            </button>
          </div>
        ) : filteredSentinels.length === 0 ? (
          <div className="text-center py-8 text-foreground-muted">
            <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No sentinels match{searchQuery ? ` "${searchQuery}"` : ''}{statusFilter !== 'all' ? ` in ${statusFilter}` : ''}</p>
            {(searchQuery || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter('all') }}
                className="mt-2 text-xs text-emerald-400 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-background-tertiary">
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-foreground-muted cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort('symbol')}
                  >
                    Coin <SortIcon field="symbol" />
                  </th>
                  <th
                    className="text-right px-4 py-3 text-xs font-medium text-foreground-muted cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort('entryPrice')}
                  >
                    Entry Price <SortIcon field="entryPrice" />
                  </th>
                  <th
                    className="text-right px-4 py-3 text-xs font-medium text-foreground-muted cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort('stopLossPct')}
                  >
                    Stop Loss <SortIcon field="stopLossPct" />
                  </th>
                  <th
                    className="text-right px-4 py-3 text-xs font-medium text-foreground-muted cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort('takeProfitPct')}
                  >
                    Take Profit <SortIcon field="takeProfitPct" />
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">Trailing Stop</th>
                  <th
                    className="text-right px-4 py-3 text-xs font-medium text-foreground-muted cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort('sellPercentage')}
                  >
                    Sell % <SortIcon field="sellPercentage" />
                  </th>
                  <th
                    className="text-center px-4 py-3 text-xs font-medium text-foreground-muted cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort('status')}
                  >
                    Status <SortIcon field="status" />
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-foreground-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSentinels.map((sentinel) => {
                  const matchedHolding = holdings.find(h => h.symbol === sentinel.symbol)
                  const iconUrl = buildImageUrl(matchedHolding?.icon)
                  return (
                  <tr 
                    key={sentinel.id}
                    onClick={() => setDetailSentinel({ ...sentinel })}
                    onMouseEnter={(e) => handleRowMouseEnter(sentinel.symbol, e)}
                    onMouseLeave={handleRowMouseLeave}
                    className="border-b border-background-tertiary/50 hover:bg-background-tertiary/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium">
                      <div
                        className={`flex items-center gap-2.5 ${onCoinClick ? 'hover:text-emerald-400 transition-colors' : ''}`}
                        onClick={(e) => {
                          if (onCoinClick) {
                            e.stopPropagation()
                            onCoinClick(sentinel.symbol)
                          }
                        }}
                        title={onCoinClick ? `View ${sentinel.symbol} coin page` : undefined}
                      >
                        <div className="w-7 h-7 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden flex-shrink-0">
                          {iconUrl ? (
                            <img
                              src={iconUrl}
                              alt={sentinel.symbol}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                                e.currentTarget.parentElement!.innerHTML = `<span class="text-xs font-bold">${sentinel.symbol.substring(0, 2).toUpperCase()}</span>`
                              }}
                            />
                          ) : (
                            <span className="text-xs font-bold text-foreground-muted">
                              {sentinel.symbol.substring(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="font-medium text-sm">${sentinel.symbol}</span>
                      </div>
                    </td>
                    <td className="text-right px-4 py-3 text-sm">{formatPrice(sentinel.entryPrice)}</td>
                    <td className="text-right px-4 py-3">
                      {sentinel.stopLossPct !== null ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm bg-sell/20 text-sell">
                          <TrendingDown className="w-3 h-3" />
                          {formatPercent(sentinel.stopLossPct)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="text-right px-4 py-3">
                      {sentinel.takeProfitPct !== null ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm bg-buy/20 text-buy">
                          <TrendingUp className="w-3 h-3" />
                          {formatPercent(sentinel.takeProfitPct)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="text-right px-4 py-3">
                      {sentinel.trailingStopPct !== null ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm bg-amber-500/20 text-amber-400">
                          <Activity className="w-3 h-3" />
                          {formatPercent(-sentinel.trailingStopPct)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="text-right px-4 py-3 text-sm">{sentinel.sellPercentage}%</td>
                    <td className="text-center px-4 py-3">
                      {sentinel.triggeredAt ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">
                          Triggered
                        </span>
                      ) : sentinel.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">
                          Paused
                        </span>
                      )}
                    </td>
                    <td className="text-right px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingSentinel({ ...sentinel }) }}
                          className="p-1.5 rounded hover:bg-background-tertiary transition-colors"
                          title="Edit settings"
                        >
                          <Settings className="w-4 h-4 text-foreground-muted" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggle(sentinel.id, sentinel.isActive) }}
                          disabled={sentinel.triggeredAt !== null}
                          className="p-1.5 rounded hover:bg-background-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={sentinel.isActive ? 'Pause' : 'Resume'}
                        >
                          {sentinel.isActive ? (
                            <PowerOff className="w-4 h-4 text-foreground-muted" />
                          ) : (
                            <Power className="w-4 h-4 text-emerald-400" />
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(sentinel.id) }}
                          className="p-1.5 rounded hover:bg-sell/20 text-foreground-muted hover:text-sell transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredSentinels.length !== sentinels.length && (
              <p className="text-xs text-foreground-muted text-center py-2 border-t border-background-tertiary/50">
                Showing {filteredSentinels.length} of {sentinels.length} sentinels
              </p>
            )}
          </div>
        )}
      </div>

      {/* Transaction Hover Tooltip */}
      {tooltipSymbol && (
        <div
          className="fixed z-40 pointer-events-none"
          style={{
            left: `${Math.min(tooltipPos.x, window.innerWidth - 200)}px`,
            top: `${tooltipPos.y - 8}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="bg-background-secondary border border-background-tertiary rounded-lg shadow-xl p-3 min-w-[240px] max-w-[320px]">
            <p className="text-xs font-semibold text-foreground-muted mb-2">
              ${tooltipSymbol} — Recent Transactions
            </p>
            {tooltipLoading ? (
              <div className="flex items-center gap-2 text-xs text-foreground-muted py-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Loading...
              </div>
            ) : tooltipTxs.length === 0 ? (
              <p className="text-xs text-foreground-muted py-1">No transactions found</p>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {tooltipTxs.slice(0, 8).map((tx, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-xs py-0.5">
                    <div className="flex items-center gap-1.5">
                      {tx.tradeType === 'BUY' ? (
                        <ArrowDownRight className="w-3 h-3 text-buy flex-shrink-0" />
                      ) : (
                        <ArrowUpRight className="w-3 h-3 text-sell flex-shrink-0" />
                      )}
                      <span className={tx.tradeType === 'BUY' ? 'text-buy font-medium' : 'text-sell font-medium'}>
                        {tx.tradeType}
                      </span>
                      <span className="text-foreground-muted">{formatTime(tx.timestamp)}</span>
                    </div>
                    <span className="font-mono tabular-nums">${tx.usdValue.toFixed(2)}</span>
                  </div>
                ))}
                {tooltipTxs.length > 8 && (
                  <p className="text-xs text-foreground-muted pt-1 text-center">
                    +{tooltipTxs.length - 8} more — click for details
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sentinel Detail Modal */}
      {detailSentinel && (
        <SentinelDetailModal
          sentinel={detailSentinel}
          holding={holdings.find(h => h.symbol === detailSentinel.symbol)}
          onClose={() => setDetailSentinel(null)}
          onEdit={(s) => {
            setDetailSentinel(null)
            setEditingSentinel({ ...s })
          }}
          onCoinClick={onCoinClick}
        />
      )}

      {/* Create Sentinel Form Modal */}
      {showForm && (
        <SentinelForm
          holdings={holdings}
          selectedHolding={selectedHolding}
          onClose={() => {
            setShowForm(false)
            setSelectedHolding(null)
          }}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* Edit Sentinel Modal */}
      {editingSentinel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background-secondary rounded-xl w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-background-tertiary">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-bold">Edit Sentinel — ${editingSentinel.symbol}</h2>
              </div>
              <button onClick={() => setEditingSentinel(null)} className="p-1 hover:bg-background-tertiary rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="p-3 rounded-lg bg-background-tertiary text-sm">
                <span className="text-foreground-muted">Entry Price: </span>
                <span className="font-mono font-bold">{formatPrice(editingSentinel.entryPrice)}</span>
              </div>

              {/* Stop Loss */}
              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={editingSentinel.stopLossPct !== null}
                    onChange={(e) => setEditingSentinel({
                      ...editingSentinel,
                      stopLossPct: e.target.checked ? 10 : null,
                    })}
                    className="rounded"
                  />
                  <TrendingDown className="w-4 h-4 text-sell" />
                  <span className="text-sm font-medium">Stop Loss</span>
                </label>
                {editingSentinel.stopLossPct !== null && (
                  <input
                    type="number"
                    value={editingSentinel.stopLossPct}
                    onChange={(e) => setEditingSentinel({ ...editingSentinel, stopLossPct: parseFloat(e.target.value) || 0 })}
                    className="input text-sm"
                    placeholder="Stop loss %"
                  />
                )}
              </div>

              {/* Take Profit */}
              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={editingSentinel.takeProfitPct !== null}
                    onChange={(e) => setEditingSentinel({
                      ...editingSentinel,
                      takeProfitPct: e.target.checked ? 50 : null,
                    })}
                    className="rounded"
                  />
                  <TrendingUp className="w-4 h-4 text-buy" />
                  <span className="text-sm font-medium">Take Profit</span>
                </label>
                {editingSentinel.takeProfitPct !== null && (
                  <input
                    type="number"
                    value={editingSentinel.takeProfitPct}
                    onChange={(e) => setEditingSentinel({ ...editingSentinel, takeProfitPct: parseFloat(e.target.value) || 0 })}
                    className="input text-sm"
                    placeholder="Take profit %"
                  />
                )}
              </div>

              {/* Trailing Stop */}
              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={editingSentinel.trailingStopPct !== null}
                    onChange={(e) => setEditingSentinel({
                      ...editingSentinel,
                      trailingStopPct: e.target.checked ? 10 : null,
                    })}
                    className="rounded"
                  />
                  <Activity className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium">Trailing Stop</span>
                </label>
                {editingSentinel.trailingStopPct !== null && (
                  <input
                    type="number"
                    value={editingSentinel.trailingStopPct}
                    onChange={(e) => setEditingSentinel({ ...editingSentinel, trailingStopPct: parseFloat(e.target.value) || 0 })}
                    className="input text-sm"
                    placeholder="Trailing stop %"
                  />
                )}
              </div>

              {/* Sell Percentage */}
              <div>
                <label className="block text-sm font-medium mb-2">Sell Percentage: {editingSentinel.sellPercentage}%</label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={editingSentinel.sellPercentage}
                  onChange={(e) => setEditingSentinel({ ...editingSentinel, sellPercentage: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingSentinel(null)}
                    className="flex-1 py-2 rounded-lg bg-background-tertiary hover:bg-background text-foreground-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
                <button
                  onClick={handleApplyToAll}
                  disabled={applyingAll}
                  className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  title="Apply these SL/TP/trailing/sell% settings to ALL sentinels"
                >
                  {applyingAll ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  Apply to All Sentinels
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
