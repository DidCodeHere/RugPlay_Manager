import {
  RefreshCw,
  Database,
  BarChart3,
  Coins,
  TestTube2,
  Layers,
  GitBranch,
  Shield,
  ExternalLink,
  Code2,
  Heart,
} from 'lucide-react'
import type { ResearchAboutStats } from '@/lib/types'

interface OverviewTabProps {
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function OverviewTab({ stats, loading }: OverviewTabProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-6 h-6 animate-spin text-foreground-muted" />
      </div>
    )
  }

  const about = stats?.about

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet-500/10 via-background-secondary to-blue-500/10 p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-500/5 via-transparent to-transparent" />
        <div className="relative z-10">
          <h2 className="text-3xl font-bold mb-2">RugPlay Manager</h2>
          <p className="text-foreground-muted max-w-2xl">
            An automated trading toolkit for Rugplay.com — snipe new launches, mirror whale trades, 
            catch dips, and protect your portfolio with intelligent sentinel guards. Built with Rust, 
            Tauri, and React.
          </p>
          <div className="flex items-center gap-4 mt-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-violet-500/20 text-violet-400 border border-violet-500/30">
              v2.0.2
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Shield className="w-3 h-3" />
              Open Source
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Code2 className="w-3 h-3" />
              Rust + React
            </span>
          </div>
        </div>
      </div>

      {/* Research Data Stats Grid */}
      {about && (
        <>
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-violet-400" />
              Research Pipeline
            </h3>
            <p className="text-sm text-foreground-muted mb-4">
              All recommended settings are derived from real backtesting data, not guesswork. 
              The analysis pipeline collects historical candle data, runs a grid search across 
              216 SL/TP/TS combinations per coin, and finds the statistically optimal configurations.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Coins className="w-5 h-5 text-amber-400" />}
              label="Coins Analyzed"
              value={formatNumber(about.totalCoinsAnalyzed)}
              sublabel={`${about.totalCoinsSkipped} skipped`}
              accent="amber"
            />
            <StatCard
              icon={<Database className="w-5 h-5 text-blue-400" />}
              label="Candle Rows"
              value={formatNumber(about.totalCandleRows)}
              sublabel="5-min intervals"
              accent="blue"
            />
            <StatCard
              icon={<TestTube2 className="w-5 h-5 text-violet-400" />}
              label="Backtests Run"
              value={formatNumber(about.totalGridBacktests)}
              sublabel={`${about.gridConfigsTestedPerCoin} configs each`}
              accent="violet"
            />
            <StatCard
              icon={<Layers className="w-5 h-5 text-emerald-400" />}
              label="Positive Sortino"
              value={about.coinsWithPositiveSortino.toString()}
              sublabel={`of ${about.totalCoinsAnalyzed} coins`}
              accent="emerald"
            />
          </div>

          {/* Tier Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TierBreakdown
              title="Coin Tiers (by age/volume)"
              data={about.tierCounts as Record<string, number>}
              total={about.totalCoinsAnalyzed}
              colors={{
                bluechip: { bg: 'bg-blue-500', label: 'Bluechip' },
                mid: { bg: 'bg-violet-500', label: 'Mid' },
                micro: { bg: 'bg-amber-500', label: 'Micro' },
                fresh: { bg: 'bg-rose-500', label: 'Fresh' },
              }}
            />
            <TierBreakdown
              title="Market Cap Tiers"
              data={about.mcapTierCounts as Record<string, number>}
              total={about.totalCoinsAnalyzed}
              colors={{
                mega: { bg: 'bg-emerald-500', label: 'Mega (>$1M)' },
                large: { bg: 'bg-blue-500', label: 'Large ($100K–$1M)' },
                medium: { bg: 'bg-amber-500', label: 'Medium ($10K–$100K)' },
                small: { bg: 'bg-rose-500', label: 'Small ($1K–$10K)' },
              }}
            />
          </div>

          {/* Market Insight Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">
                {about.overallMedianReturn?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—'}%
              </div>
              <div className="text-xs text-foreground-muted mt-1">Median Return (All Coins)</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-rose-400">
                {about.overallMedianDrawdown?.toFixed(1) ?? '—'}%
              </div>
              <div className="text-xs text-foreground-muted mt-1">Median Max Drawdown</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-amber-400">
                {about.pumpDumpPercentage?.toFixed(1) ?? '—'}%
              </div>
              <div className="text-xs text-foreground-muted mt-1">Pump &amp; Dump Coins</div>
            </div>
          </div>
        </>
      )}

      {/* Tech Stack */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Code2 className="w-5 h-5 text-blue-400" />
          Technology Stack
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { name: 'Rust', desc: 'Backend & async runtime', color: 'text-orange-400' },
            { name: 'Tauri 2.0', desc: 'Native desktop framework', color: 'text-blue-400' },
            { name: 'React 18', desc: 'Frontend UI layer', color: 'text-cyan-400' },
            { name: 'TypeScript', desc: 'Type-safe frontend', color: 'text-blue-300' },
            { name: 'SQLite', desc: 'Local encrypted database', color: 'text-emerald-400' },
            { name: 'Tokio', desc: 'Async task scheduler', color: 'text-violet-400' },
            { name: 'Tailwind CSS', desc: 'Utility-first styling', color: 'text-cyan-300' },
            { name: 'AES-256-GCM', desc: 'Token encryption', color: 'text-amber-400' },
          ].map((tech) => (
            <div key={tech.name} className="card p-3">
              <div className={`font-medium text-sm ${tech.color}`}>{tech.name}</div>
              <div className="text-xs text-foreground-muted mt-0.5">{tech.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Links */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-foreground-muted" />
          Links
        </h3>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'GitHub Repository', url: 'https://github.com' },
            { label: 'Rugplay.com', url: 'https://rugplay.com' },
          ].map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-foreground-muted hover:text-foreground border border-white/[0.06] transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-foreground-muted pb-4 flex items-center justify-center gap-1">
        Built with <Heart className="w-3 h-3 text-rose-400" /> for the Rugplay community
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sublabel: string
  accent: string
}) {
  return (
    <div className={`card p-4 border-t-2 border-t-${accent}-500/40`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-foreground-muted">{label}</span></div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-foreground-muted mt-1">{sublabel}</div>
    </div>
  )
}

function TierBreakdown({
  title,
  data,
  total,
  colors,
}: {
  title: string
  data: Record<string, number>
  total: number
  colors: Record<string, { bg: string; label: string }>
}) {
  if (!data || Object.keys(data).length === 0) return null

  const ordered = Object.entries(colors)
    .filter(([key]) => data[key] != null)
    .map(([key, meta]) => ({ key, count: data[key], ...meta }))

  return (
    <div className="card p-4">
      <h4 className="text-sm font-semibold mb-3">{title}</h4>
      {/* Bar */}
      <div className="flex rounded-full overflow-hidden h-3 mb-3">
        {ordered.map((tier) => (
          <div
            key={tier.key}
            className={`${tier.bg} transition-all`}
            style={{ width: `${(tier.count / total) * 100}%` }}
            title={`${tier.label}: ${tier.count}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-1.5">
        {ordered.map((tier) => (
          <div key={tier.key} className="flex items-center gap-2 text-xs">
            <div className={`w-2.5 h-2.5 rounded-full ${tier.bg}`} />
            <span className="text-foreground-muted">{tier.label}</span>
            <span className="font-medium ml-auto">{tier.count}</span>
            <span className="text-foreground-muted">({((tier.count / total) * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}
