import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  Crosshair,
  RefreshCw,
  DollarSign,
  Clock,
  Target,
  Shield,
  Plus,
  X,
  Save,
  Zap,
} from 'lucide-react'
import type {
  SniperStatusResponse,
  SniperConfig,
  SniperTriggeredEvent,
} from '@/lib/types'

export function SniperPage() {
  const [status, setStatus] = useState<SniperStatusResponse | null>(null)
  const [config, setConfig] = useState<SniperConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [newBlacklistedCreator, setNewBlacklistedCreator] = useState('')
  const [snipeLog, setSnipeLog] = useState<SniperTriggeredEvent[]>([])

  const fetchStatus = useCallback(async () => {
    try {
      const s = await invoke<SniperStatusResponse>('get_sniper_status')
      setStatus(s)
      setConfig(s.config)
    } catch (e) {
      console.error('Failed to fetch sniper status:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Listen for sniper events
  useEffect(() => {
    const unlistenTriggered = listen<SniperTriggeredEvent>('sniper-triggered', (event) => {
      setSnipeLog(prev => [event.payload, ...prev].slice(0, 50)) // keep last 50
      fetchStatus()
    })

    return () => {
      unlistenTriggered.then(u => u())
    }
  }, [fetchStatus])

  const toggleEnabled = async () => {
    if (!status) return
    try {
      const newEnabled = !status.enabled
      await invoke('set_sniper_enabled', { enabled: newEnabled })
      setStatus(prev => prev ? { ...prev, enabled: newEnabled } : prev)
    } catch (e) {
      console.error('Failed to toggle sniper:', e)
    }
  }

  const saveConfig = async () => {
    if (!config) return
    setSaving(true)
    try {
      await invoke('update_sniper_config', { config })
      setHasChanges(false)
    } catch (e) {
      console.error('Failed to save sniper config:', e)
    } finally {
      setSaving(false)
    }
  }

  const updateConfig = (key: keyof SniperConfig, value: unknown) => {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev)
    setHasChanges(true)
  }

  const addBlacklistedCreator = () => {
    const creator = newBlacklistedCreator.trim()
    if (creator && config && !config.blacklistedCreators.includes(creator)) {
      setConfig(prev => prev ? {
        ...prev,
        blacklistedCreators: [...prev.blacklistedCreators, creator],
      } : prev)
      setNewBlacklistedCreator('')
      setHasChanges(true)
    }
  }

  const removeBlacklistedCreator = (creator: string) => {
    setConfig(prev => prev ? {
      ...prev,
      blacklistedCreators: prev.blacklistedCreators.filter(c => c !== creator),
    } : prev)
    setHasChanges(true)
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <Crosshair className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Sniper</h1>
            <p className="text-sm text-foreground-muted">Auto-buy newly created coins</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Save button */}
          <button
            onClick={saveConfig}
            disabled={!hasChanges || saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              hasChanges
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>

          {/* Enable/Disable */}
          <button
            onClick={toggleEnabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              status?.enabled
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Zap className="w-4 h-4" />
            {status?.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="card">
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-background">
            <div className="text-xs text-foreground-muted mb-1">Status</div>
            <div className={`text-sm font-semibold ${status?.enabled ? 'text-emerald-400' : 'text-zinc-400'}`}>
              {status?.enabled ? '🟢 Active' : '⚫ Disabled'}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-background">
            <div className="text-xs text-foreground-muted mb-1">Total Sniped</div>
            <div className="text-sm font-semibold text-foreground">{status?.totalSniped ?? 0}</div>
          </div>
          <div className="p-3 rounded-lg bg-background">
            <div className="text-xs text-foreground-muted mb-1">Last Snipe</div>
            <div className="text-xs text-foreground-muted">
              {status?.lastSnipedAt
                ? new Date(status.lastSnipedAt).toLocaleString()
                : 'Never'}
            </div>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="card">
        <div className="flex items-center gap-2 mb-6">
          <Target className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold">Sniper Configuration</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Buy Amount */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Buy Amount (USD)
            </label>
            <input
              type="number"
              min="1"
              step="100"
              value={config.buyAmountUsd}
              onChange={(e) => updateConfig('buyAmountUsd', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg bg-background-tertiary border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
            />
            <p className="text-xs text-foreground-muted mt-1">USD to spend per snipe</p>
          </div>

          {/* Max Market Cap */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <DollarSign className="w-4 h-4 text-blue-400" />
              Max Market Cap
            </label>
            <input
              type="number"
              min="0"
              step="10000"
              value={config.maxMarketCapUsd}
              onChange={(e) => updateConfig('maxMarketCapUsd', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg bg-background-tertiary border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
            />
            <p className="text-xs text-foreground-muted mt-1">Skip coins above this market cap (0 = no limit)</p>
          </div>

          {/* Max Coin Age */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <Clock className="w-4 h-4 text-purple-400" />
              Max Coin Age (seconds)
            </label>
            <input
              type="number"
              min="0"
              step="60"
              value={config.maxCoinAgeSecs}
              onChange={(e) => updateConfig('maxCoinAgeSecs', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg bg-background-tertiary border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
            />
            <p className="text-xs text-foreground-muted mt-1">Only buy coins newer than this (0 = no limit)</p>
          </div>

          {/* Auto-create Sentinel */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              Auto-Create Sentinel
            </label>
            <button
              onClick={() => updateConfig('autoCreateSentinel', !config.autoCreateSentinel)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.autoCreateSentinel ? 'bg-emerald-600' : 'bg-zinc-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.autoCreateSentinel ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <p className="text-xs text-foreground-muted mt-2">Create SL/TP sentinel after each snipe</p>
          </div>
        </div>

        {/* Sentinel defaults when auto-creating */}
        {config.autoCreateSentinel && (
          <div className="mt-4 p-4 rounded-lg bg-background border border-zinc-700/50">
            <h3 className="text-sm font-medium text-foreground-muted mb-3">Sentinel Settings for Sniped Coins</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-foreground-muted">Stop Loss %</label>
                <input
                  type="number"
                  value={config.stopLossPct}
                  onChange={(e) => updateConfig('stopLossPct', parseFloat(e.target.value) || 0)}
                  className="w-full mt-1 px-2 py-1.5 rounded bg-background-tertiary border border-zinc-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-foreground-muted">Take Profit %</label>
                <input
                  type="number"
                  value={config.takeProfitPct}
                  onChange={(e) => updateConfig('takeProfitPct', parseFloat(e.target.value) || 0)}
                  className="w-full mt-1 px-2 py-1.5 rounded bg-background-tertiary border border-zinc-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-foreground-muted">Trailing Stop %</label>
                <input
                  type="number"
                  value={config.trailingStopPct ?? ''}
                  onChange={(e) => updateConfig('trailingStopPct', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Disabled"
                  className="w-full mt-1 px-2 py-1.5 rounded bg-background-tertiary border border-zinc-700 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Blacklisted Creators */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <X className="w-5 h-5 text-rose-400" />
          <h2 className="text-lg font-semibold">Blacklisted Creators</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-3">
          Skip coins created by these users
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newBlacklistedCreator}
            onChange={(e) => setNewBlacklistedCreator(e.target.value)}
            placeholder="Enter creator username"
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') addBlacklistedCreator()
            }}
          />
          <button
            onClick={addBlacklistedCreator}
            disabled={!newBlacklistedCreator.trim()}
            className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {config.blacklistedCreators.length === 0 ? (
            <span className="text-sm text-foreground-muted">No creators blacklisted</span>
          ) : (
            config.blacklistedCreators.map((creator) => (
              <span
                key={creator}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 text-sm"
              >
                @{creator}
                <button
                  onClick={() => removeBlacklistedCreator(creator)}
                  className="p-0.5 rounded hover:bg-rose-500/30 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Snipe Log */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Crosshair className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold">Recent Snipes</h2>
        </div>

        {snipeLog.length === 0 ? (
          <div className="text-center py-8 text-foreground-muted">
            <Crosshair className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No snipes yet. Enable the sniper to start.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {snipeLog.map((snipe, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-background">
                <div>
                  <span className="font-medium text-amber-400">${snipe.symbol}</span>
                  <span className="text-foreground-muted text-sm ml-2">{snipe.coinName}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-foreground-muted">
                    ${snipe.buyAmountUsd.toFixed(2)}
                  </span>
                  <span className="text-foreground-muted">
                    MCap: ${snipe.marketCap.toLocaleString()}
                  </span>
                  <span className="text-foreground-muted">
                    Age: {snipe.coinAgeSecs}s
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
