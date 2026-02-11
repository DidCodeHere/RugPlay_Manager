import {
  RefreshCw,
  Trophy,
  BarChart3,
  Target,
} from 'lucide-react'
import type { ResearchManifest, ResearchAboutStats, ResearchTopCoin, ResearchTierSummary } from '@/lib/types'

interface ResearchInsightsTabProps {
  manifest: ResearchManifest | null
  stats: {
    version: string
    generated: string
    about: ResearchAboutStats
    topCoins: unknown[]
    tierSummary: Record<string, unknown>
    mcapTiers: Record<string, unknown>
    holdAnalysis: Record<string, unknown>
    gridAggregate: Record<string, unknown>
  } | null
  loading: boolean
}

function fmtPct(n: number | undefined | null, decimals = 1): string {
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M%`
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}K%`
  return `${n.toFixed(decimals)}%`
}

function fmtUsd(n: number | undefined | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

const TIER_COLORS: Record<string, string> = {
  bluechip: 'text-blue-400',
  mid: 'text-violet-400',
  micro: 'text-amber-400',
  fresh: 'text-rose-400',
  mega: 'text-emerald-400',
  large: 'text-blue-400',
  medium: 'text-amber-400',
  small: 'text-rose-400',
}

const TIER_BG: Record<string, string> = {
  bluechip: 'bg-blue-500/10 border-blue-500/20',
  mid: 'bg-violet-500/10 border-violet-500/20',
  micro: 'bg-amber-500/10 border-amber-500/20',
  fresh: 'bg-rose-500/10 border-rose-500/20',
}

export function ResearchInsightsTab({ manifest, stats, loading }: ResearchInsightsTabProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-6 h-6 animate-spin text-foreground-muted" />
      </div>
    )
  }

  if (!manifest || !stats) {
    return (
      <div className="card p-8 text-center text-foreground-muted">
        Research data not available. Run the analysis pipeline to generate data.
      </div>
    )
  }

  const rawTiers = stats.tierSummary as Record<string, Record<string, unknown>>
  const tierSummary: Record<string, ResearchTierSummary> = {}
  for (const [tier, raw] of Object.entries(rawTiers)) {
    tierSummary[tier] = {
      count: (raw.count as number) ?? 0,
      medianReturn: (raw.medianReturn ?? raw.median_return ?? 0) as number,
      medianDrawdown: (raw.medianDrawdown ?? raw.median_drawdown ?? 0) as number,
      pumpDumpCoins: (raw.pumpDumpCoins ?? raw.pump_dump_coins ?? null) as number,
    }
  }
  const topCoins = (manifest.topCoins || []) as ResearchTopCoin[]
  const sentinel = manifest.sentinel

  return (
    <div className="space-y-6">
      {/* Tier Performance Comparison */}
      <div>
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-violet-400" />
          Performance by Coin Tier
        </h3>
        <p className="text-xs text-foreground-muted mb-4">
          How different coin categories performed across the backtesting period.
          Median return and drawdown represent the typical outcome, not outliers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(tierSummary).map(([tier, data]) => {
          const summary = data as ResearchTierSummary
          return (
            <div key={tier} className={`rounded-xl border p-4 ${TIER_BG[tier] || 'bg-white/[0.02] border-white/[0.06]'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-semibold capitalize ${TIER_COLORS[tier] || 'text-foreground'}`}>
                  {tier}
                </span>
                <span className="text-xs text-foreground-muted">{summary.count} coins</span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-foreground-muted">Median Return</div>
                  <div className={`text-lg font-bold ${summary.medianReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {fmtPct(summary.medianReturn)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-foreground-muted">Median Drawdown</div>
                  <div className="text-sm font-medium text-rose-400">
                    {summary.medianDrawdown?.toFixed(1) ?? '—'}%
                  </div>
                </div>
                {summary.pumpDumpCoins != null && (
                  <div>
                    <div className="text-xs text-foreground-muted">Pump &amp; Dump</div>
                    <div className="text-sm font-medium text-amber-400">
                      {summary.pumpDumpCoins} coins
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Sentinel Config Comparison */}
      <div>
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Target className="w-5 h-5 text-emerald-400" />
          Optimal Sentinel Configurations
        </h3>
        <p className="text-xs text-foreground-muted mb-4">
          Three optimization strategies were tested — each prioritizes a different risk/reward tradeoff.
          The "Balanced" config is the default recommendation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { key: 'bySortino', label: 'Best Risk-Adjusted', desc: 'Maximizes Sortino ratio (return per unit of downside risk)', config: sentinel.overall.bySortino },
          { key: 'byMedianPnl', label: 'Best Median P&L', desc: 'Maximizes the typical (median) profit per trade', config: sentinel.overall.byMedianPnl },
          { key: 'balanced', label: 'Balanced (Default)', desc: 'Compromise between risk-adjusted returns and raw profitability', config: sentinel.overall.balanced },
        ].map((strategy) => (
          <div
            key={strategy.key}
            className={`card p-4 ${strategy.key === 'balanced' ? 'ring-1 ring-violet-500/40' : ''}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-semibold ${strategy.key === 'balanced' ? 'text-violet-400' : 'text-foreground'}`}>
                {strategy.label}
              </span>
              {strategy.key === 'balanced' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-medium">
                  RECOMMENDED
                </span>
              )}
            </div>
            <p className="text-xs text-foreground-muted mb-3">{strategy.desc}</p>
            <div className="grid grid-cols-2 gap-2">
              <ConfigPill label="Stop Loss" value={`${strategy.config.stopLossPct}%`} negative />
              <ConfigPill label="Take Profit" value={`${strategy.config.takeProfitPct}%`} />
              <ConfigPill
                label="Trailing Stop"
                value={strategy.config.trailingStopPct != null ? `${strategy.config.trailingStopPct}%` : 'Off'}
              />
              <ConfigPill label="Sell %" value={`${strategy.config.sellPercentage}%`} />
            </div>
          </div>
        ))}
      </div>

      {/* Per-Tier Sentinel Configs */}
      {sentinel.perTier && Object.keys(sentinel.perTier).length > 0 && (
        <>
          <div>
            <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              Per-Tier Optimal Configs
            </h3>
            <p className="text-xs text-foreground-muted mb-4">
              Different coin tiers have vastly different volatility profiles. These are the best 
              SL/TP combinations found for each tier individually.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(sentinel.perTier as unknown as Record<string, Record<string, number | null>>).map(([tier, config]) => (
              <div key={tier} className={`rounded-xl border p-3 ${TIER_BG[tier] || 'bg-white/[0.02] border-white/[0.06]'}`}>
                <div className={`text-sm font-semibold capitalize mb-2 ${TIER_COLORS[tier] || ''}`}>{tier}</div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">SL</span>
                    <span className="font-medium text-rose-400">{config.stop_loss_pct ?? config.stopLossPct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">TP</span>
                    <span className="font-medium text-emerald-400">{config.take_profit_pct ?? config.takeProfitPct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">TS</span>
                    <span className="font-medium">
                      {(config.trailing_stop_pct ?? config.trailingStopPct) != null
                        ? `${config.trailing_stop_pct ?? config.trailingStopPct}%`
                        : 'Off'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Top Performing Coins */}
      {topCoins.length > 0 && (
        <>
          <div>
            <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Top Performing Coins
            </h3>
            <p className="text-xs text-foreground-muted mb-4">
              Coins with the highest risk-adjusted returns (Sortino ratio) in the dataset.
            </p>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-foreground-muted text-xs">
                  <th className="text-left p-3">Coin</th>
                  <th className="text-left p-3">Tier</th>
                  <th className="text-right p-3">MCap</th>
                  <th className="text-right p-3">Return</th>
                  <th className="text-right p-3">Drawdown</th>
                  <th className="text-right p-3">Win Rate</th>
                  <th className="text-right p-3">Best SL/TP</th>
                  <th className="text-right p-3">Sortino</th>
                </tr>
              </thead>
              <tbody>
                {topCoins.slice(0, 15).map((coin, i) => (
                  <tr key={coin.symbol} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="p-3 font-medium">
                      <span className="text-foreground-muted mr-1.5 text-xs">{i + 1}.</span>
                      {coin.symbol}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs capitalize ${TIER_COLORS[coin.tier] || ''}`}>{coin.tier}</span>
                    </td>
                    <td className="p-3 text-right text-foreground-muted">{fmtUsd(coin.marketCap)}</td>
                    <td className={`p-3 text-right font-medium ${coin.totalReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {fmtPct(coin.totalReturn)}
                    </td>
                    <td className="p-3 text-right text-rose-400">{coin.maxDrawdown?.toFixed(1) ?? '—'}%</td>
                    <td className="p-3 text-right">{coin.winRate != null ? (coin.winRate * 100).toFixed(0) : '—'}%</td>
                    <td className="p-3 text-right text-xs text-foreground-muted">
                      {coin.bestSl ?? '—'} / {coin.bestTp ?? '—'}
                    </td>
                    <td className="p-3 text-right font-medium text-violet-400">{coin.sortino?.toFixed(2) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function ConfigPill({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex flex-col items-center p-2 rounded-lg bg-white/[0.03]">
      <span className="text-[10px] text-foreground-muted">{label}</span>
      <span className={`text-sm font-bold ${negative ? 'text-rose-400' : 'text-emerald-400'}`}>
        {value}
      </span>
    </div>
  )
}
