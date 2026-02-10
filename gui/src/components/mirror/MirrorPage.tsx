import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  Users,
  Plus,
  Trash2,
  Search,
  ToggleLeft,
  ToggleRight,
  Activity,
  AlertCircle,
  User,
  Loader2,
} from 'lucide-react'
import { FormattedInput, ToggleSwitch } from '@/components/ui/FormattedInput'

// Backend response types matching Rust structs

interface MirrorConfig {
  scaleFactor: number
  maxTradeUsd: number
  maxLatencySecs: number
  autoCreateSentinel: boolean
  stopLossPct: number
  takeProfitPct: number
  trailingStopPct: number | null
  skipIfAlreadyHeld: boolean
  pollIntervalSecs: number
}

interface MirrorStatusResponse {
  enabled: boolean
  config: MirrorConfig
  trackedWhaleCount: number
  totalMirrored: number
  lastMirroredAt: string | null
}

interface TrackedWhaleResponse {
  userId: string
  username: string
  performanceScore: number
  trackedSince: string
}

interface WhaleProfileResponse {
  userId: string
  username: string
  name: string
  image: string | null
  balance: number
  holdingsCount: number
  totalVolume: number
  portfolioValue: number
}

interface MirrorTradeRecord {
  whaleUsername: string
  whaleUserId: string
  coinSymbol: string
  coinName: string
  tradeType: string
  whaleAmountUsd: number
  ourAmountUsd: number
  timestamp: string
  success: boolean
}

interface MirrorTriggeredEvent {
  whaleUsername: string
  whaleUserId: string
  coinSymbol: string
  coinName: string
  whaleAmountUsd: number
  ourAmountUsd: number
  tradeType: string
  latencySecs: number
}

export function MirrorPage() {
  const [enabled, setEnabled] = useState(false)
  const [whales, setWhales] = useState<TrackedWhaleResponse[]>([])
  const [config, setConfig] = useState<MirrorConfig>({
    scaleFactor: 0.10,
    maxTradeUsd: 5000,
    maxLatencySecs: 5,
    autoCreateSentinel: true,
    stopLossPct: -25,
    takeProfitPct: 100,
    trailingStopPct: 15,
    skipIfAlreadyHeld: true,
    pollIntervalSecs: 0,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<WhaleProfileResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [mirrorLog, setMirrorLog] = useState<MirrorTradeRecord[]>([])
  const [totalMirrored, setTotalMirrored] = useState(0)

  // Load mirror status on mount
  useEffect(() => {
    loadMirrorStatus()
    loadTrackedWhales()
    loadMirrorTrades()
  }, [])

  // Listen for mirror events
  useEffect(() => {
    const unlisteners: (() => void)[] = []

    listen<MirrorTriggeredEvent>('mirror-triggered', (event) => {
      const record: MirrorTradeRecord = {
        whaleUsername: event.payload.whaleUsername,
        whaleUserId: event.payload.whaleUserId,
        coinSymbol: event.payload.coinSymbol,
        coinName: event.payload.coinName,
        tradeType: event.payload.tradeType,
        whaleAmountUsd: event.payload.whaleAmountUsd,
        ourAmountUsd: event.payload.ourAmountUsd,
        timestamp: new Date().toISOString(),
        success: true,
      }
      setMirrorLog((prev) => [record, ...prev].slice(0, 50))
      setTotalMirrored((prev) => prev + 1)
    }).then((u) => unlisteners.push(u))

    return () => unlisteners.forEach((u) => u())
  }, [])

  const loadMirrorStatus = async () => {
    try {
      const status = await invoke<MirrorStatusResponse>('get_mirror_status')
      setEnabled(status.enabled)
      setConfig(status.config)
      setTotalMirrored(status.totalMirrored)
    } catch (e) {
      console.debug('Mirror status not available:', e)
    }
  }

  const loadTrackedWhales = async () => {
    try {
      const list = await invoke<TrackedWhaleResponse[]>('list_tracked_whales')
      setWhales(list)
    } catch (e) {
      console.debug('Failed to load tracked whales:', e)
    }
  }

  const loadMirrorTrades = async () => {
    try {
      const trades = await invoke<MirrorTradeRecord[]>('get_mirror_trades')
      setMirrorLog(trades)
    } catch (e) {
      console.debug('Failed to load mirror trades:', e)
    }
  }

  const toggleEnabled = async () => {
    const newEnabled = !enabled
    try {
      await invoke('set_mirror_enabled', { enabled: newEnabled })
      setEnabled(newEnabled)
    } catch (e) {
      console.error('Failed to toggle mirror:', e)
      // Still toggle locally for UX until backend is wired
      setEnabled(newEnabled)
    }
  }

  const searchWhale = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchError(null)
    setSearchResult(null)
    try {
      const profile = await invoke<WhaleProfileResponse>('get_whale_profile', {
        userId: searchQuery.trim(),
      })
      setSearchResult(profile)
    } catch (e) {
      setSearchError(String(e))
    } finally {
      setSearching(false)
    }
  }

  const addWhale = async (userId: string, username: string) => {
    try {
      await invoke('add_tracked_whale', { userId, username })
      // Reload from DB
      await loadTrackedWhales()
      setSearchResult(null)
      setSearchQuery('')
    } catch (e) {
      console.error('Failed to add whale:', e)
    }
  }

  const removeWhale = async (userId: string) => {
    try {
      await invoke('remove_tracked_whale', { userId })
      setWhales((prev) => prev.filter((w) => w.userId !== userId))
    } catch (e) {
      console.error('Failed to remove whale:', e)
    }
  }

  const updateConfig = async (updates: Partial<MirrorConfig>) => {
    const newConfig = { ...config, ...updates }
    setConfig(newConfig)
    try {
      await invoke('update_mirror_config', { config: newConfig })
    } catch (e) {
      console.debug('Config save pending backend:', e)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Users className="w-7 h-7 text-cyan-400" />
            Mirror Trading
          </h1>
          <p className="text-foreground-muted mt-1">
            Copy trades from top traders automatically
            {totalMirrored > 0 && (
              <span className="ml-2 text-cyan-400">· {totalMirrored} trades mirrored</span>
            )}
          </p>
        </div>
        <button
          onClick={toggleEnabled}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            enabled
              ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
              : 'bg-background-tertiary text-foreground-muted hover:bg-background-tertiary/80'
          }`}
        >
          {enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {/* Config Panel */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4">Mirror Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Scale Factor (% of whale's trade)
            </label>
            <input
              type="number"
              value={Math.round(config.scaleFactor * 100)}
              onChange={(e) =>
                updateConfig({ scaleFactor: (parseFloat(e.target.value) || 0) / 100 })
              }
              className="input"
              min={1}
              max={100}
              step={1}
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Max Trade Size ($)
            </label>
            <FormattedInput
              value={config.maxTradeUsd}
              onChange={(v) => updateConfig({ maxTradeUsd: v })}
              prefix="$"
              min={10}
              step={100}
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Max Latency (seconds)
            </label>
            <FormattedInput
              value={config.maxLatencySecs}
              onChange={(v) => updateConfig({ maxLatencySecs: Math.round(v) })}
              suffix="sec"
              min={5}
              max={120}
              step={5}
            />
          </div>
          <div className="flex items-end">
            <div className="flex items-center gap-3">
              <ToggleSwitch
                enabled={config.autoCreateSentinel}
                onChange={(v) => updateConfig({ autoCreateSentinel: v })}
              />
              <span className="text-sm">Auto-create Sentinel</span>
            </div>
          </div>
        </div>
      </div>

      {/* Add Whale Section */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-foreground-muted" />
          Add Whale to Track
        </h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchWhale()}
            placeholder="Enter username or user ID..."
            className="input flex-1"
          />
          <button
            onClick={searchWhale}
            disabled={searching || !searchQuery.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </div>

        {searchError && (
          <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {searchError}
          </div>
        )}

        {searchResult && (
          <div className="mt-3 p-4 rounded-lg bg-background border border-background-tertiary flex items-center justify-between">
            <div className="flex items-center gap-3">
              {searchResult.image ? (
                <img
                  src={searchResult.image.startsWith('http') ? searchResult.image : `https://rugplay.com/${searchResult.image}`}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-background-tertiary flex items-center justify-center">
                  <User className="w-5 h-5 text-foreground-muted" />
                </div>
              )}
              <div>
                <div className="font-medium">{searchResult.username}</div>
                <div className="text-xs text-foreground-muted">
                  ${searchResult.balance?.toLocaleString()} balance · {searchResult.holdingsCount} holdings · ${searchResult.portfolioValue?.toLocaleString()} portfolio
                </div>
              </div>
            </div>
            <button
              onClick={() => addWhale(searchResult.userId, searchResult.username)}
              disabled={whales.some((w) => w.userId === searchResult.userId)}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              {whales.some((w) => w.userId === searchResult.userId) ? 'Tracked' : 'Track'}
            </button>
          </div>
        )}
      </div>

      {/* Tracked Whales */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-cyan-400" />
          Tracked Whales ({whales.length})
        </h2>
        {whales.length === 0 ? (
          <div className="text-center py-8 text-foreground-muted">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No whales tracked yet</p>
            <p className="text-xs mt-1">Search for a user above to start copy-trading</p>
          </div>
        ) : (
          <div className="space-y-2">
            {whales.map((whale) => (
              <div
                key={whale.userId}
                className="flex items-center justify-between p-3 rounded-lg bg-background"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center">
                    <User className="w-4 h-4 text-foreground-muted" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{whale.username}</div>
                    <div className="text-xs text-foreground-muted">
                      Tracked since {new Date(whale.trackedSince).toLocaleDateString()}
                      {whale.performanceScore > 0 && ` · Score: ${whale.performanceScore.toFixed(1)}`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeWhale(whale.userId)}
                  className="p-1.5 rounded-md text-foreground-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mirror Activity Log */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          Mirror Activity Log
        </h2>
        {mirrorLog.length === 0 ? (
          <div className="text-center py-8 text-foreground-muted">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No mirrored trades yet</p>
            <p className="text-xs mt-1">Activity will appear when tracked whales trade</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {mirrorLog.map((trade, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-background">
                <div className="flex items-center gap-3">
                  <div
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      trade.tradeType.toUpperCase() === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {trade.tradeType.toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{trade.coinSymbol}</div>
                    <div className="text-xs text-foreground-muted">
                      Copied from {trade.whaleUsername}
                      {!trade.success && <span className="text-rose-400 ml-1">(failed)</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">
                    ${trade.ourAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-foreground-muted">
                    Whale: ${trade.whaleAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
