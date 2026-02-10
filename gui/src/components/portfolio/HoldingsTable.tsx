import { useState, useMemo } from 'react'
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  TrendingUp, 
  TrendingDown,
  X
} from 'lucide-react'
import { buildImageUrl } from '@/lib/utils'
import type { CoinHolding } from '@/lib/types'

type SortField = 'symbol' | 'quantity' | 'currentPrice' | 'value' | 'profitLossPct' | 'change24h' | 'portfolioPct'
type SortOrder = 'asc' | 'desc'

interface HoldingsTableProps {
  holdings: CoinHolding[]
  totalPortfolioValue: number
  onCoinClick: (holding: CoinHolding) => void
}

export function HoldingsTable({ holdings, totalPortfolioValue, onCoinClick }: HoldingsTableProps) {
  const [sortField, setSortField] = useState<SortField>('value')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [showProfitOnly, setShowProfitOnly] = useState(false)
  const [showLossOnly, setShowLossOnly] = useState(false)

  // Calculate P&L for each holding
  const holdingsWithPnL = useMemo(() => {
    return holdings.map(h => ({
      ...h,
      profitLoss: h.value - h.costBasis,
      profitLossPct: h.costBasis > 0 ? ((h.value - h.costBasis) / h.costBasis) * 100 : 0,
      portfolioPct: totalPortfolioValue > 0 ? (h.value / totalPortfolioValue) * 100 : 0,
    }))
  }, [holdings, totalPortfolioValue])

  // Filter holdings
  const filteredHoldings = useMemo(() => {
    return holdingsWithPnL.filter(h => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!h.symbol.toLowerCase().includes(query)) {
          return false
        }
      }
      // Profit/Loss filter
      if (showProfitOnly && h.profitLoss <= 0) return false
      if (showLossOnly && h.profitLoss >= 0) return false
      return true
    })
  }, [holdingsWithPnL, searchQuery, showProfitOnly, showLossOnly])

  // Sort holdings
  const sortedHoldings = useMemo(() => {
    return [...filteredHoldings].sort((a, b) => {
      let aVal: number, bVal: number
      
      switch (sortField) {
        case 'symbol':
          return sortOrder === 'asc' 
            ? a.symbol.localeCompare(b.symbol)
            : b.symbol.localeCompare(a.symbol)
        case 'quantity':
          aVal = a.quantity
          bVal = b.quantity
          break
        case 'currentPrice':
          aVal = a.currentPrice
          bVal = b.currentPrice
          break
        case 'value':
          aVal = a.value
          bVal = b.value
          break
        case 'profitLossPct':
          aVal = a.profitLossPct
          bVal = b.profitLossPct
          break
        case 'change24h':
          aVal = a.change24h
          bVal = b.change24h
          break
        case 'portfolioPct':
          aVal = a.portfolioPct
          bVal = b.portfolioPct
          break
        default:
          return 0
      }
      
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    })
  }, [filteredHoldings, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
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

  const formatQuantity = (num: number) => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
    return formatNumber(num, 2)
  }

  const formatPrice = (num: number) => {
    if (num < 0.0001) return `$${num.toExponential(2)}`
    if (num < 0.01) return `$${num.toFixed(6)}`
    if (num < 1) return `$${num.toFixed(4)}`
    return `$${formatNumber(num, 2)}`
  }

  const formatValue = (num: number) => {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
    return `$${formatNumber(num, 2)}`
  }

  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[150px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder="Search coins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input w-full pl-9 pr-8 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-background-tertiary rounded"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Quick Filters */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowProfitOnly(!showProfitOnly)
              if (!showProfitOnly) setShowLossOnly(false)
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showProfitOnly 
                ? 'bg-buy/20 text-buy border border-buy/30' 
                : 'bg-background hover:bg-background-tertiary text-foreground-muted'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Profit
          </button>
          <button
            onClick={() => {
              setShowLossOnly(!showLossOnly)
              if (!showLossOnly) setShowProfitOnly(false)
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showLossOnly 
                ? 'bg-sell/20 text-sell border border-sell/30' 
                : 'bg-background hover:bg-background-tertiary text-foreground-muted'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            Loss
          </button>
        </div>

        {/* Results count */}
        <span className="text-sm text-foreground-muted ml-auto">
          {sortedHoldings.length} of {holdings.length} positions
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-background-tertiary">
        <table className="w-full">
          <thead>
            <tr className="bg-background-tertiary/50">
              <th className="text-left px-3 lg:px-4 py-3">
                <button 
                  onClick={() => handleSort('symbol')}
                  className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
                >
                  Coin <SortIcon field="symbol" />
                </button>
              </th>
              <th className="text-right px-3 lg:px-4 py-3 hidden lg:table-cell">
                <button 
                  onClick={() => handleSort('quantity')}
                  className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors ml-auto"
                >
                  Quantity <SortIcon field="quantity" />
                </button>
              </th>
              <th className="text-right px-3 lg:px-4 py-3">
                <button 
                  onClick={() => handleSort('currentPrice')}
                  className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors ml-auto"
                >
                  Price <SortIcon field="currentPrice" />
                </button>
              </th>
              <th className="text-right px-3 lg:px-4 py-3">
                <button 
                  onClick={() => handleSort('profitLossPct')}
                  className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors ml-auto"
                >
                  P&L % <SortIcon field="profitLossPct" />
                </button>
              </th>
              <th className="text-right px-3 lg:px-4 py-3 hidden md:table-cell">
                <button 
                  onClick={() => handleSort('change24h')}
                  className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors ml-auto"
                >
                  24h Change <SortIcon field="change24h" />
                </button>
              </th>
              <th className="text-right px-3 lg:px-4 py-3">
                <button 
                  onClick={() => handleSort('value')}
                  className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors ml-auto"
                >
                  Value <SortIcon field="value" />
                </button>
              </th>
              <th className="text-right px-3 lg:px-4 py-3 hidden md:table-cell">
                <button 
                  onClick={() => handleSort('portfolioPct')}
                  className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors ml-auto"
                >
                  Portfolio % <SortIcon field="portfolioPct" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-foreground-muted">
                  {searchQuery || showProfitOnly || showLossOnly 
                    ? 'No holdings match your filters'
                    : 'No holdings yet'}
                </td>
              </tr>
            ) : (
              sortedHoldings.map((holding) => {
                const iconUrl = buildImageUrl(holding.icon)
                const isProfit = holding.profitLoss > 0
                const isLoss = holding.profitLoss < 0
                const is24hUp = holding.change24h > 0
                const is24hDown = holding.change24h < 0

                return (
                  <tr 
                    key={holding.symbol}
                    onClick={() => onCoinClick(holding)}
                    className="border-t border-background-tertiary hover:bg-background-tertiary/50 cursor-pointer transition-colors"
                  >
                    {/* Coin */}
                    <td className="px-3 lg:px-4 py-3">
                      <div className="flex items-center gap-2 lg:gap-3">
                        <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden flex-shrink-0">
                          {iconUrl ? (
                            <img 
                              src={iconUrl} 
                              alt={holding.symbol} 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                                e.currentTarget.parentElement!.innerHTML = `<span class="text-xs font-bold">${holding.symbol.substring(0, 2).toUpperCase()}</span>`
                              }}
                            />
                          ) : (
                            <span className="text-xs font-bold text-foreground-muted">
                              {holding.symbol.substring(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="font-medium text-sm lg:text-base">${holding.symbol}</span>
                      </div>
                    </td>

                    {/* Quantity */}
                    <td className="text-right px-3 lg:px-4 py-3 text-sm hidden lg:table-cell">
                      {formatQuantity(holding.quantity)}
                    </td>

                    {/* Price */}
                    <td className="text-right px-3 lg:px-4 py-3 text-sm">
                      {formatPrice(holding.currentPrice)}
                    </td>

                    {/* P&L % */}
                    <td className="text-right px-3 lg:px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-1.5 lg:px-2 py-0.5 rounded text-xs lg:text-sm font-medium ${
                        isProfit ? 'bg-buy/20 text-buy' : isLoss ? 'bg-sell/20 text-sell' : 'text-foreground-muted'
                      }`}>
                        {isProfit && <TrendingUp className="w-3 h-3" />}
                        {isLoss && <TrendingDown className="w-3 h-3" />}
                        {isProfit ? '+' : ''}{formatNumber(holding.profitLossPct)}%
                      </span>
                    </td>

                    {/* 24h Change */}
                    <td className="text-right px-3 lg:px-4 py-3 hidden md:table-cell">
                      <span className={`inline-flex items-center gap-1 px-1.5 lg:px-2 py-0.5 rounded text-xs lg:text-sm ${
                        is24hUp ? 'bg-buy/20 text-buy' : is24hDown ? 'bg-sell/20 text-sell' : 'text-foreground-muted'
                      }`}>
                        {is24hUp ? '+' : ''}{formatNumber(holding.change24h)}%
                      </span>
                    </td>

                    {/* Value */}
                    <td className="text-right px-3 lg:px-4 py-3 font-medium text-sm lg:text-base">
                      {formatValue(holding.value)}
                    </td>

                    {/* Portfolio % */}
                    <td className="text-right px-3 lg:px-4 py-3 text-sm text-foreground-muted hidden md:table-cell">
                      {formatNumber(holding.portfolioPct, 1)}%
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
