import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Trophy,
  Skull,
  Crown,
  Gem,
  RefreshCw,
  Search,
  User,
  ShieldAlert,
  ShieldCheck,
  Shield,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react'
import { buildImageUrl } from '@/lib/utils'
import type { LeaderboardFullResponse, LeaderboardUser } from '@/lib/types'

type LeaderboardTab = 'rugpullers' | 'losers' | 'cashKings' | 'paperMillionaires'

interface LeaderboardPageProps {
  onUserClick?: (userId: string) => void
}

const TABS: { id: LeaderboardTab; label: string; icon: React.ReactNode; color: string; description: string }[] = [
  { id: 'rugpullers', label: 'Top Rugpullers', icon: <Skull className="w-4 h-4" />, color: 'text-rose-400', description: 'Extracted the most value from the market' },
  { id: 'losers', label: 'Biggest Losers', icon: <TrendingDown className="w-4 h-4" />, color: 'text-amber-400', description: 'Lost the most money trading' },
  { id: 'cashKings', label: 'Cash Kings', icon: <Crown className="w-4 h-4" />, color: 'text-emerald-400', description: 'Highest liquid cash balances' },
  { id: 'paperMillionaires', label: 'Paper Millionaires', icon: <Gem className="w-4 h-4" />, color: 'text-purple-400', description: 'Richest portfolios (including unrealized)' },
]

export function LeaderboardPage({ onUserClick }: LeaderboardPageProps) {
  const [data, setData] = useState<LeaderboardFullResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('rugpullers')
  const [search, setSearch] = useState('')

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await invoke<LeaderboardFullResponse>('get_leaderboard')
      setData(result)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  const currentList = useMemo(() => {
    if (!data) return []
    const map: Record<LeaderboardTab, LeaderboardUser[]> = {
      rugpullers: data.topRugpullers,
      losers: data.biggestLosers,
      cashKings: data.cashKings,
      paperMillionaires: data.paperMillionaires,
    }
    let list = map[activeTab] || []
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((u) => u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    }
    return list
  }, [data, activeTab, search])

  const tabMeta = TABS.find((t) => t.id === activeTab)!

  const formatValue = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`
    return `$${v.toFixed(2)}`
  }

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Leaderboard</h1>
            <p className="text-sm text-foreground-muted">Rugplay rankings and reputation tracker</p>
          </div>
        </div>
        <button
          onClick={fetchLeaderboard}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? `bg-background-secondary ${tab.color} shadow-sm`
                : 'text-foreground-muted hover:text-foreground hover:bg-white/[0.03]'
            }`}
          >
            {tab.icon}
            <span className="hidden md:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players..."
          className="input pl-10"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="card p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
          <p className="text-foreground-muted mb-3">{error}</p>
          <button onClick={fetchLeaderboard} className="btn btn-primary px-4 py-2">Retry</button>
        </div>
      )}

      {/* Category Description */}
      {!error && (
        <div className="flex items-center gap-2 px-1 text-sm text-foreground-muted">
          <span className={tabMeta.color}>{tabMeta.icon}</span>
          {tabMeta.description}
          {search && ` · ${currentList.length} results`}
        </div>
      )}

      {/* Leaderboard List */}
      {!error && (
        <div className="card !p-0 overflow-hidden">
          {loading && !data ? (
            <div className="text-center py-12 text-foreground-muted">
              <RefreshCw className="w-6 h-6 mx-auto mb-3 animate-spin opacity-50" />
              <p>Loading leaderboard...</p>
            </div>
          ) : currentList.length === 0 ? (
            <div className="text-center py-12 text-foreground-muted">
              <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{search ? 'No players match your search' : 'No data available'}</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {currentList.map((user) => (
                <LeaderboardRow
                  key={user.userId}
                  user={user}
                  tab={activeTab}
                  onUserClick={onUserClick}
                  formatValue={formatValue}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LeaderboardRow({
  user,
  tab,
  onUserClick,
  formatValue,
}: {
  user: LeaderboardUser
  tab: LeaderboardTab
  onUserClick?: (userId: string) => void
  formatValue: (v: number) => string
}) {
  const imageUrl = buildImageUrl(user.image)
  const rep = user.reputationScore
  const repColor = rep !== null
    ? rep >= 70 ? 'text-emerald-400' : rep >= 40 ? 'text-amber-400' : 'text-rose-400'
    : ''
  const RepIcon = rep !== null
    ? rep >= 70 ? ShieldCheck : rep >= 40 ? Shield : ShieldAlert
    : Shield

  const rankColor =
    user.rank === 1 ? 'text-amber-400' :
    user.rank === 2 ? 'text-zinc-300' :
    user.rank === 3 ? 'text-amber-600' :
    'text-foreground-muted'

  const primaryColor: Record<LeaderboardTab, string> = {
    rugpullers: 'text-rose-400',
    losers: 'text-amber-400',
    cashKings: 'text-emerald-400',
    paperMillionaires: 'text-purple-400',
  }

  return (
    <div
      onClick={() => onUserClick?.(user.userId)}
      className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${
        onUserClick ? 'cursor-pointer hover:bg-white/[0.03]' : ''
      }`}
    >
      {/* Rank */}
      <span className={`w-8 text-center text-sm font-bold ${rankColor}`}>
        {user.rank <= 3 ? ['', '🥇', '🥈', '🥉'][user.rank] : `#${user.rank}`}
      </span>

      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden flex-shrink-0">
        {imageUrl ? (
          <img src={imageUrl} alt={user.username} className="w-full h-full object-cover" />
        ) : (
          <User className="w-5 h-5 text-foreground-muted" />
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{user.name || user.username}</div>
        <div className="text-xs text-foreground-muted">@{user.username}</div>
      </div>

      {/* Reputation badge */}
      {rep !== null && (
        <div className={`flex items-center gap-1 text-xs font-semibold ${repColor}`} title={`Reputation: ${rep.toFixed(0)}`}>
          <RepIcon className="w-3.5 h-3.5" />
          {rep.toFixed(0)}
        </div>
      )}

      {/* Values */}
      <div className="text-right flex-shrink-0">
        <div className={`font-mono font-medium ${primaryColor[tab]}`}>
          {formatValue(user.primaryValue)}
        </div>
        <div className="text-xs text-foreground-muted">
          {user.label}
        </div>
      </div>
    </div>
  )
}
