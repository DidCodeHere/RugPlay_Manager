// Type definitions for RugPlay Manager

export interface ProfileSummary {
  id: number
  username: string
  last_verified: string | null
}

export interface UserProfile {
  id: string
  username: string
  name?: string
  email?: string
  image?: string
  balance: number
  isAdmin?: boolean
  isBanned?: boolean
  sessionExpiresAt?: string
}

export type LoginResult = 
  | { status: 'success'; profile: UserProfile }
  | { status: 'expired'; profile_id: number }
  | { status: 'error'; message: string }

export interface Holding {
  symbol: string
  quantity: number
  avg_entry_price: number
}

export interface TradeRequest {
  type: 'BUY' | 'SELL'
  amount: number
}

export interface TradeResponse {
  success: boolean
  type: string
  coins_bought?: number
  coins_sold?: number
  total_cost?: number
  total_received?: number
  new_price: number
  price_impact: number
  new_balance: number
}

export interface TradeResult {
  success: boolean
  tradeType: string
  coinsAmount: number
  usdAmount: number
  newPrice: number
  priceImpact: number
  newBalance: number
  message: string
}

// ============================================================================
// Portfolio Types
// ============================================================================

export interface PortfolioResponse {
  baseCurrencyBalance: number
  totalCoinValue: number
  totalValue: number
  coinHoldings: CoinHolding[]
}

export interface CoinHolding {
  symbol: string
  icon?: string
  quantity: number
  currentPrice: number
  value: number
  change24h: number
  avgPurchasePrice: number
  percentageChange: number
  costBasis: number
}

export interface PortfolioSummary {
  balance: number
  portfolioValue: number
  totalValue: number
  totalProfitLoss: number
  totalProfitLossPct: number
  holdingsCount: number
}

// ============================================================================
// Market Types
// ============================================================================

export interface MarketCoin {
  id: string
  symbol: string
  name: string
  icon?: string
  currentPrice: number
  marketCap: number
  volume24h: number
  change24h: number
  createdAt: string
  creatorUsername?: string
  holdersCount?: number
}

export interface MarketResponse {
  coins: MarketCoin[]
  total?: number
  page?: number
  limit?: number
  totalPages?: number
}

// ============================================================================
// Coin Details Types
// ============================================================================

export interface CoinDetails {
  id: string
  symbol: string
  name: string
  icon?: string
  currentPrice: number
  marketCap: number
  poolCoinAmount: number
  poolBaseCurrencyAmount: number
  circulatingSupply: number
  creatorId?: string
  isLocked: boolean
  volume24h: number
  change24h: number
}

export interface CandlestickPoint {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export interface VolumePoint {
  time: number
  volume: number
}

export interface CoinWithChartResponse {
  coin: CoinDetails
  candlestickData: CandlestickPoint[]
  volumeData: VolumePoint[]
  timeframe?: string
}

// Legacy alias for backward compatibility
export type CoinDetailsResponse = CoinDetails

export interface CoinHoldersResponse {
  coinSymbol: string
  totalHolders: number
  circulatingSupply: number
  poolInfo: PoolInfo
  holders: Holder[]
}

export interface PoolInfo {
  coinAmount: number
  baseCurrencyAmount: number
  currentPrice: number
}

export interface Holder {
  rank: number
  userId: number
  username: string
  name: string
  image?: string
  quantity: number
  percentage: number
  liquidationValue: number
}

// ============================================================================
// Coin Comment Types
// ============================================================================

export interface CoinComment {
  id: number
  content: string
  userId: number
  userUsername: string
  userName: string | null
  userImage: string | null
  likesCount: number
  isLikedByUser: boolean
  createdAt: string
  updatedAt: string | null
}

// ============================================================================
// Sentinel Types
// ============================================================================

export interface SentinelConfig {
  id: number
  symbol: string
  stopLossPct: number | null
  takeProfitPct: number | null
  trailingStopPct: number | null
  sellPercentage: number
  entryPrice: number
  highestPriceSeen: number
  isActive: boolean
  createdAt: string | null
  triggeredAt: string | null
}

export interface CreateSentinelRequest {
  symbol: string
  stopLossPct: number | null
  takeProfitPct: number | null
  trailingStopPct: number | null
  sellPercentage: number
  entryPrice: number
}

// ============================================================================
// Live Feed Types
// ============================================================================

export interface RecentTrade {
  tradeType: string
  username: string
  userImage?: string
  amount: number
  coinSymbol: string
  coinName: string
  coinIcon?: string
  totalValue: number
  price: number
  timestamp: number
  userId: string
}

// ============================================================================
// Transaction History Types (from Rugplay API)
// ============================================================================

export interface TransactionRecord {
  id: number
  tradeType: string
  symbol: string
  coinName: string
  coinIcon?: string
  coinAmount: number
  price: number
  usdValue: number
  timestamp: string
  isTransfer: boolean
  isIncoming: boolean
  sender?: string
  recipient?: string
}

export interface TransactionListResponse {
  transactions: TransactionRecord[]
  total: number
  page: number
  limit: number
}

// ============================================================================
// Settings Types
// ============================================================================

export interface SentinelDefaults {
  stopLossPct: number
  takeProfitPct: number
  trailingStopPct: number | null
  sellPercentage: number
}

export interface AppSettings {
  sentinelDefaults: SentinelDefaults
  autoManageSentinels: boolean
  blacklistedCoins: string[]
}

// ============================================================================
// Sentinel Monitor Types (background automation)
// ============================================================================

export type MonitorStatus = 'Running' | 'Paused' | 'Stopped'

export interface MonitorStatusResponse {
  status: MonitorStatus
  intervalSecs: number
  isPaused: boolean
}

export interface SentinelTriggeredEvent {
  sentinelId: number
  symbol: string
  reason: string
  triggerType: 'stop_loss' | 'take_profit' | 'trailing_stop'
  currentPrice: number
  entryPrice: number
  sellAmount: number
  sellPercentage: number
}

export interface SentinelTickEvent {
  status: MonitorStatus
  checked: number
  activeCount: number
  lastCheckAt: string
}

export interface TradeExecutedEvent {
  symbol: string
  tradeType: string
  amount: number
  newPrice: number
  priceImpact: number
  newBalance: number
  reason: string
  success: boolean
  error?: string
}

// ============================================================================
// Harvester Types (12h auto-claim)
// ============================================================================

export interface HarvesterStatusResponse {
  enabled: boolean
  lastClaimAt: string | null
  nextClaimAt: string | null
  secondsUntilNext: number
  totalClaims: number
}

export interface HarvesterTickEvent {
  enabled: boolean
  secondsUntilNext: number
  lastClaimAt: string | null
  totalClaims: number
  profilesCount: number
}

export interface HarvesterClaimedEvent {
  profileId: number
  username: string
  rewardAmount: number
  newBalance: number
  loginStreak: number
  nextClaimAt: string | null
  totalClaims: number
}

// ============================================================================
// Sniper Types (auto-buy new coins)
// ============================================================================

export interface SniperConfig {
  enabled: boolean
  buyAmountUsd: number
  maxMarketCapUsd: number
  maxCoinAgeSecs: number
  autoCreateSentinel: boolean
  stopLossPct: number
  takeProfitPct: number
  trailingStopPct: number | null
  blacklistedCreators: string[]
  minLiquidityUsd: number
  maxDailySpendUsd: number
  pollIntervalSecs: number
  minCoinAgeSecs: number
}

export interface SniperStatusResponse {
  enabled: boolean
  totalSniped: number
  lastSnipedAt: string | null
  config: SniperConfig
}

export interface SniperTriggeredEvent {
  symbol: string
  coinName: string
  buyAmountUsd: number
  marketCap: number
  price: number
  coinAgeSecs: number
}

// ============================================================================
// Risk Limits Types
// ============================================================================

export interface RiskLimits {
  maxPositionUsd: number
  maxDailyTradesCount: number
  maxDailyVolumeUsd: number
  cooldownAfterLossSecs: number
  retryCount: number
  retryDelayMs: number
  rateLimitMs: number
}

// ============================================================================
// Notification Types
// ============================================================================

export interface NotificationConfig {
  enabled: boolean
  sentinelTriggers: boolean
  sniperBuys: boolean
  harvesterClaims: boolean
  riskAlerts: boolean
  sessionAlerts: boolean
  tradeConfirmations: boolean
}

// ============================================================================
// Dip Buyer Types
// ============================================================================

export type Aggressiveness = 'conservative' | 'moderate' | 'aggressive'

export interface CoinTier {
  label: string
  minMcap: number
  maxMcap: number
  buyAmountUsd: number
  minSellValueUsd: number
  minVolume24h: number
  maxBuySlippagePct: number
}

export interface SignalWeights {
  sellImpact: number
  holderSafety: number
  momentum: number
  volumeQuality: number
}

export interface DipBuyerConfig {
  preset: Aggressiveness
  buyAmountUsd: number
  coinTiers: CoinTier[]
  useCoinTiers: boolean
  minSellValueUsd: number
  minVolume24h: number
  minMarketCap: number
  maxMarketCap: number
  skipTopNHolders: number
  maxPriceDropPct: number
  pollIntervalSecs: number
  cooldownPerCoinSecs: number
  maxDailyBuys: number
  maxDailySpendUsd: number
  autoCreateSentinel: boolean
  stopLossPct: number
  takeProfitPct: number
  trailingStopPct: number | null
  blacklistedCoins: string[]
  minConfidenceScore: number
  maxBuySlippagePct: number
  useMomentumAnalysis: boolean
  signalWeights: SignalWeights
  scaleByConfidence: boolean
  maxPositionPct: number
  portfolioAware: boolean
}

export interface DipBuyerStatusResponse {
  enabled: boolean
  config: DipBuyerConfig
  totalBought: number
  lastBoughtAt: string | null
}

export interface DipBuyerTriggeredEvent {
  symbol: string
  coinName: string
  buyAmountUsd: number
  sellerUsername: string
  sellValueUsd: number
  sellerRank: number | null
  marketCap: number
  price: number
  change24h: number
  confidenceScore: number
  slippagePct: number
  sellImpactPct: number
}

export interface DipBuyerTickEvent {
  enabled: boolean
  totalBought: number
  lastBoughtAt: string | null
  tradesScanned: number
  dipsDetected: number
}

export interface DipBuyerLogEntry {
  id: number
  symbol: string
  coinName: string
  action: string
  amountUsd: number
  details: string
  createdAt: string | null
}

// ============================================================================
// Automation Log Types
// ============================================================================

export interface AutomationLogEntry {
  id: number
  module: string
  symbol: string
  coinName: string
  action: string
  amountUsd: number
  details: string
  createdAt: string | null
}

// ============================================================================
// User Profile Types (Public)
// ============================================================================

export interface UserProfileFullResponse {
  userId: string
  username: string
  name: string
  bio: string | null
  image: string | null
  balance: number
  holdingsCount: number
  holdingsValue: number
  totalPortfolioValue: number
  totalBuyVolume: number
  totalSellVolume: number
  totalTransactions: number
  transactions24h: number
  buyVolume24h: number
  sellVolume24h: number
  coinsCreated: number
  createdCoins: UserCreatedCoin[]
  recentTransactions: UserTransaction[]
  reputation: ReputationInfo | null
}

export interface UserCreatedCoin {
  symbol: string
  name: string
  icon: string | null
  currentPrice: number
  marketCap: number
  volume24h: number
  change24h: number
}

export interface UserTransaction {
  id: number
  tradeType: string
  coinSymbol: string
  coinName: string
  coinIcon: string | null
  quantity: number
  pricePerCoin: number
  totalValue: number
  timestamp: string
}

export interface ReputationInfo {
  score: number
  rugPulls: number
  leaderboardAppearances: number
  totalExtracted: number
  lastUpdated: string | null
}

// ============================================================================
// Leaderboard Types
// ============================================================================

export interface LeaderboardFullResponse {
  topRugpullers: LeaderboardUser[]
  biggestLosers: LeaderboardUser[]
  cashKings: LeaderboardUser[]
  paperMillionaires: LeaderboardUser[]
}

export interface LeaderboardUser {
  rank: number
  userId: string
  username: string
  name: string
  image: string | null
  primaryValue: number
  secondaryValue: number
  label: string
  reputationScore: number | null
}

// ============================================================================
// Research Manifest Types (from deep_analysis.py pipeline)
// ============================================================================

export interface ResearchManifest {
  _version: string
  _generated: string
  about: ResearchAboutStats
  topCoins: ResearchTopCoin[]
  sentinel: {
    overall: {
      bySortino: ResearchSentinelConfig
      byMedianPnl: ResearchSentinelConfig
      balanced: ResearchSentinelConfig
    }
    perTier: Record<string, ResearchSentinelConfig>
  }
  dipbuyer: {
    presets: Record<string, ResearchDipBuyerPreset>
    perTier: Record<string, ResearchDipTierConfig>
  }
  mcapTiers: Record<string, ResearchMcapTier>
  holdAnalysis: Record<string, Record<string, ResearchHoldDuration>>
  gridAggregate: {
    topBySortino: ResearchGridConfig[]
    topByMedianPnl: ResearchGridConfig[]
  }
  tierSummary: Record<string, ResearchTierSummary>
}

export interface ResearchAboutStats {
  totalCoinsAnalyzed: number
  totalCoinsSkipped: number
  totalCandleRows: number
  gridConfigsTestedPerCoin: number
  totalGridBacktests: number
  tierCounts: Record<string, number>
  mcapTierCounts: Record<string, number>
  overallMedianReturn: number
  overallMedianDrawdown: number
  pumpDumpPercentage: number
  coinsWithPositiveSortino: number
}

export interface ResearchTopCoin {
  symbol: string
  tier: string
  mcapTier: string
  marketCap: number
  candles: number
  totalReturn: number
  maxDrawdown: number
  bestSl: number | null
  bestTp: number | null
  bestTs: number | null
  sortino: number
  winRate: number
  medianPnl: number
}

export interface ResearchSentinelConfig {
  stopLossPct: number
  takeProfitPct: number
  trailingStopPct: number | null
  sellPercentage: number
}

export interface ResearchDipBuyerPreset {
  buyAmountUsd: number
  maxPriceDropPct: number
  stopLossPct: number
  takeProfitPct: number
  trailingStopPct: number | null
  minMarketCap: number
  minVolume24h: number
  minConfidenceScore: number
  maxDailyBuys: number
}

export interface ResearchDipTierConfig {
  maxPriceDropPct: number
  takeProfitPct: number
  stopLossPct: number
}

export interface ResearchMcapTier {
  count: number
  range: [number, number]
  medianMcap: number
  medianReturn: number
  bestConfig: ResearchGridConfig | null
  dipBuyerBest: { dip: number; tp: number; sl: number; votes: number } | null
}

export interface ResearchHoldDuration {
  medianReturn: number
  avgWinRate: number
}

export interface ResearchGridConfig {
  sl: number
  tp: number
  ts: number | null
  votes: number
}

export interface ResearchTierSummary {
  count: number
  medianReturn: number
  medianDrawdown: number
  pumpDumpCoins: number
}
