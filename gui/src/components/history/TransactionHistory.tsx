import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar,
  RefreshCw,
  FileText,
  ArrowLeftRight,
} from 'lucide-react'
import type { TransactionRecord, TransactionListResponse } from '@/lib/types'

type TradeTypeFilter = 'all' | 'BUY' | 'SELL'

export function TransactionHistory() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [symbols, setSymbols] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [tradeTypeFilter, setTradeTypeFilter] = useState<TradeTypeFilter>('all')
  const [symbolFilter, setSymbolFilter] = useState<string>('all')

  // Pagination
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [total, setTotal] = useState(0)

  const fetchSymbols = useCallback(async () => {
    try {
      const result = await invoke<string[]>('get_traded_symbols')
      setSymbols(result)
    } catch (err) {
      console.error('Failed to fetch symbols:', err)
    }
  }, [])

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Build params for Tauri command (camelCase for Tauri 2.0)
      const params: {
        page: number
        limit?: number
        tradeType?: string
        search?: string
      } = {
        page,
        limit: perPage,
      }

      if (tradeTypeFilter !== 'all') {
        params.tradeType = tradeTypeFilter
      }

      if (symbolFilter !== 'all') {
        params.search = symbolFilter
      }

      console.log('Fetching transactions with params:', params)
      const result = await invoke<TransactionListResponse>('get_transactions', params)
      console.log('Transactions result:', result)
      setTransactions(result.transactions)
      setTotal(result.total)
    } catch (err) {
      console.error('Failed to fetch transactions:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [page, perPage, symbolFilter, tradeTypeFilter])

  useEffect(() => {
    fetchSymbols()
  }, [fetchSymbols])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [symbolFilter, tradeTypeFilter])

  const totalPages = Math.ceil(total / perPage)

  // Filter by search query (client-side for symbol search within current page)
  const filteredTransactions = searchQuery
    ? transactions.filter((tx) =>
        tx.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.coinName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : transactions

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatNumber = (num: number, decimals = 2) => {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(decimals)}M`
    } else if (num >= 1_000) {
      return `${(num / 1_000).toFixed(decimals)}K`
    }
    return num.toFixed(decimals)
  }

  const formatPrice = (num: number) => {
    if (num === 0) return '$0.00'
    if (num < 0.00001) return `$${num.toExponential(2)}`
    if (num < 0.01) return `$${num.toFixed(8)}`
    if (num < 1) return `$${num.toFixed(6)}`
    return `$${num.toFixed(2)}`
  }

  const buildIconUrl = (icon?: string) => {
    if (!icon) return null
    return icon.startsWith('http') ? icon : `https://rugplay.com/api/proxy/s3/${icon}`
  }

  // Summary stats from current page
  const buyCount = transactions.filter((t) => t.tradeType === 'BUY').length
  const sellCount = transactions.filter((t) => t.tradeType === 'SELL').length
  const totalVolume = transactions.reduce((sum, t) => sum + t.usdValue, 0)

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 mb-4">{error}</p>
          <button
            onClick={fetchTransactions}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Transaction History</h2>
          <p className="text-zinc-400 text-sm mt-1">
            {total} total transactions
          </p>
        </div>
        <button
          onClick={fetchTransactions}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
            <FileText className="w-4 h-4" />
            Total Trades
          </div>
          <p className="text-2xl font-bold text-white">{total}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-emerald-400 text-sm mb-1">
            <ArrowUpCircle className="w-4 h-4" />
            Buy Orders
          </div>
          <p className="text-2xl font-bold text-emerald-400">{buyCount}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-rose-400 text-sm mb-1">
            <ArrowDownCircle className="w-4 h-4" />
            Sell Orders
          </div>
          <p className="text-2xl font-bold text-rose-400">{sellCount}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
            <Calendar className="w-4 h-4" />
            Page Volume
          </div>
          <p className="text-2xl font-bold text-white">${formatNumber(totalVolume)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Trade Type Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <select
            value={tradeTypeFilter}
            onChange={(e) => setTradeTypeFilter(e.target.value as TradeTypeFilter)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Types</option>
            <option value="BUY">Buys Only</option>
            <option value="SELL">Sells Only</option>
          </select>
        </div>

        {/* Symbol Filter */}
        <select
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All Coins</option>
          {symbols.map((symbol) => (
            <option key={symbol} value={symbol}>
              {symbol}
            </option>
          ))}
        </select>
      </div>

      {/* Transaction Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-zinc-800/50">
            <tr>
              <th className="text-left text-xs font-medium text-zinc-400 uppercase px-4 py-3">
                Type
              </th>
              <th className="text-left text-xs font-medium text-zinc-400 uppercase px-4 py-3">
                Coin
              </th>
              <th className="text-right text-xs font-medium text-zinc-400 uppercase px-4 py-3">
                Amount
              </th>
              <th className="text-right text-xs font-medium text-zinc-400 uppercase px-4 py-3">
                Price
              </th>
              <th className="text-right text-xs font-medium text-zinc-400 uppercase px-4 py-3">
                USD Value
              </th>
              <th className="text-right text-xs font-medium text-zinc-400 uppercase px-4 py-3">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin mx-auto mb-2" />
                  <p className="text-zinc-400">Loading transactions...</p>
                </td>
              </tr>
            ) : filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-zinc-400">No transactions found</p>
                  <p className="text-zinc-500 text-sm mt-1">
                    {searchQuery || symbolFilter !== 'all' || tradeTypeFilter !== 'all'
                      ? 'Try adjusting your filters'
                      : 'Transactions will appear here after you make trades'}
                  </p>
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => {
                const iconUrl = buildIconUrl(tx.coinIcon)
                const isTransfer = tx.isTransfer
                const isBuy = tx.tradeType === 'BUY'

                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-zinc-800/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
                          isTransfer
                            ? 'bg-blue-500/10 text-blue-400'
                            : isBuy
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {isTransfer ? (
                          <ArrowLeftRight className="w-3 h-3" />
                        ) : isBuy ? (
                          <ArrowUpCircle className="w-3 h-3" />
                        ) : (
                          <ArrowDownCircle className="w-3 h-3" />
                        )}
                        {tx.tradeType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {iconUrl ? (
                            <img
                              src={iconUrl}
                              alt={tx.symbol}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : (
                            <span className="text-xs font-bold text-zinc-500">
                              {tx.symbol.charAt(0)}
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="font-mono text-white">${tx.symbol}</span>
                          <div className="text-xs text-zinc-500">{tx.coinName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      {formatNumber(tx.coinAmount, 4)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      {formatPrice(tx.price)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-white">
                      ${formatNumber(tx.usdValue)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-zinc-400">
                      {formatDate(tx.timestamp)}
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-400">
            Showing {(page - 1) * perPage + 1} to{' '}
            {Math.min(page * perPage, total)} of {total} transactions
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      page === pageNum
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
