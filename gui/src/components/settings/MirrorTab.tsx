import {
  Users,
  DollarSign,
  Timer,
  Clock,
  Shield,
  AlertTriangle,
  Percent,
  Ban,
} from 'lucide-react'
import type { MirrorConfigState } from './SettingsLayout'
import { ToggleSwitch } from '@/components/ui/FormattedInput'

interface MirrorTabProps {
  config: MirrorConfigState
  setConfig: React.Dispatch<React.SetStateAction<MirrorConfigState>>
  onChanged: () => void
}

export function MirrorTab({ config, setConfig, onChanged }: MirrorTabProps) {
  const update = <K extends keyof MirrorConfigState>(key: K, value: MirrorConfigState[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    onChanged()
  }

  const effectiveInterval = config.pollIntervalSecs > 0 ? config.pollIntervalSecs : 10

  return (
    <div className="space-y-6">
      {/* Scale & Limits */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Trade Sizing</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Control how much of each whale trade to mirror
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* Scale Factor */}
          <div className="form-field">
            <div className="flex items-center justify-between mb-2">
              <label className="form-label">
                <Percent className="w-4 h-4 text-emerald-400" />
                Scale Factor
              </label>
              <span className="text-sm font-mono text-white">{(config.scaleFactor * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={Math.round(config.scaleFactor * 100)}
              onChange={e => update('scaleFactor', parseInt(e.target.value) / 100)}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between form-hint">
              <span>1%</span>
              <span>100%</span>
            </div>
            <p className="form-hint">
              Percentage of whale's trade to mirror
            </p>
          </div>

          {/* Max Trade USD */}
          <div className="form-field">
            <label className="form-label">
              <DollarSign className="w-4 h-4 text-blue-400" />
              Max Trade Size
            </label>
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted">$</span>
              <input
                type="number"
                min="0"
                step="500"
                value={config.maxTradeUsd}
                onChange={e => update('maxTradeUsd', parseFloat(e.target.value) || 0)}
                className="input flex-1"
              />
            </div>
            <p className="form-hint">
              Cap per mirrored trade regardless of scale
            </p>
          </div>
        </div>
      </div>

      {/* Timing */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Timing</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Poll Interval */}
          <div className="form-field">
            <div className="flex items-center justify-between mb-2">
              <label className="form-label">
                <Timer className="w-4 h-4 text-blue-400" />
                Poll Interval
              </label>
              <span className="text-sm font-mono text-white">{effectiveInterval}s</span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              step="1"
              value={effectiveInterval}
              onChange={e => update('pollIntervalSecs', parseInt(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between form-hint">
              <span>5s (fast)</span>
              <span>30s (slow)</span>
            </div>
            {effectiveInterval < 8 && (
              <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Very fast polling — higher API load
              </p>
            )}
          </div>

          {/* Max Latency */}
          <div className="form-field">
            <label className="form-label">
              <Clock className="w-4 h-4 text-amber-400" />
              Max Latency
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="30"
                step="1"
                value={config.maxLatencySecs}
                onChange={e => update('maxLatencySecs', parseInt(e.target.value) || 5)}
                className="input flex-1"
              />
              <span className="text-foreground-muted text-sm">sec</span>
            </div>
            <p className="form-hint">
              Skip whale trades older than this
            </p>
          </div>
        </div>
      </div>

      {/* Behavior */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold">Behavior</h2>
        </div>

        <div className="space-y-3">
          {/* Skip if already held */}
          <div className="flex items-center justify-between form-field">
            <div>
              <div className="font-medium text-sm flex items-center gap-2">
                <Ban className="w-4 h-4 text-amber-400" />
                Skip If Already Held
              </div>
              <p className="form-hint">
                Don't mirror a BUY if you already own the coin
              </p>
            </div>
            <ToggleSwitch enabled={config.skipIfAlreadyHeld} onChange={() => update('skipIfAlreadyHeld', !config.skipIfAlreadyHeld)} />
          </div>

          {/* Auto Sentinel */}
          <div className="flex items-center justify-between form-field">
            <div>
              <div className="font-medium text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                Auto-Create Sentinel
              </div>
              <p className="form-hint">
                Create a sentinel for each mirrored buy
              </p>
            </div>
            <ToggleSwitch enabled={config.autoCreateSentinel} onChange={() => update('autoCreateSentinel', !config.autoCreateSentinel)} />
          </div>
        </div>

        {config.autoCreateSentinel && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="form-field">
              <label className="text-xs text-foreground-muted mb-1 block">Stop Loss %</label>
              <input
                type="number"
                value={config.stopLossPct}
                onChange={e => update('stopLossPct', parseFloat(e.target.value) || 0)}
                className="input"
              />
            </div>
            <div className="form-field">
              <label className="text-xs text-foreground-muted mb-1 block">Take Profit %</label>
              <input
                type="number"
                value={config.takeProfitPct}
                onChange={e => update('takeProfitPct', parseFloat(e.target.value) || 0)}
                className="input"
              />
            </div>
            <div className="form-field">
              <label className="text-xs text-foreground-muted mb-1 block">Trailing Stop %</label>
              <input
                type="number"
                value={config.trailingStopPct ?? ''}
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

      {/* Info */}
      <div className="card bg-blue-500/10 border-blue-500/30">
        <h3 className="font-semibold text-blue-400 mb-2">How Mirror Works</h3>
        <ul className="text-sm text-foreground-muted space-y-1 list-disc list-inside">
          <li>Monitors tracked whale accounts for new trades</li>
          <li>Scales each whale trade by your configured scale factor</li>
          <li>Caps each trade at the max trade size</li>
          <li>Skips trades that are too old (beyond max latency)</li>
          <li>Deduplication prevents copying the same trade twice</li>
          <li>Manage tracked whales on the Mirror page</li>
        </ul>
      </div>
    </div>
  )
}
