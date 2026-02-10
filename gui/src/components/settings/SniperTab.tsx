import { useState } from 'react'
import {
  DollarSign,
  Clock,
  Timer,
  Target,
  Shield,
  Plus,
  X,
  AlertTriangle,
  Droplets,
  Ban,
} from 'lucide-react'
import type { SniperConfig } from '@/lib/types'
import { ToggleSwitch } from '@/components/ui/FormattedInput'

interface SniperTabProps {
  config: SniperConfig | null
  setConfig: React.Dispatch<React.SetStateAction<SniperConfig | null>>
  onChanged: () => void
}

const DEFAULT_SNIPER_CONFIG: SniperConfig = {
  enabled: false,
  buyAmountUsd: 1000,
  maxMarketCapUsd: 50000,
  maxCoinAgeSecs: 300,
  autoCreateSentinel: true,
  stopLossPct: -25,
  takeProfitPct: 100,
  trailingStopPct: 15,
  blacklistedCreators: [],
  minLiquidityUsd: 0,
  maxDailySpendUsd: 0,
  pollIntervalSecs: 0,
  minCoinAgeSecs: 0,
}

export function SniperTab({ config, setConfig, onChanged }: SniperTabProps) {
  const c = config ?? DEFAULT_SNIPER_CONFIG
  const [newCreator, setNewCreator] = useState('')

  const update = <K extends keyof SniperConfig>(key: K, value: SniperConfig[K]) => {
    setConfig(prev => ({ ...(prev ?? DEFAULT_SNIPER_CONFIG), [key]: value }))
    onChanged()
  }

  const addBlacklistedCreator = () => {
    const creator = newCreator.trim()
    if (creator && !c.blacklistedCreators.includes(creator)) {
      update('blacklistedCreators', [...c.blacklistedCreators, creator])
      setNewCreator('')
    }
  }

  const removeBlacklistedCreator = (creator: string) => {
    update('blacklistedCreators', c.blacklistedCreators.filter(cr => cr !== creator))
  }

  const effectiveInterval = c.pollIntervalSecs > 0 ? c.pollIntervalSecs : 15

  return (
    <div className="space-y-6">
      {/* Buy Settings */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Buy Settings</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Configure how much to spend per snipe and spending limits
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* Buy Amount */}
          <div className="form-field">
            <label className="form-label">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Buy Amount per Snipe
            </label>
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted">$</span>
              <input
                type="number"
                min="1"
                step="100"
                value={c.buyAmountUsd}
                onChange={e => update('buyAmountUsd', parseFloat(e.target.value) || 0)}
                className="input flex-1"
              />
            </div>
            <p className="form-hint">USD to spend on each new coin</p>
          </div>

          {/* Daily Spend Limit */}
          <div className="form-field">
            <label className="form-label">
              <Ban className="w-4 h-4 text-amber-400" />
              Daily Spend Limit
            </label>
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted">$</span>
              <input
                type="number"
                min="0"
                step="500"
                value={c.maxDailySpendUsd}
                onChange={e => update('maxDailySpendUsd', parseFloat(e.target.value) || 0)}
                className="input flex-1"
              />
            </div>
            <p className="form-hint">Max USD via sniper per 24h (0 = unlimited)</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Coin Filters</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Only coins matching ALL filters will be sniped
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* Max Market Cap */}
          <div className="form-field">
            <label className="form-label">
              <DollarSign className="w-4 h-4 text-blue-400" />
              Max Market Cap
            </label>
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted">$</span>
              <input
                type="number"
                min="0"
                step="5000"
                value={c.maxMarketCapUsd}
                onChange={e => update('maxMarketCapUsd', parseFloat(e.target.value) || 0)}
                className="input flex-1"
              />
            </div>
            <p className="form-hint">Skip coins above this market cap (0 = no limit)</p>
          </div>

          {/* Max Coin Age */}
          <div className="form-field">
            <label className="form-label">
              <Clock className="w-4 h-4 text-purple-400" />
              Max Coin Age
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="30"
                value={c.maxCoinAgeSecs}
                onChange={e => update('maxCoinAgeSecs', parseInt(e.target.value) || 0)}
                className="input flex-1"
              />
              <span className="text-foreground-muted text-sm">sec</span>
            </div>
            <p className="form-hint">
              Only snipe coins created within this many seconds (0 = no limit)
            </p>
          </div>

          {/* Min Liquidity */}
          <div className="form-field">
            <label className="form-label">
              <Droplets className="w-4 h-4 text-cyan-400" />
              Min Liquidity
            </label>
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted">$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={c.minLiquidityUsd}
                onChange={e => update('minLiquidityUsd', parseFloat(e.target.value) || 0)}
                className="input flex-1"
              />
            </div>
            <p className="form-hint">
              Minimum pool liquidity in USD (0 = no filter)
            </p>
          </div>
        </div>
      </div>

      {/* Poll Interval */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Timer className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Poll Interval</h2>
        </div>

        <div className="form-field">
          <div className="flex items-center justify-between mb-2">
            <label className="form-label">
              <Timer className="w-4 h-4 text-blue-400" />
              Check for New Coins Every
            </label>
            <span className="text-sm font-mono text-white">{effectiveInterval}s</span>
          </div>
          <input
            type="range"
            min="5"
            max="60"
            step="1"
            value={effectiveInterval}
            onChange={e => {
              update('pollIntervalSecs', parseInt(e.target.value))
            }}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between form-hint">
            <span>5s (aggressive)</span>
            <span>60s (conservative)</span>
          </div>
          {effectiveInterval < 10 && (
            <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Fast polling increases API load. Risk of rate limiting.
            </p>
          )}
        </div>
      </div>

      {/* Auto Sentinel for Sniped Coins */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Auto-Sentinel for Sniped Coins</h2>
        </div>

        <div className="flex items-center justify-between form-field mb-4">
          <div>
            <div className="font-medium">Create Sentinel on Snipe</div>
            <p className="text-sm text-foreground-muted mt-1">
              Automatically create a sentinel when a new coin is sniped
            </p>
          </div>
          <ToggleSwitch enabled={c.autoCreateSentinel} onChange={() => update('autoCreateSentinel', !c.autoCreateSentinel)} />
        </div>

        {c.autoCreateSentinel && (
          <div className="grid grid-cols-3 gap-3">
            <div className="form-field">
              <label className="text-xs text-foreground-muted mb-1 block">Stop Loss %</label>
              <input
                type="number"
                value={c.stopLossPct}
                onChange={e => update('stopLossPct', parseFloat(e.target.value) || 0)}
                className="input"
              />
            </div>
            <div className="form-field">
              <label className="text-xs text-foreground-muted mb-1 block">Take Profit %</label>
              <input
                type="number"
                value={c.takeProfitPct}
                onChange={e => update('takeProfitPct', parseFloat(e.target.value) || 0)}
                className="input"
              />
            </div>
            <div className="form-field">
              <label className="text-xs text-foreground-muted mb-1 block">Trailing Stop %</label>
              <input
                type="number"
                value={c.trailingStopPct ?? ''}
                onChange={e =>
                  update('trailingStopPct', e.target.value ? parseFloat(e.target.value) : null)
                }
                placeholder="Off"
                className="input"
              />
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
        <p className="text-sm text-foreground-muted mb-4">
          Coins created by these users will never be sniped
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newCreator}
            onChange={e => setNewCreator(e.target.value)}
            placeholder="Enter creator username"
            className="input flex-1"
            onKeyDown={e => {
              if (e.key === 'Enter') addBlacklistedCreator()
            }}
          />
          <button
            onClick={addBlacklistedCreator}
            disabled={!newCreator.trim()}
            className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {c.blacklistedCreators.length === 0 ? (
            <span className="text-sm text-foreground-muted">No creators blacklisted</span>
          ) : (
            c.blacklistedCreators.map(creator => (
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

      {/* Info */}
      <div className="card bg-blue-500/10 border-blue-500/30">
        <h3 className="font-semibold text-blue-400 mb-2">How Sniper Works</h3>
        <ul className="text-sm text-foreground-muted space-y-1 list-disc list-inside">
          <li>Polls the market API at the configured interval for newly created coins</li>
          <li>Filters by age, market cap, liquidity, and creator blacklist</li>
          <li>Buys with the configured USD amount if all filters pass</li>
          <li>Optionally creates a sentinel with your default SL/TP settings</li>
          <li>Daily spend limit prevents runaway spending (0 = unlimited)</li>
          <li>Already-sniped symbols are tracked to prevent duplicates</li>
        </ul>
      </div>
    </div>
  )
}
