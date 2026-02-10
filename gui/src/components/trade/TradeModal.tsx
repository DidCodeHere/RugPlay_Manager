import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { X, TrendingUp, TrendingDown, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import type { CoinHolding, TradeResult } from '@/lib/types'

export type TradeDirection = 'BUY' | 'SELL'

interface TradeModalProps {
  symbol: string
  holding?: CoinHolding
  direction: TradeDirection
  isOpen: boolean
  onClose: () => void
  onTradeComplete?: () => void
}

export function TradeModal({ 
  symbol, 
  holding, 
  direction, 
  isOpen, 
  onClose,
  onTradeComplete
}: TradeModalProps) {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TradeResult | null>(null)
  const [balance, setBalance] = useState<number | null>(null)

  // Reset state when modal opens/direction changes
  useEffect(() => {
    if (isOpen) {
      setAmount('')
      setError(null)
      setResult(null)
      fetchBalance()
    }
  }, [isOpen, direction])

  async function fetchBalance() {
    try {
      const bal = await invoke<number>('get_balance')
      setBalance(bal)
    } catch (e) {
      console.error('Failed to fetch balance:', e)
    }
  }

  async function executeTrade() {
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const tradeResult = await invoke<TradeResult>('execute_trade', {
        symbol,
        direction,
        amount: numAmount,
      })

      setResult(tradeResult)
      
      // Refresh balance
      fetchBalance()
      
      // Notify parent
      if (tradeResult.success) {
        onTradeComplete?.()
      }
    } catch (e) {
      setError(`Trade failed: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAmount = (percentage: number) => {
    if (direction === 'BUY' && balance) {
      setAmount((balance * percentage).toFixed(2))
    } else if (direction === 'SELL' && holding) {
      // Truncate to 8 decimals for selling
      const maxAmount = Math.floor(holding.quantity * percentage * 1e8) / 1e8
      setAmount(maxAmount.toString())
    }
  }

  if (!isOpen) return null

  const isBuy = direction === 'BUY'
  const amountLabel = isBuy ? 'USD' : symbol
  const numAmount = parseFloat(amount) || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background-secondary border border-background-tertiary rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b border-background-tertiary ${
          isBuy ? 'bg-buy/10' : 'bg-sell/10'
        }`}>
          <div className="flex items-center gap-3">
            {isBuy ? (
              <TrendingUp className="w-6 h-6 text-buy" />
            ) : (
              <TrendingDown className="w-6 h-6 text-sell" />
            )}
            <div>
              <h2 className="text-lg font-bold">{isBuy ? 'Buy' : 'Sell'} ${symbol}</h2>
              {holding && (
                <p className="text-xs text-foreground-muted">
                  You own: {holding.quantity.toFixed(8)} {symbol}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {result ? (
            // Success/Result State
            <div className="text-center py-4">
              {result.success ? (
                <>
                  <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-buy" />
                  <h3 className="text-xl font-bold mb-2">Trade Successful!</h3>
                  <p className="text-foreground-muted mb-4">{result.message}</p>
                  
                  <div className="space-y-2 text-sm bg-background p-3 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">New Price</span>
                      <span className="font-medium">${result.newPrice.toFixed(8)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">Price Impact</span>
                      <span className={result.priceImpact > 0 ? 'text-buy' : 'text-sell'}>
                        {result.priceImpact > 0 ? '+' : ''}{(result.priceImpact * 100).toFixed(4)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">New Balance</span>
                      <span className="font-medium">${result.newBalance.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <button
                    onClick={onClose}
                    className="mt-4 w-full py-2 rounded-lg bg-background-tertiary hover:bg-background transition-colors font-medium"
                  >
                    Close
                  </button>
                </>
              ) : (
                <>
                  <XCircle className="w-16 h-16 mx-auto mb-4 text-sell" />
                  <h3 className="text-xl font-bold mb-2">Trade Failed</h3>
                  <p className="text-foreground-muted">{result.message}</p>
                  <button
                    onClick={() => setResult(null)}
                    className="mt-4 w-full py-2 rounded-lg bg-background-tertiary hover:bg-background transition-colors font-medium"
                  >
                    Try Again
                  </button>
                </>
              )}
            </div>
          ) : (
            // Input State
            <>
              {/* Balance Display */}
              <div className="flex items-center justify-between text-sm mb-4">
                <span className="text-foreground-muted">
                  {isBuy ? 'Available Balance:' : 'Available:'}
                </span>
                <span className="font-medium">
                  {isBuy 
                    ? `$${balance?.toFixed(2) ?? '...'}`
                    : `${holding?.quantity.toFixed(8) ?? '0'} ${symbol}`
                  }
                </span>
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="block text-sm text-foreground-muted mb-2">
                  Amount ({amountLabel})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="input text-lg font-medium py-3"
                    min="0"
                    step={isBuy ? '0.01' : '0.00000001'}
                    disabled={loading}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground-muted">
                    {amountLabel}
                  </span>
                </div>
              </div>

              {/* Quick Amount Buttons */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[0.25, 0.5, 0.75, 1].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => handleQuickAmount(pct)}
                    className="py-2 rounded-lg bg-background hover:bg-background-tertiary transition-colors text-sm font-medium"
                    disabled={loading}
                  >
                    {pct === 1 ? 'MAX' : `${pct * 100}%`}
                  </button>
                ))}
              </div>

              {/* Preview */}
              {numAmount > 0 && holding && (
                <div className="mb-4 p-3 rounded-lg bg-background text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-foreground-muted">Current Price</span>
                    <span>${holding.currentPrice.toFixed(8)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">Est. {isBuy ? 'Receive' : 'Receive'}</span>
                    <span className="font-medium">
                      {isBuy 
                        ? `~${(numAmount / holding.currentPrice).toFixed(4)} ${symbol}`
                        : `~$${(numAmount * holding.currentPrice).toFixed(2)}`
                      }
                    </span>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-sell/20 border border-sell/30 text-sell text-sm">
                  {error}
                </div>
              )}

              {/* Execute Button */}
              <button
                onClick={executeTrade}
                disabled={loading || !amount || numAmount <= 0}
                className={`w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
                  isBuy 
                    ? 'bg-buy hover:bg-buy/80 text-white' 
                    : 'bg-sell hover:bg-sell/80 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `${isBuy ? 'Buy' : 'Sell'} ${symbol}`
                )}
              </button>

              {/* Warning for SELL */}
              {!isBuy && (
                <p className="mt-3 text-xs text-foreground-muted text-center">
                  Selling truncates to 8 decimal places automatically
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
