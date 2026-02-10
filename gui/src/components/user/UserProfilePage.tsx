import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  ArrowLeft,
  RefreshCw,
  User,
  Wallet,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Coins,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Clock,
  ExternalLink,
} from 'lucide-react'
import { buildImageUrl } from '@/lib/utils'
import type { UserProfileFullResponse } from '@/lib/types'

interface UserProfilePageProps {
  userId: string
  onBack: () => void
  onCoinClick?: (symbol: string) => void
}

export function UserProfilePage({ userId, onBack, onCoinClick }: UserProfilePageProps) {
  const [profile, setProfile] = useState<UserProfileFullResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await invoke<UserProfileFullResponse>('get_user_profile_full', { userId })
      setProfile(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const handleReportRug = async () => {
    if (!profile || reporting) return
    setReporting(true)
    try {
      await invoke('report_rug_pull', { userId: profile.userId, username: profile.username })
      await fetchProfile()
    } catch (e) {
      console.error('Failed to report:', e)
    } finally {
      setReporting(false)
    }
  }

  const formatValue = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`
    return `$${v.toFixed(2)}`
  }

  const formatCompact = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
    return v.toFixed(2)
  }

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-foreground-muted hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="card p-8 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
          <p className="text-foreground-muted mb-4">{error}</p>
          <button onClick={fetchProfile} className="btn btn-primary px-4 py-2">Retry</button>
        </div>
      </div>
    )
  }

  if (!profile) return null

  const avatarUrl = buildImageUrl(profile.image)
  const rep = profile.reputation
  const repScore = rep?.score ?? 50
  const repColor = repScore >= 70 ? 'text-emerald-400' : repScore >= 40 ? 'text-amber-400' : 'text-rose-400'
  const repBg = repScore >= 70 ? 'bg-emerald-500/15' : repScore >= 40 ? 'bg-amber-500/15' : 'bg-rose-500/15'
  const RepIcon = repScore >= 70 ? ShieldCheck : repScore >= 40 ? Shield : ShieldAlert

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-foreground-muted hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <a
            href={`https://rugplay.com/profile/${profile.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground transition-colors"
          >
            View on Rugplay <ExternalLink className="w-3 h-3" />
          </a>
          <button onClick={fetchProfile} className="p-2 rounded-lg hover:bg-background-tertiary transition-colors" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Profile Card */}
      <div className="card">
        <div className="flex items-start gap-5">
          <div className="w-20 h-20 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-white/[0.08]">
            {avatarUrl ? (
              <img src={avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-foreground-muted" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold truncate">{profile.name || profile.username}</h1>
              {rep && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${repBg} ${repColor}`}>
                  <RepIcon className="w-3.5 h-3.5" />
                  {repScore.toFixed(0)}
                </div>
              )}
            </div>
            <p className="text-foreground-muted">@{profile.username}</p>
            {profile.bio && (
              <p className="text-sm text-foreground-muted mt-2 leading-relaxed">{profile.bio}</p>
            )}
          </div>

          {/* Report button */}
          <button
            onClick={handleReportRug}
            disabled={reporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition-colors flex-shrink-0"
            title="Flag this user as a rug puller (-15 reputation)"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            {reporting ? 'Reporting...' : 'Report Rug'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Wallet className="w-4 h-4 text-emerald-400" />} label="Balance" value={formatValue(profile.balance)} />
        <StatCard icon={<BarChart3 className="w-4 h-4 text-blue-400" />} label="Portfolio" value={formatValue(profile.totalPortfolioValue)} />
        <StatCard icon={<Coins className="w-4 h-4 text-amber-400" />} label="Holdings" value={String(profile.holdingsCount)} />
        <StatCard icon={<TrendingUp className="w-4 h-4 text-purple-400" />} label="Total Volume" value={formatValue(profile.totalBuyVolume + profile.totalSellVolume)} />
      </div>

      {/* 24h Activity */}
      <div className="card">
        <h2 className="text-sm font-semibold text-foreground-muted uppercase tracking-wider mb-4">24h Activity</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-foreground-muted mb-1">Transactions</p>
            <p className="text-lg font-bold">{profile.transactions24h}</p>
          </div>
          <div>
            <p className="text-xs text-foreground-muted mb-1">Buy Volume</p>
            <p className="text-lg font-bold text-buy">{formatValue(profile.buyVolume24h)}</p>
          </div>
          <div>
            <p className="text-xs text-foreground-muted mb-1">Sell Volume</p>
            <p className="text-lg font-bold text-sell">{formatValue(profile.sellVolume24h)}</p>
          </div>
        </div>
      </div>

      {/* Reputation Detail */}
      {rep && (
        <div className="card">
          <h2 className="text-sm font-semibold text-foreground-muted uppercase tracking-wider mb-4">Local Reputation</h2>
          <div className="space-y-4">
            {/* Score bar */}
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-foreground-muted">Trust Score</span>
                <span className={`font-bold ${repColor}`}>{repScore.toFixed(1)} / 100</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    repScore >= 70 ? 'bg-emerald-500' : repScore >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.max(2, repScore)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 rounded-lg bg-white/[0.02]">
                <p className="text-xs text-foreground-muted mb-1">Rug Pulls</p>
                <p className={`text-lg font-bold ${rep.rugPulls > 0 ? 'text-rose-400' : 'text-foreground'}`}>{rep.rugPulls}</p>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.02]">
                <p className="text-xs text-foreground-muted mb-1">LB Appearances</p>
                <p className="text-lg font-bold">{rep.leaderboardAppearances}</p>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.02]">
                <p className="text-xs text-foreground-muted mb-1">Total Extracted</p>
                <p className="text-lg font-bold text-amber-400">{formatValue(rep.totalExtracted)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Created Coins */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground-muted uppercase tracking-wider">
              Created Coins ({profile.coinsCreated})
            </h2>
          </div>
          {profile.createdCoins.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {profile.createdCoins.map((coin) => {
                const iconUrl = buildImageUrl(coin.icon)
                const isUp = coin.change24h >= 0
                return (
                  <div
                    key={coin.symbol}
                    onClick={() => onCoinClick?.(coin.symbol)}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-background-tertiary/50 transition-colors cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden">
                      {iconUrl ? (
                        <img src={iconUrl} alt={coin.symbol} className="w-full h-full object-cover" />
                      ) : (
                        <Coins className="w-4 h-4 text-foreground-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">${coin.symbol}</div>
                      <div className="text-xs text-foreground-muted truncate">{coin.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono">{formatValue(coin.currentPrice)}</div>
                      <div className={`text-xs flex items-center gap-0.5 justify-end ${isUp ? 'text-buy' : 'text-sell'}`}>
                        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(coin.change24h).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-foreground-muted text-center py-6">No coins created</p>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="card">
          <h2 className="text-sm font-semibold text-foreground-muted uppercase tracking-wider mb-4">
            Recent Transactions
          </h2>
          {profile.recentTransactions.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {profile.recentTransactions.map((tx) => {
                const isBuy = tx.tradeType.toUpperCase() === 'BUY'
                const iconUrl = buildImageUrl(tx.coinIcon)
                return (
                  <div
                    key={tx.id}
                    onClick={() => onCoinClick?.(tx.coinSymbol)}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-background-tertiary/50 transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden">
                      {iconUrl ? (
                        <img src={iconUrl} alt={tx.coinSymbol} className="w-full h-full object-cover" />
                      ) : (
                        <Coins className="w-3.5 h-3.5 text-foreground-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          isBuy ? 'bg-buy/20 text-buy' : 'bg-sell/20 text-sell'
                        }`}>
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                        <span className="text-sm font-medium truncate">${tx.coinSymbol}</span>
                      </div>
                      <div className="text-xs text-foreground-muted">
                        {formatCompact(tx.quantity)} @ {formatValue(tx.pricePerCoin)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-mono ${isBuy ? 'text-buy' : 'text-sell'}`}>
                        {formatValue(tx.totalValue)}
                      </div>
                      <div className="text-[10px] text-foreground-muted flex items-center gap-1 justify-end">
                        <Clock className="w-2.5 h-2.5" />
                        {formatTimestamp(tx.timestamp)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-foreground-muted text-center py-6">No recent transactions</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card !p-4">
      <div className="flex items-center gap-2 text-xs text-foreground-muted mb-1.5">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  )
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return `${diffSecs}s ago`
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`
  return date.toLocaleDateString()
}
