import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  X,
  Shield,
  TrendingDown,
  TrendingUp,
  Activity,
  RefreshCw,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  DollarSign,
  Layers,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react'
import { buildImageUrl } from '@/lib/utils'
import type { SentinelConfig, CoinHolding, TransactionRecord, TransactionListResponse } from '@/lib/types'

interface SentinelDetailModalProps {
  sentinel: SentinelConfig
  holding?: CoinHolding
  onClose: () => void
  onEdit: (sentinel: SentinelConfig) => void
  onCoinClick?: (symbol: string) => void
}

export function SentinelDetailModal({ sentinel, holding, onClose, onEdit, onCoinClick }: SentinelDetailModalProps) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [loadingTx, setLoadingTx] = useState(true)
  const [txError, setTxError] = useState<string | null>(null)
  const [showAllTx, setShowAllTx] = useState(false)
  const [totalTx, setTotalTx] = useState(0)

  const fetchTransactions = useCallback(async () => {
    setLoadingTx(true)
    setTxError(null)
    try {
      const resp = await invoke<TransactionListResponse>('get_transactions', {
        page: 1,
        limit: 100,
        tradeType: null,
        search: sentinel.symbol,
      })
      const filtered = resp.transactions.filter(
        tx => tx.symbol === sentinel.symbol
      )
      setTransactions(filtered)
      setTotalTx(filtered.length)
    } catch (e) {
      setTxError(`Failed to load transactions: ${e}`)
    } finally {
      setLoadingTx(false)
    }
  }, [sentinel.symbol])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const buyTxs = transactions.filter(tx => tx.tradeType === 'BUY')
  const sellTxs = transactions.filter(tx => tx.tradeType === 'SELL')

  const formatPrice = (price: number) => {
    if (price < 0.0001) return `$${price.toExponential(2)}`
    if (price < 0.01) return `$${price.toFixed(6)}`
    if (price < 1) return `$${price.toFixed(4)}`
    return `$${price.toFixed(2)}`
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const currentPrice = holding?.currentPrice ?? 0
  const pnlPct = sentinel.entryPrice > 0
    ? ((currentPrice - sentinel.entryPrice) / sentinel.entryPrice) * 100
    : 0
  const pnlPositive = pnlPct >= 0

  const slPrice = sentinel.stopLossPct !== null
    ? sentinel.entryPrice * (1 - Math.abs(sentinel.stopLossPct) / 100)
    : null
  const tpPrice = sentinel.takeProfitPct !== null
    ? sentinel.entryPrice * (1 + sentinel.takeProfitPct / 100)
    : null

  const displayedTxs = showAllTx ? transactions : transactions.slice(0, 10)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-background-secondary rounded-xl w-full max-w-2xl mx-4 shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-background-tertiary shrink-0">
          <div className="flex items-center gap-3">
            {holding && buildImageUrl(holding.icon) ? (
              <img
                src={buildImageUrl(holding.icon)!}
                alt={sentinel.symbol}
                className="w-8 h-8 rounded-full"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-emerald-400" />
              </div>
            )}
            <div>
              <h2
                className={`text-lg font-bold ${onCoinClick ? 'cursor-pointer hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5' : ''}`}
                onClick={() => { if (onCoinClick) { onClose(); onCoinClick(sentinel.symbol) } }}
                title={onCoinClick ? `View ${sentinel.symbol} coin page` : undefined}
              >
                ${sentinel.symbol}
                {onCoinClick && <ExternalLink className="w-3.5 h-3.5 text-foreground-muted" />}
              </h2>
              <p className="text-xs text-foreground-muted">
                Sentinel #{sentinel.id} &middot; Created {sentinel.createdAt ? formatTime(sentinel.createdAt) : 'Unknown'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(sentinel)}
              className="px-3 py-1.5 text-sm rounded-lg bg-background-tertiary hover:bg-background text-foreground-muted hover:text-foreground transition-colors"
            >
              Edit Settings
            </button>
            <button onClick={onClose} className="p-1 hover:bg-background-tertiary rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-4 space-y-4">
          {/* Overview Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-background-tertiary">
              <p className="text-xs text-foreground-muted mb-1">Avg Entry</p>
              <p className="font-mono font-bold text-sm">{formatPrice(sentinel.entryPrice)}</p>
            </div>
            <div className="p-3 rounded-lg bg-background-tertiary">
              <p className="text-xs text-foreground-muted mb-1">Current Price</p>
              <p className="font-mono font-bold text-sm">
                {holding ? formatPrice(currentPrice) : '—'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-background-tertiary">
              <p className="text-xs text-foreground-muted mb-1">P&L</p>
              <p className={`font-mono font-bold text-sm ${pnlPositive ? 'text-buy' : 'text-sell'}`}>
                {holding ? `${pnlPositive ? '+' : ''}${pnlPct.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-background-tertiary">
              <p className="text-xs text-foreground-muted mb-1">Status</p>
              {sentinel.triggeredAt ? (
                <span className="text-sm font-medium text-amber-400">Triggered</span>
              ) : sentinel.isActive ? (
                <span className="text-sm font-medium text-emerald-400">Active</span>
              ) : (
                <span className="text-sm font-medium text-gray-400">Paused</span>
              )}
            </div>
          </div>

          {/* Sentinel Thresholds */}
          <div className="p-3 rounded-lg bg-background-tertiary space-y-2">
            <h3 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">Trigger Thresholds</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-sell shrink-0" />
                <div>
                  <p className="text-xs text-foreground-muted">Stop Loss</p>
                  {sentinel.stopLossPct !== null ? (
                    <p className="text-sm font-medium text-sell">
                      {sentinel.stopLossPct > 0 ? '-' : ''}{Math.abs(sentinel.stopLossPct).toFixed(1)}% @ {slPrice !== null ? formatPrice(slPrice) : '—'}
                    </p>
                  ) : (
                    <p className="text-sm text-foreground-muted">Off</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-buy shrink-0" />
                <div>
                  <p className="text-xs text-foreground-muted">Take Profit</p>
                  {sentinel.takeProfitPct !== null ? (
                    <p className="text-sm font-medium text-buy">
                      +{sentinel.takeProfitPct.toFixed(1)}% @ {tpPrice !== null ? formatPrice(tpPrice) : '—'}
                    </p>
                  ) : (
                    <p className="text-sm text-foreground-muted">Off</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <p className="text-xs text-foreground-muted">Trailing Stop</p>
                  {sentinel.trailingStopPct !== null ? (
                    <p className="text-sm font-medium text-amber-400">
                      -{sentinel.trailingStopPct.toFixed(1)}% from peak
                    </p>
                  ) : (
                    <p className="text-sm text-foreground-muted">Off</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 pt-1 border-t border-background-secondary/50">
              <div className="text-xs">
                <span className="text-foreground-muted">Sell Amount: </span>
                <span className="font-medium">{sentinel.sellPercentage}%</span>
              </div>
              <div className="text-xs">
                <span className="text-foreground-muted">Peak Tracked: </span>
                <span className="font-mono">{formatPrice(sentinel.highestPriceSeen)}</span>
              </div>
            </div>
          </div>

          {/* Holding Summary */}
          {holding && (
            <div className="p-3 rounded-lg bg-background-tertiary">
              <h3 className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">Current Position</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-foreground-muted">Quantity</p>
                  <p className="text-sm font-mono font-medium">{holding.quantity.toFixed(8)}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-muted">Value</p>
                  <p className="text-sm font-mono font-medium">${holding.value.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-muted">Cost Basis</p>
                  <p className="text-sm font-mono font-medium">${holding.costBasis.toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Individual Trade Entries */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-foreground-muted" />
                <h3 className="text-sm font-medium">Individual Orders</h3>
                <span className="text-xs px-1.5 py-0.5 rounded bg-background-tertiary text-foreground-muted">
                  {buyTxs.length} buys &middot; {sellTxs.length} sells
                </span>
              </div>
              <button
                onClick={fetchTransactions}
                disabled={loadingTx}
                className="p-1 rounded hover:bg-background-tertiary transition-colors"
                title="Refresh transactions"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-foreground-muted ${loadingTx ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {txError && (
              <div className="p-3 rounded-lg bg-sell/10 text-sell text-sm mb-3">{txError}</div>
            )}

            {loadingTx ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-5 h-5 animate-spin text-foreground-muted" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-foreground-muted text-sm">
                No transactions found for ${sentinel.symbol}
              </div>
            ) : (
              <div className="space-y-1.5">
                {displayedTxs.map((tx) => {
                  const isBuy = tx.tradeType === 'BUY'
                  const priceDiffFromEntry = sentinel.entryPrice > 0
                    ? ((tx.price - sentinel.entryPrice) / sentinel.entryPrice) * 100
                    : 0

                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-background-tertiary/50 hover:bg-background-tertiary transition-colors"
                    >
                      <div className={`p-1.5 rounded ${isBuy ? 'bg-buy/15' : 'bg-sell/15'}`}>
                        {isBuy ? (
                          <ArrowDownRight className="w-3.5 h-3.5 text-buy" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-sell" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            isBuy ? 'bg-buy/20 text-buy' : 'bg-sell/20 text-sell'
                          }`}>
                            {tx.tradeType}
                          </span>
                          <span className="text-xs text-foreground-muted truncate">
                            {tx.coinAmount.toFixed(8)} coins
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono font-medium">{formatPrice(tx.price)}</p>
                        <p className="text-xs text-foreground-muted">${tx.usdValue.toFixed(2)}</p>
                      </div>

                      <div className="text-right shrink-0 w-16">
                        {isBuy && Math.abs(priceDiffFromEntry) > 0.1 ? (
                          <p className={`text-xs font-mono ${priceDiffFromEntry >= 0 ? 'text-sell' : 'text-buy'}`}>
                            {priceDiffFromEntry >= 0 ? '+' : ''}{priceDiffFromEntry.toFixed(1)}%
                          </p>
                        ) : isBuy ? (
                          <p className="text-xs font-mono text-foreground-muted">avg</p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1 text-xs text-foreground-muted shrink-0">
                        <Clock className="w-3 h-3" />
                        {formatTime(tx.timestamp)}
                      </div>
                    </div>
                  )
                })}

                {totalTx > 10 && (
                  <button
                    onClick={() => setShowAllTx(!showAllTx)}
                    className="w-full py-2 text-xs text-foreground-muted hover:text-foreground transition-colors flex items-center justify-center gap-1"
                  >
                    {showAllTx ? (
                      <>Show Less <ChevronUp className="w-3 h-3" /></>
                    ) : (
                      <>Show All {totalTx} Transactions <ChevronDown className="w-3 h-3" /></>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Buy Entry Breakdown */}
          {buyTxs.length > 1 && (
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <h3 className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-2">
                Entry Point Breakdown ({buyTxs.length} buys)
              </h3>
              <div className="space-y-1">
                {buyTxs.map((tx, idx) => {
                  const weight = holding && holding.costBasis > 0
                    ? (tx.usdValue / holding.costBasis) * 100
                    : 0

                  return (
                    <div key={tx.id} className="flex items-center gap-2 text-xs">
                      <span className="text-foreground-muted w-5">#{idx + 1}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-background-tertiary overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(weight, 100)}%` }}
                        />
                      </div>
                      <span className="font-mono w-20 text-right">{formatPrice(tx.price)}</span>
                      <span className="text-foreground-muted w-16 text-right">${tx.usdValue.toFixed(2)}</span>
                      <span className="text-foreground-muted w-12 text-right">{weight.toFixed(0)}%</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-blue-500/20 text-xs">
                <div className="flex items-center gap-1 text-blue-400">
                  <DollarSign className="w-3 h-3" />
                  Weighted Avg Entry
                </div>
                <span className="font-mono font-bold text-blue-400">{formatPrice(sentinel.entryPrice)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
