import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  TrendingDown,
  RefreshCw,
  DollarSign,
  BarChart3,
  Shield,
  Plus,
  X,
  Save,
  Zap,
  Users,
  Clock,
  Target,
  SlidersHorizontal,
  Brain,
  Activity,
  Settings2,
  History,
  Filter,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { FormattedInput, ToggleSwitch } from '@/components/ui/FormattedInput'
import type {
  DipBuyerStatusResponse,
  DipBuyerConfig,
  DipBuyerTriggeredEvent,
  DipBuyerLogEntry,
  Aggressiveness,
  CoinTier,
} from '@/lib/types'

const PRESET_LABELS: Record<Aggressiveness, string> = {
  conservative: 'Conservative',
  moderate: 'Moderate',
  aggressive: 'Aggressive',
}

const PRESET_DESCRIPTIONS: Record<Aggressiveness, string> = {
  conservative: 'Higher confidence threshold (65%), lower slippage cap, portfolio-aware.',
  moderate: 'Balanced confidence (55%) and slippage settings for most conditions.',
  aggressive: 'Lower confidence (45%), higher slippage tolerance, no portfolio limits.',
}

const PRESET_COLORS: Record<Aggressiveness, string> = {
  conservative: 'text-blue-400 bg-blue-500/20',
  moderate: 'text-amber-400 bg-amber-500/20',
  aggressive: 'text-rose-400 bg-rose-500/20',
}

type TabId = 'overview' | 'strategy' | 'filters' | 'history'

const TABS: { id: TabId; label: string; icon: typeof TrendingDown }[] = [
  { id: 'overview', label: 'Overview', icon: Zap },
  { id: 'strategy', label: 'Strategy', icon: Brain },
  { id: 'filters', label: 'Filters & Limits', icon: Filter },
  { id: 'history', label: 'History', icon: History },
]

interface DipBuyerPageProps {
  setNavGuard?: (guard: (() => boolean) | null) => void
}

export function DipBuyerPage({ setNavGuard }: DipBuyerPageProps) {
  const [status, setStatus] = useState<DipBuyerStatusResponse | null>(null)
  const [config, setConfig] = useState<DipBuyerConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [history, setHistory] = useState<DipBuyerLogEntry[]>([])
  const [newBlacklistedCoin, setNewBlacklistedCoin] = useState('')
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetMessage, setResetMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!setNavGuard) return
    setNavGuard(() => {
      if (!hasChanges) return true
      return window.confirm('You have unsaved Dip Buyer changes. Discard them?')
    })
    return () => setNavGuard(null)
  }, [hasChanges, setNavGuard])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasChanges) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

  const fetchStatus = useCallback(async () => {
    try {
      const s = await invoke<DipBuyerStatusResponse>('get_dipbuyer_status')
      setStatus(s)
      setConfig(s.config)
    } catch (e) {
      console.error('Failed to fetch dip buyer status:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const h = await invoke<DipBuyerLogEntry[]>('get_dipbuyer_history', { limit: 50 })
      setHistory(h)
    } catch (e) {
      console.error('Failed to fetch dip buyer history:', e)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchHistory()
  }, [fetchStatus, fetchHistory])

  useEffect(() => {
    const unlistenTriggered = listen<DipBuyerTriggeredEvent>('dipbuyer-triggered', () => {
      fetchStatus()
      fetchHistory()
    })

    return () => {
      unlistenTriggered.then((u) => u())
    }
  }, [fetchStatus, fetchHistory])

  const toggleEnabled = async () => {
    if (!status) return
    try {
      const newEnabled = !status.enabled
      await invoke('set_dipbuyer_enabled', { enabled: newEnabled })
      setStatus((prev) => (prev ? { ...prev, enabled: newEnabled } : prev))
    } catch (e) {
      console.error('Failed to toggle dip buyer:', e)
    }
  }

  const applyPreset = async (preset: Aggressiveness) => {
    try {
      const presetConfig = await invoke<DipBuyerConfig>('get_dipbuyer_preset', { preset })
      // Preserve user's blacklisted coins
      if (config) {
        presetConfig.blacklistedCoins = config.blacklistedCoins
      }
      setConfig(presetConfig)
      setHasChanges(true)
    } catch (e) {
      console.error('Failed to get preset:', e)
    }
  }

  const saveConfig = async () => {
    if (!config) return
    setSaving(true)
    try {
      await invoke('update_dipbuyer_config', { config })
      setHasChanges(false)
    } catch (e) {
      console.error('Failed to save dip buyer config:', e)
    } finally {
      setSaving(false)
    }
  }

  const resetToDefaults = async () => {
    if (!confirm('Reset all Dip Buyer settings to research-backed defaults? This will recreate all coin tiers and parameters.')) return
    setResetting(true)
    setResetMessage(null)
    try {
      const preset = config?.preset || 'moderate'
      const freshConfig = await invoke<DipBuyerConfig>('reset_dipbuyer_config', { preset })
      setConfig(freshConfig)
      setHasChanges(false)
      setResetMessage(`Settings reset to ${preset} research defaults with all coin tiers`)
      setTimeout(() => setResetMessage(null), 5000)
    } catch (e) {
      console.error('Failed to reset dip buyer config:', e)
    } finally {
      setResetting(false)
    }
  }

  const updateConfig = (key: keyof DipBuyerConfig, value: unknown) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
    setHasChanges(true)
  }

  const addBlacklistedCoin = () => {
    const coin = newBlacklistedCoin.trim().toUpperCase()
    if (coin && config && !config.blacklistedCoins.includes(coin)) {
      setConfig((prev) =>
        prev
          ? { ...prev, blacklistedCoins: [...prev.blacklistedCoins, coin] }
          : prev,
      )
      setNewBlacklistedCoin('')
      setHasChanges(true)
    }
  }

  const removeBlacklistedCoin = (coin: string) => {
    setConfig((prev) =>
      prev
        ? { ...prev, blacklistedCoins: prev.blacklistedCoins.filter((c) => c !== coin) }
        : prev,
    )
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
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-header-icon bg-emerald-500/20">
            <TrendingDown className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dip Buyer</h1>
            <p className="text-sm text-foreground-muted">
              Confidence-scored dip detection with automated risk management
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={resetToDefaults}
            disabled={resetting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
          >
            <RefreshCw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
            {resetting ? 'Resetting...' : 'Reset to Defaults'}
          </button>

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

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-foreground-muted hover:text-foreground hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.id === 'history' && history.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-zinc-700 text-zinc-300">
                  {history.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Reset confirmation */}
      {resetMessage && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/20 text-blue-400 text-sm">
          <RefreshCw className="w-4 h-4" />
          {resetMessage}
        </div>
      )}

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="card">
            <div className="grid grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-background">
                <div className="text-xs text-foreground-muted mb-1">Status</div>
                <div className={`text-sm font-semibold ${status?.enabled ? 'text-emerald-400' : 'text-zinc-400'}`}>
                  {status?.enabled ? 'Active' : 'Disabled'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-background">
                <div className="text-xs text-foreground-muted mb-1">Total Dip Buys</div>
                <div className="text-sm font-semibold text-foreground">{status?.totalBought ?? 0}</div>
              </div>
              <div className="p-3 rounded-lg bg-background">
                <div className="text-xs text-foreground-muted mb-1">Last Buy</div>
                <div className="text-xs text-foreground-muted">
                  {status?.lastBoughtAt ? new Date(status.lastBoughtAt).toLocaleString() : 'Never'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-background">
                <div className="text-xs text-foreground-muted mb-1">Confidence</div>
                <div className="text-sm font-semibold text-violet-400">
                  {(config.minConfidenceScore * 100).toFixed(0)}% min
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold">Aggressiveness Preset</h2>
            </div>
            <p className="text-sm text-foreground-muted mb-4">
              Choose a preset to quickly configure all parameters, then fine-tune in the Strategy and Filters tabs.
            </p>

            <div className="grid grid-cols-3 gap-3">
              {(['conservative', 'moderate', 'aggressive'] as Aggressiveness[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    config.preset === preset
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-white/[0.06] hover:border-white/[0.12] bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRESET_COLORS[preset]}`}>
                      {PRESET_LABELS[preset]}
                    </span>
                    {config.preset === preset && <span className="text-xs text-emerald-400">Active</span>}
                  </div>
                  <p className="text-xs text-foreground-muted mt-1">{PRESET_DESCRIPTIONS[preset]}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Settings2 className="w-5 h-5 text-zinc-400" />
              <h2 className="text-lg font-semibold">Current Config Summary</h2>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-foreground-muted">Buy Amount</span>
                <span>{config.useCoinTiers ? `${config.coinTiers.length} tiers` : `$${config.buyAmountUsd.toLocaleString()}`}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-foreground-muted">Min Sell Trigger</span>
                <span>${config.minSellValueUsd.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-foreground-muted">Confidence Threshold</span>
                <span className="text-violet-400">{(config.minConfidenceScore * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-foreground-muted">Max Slippage</span>
                <span>{config.maxBuySlippagePct}%</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-foreground-muted">Auto-Sentinel</span>
                <span className={config.autoCreateSentinel ? 'text-emerald-400' : 'text-zinc-500'}>
                  {config.autoCreateSentinel ? `SL ${config.stopLossPct}% / TP ${config.takeProfitPct}%` : 'Off'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-foreground-muted">Daily Limits</span>
                <span>{config.maxDailyBuys} buys / ${config.maxDailySpendUsd.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-foreground-muted">Momentum</span>
                <span className={config.useMomentumAnalysis ? 'text-emerald-400' : 'text-zinc-500'}>
                  {config.useMomentumAnalysis ? 'On' : 'Off'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-foreground-muted">Portfolio Aware</span>
                <span className={config.portfolioAware ? 'text-emerald-400' : 'text-zinc-500'}>
                  {config.portfolioAware ? `Max ${config.maxPositionPct}% per coin` : 'Off'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Strategy Tab ── */}
      {activeTab === 'strategy' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold">Buy Sizing</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-background">
                <div>
                  <div className="text-sm font-medium">Coin Tiers</div>
                  <p className="text-xs text-foreground-muted mt-0.5">
                    {config.useCoinTiers ? 'Per-tier buy amount, min sell, volume & slippage settings' : 'Same settings for all coins'}
                  </p>
                </div>
                <ToggleSwitch enabled={config.useCoinTiers} onChange={(v) => updateConfig('useCoinTiers', v)} />
              </div>

              {!config.useCoinTiers ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-field">
                    <label className="form-label">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      Buy Amount (USD)
                    </label>
                    <FormattedInput value={config.buyAmountUsd} onChange={(v) => updateConfig('buyAmountUsd', v)} prefix="$" min={1} step={100} placeholder="1,000" />
                    <p className="form-hint">USD to spend per dip buy</p>
                  </div>
                  <div className="form-field">
                    <label className="form-label">
                      <DollarSign className="w-4 h-4 text-rose-400" />
                      Min Sell Value (USD)
                    </label>
                    <FormattedInput value={config.minSellValueUsd} onChange={(v) => updateConfig('minSellValueUsd', v)} prefix="$" min={100} step={500} placeholder="5,000" />
                    <p className="form-hint">Minimum sell trade value to trigger analysis</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-field">
                      <label className="form-label">
                        <DollarSign className="w-4 h-4 text-emerald-400" />
                        Fallback Buy Amount
                      </label>
                      <FormattedInput value={config.buyAmountUsd} onChange={(v) => updateConfig('buyAmountUsd', v)} prefix="$" min={1} step={100} placeholder="1,000" />
                      <p className="form-hint">Used when no tier matches the coin's market cap</p>
                    </div>
                    <div className="form-field">
                      <label className="form-label">
                        <DollarSign className="w-4 h-4 text-rose-400" />
                        Global Min Sell Value
                      </label>
                      <FormattedInput value={config.minSellValueUsd} onChange={(v) => updateConfig('minSellValueUsd', v)} prefix="$" min={100} step={500} placeholder="5,000" />
                      <p className="form-hint">Quick pre-filter before coin data is fetched (tier values override after)</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="overflow-x-auto">
                      <div className="min-w-[700px]">
                        <div className="grid grid-cols-[0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] gap-2 text-xs text-foreground-muted px-1 mb-1">
                          <span>Label</span><span>Min MCap</span><span>Max MCap</span><span>Buy Amount</span><span>Min Sell</span><span>Min Volume</span><span>Max Slip %</span><span className="w-8" />
                        </div>
                        {config.coinTiers.map((tier, idx) => (
                          <div key={idx} className="grid grid-cols-[0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] gap-2 items-center mb-1">
                            <input type="text" value={tier.label} onChange={(e) => { const tiers = [...config.coinTiers]; tiers[idx] = { ...tier, label: e.target.value }; updateConfig('coinTiers', tiers) }} className="input text-sm h-9" placeholder="Label" />
                            <FormattedInput value={tier.minMcap} onChange={(v) => { const tiers = [...config.coinTiers]; tiers[idx] = { ...tier, minMcap: v }; updateConfig('coinTiers', tiers) }} prefix="$" min={0} step={5000} />
                            <FormattedInput value={tier.maxMcap} onChange={(v) => { const tiers = [...config.coinTiers]; tiers[idx] = { ...tier, maxMcap: v }; updateConfig('coinTiers', tiers) }} prefix="$" min={0} step={10000} />
                            <FormattedInput value={tier.buyAmountUsd} onChange={(v) => { const tiers = [...config.coinTiers]; tiers[idx] = { ...tier, buyAmountUsd: v }; updateConfig('coinTiers', tiers) }} prefix="$" min={1} step={100} />
                            <FormattedInput value={tier.minSellValueUsd} onChange={(v) => { const tiers = [...config.coinTiers]; tiers[idx] = { ...tier, minSellValueUsd: v }; updateConfig('coinTiers', tiers) }} prefix="$" min={0} step={500} />
                            <FormattedInput value={tier.minVolume24h} onChange={(v) => { const tiers = [...config.coinTiers]; tiers[idx] = { ...tier, minVolume24h: v }; updateConfig('coinTiers', tiers) }} prefix="$" min={0} step={1000} />
                            <FormattedInput value={tier.maxBuySlippagePct} onChange={(v) => { const tiers = [...config.coinTiers]; tiers[idx] = { ...tier, maxBuySlippagePct: v }; updateConfig('coinTiers', tiers) }} suffix="%" min={0} step={1} />
                            <button onClick={() => { const tiers = config.coinTiers.filter((_, i) => i !== idx); updateConfig('coinTiers', tiers) }} className="p-1.5 rounded hover:bg-rose-500/20 text-foreground-muted hover:text-rose-400 transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const lastTier = config.coinTiers[config.coinTiers.length - 1]
                        const newTier: CoinTier = { label: '', minMcap: lastTier ? lastTier.maxMcap : 0, maxMcap: 0, buyAmountUsd: lastTier ? lastTier.buyAmountUsd : 500, minSellValueUsd: 0, minVolume24h: 0, maxBuySlippagePct: 0 }
                        updateConfig('coinTiers', [...config.coinTiers, newTier])
                      }}
                      className="flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 transition-colors mt-1"
                    >
                      <Plus className="w-4 h-4" />Add Tier
                    </button>
                    <p className="form-hint">Max MCap $0 = no upper limit. Per-tier values of 0 = use global setting. Fallback buy: ${config.buyAmountUsd.toLocaleString()}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-semibold">Signal Analysis</h2>
            </div>
            <p className="text-sm text-foreground-muted mb-4">
              Each dip candidate is scored across four signals. Only trades above the
              confidence threshold are taken, with optional buy-size scaling.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label className="form-label">
                    <Target className="w-4 h-4 text-violet-400" />
                    Min Confidence Score
                  </label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={1} step={0.05} value={config.minConfidenceScore} onChange={(e) => updateConfig('minConfidenceScore', parseFloat(e.target.value))} className="flex-1 accent-violet-500" />
                    <span className="text-sm font-mono w-12 text-right">{(config.minConfidenceScore * 100).toFixed(0)}%</span>
                  </div>
                  <p className="form-hint">Dips scoring below this are skipped</p>
                </div>

                <div className="form-field">
                  <label className="form-label">
                    <Activity className="w-4 h-4 text-amber-400" />
                    Max Buy Slippage %
                  </label>
                  <input type="number" min={0.5} max={50} step={0.5} value={config.maxBuySlippagePct} onChange={(e) => updateConfig('maxBuySlippagePct', parseFloat(e.target.value) || 5)} className="input" />
                  <p className="form-hint">Hard reject if our buy would cause more slippage</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-background">
                  <div>
                    <div className="text-sm font-medium">Momentum</div>
                    <p className="text-xs text-foreground-muted mt-0.5">Candlestick analysis</p>
                  </div>
                  <ToggleSwitch enabled={config.useMomentumAnalysis} onChange={(v) => updateConfig('useMomentumAnalysis', v)} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-background">
                  <div>
                    <div className="text-sm font-medium">Scale by Conf.</div>
                    <p className="text-xs text-foreground-muted mt-0.5">Reduce size for weaker dips</p>
                  </div>
                  <ToggleSwitch enabled={config.scaleByConfidence} onChange={(v) => updateConfig('scaleByConfidence', v)} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-background">
                  <div>
                    <div className="text-sm font-medium">Portfolio Aware</div>
                    <p className="text-xs text-foreground-muted mt-0.5">Limit position size</p>
                  </div>
                  <ToggleSwitch enabled={config.portfolioAware} onChange={(v) => updateConfig('portfolioAware', v)} />
                </div>
              </div>

              {config.portfolioAware && (
                <div className="form-field">
                  <label className="form-label">
                    <Shield className="w-4 h-4 text-amber-400" />
                    Max Position % of Portfolio
                  </label>
                  <input type="number" min={0} max={100} step={1} value={config.maxPositionPct} onChange={(e) => updateConfig('maxPositionPct', parseFloat(e.target.value) || 0)} className="input" />
                  <p className="form-hint">0 = unlimited. Prevents over-concentration in one coin.</p>
                </div>
              )}

              <div className="p-4 rounded-lg bg-background">
                <div className="flex items-center gap-2 mb-3">
                  <SlidersHorizontal className="w-4 h-4 text-violet-400" />
                  <h3 className="text-sm font-medium">Signal Weights</h3>
                  <span className="text-xs text-foreground-muted ml-auto">Normalized automatically</span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {([
                    { key: 'sellImpact' as const, label: 'Sell Impact', color: 'text-rose-400', hint: 'How big was the sell vs pool' },
                    { key: 'holderSafety' as const, label: 'Holder Safety', color: 'text-blue-400', hint: 'Concentration & creator risk' },
                    { key: 'momentum' as const, label: 'Momentum', color: 'text-amber-400', hint: 'Exhaustion / reversal signals' },
                    { key: 'volumeQuality' as const, label: 'Volume', color: 'text-emerald-400', hint: 'Trading activity quality' },
                  ]).map(({ key, label, color, hint }) => (
                    <div key={key}>
                      <label className={`text-xs font-medium ${color} mb-1 block`}>{label}</label>
                      <input type="number" min={0} max={1} step={0.05} value={config.signalWeights[key]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setConfig((prev) => prev ? { ...prev, signalWeights: { ...prev.signalWeights, [key]: val } } : prev)
                          setHasChanges(true)
                        }}
                        className="input text-sm h-9"
                      />
                      <p className="text-[10px] text-foreground-muted mt-0.5">{hint}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-semibold">Auto-Sentinel</h2>
              </div>
              <ToggleSwitch enabled={config.autoCreateSentinel} onChange={(v) => updateConfig('autoCreateSentinel', v)} />
            </div>
            <p className="text-sm text-foreground-muted mb-4">
              Automatically create a stop-loss / take-profit sentinel after each dip buy.
            </p>

            {config.autoCreateSentinel && (
              <div className="grid grid-cols-3 gap-4">
                <div className="form-field">
                  <label className="form-label text-rose-400">Stop Loss %</label>
                  <input type="number" value={config.stopLossPct} onChange={(e) => updateConfig('stopLossPct', parseFloat(e.target.value) || 0)} className="input" />
                  <p className="form-hint">e.g. -15 means sell if down 15%</p>
                </div>
                <div className="form-field">
                  <label className="form-label text-emerald-400">Take Profit %</label>
                  <input type="number" value={config.takeProfitPct} onChange={(e) => updateConfig('takeProfitPct', parseFloat(e.target.value) || 0)} className="input" />
                  <p className="form-hint">e.g. 50 means sell if up 50%</p>
                </div>
                <div className="form-field">
                  <label className="form-label text-blue-400">Trailing Stop %</label>
                  <input type="number" value={config.trailingStopPct ?? ''} onChange={(e) => updateConfig('trailingStopPct', e.target.value ? parseFloat(e.target.value) : null)} placeholder="Disabled" className="input" />
                  <p className="form-hint">Locks in gains from peak price</p>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-semibold">Holder Analysis</h2>
            </div>
            <div className="form-field">
              <label className="form-label">
                <Users className="w-4 h-4 text-purple-400" />
                Skip Top N Holders
              </label>
              <input type="number" min={1} max={10} value={config.skipTopNHolders} onChange={(e) => updateConfig('skipTopNHolders', parseInt(e.target.value) || 1)} className="input" />
              <p className="form-hint">
                If the seller is among the top N holders, the dip is treated as a whale dump and hard-rejected.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters & Limits Tab ── */}
      {activeTab === 'filters' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold">Market Filters</h2>
            </div>
            <p className="text-sm text-foreground-muted mb-4">
              Coins must pass these gates before signal analysis runs.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-field">
                <label className="form-label">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  Min 24h Volume
                </label>
                <FormattedInput value={config.minVolume24h} onChange={(v) => updateConfig('minVolume24h', v)} prefix="$" min={0} step={1000} />
                <p className="form-hint">Skip coins with less 24h trading volume</p>
              </div>

              <div className="form-field">
                <label className="form-label">
                  <DollarSign className="w-4 h-4 text-blue-400" />
                  Min Market Cap
                </label>
                <FormattedInput value={config.minMarketCap} onChange={(v) => updateConfig('minMarketCap', v)} prefix="$" min={0} step={5000} />
              </div>

              <div className="form-field">
                <label className="form-label">
                  <DollarSign className="w-4 h-4 text-purple-400" />
                  Max Market Cap
                </label>
                <FormattedInput value={config.maxMarketCap} onChange={(v) => updateConfig('maxMarketCap', v)} prefix="$" min={0} step={10000} />
                <p className="form-hint">0 = no limit</p>
              </div>

              <div className="form-field">
                <label className="form-label">
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                  Max Price Drop % (24h)
                </label>
                <input type="number" max={0} step={5} value={config.maxPriceDropPct} onChange={(e) => updateConfig('maxPriceDropPct', parseFloat(e.target.value) || 0)} className="input" />
                <p className="form-hint">Skip coins already down more than this</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold">Rate Limits</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-field">
                <label className="form-label">
                  <Target className="w-4 h-4 text-emerald-400" />
                  Max Daily Buys
                </label>
                <input type="number" min={1} step={1} value={config.maxDailyBuys} onChange={(e) => updateConfig('maxDailyBuys', parseInt(e.target.value) || 1)} className="input" />
              </div>

              <div className="form-field">
                <label className="form-label">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  Max Daily Spend (USD)
                </label>
                <FormattedInput value={config.maxDailySpendUsd} onChange={(v) => updateConfig('maxDailySpendUsd', v)} prefix="$" min={0} step={1000} />
                <p className="form-hint">0 = unlimited</p>
              </div>

              <div className="form-field">
                <label className="form-label">
                  <Clock className="w-4 h-4 text-blue-400" />
                  Cooldown per Coin
                </label>
                <FormattedInput value={config.cooldownPerCoinSecs} onChange={(v) => updateConfig('cooldownPerCoinSecs', Math.round(v))} suffix="sec" min={0} step={30} />
                <p className="form-hint">Don't buy the same coin again within this window</p>
              </div>

              <div className="form-field">
                <label className="form-label">
                  <Clock className="w-4 h-4 text-blue-400" />
                  Poll Interval
                </label>
                <FormattedInput value={config.pollIntervalSecs} onChange={(v) => updateConfig('pollIntervalSecs', Math.round(v))} suffix="sec" min={2} step={1} />
                <p className="form-hint">How often to check the live trade feed</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <X className="w-5 h-5 text-rose-400" />
              <h2 className="text-lg font-semibold">Blacklisted Coins</h2>
            </div>
            <p className="text-sm text-foreground-muted mb-3">Never buy dips on these coins</p>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newBlacklistedCoin}
                onChange={(e) => setNewBlacklistedCoin(e.target.value)}
                placeholder="Enter coin symbol (e.g. SCAM)"
                className="input flex-1"
                onKeyDown={(e) => { if (e.key === 'Enter') addBlacklistedCoin() }}
              />
              <button onClick={addBlacklistedCoin} disabled={!newBlacklistedCoin.trim()} className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors disabled:opacity-50">
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {config.blacklistedCoins.length === 0 ? (
                <span className="text-sm text-foreground-muted">No coins blacklisted</span>
              ) : (
                config.blacklistedCoins.map((coin) => (
                  <span key={coin} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 text-sm">
                    ${coin}
                    <button onClick={() => removeBlacklistedCoin(coin)} className="p-0.5 rounded hover:bg-rose-500/30 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── History Tab ── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-semibold">Recent Dip Buys</h2>
              </div>
              <button onClick={fetchHistory} className="text-sm text-foreground-muted hover:text-foreground transition-colors flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-12 text-foreground-muted">
                <TrendingDown className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No dip buys yet. Enable the dip buyer to start.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {history.map((entry) => {
                  let details: Record<string, unknown> = {}
                  try { details = JSON.parse(entry.details) } catch { /* ignore */ }
                  const signals = Array.isArray(details.signals) ? (details.signals as Array<{ name: string; score: number; weight: number; weighted: number; reason: string }>) : []
                  const isExpanded = expandedEntry === entry.id

                  return (
                    <div key={entry.id} className="rounded-lg bg-white/[0.03] overflow-hidden">
                      <button
                        onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                        className="w-full flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-foreground-muted" /> : <ChevronRight className="w-4 h-4 text-foreground-muted" />}
                          <span className="font-medium text-emerald-400">${entry.symbol}</span>
                          <span className="text-foreground-muted text-sm">{entry.coinName}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-emerald-400 font-medium">+${entry.amountUsd.toFixed(2)}</span>
                          {typeof details.confidenceScore === 'number' && (
                            <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                              details.confidenceScore >= 0.7 ? 'bg-emerald-500/20 text-emerald-400'
                                : details.confidenceScore >= 0.55 ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {(Number(details.confidenceScore) * 100).toFixed(0)}%
                            </span>
                          )}
                          {details.sellerUsername ? (
                            <span className="text-foreground-muted">
                              @{String(details.sellerUsername)} sold ${Number(details.sellValueUsd || 0).toFixed(0)}
                            </span>
                          ) : null}
                          {entry.createdAt && (
                            <span className="text-foreground-muted text-xs">{new Date(entry.createdAt).toLocaleTimeString()}</span>
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-3 pt-0 border-t border-white/[0.04]">
                          <div className="grid grid-cols-4 gap-3 mt-3 text-xs">
                            <div>
                              <span className="text-foreground-muted block">Price</span>
                              <span>${Number(details.price || 0).toFixed(8)}</span>
                            </div>
                            <div>
                              <span className="text-foreground-muted block">Market Cap</span>
                              <span>${Number(details.marketCap || 0).toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-foreground-muted block">Slippage</span>
                              <span>{Number(details.slippagePct || 0).toFixed(2)}%</span>
                            </div>
                            <div>
                              <span className="text-foreground-muted block">Sell Impact</span>
                              <span>{Number(details.sellImpactPct || 0).toFixed(2)}%</span>
                            </div>
                          </div>

                          {signals.length > 0 && (
                            <div className="mt-3">
                              <div className="text-xs text-foreground-muted mb-2">Signal Breakdown</div>
                              <div className="space-y-1.5">
                                {signals.map((sig, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className="w-24 font-medium truncate">{sig.name}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          sig.score >= 0.7 ? 'bg-emerald-500' : sig.score >= 0.4 ? 'bg-amber-500' : 'bg-rose-500'
                                        }`}
                                        style={{ width: `${Math.min(sig.score * 100, 100)}%` }}
                                      />
                                    </div>
                                    <span className="w-10 text-right font-mono">{(sig.score * 100).toFixed(0)}%</span>
                                    <span className="text-foreground-muted w-8 text-right">x{sig.weight.toFixed(1)}</span>
                                    <span className="text-foreground-muted truncate max-w-[200px]">{sig.reason}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
