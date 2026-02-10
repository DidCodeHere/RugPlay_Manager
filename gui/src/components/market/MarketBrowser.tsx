import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { 
  RefreshCw, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  TrendingUp,
  TrendingDown,
  Store,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { CoinDetailsModal } from '../portfolio/CoinDetailsModal'
import { buildImageUrl } from '@/lib/utils'
import type { MarketResponse, MarketCoin } from '@/lib/types'

type SortField = 'marketCap' | 'currentPrice' | 'volume24h' | 'change24h' | 'createdAt'
type SortOrder = 'asc' | 'desc'

interface MarketBrowserProps {
  onCoinClick?: (symbol: string) => void
}

export function MarketBrowser({ onCoinClick }: MarketBrowserProps) {
  const [coins, setCoins] = useState<MarketCoin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  // Pagination
  const [page, setPage] = useState(1)
  const [totalCoins, setTotalCoins] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const perPage = 25
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>('marketCap')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  
  // Server-side search
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Modal
  const [selectedCoin, setSelectedCoin] = useState<MarketCoin | null>(null)

  const fetchMarket = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      
      const data = await invoke<MarketResponse>('get_market', {
        page,
        limit: perPage,
        sortBy: sortField,
        sortOrder,
        search: searchQuery || null,
      })
      
      setCoins(data.coins)
      setTotalCoins(data.total ?? data.coins.length)
      setTotalPages(data.totalPages ?? Math.ceil((data.total ?? data.coins.length) / perPage))
      setLastUpdated(new Date())
    } catch (e) {
      setError(`Failed to load market: ${e}`)
    } finally {
      setLoading(false)
    }
  }, [page, sortField, sortOrder, searchQuery])

  // Initial load + refetch on params change
  useEffect(() => {
    fetchMarket()
  }, [fetchMarket])

  // Debounced search: update searchQuery 400ms after user stops typing
  const handleSearchInput = (value: string) => {
    setSearchInput(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearchQuery(value.trim())
      setPage(1) // Reset to page 1 on search
    }, 400)
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
    setPage(1)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-40" />
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-blue-400" />
      : <ArrowDown className="w-3 h-3 text-blue-400" />
  }

  const formatNumber = (num: number, decimals = 2) => 
    num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  const formatPrice = (num: number) => {
    if (num < 0.0001) return `$${num.toExponential(2)}`
    if (num < 0.01) return `$${num.toFixed(6)}`
    if (num < 1) return `$${num.toFixed(4)}`
    return `$${formatNumber(num, 2)}`
  }

  const formatMarketCap = (num: number) => {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
    return `$${formatNumber(num, 2)}`
  }

  const formatVolume = (num: number) => {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`
    return `$${formatNumber(num, 0)}`
  }

  // totalPages is now set from API response

  if (loading && coins.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    )
  }

  if (error && coins.length === 0) {
    return (
      <div className="card">
        <div className="text-center py-8">
          <p className="text-sell mb-4">{error}</p>
          <button 
            onClick={fetchMarket}
            className="btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Store className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Market</h1>
            <p className="text-sm text-foreground-muted">
              Browse all coins on Rugplay
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-foreground-muted">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchMarket}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
            title="Refresh market"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Market Table Card */}
      <div className="card">
        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input
              type="text"
              placeholder="Search all coins..."
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="input w-full pl-9 pr-8 text-sm"
            />
            {searchInput && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-background-tertiary rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Results count */}
          <span className="text-sm text-foreground-muted ml-auto">
            {totalCoins.toLocaleString()} coins
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-background-tertiary">
          <table className="w-full">
            <thead>
              <tr className="bg-background-tertiary/50">
                <th className="text-left px-4 py-3">
                  <span className="text-xs font-medium text-foreground-muted">Coin</span>
                </th>
                <th className="text-right px-4 py-3">
                  <button 
                    onClick={() => handleSort('currentPrice')}
                    className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors ml-auto"
                  >
                    Price <SortIcon field="currentPrice" />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <button 
                    onClick={() => handleSort('change24h')}
                    className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors ml-auto"
                  >
                    24h Change <SortIcon field="change24h" />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <button 
                    onClick={() => handleSort('marketCap')}
                    className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors ml-auto"
                  >
                    Market Cap <SortIcon field="marketCap" />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <button 
                    onClick={() => handleSort('volume24h')}
                    className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors ml-auto"
                  >
                    Volume (24h) <SortIcon field="volume24h" />
                  </button>
                </th>
                <th className="text-right px-4 py-3">
                  <button 
                    onClick={() => handleSort('createdAt')}
                    className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors ml-auto"
                  >
                    Created <SortIcon field="createdAt" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {coins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-foreground-muted">
                    {searchQuery ? 'No coins match your search' : 'No coins found'}
                  </td>
                </tr>
              ) : (
                coins.map((coin) => {
                  const iconUrl = buildImageUrl(coin.icon)
                  const isUp = coin.change24h > 0
                  const isDown = coin.change24h < 0

                  const handleRowClick = () => {
                    if (onCoinClick) {
                      onCoinClick(coin.symbol)
                    } else {
                      setSelectedCoin(coin)
                    }
                  }

                  return (
                    <tr 
                      key={coin.symbol}
                      onClick={handleRowClick}
                      className="border-t border-background-tertiary hover:bg-background-tertiary/50 cursor-pointer transition-colors"
                    >
                      {/* Coin */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden flex-shrink-0">
                            {iconUrl ? (
                              <img 
                                src={iconUrl} 
                                alt={coin.symbol} 
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                  e.currentTarget.parentElement!.innerHTML = `<span class="text-xs font-bold">${coin.symbol.substring(0, 2).toUpperCase()}</span>`
                                }}
                              />
                            ) : (
                              <span className="text-xs font-bold text-foreground-muted">
                                {coin.symbol.substring(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="font-medium">${coin.symbol}</span>
                            <p className="text-xs text-foreground-muted truncate max-w-[150px]">{coin.name}</p>
                          </div>
                        </div>
                      </td>

                      {/* Price */}
                      <td className="text-right px-4 py-3 font-medium">
                        {formatPrice(coin.currentPrice)}
                      </td>

                      {/* 24h Change */}
                      <td className="text-right px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm ${
                          isUp ? 'bg-buy/20 text-buy' : isDown ? 'bg-sell/20 text-sell' : 'text-foreground-muted'
                        }`}>
                          {isUp && <TrendingUp className="w-3 h-3" />}
                          {isDown && <TrendingDown className="w-3 h-3" />}
                          {isUp ? '+' : ''}{formatNumber(coin.change24h)}%
                        </span>
                      </td>

                      {/* Market Cap */}
                      <td className="text-right px-4 py-3 text-sm">
                        {formatMarketCap(coin.marketCap)}
                      </td>

                      {/* Volume */}
                      <td className="text-right px-4 py-3 text-sm text-foreground-muted">
                        {formatVolume(coin.volume24h)}
                      </td>

                      {/* Created */}
                      <td className="text-right px-4 py-3 text-sm text-foreground-muted">
                        {coin.createdAt ? new Date(coin.createdAt).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-background-tertiary">
            <span className="text-sm text-foreground-muted">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="p-2 rounded-lg hover:bg-background-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="p-2 rounded-lg hover:bg-background-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Coin Details Modal */}
      <CoinDetailsModal
        symbol={selectedCoin?.symbol ?? ''}
        isOpen={selectedCoin !== null}
        onClose={() => setSelectedCoin(null)}
        onTradeComplete={() => {
          // Could refresh market after trade if needed
        }}
      />
    </div>
  )
}
