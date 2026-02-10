import { useState, useEffect, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { 
  X, 
  Shield, 
  TrendingDown, 
  TrendingUp, 
  Activity,
  ChevronDown
} from 'lucide-react'
import type { CoinHolding, CreateSentinelRequest, SentinelConfig, AppSettings } from '@/lib/types'
import { ToggleSwitch } from '@/components/ui/FormattedInput'

interface SentinelFormProps {
  holdings: CoinHolding[]
  selectedHolding?: CoinHolding | null
  onClose: () => void
  onSuccess: () => void
}

// Load default settings from backend first, then localStorage fallback
function getDefaultSettings() {
  // This is a sync function for initial render — async loading
  // happens in the component below
  try {
    const stored = localStorage.getItem('rugplay_settings')
    if (stored) {
      const settings: AppSettings = JSON.parse(stored)
      return settings.sentinelDefaults
    }
  } catch {
    // Ignore parsing errors
  }
  return {
    stopLossPct: -15,
    takeProfitPct: 100,
    trailingStopPct: 10,
    sellPercentage: 100,
  }
}

export function SentinelForm({ holdings, selectedHolding, onClose, onSuccess }: SentinelFormProps) {
  const defaults = useMemo(() => getDefaultSettings(), [])
  
  const [symbol, setSymbol] = useState(selectedHolding?.symbol || '')
  const [entryPrice, setEntryPrice] = useState(selectedHolding?.avgPurchasePrice || 0)
  const [stopLossEnabled, setStopLossEnabled] = useState(true)
  const [stopLossPct, setStopLossPct] = useState(defaults.stopLossPct)
  const [takeProfitEnabled, setTakeProfitEnabled] = useState(true)
  const [takeProfitPct, setTakeProfitPct] = useState(defaults.takeProfitPct)
  const [trailingStopEnabled, setTrailingStopEnabled] = useState((defaults.trailingStopPct ?? 0) > 0)
  const [trailingStopPct, setTrailingStopPct] = useState(defaults.trailingStopPct || 10)
  const [sellPercentage, setSellPercentage] = useState(defaults.sellPercentage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load defaults from backend (overrides localStorage sync defaults)
  useEffect(() => {
    invoke<AppSettings | null>('get_app_settings')
      .then((backendSettings) => {
        if (backendSettings?.sentinelDefaults) {
          const d = backendSettings.sentinelDefaults
          setStopLossPct(d.stopLossPct)
          setTakeProfitPct(d.takeProfitPct)
          setTrailingStopPct(d.trailingStopPct || 10)
          setTrailingStopEnabled((d.trailingStopPct ?? 0) > 0)
          setSellPercentage(d.sellPercentage)
        }
      })
      .catch(() => {
        // Backend not available — already using localStorage defaults
      })
  }, [])

  // Update entry price when symbol changes
  useEffect(() => {
    if (symbol) {
      const holding = holdings.find(h => h.symbol === symbol)
      if (holding) {
        setEntryPrice(holding.avgPurchasePrice || holding.currentPrice)
      }
    }
  }, [symbol, holdings])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!symbol) {
      setError('Please select a coin')
      return
    }

    if (!stopLossEnabled && !takeProfitEnabled && !trailingStopEnabled) {
      setError('Please enable at least one trigger condition')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const request: CreateSentinelRequest = {
        symbol,
        stopLossPct: stopLossEnabled ? stopLossPct : null,
        takeProfitPct: takeProfitEnabled ? takeProfitPct : null,
        trailingStopPct: trailingStopEnabled ? trailingStopPct : null,
        sellPercentage,
        entryPrice,
      }

      await invoke<SentinelConfig>('create_sentinel', { request })
      onSuccess()
    } catch (e) {
      setError(`Failed to create sentinel: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price: number) => {
    if (price < 0.0001) return `$${price.toExponential(2)}`
    if (price < 0.01) return `$${price.toFixed(6)}`
    if (price < 1) return `$${price.toFixed(4)}`
    return `$${price.toFixed(2)}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background-secondary rounded-xl w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-background-tertiary">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">Create Sentinel</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-background-tertiary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Coin Selection */}
          <div>
            <label className="block text-sm font-medium mb-1">Coin</label>
            <div className="relative">
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="input appearance-none pr-10"
              >
                <option value="">Select a coin...</option>
                {holdings.map((h) => (
                  <option key={h.symbol} value={h.symbol}>
                    ${h.symbol} - {formatPrice(h.currentPrice)}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted pointer-events-none" />
            </div>
          </div>

          {/* Entry Price */}
          <div>
            <label className="block text-sm font-medium mb-1">Entry Price (USD)</label>
            <input
              type="number"
              step="any"
              value={entryPrice}
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              className="input"
            />
            <p className="form-hint">Price used to calculate P&L triggers</p>
          </div>

          {/* Stop Loss */}
          <div className="form-field">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-sell" />
                <span className="font-medium">Stop Loss</span>
              </div>
              <ToggleSwitch
                enabled={stopLossEnabled}
                onChange={setStopLossEnabled}
              />
            </div>
            {stopLossEnabled && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground-muted">Sell if price drops</span>
                <input
                  type="number"
                  value={Math.abs(stopLossPct)}
                  onChange={(e) => setStopLossPct(-Math.abs(parseFloat(e.target.value) || 0))}
                  className="input w-20 text-center h-9"
                  min="1"
                  max="100"
                />
                <span className="text-sm text-foreground-muted">% from entry</span>
              </div>
            )}
          </div>

          {/* Take Profit */}
          <div className="form-field">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-buy" />
                <span className="font-medium">Take Profit</span>
              </div>
              <ToggleSwitch
                enabled={takeProfitEnabled}
                onChange={setTakeProfitEnabled}
              />
            </div>
            {takeProfitEnabled && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground-muted">Sell if price rises</span>
                <input
                  type="number"
                  value={takeProfitPct}
                  onChange={(e) => setTakeProfitPct(parseFloat(e.target.value) || 0)}
                  className="input w-20 text-center h-9"
                  min="1"
                  max="10000"
                />
                <span className="text-sm text-foreground-muted">% from entry</span>
              </div>
            )}
          </div>

          {/* Trailing Stop */}
          <div className="form-field">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <span className="font-medium">Trailing Stop</span>
              </div>
              <ToggleSwitch
                enabled={trailingStopEnabled}
                onChange={setTrailingStopEnabled}
              />
            </div>
            {trailingStopEnabled && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground-muted">Sell if price drops</span>
                <input
                  type="number"
                  value={trailingStopPct}
                  onChange={(e) => setTrailingStopPct(parseFloat(e.target.value) || 0)}
                  className="input w-20 text-center h-9"
                  min="1"
                  max="50"
                />
                <span className="text-sm text-foreground-muted">% from peak</span>
              </div>
            )}
          </div>

          {/* Sell Percentage */}
          <div>
            <label className="block text-sm font-medium mb-1">Sell Percentage</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="1"
                max="100"
                value={sellPercentage}
                onChange={(e) => setSellPercentage(parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="w-14 text-right font-medium">{sellPercentage}%</span>
            </div>
            <p className="form-hint">Percentage of holding to sell when triggered</p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-sell/20 text-sell text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg bg-background-tertiary hover:bg-background text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn-primary disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Sentinel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
