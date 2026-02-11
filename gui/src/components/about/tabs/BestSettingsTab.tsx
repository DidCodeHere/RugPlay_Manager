import {
  RefreshCw,
  Shield,
  TrendingDown,
  SlidersHorizontal,
  ArrowRight,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import type { ResearchManifest, ResearchSentinelConfig, ResearchDipBuyerPreset } from '@/lib/types'

interface BestSettingsTabProps {
  manifest: ResearchManifest | null
  loading: boolean
}

export function BestSettingsTab({ manifest, loading }: BestSettingsTabProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-6 h-6 animate-spin text-foreground-muted" />
      </div>
    )
  }

  if (!manifest) {
    return (
      <div className="card p-8 text-center text-foreground-muted">
        Research data not available.
      </div>
    )
  }

  const balanced = manifest.sentinel.overall.balanced
  const bySortino = manifest.sentinel.overall.bySortino
  const byPnl = manifest.sentinel.overall.byMedianPnl

  // Normalize raw JSON (may be snake_case from disk manifest or camelCase from builtin)
  const rawPresets = manifest.dipbuyer.presets as unknown as Record<string, Record<string, unknown>>
  const dipPresets: Record<string, ResearchDipBuyerPreset> = {}
  for (const [level, raw] of Object.entries(rawPresets)) {
    dipPresets[level] = {
      buyAmountUsd: (raw.buyAmountUsd ?? raw.buy_amount_usd ?? 0) as number,
      maxPriceDropPct: (raw.maxPriceDropPct ?? raw.max_price_drop_pct ?? 0) as number,
      stopLossPct: (raw.stopLossPct ?? raw.stop_loss_pct ?? 0) as number,
      takeProfitPct: (raw.takeProfitPct ?? raw.take_profit_pct ?? 0) as number,
      trailingStopPct: (raw.trailingStopPct ?? raw.trailing_stop_pct ?? null) as number | null,
      minMarketCap: (raw.minMarketCap ?? raw.min_market_cap ?? 0) as number,
      minVolume24h: (raw.minVolume24h ?? raw.min_volume_24h ?? 0) as number,
      minConfidenceScore: (raw.minConfidenceScore ?? raw.min_confidence_score ?? 0) as number,
      maxDailyBuys: (raw.maxDailyBuys ?? raw.max_daily_buys ?? 0) as number,
    }
  }

  const rawPerTier = manifest.sentinel.perTier as unknown as Record<string, Record<string, number | null>>
  const perTier: Record<string, { stopLossPct: number | null; takeProfitPct: number | null; trailingStopPct: number | null }> = {}
  for (const [tier, raw] of Object.entries(rawPerTier)) {
    perTier[tier] = {
      stopLossPct: (raw.stopLossPct ?? raw.stop_loss_pct ?? null) as number | null,
      takeProfitPct: (raw.takeProfitPct ?? raw.take_profit_pct ?? null) as number | null,
      trailingStopPct: (raw.trailingStopPct ?? raw.trailing_stop_pct ?? null) as number | null,
    }
  }

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-emerald-500/5 via-background-secondary to-violet-500/5 p-6">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-6 h-6 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-lg font-semibold mb-1">Data-Driven Settings</h3>
            <p className="text-sm text-foreground-muted">
              Every recommendation below comes directly from backtesting {manifest.about.totalCoinsAnalyzed} coins 
              across {manifest.about.gridConfigsTestedPerCoin} SL/TP/TS configurations each 
              ({(manifest.about.totalGridBacktests).toLocaleString()} total backtests).
              These numbers update automatically when you run the analysis pipeline with new market data.
            </p>
          </div>
        </div>
      </div>

      {/* Sentinel Recommended Settings */}
      <SettingsSection
        icon={<Shield className="w-5 h-5 text-emerald-400" />}
        title="Sentinel (Stop-Loss / Take-Profit)"
        subtitle="Default protection settings applied to all new sentinels"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Balanced Config (Recommended) */}
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-semibold text-violet-400">Balanced (Recommended)</span>
            </div>
            <SettingsGrid config={balanced} />
            <p className="text-xs text-foreground-muted mt-3">
              Balances risk-adjusted returns (Sortino) with raw profitability (median P&L). 
              This is the default applied via "Reset to Defaults" on the Settings page.
            </p>
          </div>

          {/* Why These Values */}
          <div className="space-y-3">
            <Insight
              title={`Stop Loss at ${balanced.stopLossPct}%`}
              positive={false}
            >
              The backtest found that a {balanced.stopLossPct}% stop loss provides enough room for 
              normal volatility while still cutting catastrophic losses. 
              Tighter stops (e.g. {byPnl.stopLossPct}%) maximize median P&L but get stopped out more 
              on volatile coins. Wider stops ({bySortino.stopLossPct}%) maximize risk-adjusted returns 
              but require higher risk tolerance.
            </Insight>
            <Insight
              title={`Take Profit at ${balanced.takeProfitPct}%`}
              positive
            >
              Rugplay coins commonly see {'>'}500% swings. Setting TP at {balanced.takeProfitPct}% captures 
              the bulk of profitable moves. Lower TPs leave money on the table, while higher TPs 
              (like {bySortino.takeProfitPct}%) only work for coins that truly moon.
            </Insight>
            <Insight
              title="Trailing Stop: Off"
              positive={false}
            >
              Across all {manifest.about.totalCoinsAnalyzed} coins tested, trailing stops didn't improve 
              overall performance. The extreme volatility of Rugplay coins means trailing stops often 
              trigger on normal pullbacks before the next leg up.
            </Insight>
          </div>
        </div>

        {/* Alternative Configs */}
        <div className="mt-4">
          <h4 className="text-sm font-semibold mb-2 text-foreground-muted">Alternative Strategies</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="text-xs font-medium mb-2">Best Risk-Adjusted (Sortino)</div>
              <SettingsGrid config={bySortino} compact />
              <p className="text-xs text-foreground-muted mt-2">
                For patient traders who can stomach drawdowns. Wider stop loss, 
                larger take profit — fewer trades but bigger wins.
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="text-xs font-medium mb-2">Best Median P&L</div>
              <SettingsGrid config={byPnl} compact />
              <p className="text-xs text-foreground-muted mt-2">
                Tight stop loss cuts losers fast. Good for high-frequency approaches 
                but may exit too early on volatile coins.
              </p>
            </div>
          </div>
        </div>

        {/* Per-Tier Table */}
        {Object.keys(perTier).length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold mb-2 text-foreground-muted">Optimal Settings by Coin Tier</h4>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-foreground-muted text-xs">
                    <th className="text-left p-3">Tier</th>
                    <th className="text-right p-3">Stop Loss</th>
                    <th className="text-right p-3">Take Profit</th>
                    <th className="text-right p-3">Trailing Stop</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(perTier).map(([tier, config]) => (
                    <tr key={tier} className="border-b border-white/[0.04]">
                      <td className="p-3 capitalize font-medium">{tier}</td>
                      <td className="p-3 text-right text-rose-400">
                        {config.stopLossPct}%
                      </td>
                      <td className="p-3 text-right text-emerald-400">
                        {config.takeProfitPct}%
                      </td>
                      <td className="p-3 text-right text-foreground-muted">
                        {config.trailingStopPct != null
                          ? `${config.trailingStopPct}%`
                          : 'Off'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-foreground-muted mt-2">
              Bluechip and Mid-tier coins can tolerate wider stops because they tend to recover from dips. 
              Micro and Fresh coins need tighter exits because drawdowns are often permanent (rug pulls).
            </p>
          </div>
        )}
      </SettingsSection>

      {/* Dip Buyer Settings */}
      <SettingsSection
        icon={<TrendingDown className="w-5 h-5 text-rose-400" />}
        title="Dip Buyer Presets"
        subtitle="Research-backed parameters for each aggressiveness level"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(dipPresets).map(([level, preset]) => {
            const colors: Record<string, { border: string; text: string; badge: string }> = {
              conservative: { border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/20' },
              moderate: { border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-500/20' },
              aggressive: { border: 'border-rose-500/30', text: 'text-rose-400', badge: 'bg-rose-500/20' },
            }
            const c = colors[level] || colors.moderate

            return (
              <div key={level} className={`rounded-xl border ${c.border} bg-white/[0.02] p-4`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-sm font-semibold capitalize ${c.text}`}>{level}</span>
                  {level === 'moderate' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-medium">
                      DEFAULT
                    </span>
                  )}
                </div>
                <div className="space-y-2 text-xs">
                  <Row label="Buy Amount" value={`$${preset.buyAmountUsd}`} />
                  <Row label="Max Dip" value={`${preset.maxPriceDropPct}%`} negative />
                  <Row label="Stop Loss" value={`${preset.stopLossPct}%`} negative />
                  <Row label="Take Profit" value={`${preset.takeProfitPct}%`} positive />
                  <Row
                    label="Trailing Stop"
                    value={preset.trailingStopPct != null ? `${preset.trailingStopPct}%` : 'Off'}
                  />
                  <Row label="Min MCap" value={preset.minMarketCap ? `$${(preset.minMarketCap / 1000).toFixed(0)}K` : '—'} />
                  <Row label="Min Volume" value={preset.minVolume24h ? `$${(preset.minVolume24h / 1000).toFixed(0)}K` : '—'} />
                  <Row label="Min Confidence" value={preset.minConfidenceScore ? `${(preset.minConfidenceScore * 100).toFixed(0)}%` : '—'} />
                  <Row label="Max Daily Buys" value={preset.maxDailyBuys.toString()} />
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-foreground-muted">
            <span className="font-medium text-amber-400">Coin tiers matter.</span> The Dip Buyer uses 
            market-cap-based tiers (Small, Medium, Large, Mega) to scale buy amounts and filter quality. 
            Use "Reset to Defaults" on the Dip Buyer page to regenerate all tiers with research-backed 
            boundaries: Small ($1K–$10K), Medium ($10K–$100K), Large ($100K–$1M), Mega ({'>'}$1M).
          </div>
        </div>
      </SettingsSection>

      {/* General Strategy Advice */}
      <SettingsSection
        icon={<SlidersHorizontal className="w-5 h-5 text-violet-400" />}
        title="General Strategy Guidance"
        subtitle="Key takeaways from the research data"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TakeawayCard
            title="Trailing Stops Don't Help Overall"
            description={`Across ${manifest.about.totalCoinsAnalyzed} coins, trailing stops didn't improve aggregate performance. Rugplay's extreme volatility means prices often retrace 10-20% before continuing upward, prematurely triggering trailing stops.`}
            type="warning"
          />
          <TakeawayCard
            title="Wider Stops = Better Risk-Adjusted Returns"
            description={`The Sortino-optimal config uses SL ${bySortino.stopLossPct}% / TP ${bySortino.takeProfitPct}%. While this means accepting larger individual losses, the wins more than compensate. Best for patient, longer-term positions.`}
            type="info"
          />
          <TakeawayCard
            title="Tight Stops = Better Median P&L"
            description={`SL ${byPnl.stopLossPct}% / TP ${byPnl.takeProfitPct}% produces the best median trade outcome. Quick exits on losers, but may get stopped out of coins that eventually recover.`}
            type="info"
          />
          <TakeawayCard
            title={`${manifest.about.pumpDumpPercentage?.toFixed(0) ?? '—'}% Are Pump & Dumps`}
            description={`Over a third of coins in the dataset showed classic pump-and-dump patterns. The Dip Buyer's holder analysis and confidence scoring helps filter these out before buying.`}
            type="warning"
          />
        </div>
      </SettingsSection>
    </div>
  )
}

function SettingsSection({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <p className="text-xs text-foreground-muted mb-4">{subtitle}</p>
      {children}
    </div>
  )
}

function SettingsGrid({ config, compact }: { config: ResearchSentinelConfig; compact?: boolean }) {
  const cls = compact ? 'grid-cols-4 gap-1.5' : 'grid-cols-4 gap-2'
  return (
    <div className={`grid ${cls}`}>
      <MiniStat label="SL" value={`${config.stopLossPct}%`} color="text-rose-400" compact={compact} />
      <MiniStat label="TP" value={`${config.takeProfitPct}%`} color="text-emerald-400" compact={compact} />
      <MiniStat
        label="TS"
        value={config.trailingStopPct != null ? `${config.trailingStopPct}%` : 'Off'}
        color="text-foreground-muted"
        compact={compact}
      />
      <MiniStat label="Sell" value={`${config.sellPercentage}%`} color="text-blue-400" compact={compact} />
    </div>
  )
}

function MiniStat({ label, value, color, compact }: { label: string; value: string; color: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-lg bg-white/[0.04] ${compact ? 'p-1.5' : 'p-2.5'}`}>
      <span className="text-[10px] text-foreground-muted">{label}</span>
      <span className={`${compact ? 'text-xs' : 'text-sm'} font-bold ${color}`}>{value}</span>
    </div>
  )
}

function Row({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  let valueColor = ''
  if (positive) valueColor = 'text-emerald-400'
  if (negative) valueColor = 'text-rose-400'
  return (
    <div className="flex justify-between items-center">
      <span className="text-foreground-muted">{label}</span>
      <span className={`font-medium ${valueColor}`}>{value}</span>
    </div>
  )
}

function Insight({ title, positive, children }: { title: string; positive: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border p-3 ${positive ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {positive ? (
          <ArrowRight className="w-3 h-3 text-emerald-400" />
        ) : (
          <ArrowRight className="w-3 h-3 text-foreground-muted" />
        )}
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <p className="text-xs text-foreground-muted">{children}</p>
    </div>
  )
}

function TakeawayCard({ title, description, type }: { title: string; description: string; type: 'info' | 'warning' }) {
  const colors = type === 'warning'
    ? 'border-amber-500/20 bg-amber-500/5'
    : 'border-blue-500/20 bg-blue-500/5'
  const iconColor = type === 'warning' ? 'text-amber-400' : 'text-blue-400'

  return (
    <div className={`rounded-xl border p-4 ${colors}`}>
      <div className="flex items-center gap-2 mb-2">
        {type === 'warning' ? (
          <AlertTriangle className={`w-4 h-4 ${iconColor}`} />
        ) : (
          <Lightbulb className={`w-4 h-4 ${iconColor}`} />
        )}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="text-xs text-foreground-muted">{description}</p>
    </div>
  )
}
