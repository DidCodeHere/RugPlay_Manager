import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Header } from './Header'
import { Sidebar, type NavItemId } from './Sidebar'
import { PortfolioView } from '@/components/portfolio'
import { MarketBrowser } from '@/components/market/MarketBrowser'
import { SentinelManager } from '@/components/sentinel'
import { SniperPage } from '@/components/sniper'
import { LiveTrades } from '@/components/feed'
import { TransactionHistory } from '@/components/history'
import { CoinDetailPage } from '@/components/coin'
import { SettingsLayout } from '@/components/settings'
import { MirrorPage } from '@/components/mirror'
import { MobileAccessPage } from '@/components/mobile/MobileAccessPage'
import { DashboardHome } from '@/components/dashboard/DashboardHome'
import type { UserProfile, PortfolioResponse } from '@/lib/types'

interface DashboardProps {
  user: UserProfile
  onLogout: () => void
}

export function Dashboard({ user, onLogout }: DashboardProps) {
  const [activeNav, setActiveNav] = useState<NavItemId>('dashboard')
  const [holdings, setHoldings] = useState<PortfolioResponse['coinHoldings']>([])
  const [selectedCoinSymbol, setSelectedCoinSymbol] = useState<string | null>(null)

  // Handle coin detail navigation
  const handleCoinClick = (symbol: string) => {
    setSelectedCoinSymbol(symbol)
  }

  const handleCoinDetailBack = () => {
    setSelectedCoinSymbol(null)
  }

  // Fetch holdings for Sentinel (so it can select coins)
  const fetchHoldings = useCallback(async () => {
    try {
      const data = await invoke<PortfolioResponse>('get_portfolio')
      setHoldings(data.coinHoldings)
    } catch (e) {
      console.error('Failed to fetch holdings:', e)
    }
  }, [])

  useEffect(() => {
    fetchHoldings()
  }, [fetchHoldings])

  // Clear selected coin when switching nav
  useEffect(() => {
    setSelectedCoinSymbol(null)
  }, [activeNav])
  
  return (
    <div className="min-h-screen flex flex-col">
      <Header user={user} onLogout={onLogout} />
      
      <div className="flex flex-1">
        <Sidebar activeItem={activeNav} onNavigate={setActiveNav} />
        
        <main className="flex-1 p-3 lg:p-6 overflow-auto min-w-0">
          {/* Coin Detail Page - shown on top of other views */}
          {selectedCoinSymbol ? (
            <div key={`coin-${selectedCoinSymbol}`} className="page-enter">
              <CoinDetailPage
                symbol={selectedCoinSymbol}
                onBack={handleCoinDetailBack}
                onTradeComplete={fetchHoldings}
                holdings={holdings}
              />
            </div>
          ) : (
            <div key={activeNav} className="page-enter">
              {activeNav === 'dashboard' && (
                <DashboardHome 
                  user={user} 
                  onViewPortfolio={() => setActiveNav('portfolio')} 
                  onViewMarket={() => setActiveNav('market')}
                  onViewSentinel={() => setActiveNav('sentinel')}
                  onViewSniper={() => setActiveNav('sniper')}
                  onViewMirror={() => setActiveNav('mirror')}
                  onCoinClick={handleCoinClick}
                />
              )}
              
              {activeNav === 'portfolio' && (
                <PortfolioView onCoinClick={handleCoinClick} />
              )}

              {activeNav === 'market' && (
                <MarketBrowser onCoinClick={handleCoinClick} />
              )}

              {activeNav === 'sentinel' && (
                <SentinelManager holdings={holdings} />
              )}

              {activeNav === 'sniper' && (
                <SniperPage />
              )}

              {activeNav === 'mirror' && (
                <MirrorPage />
              )}

              {activeNav === 'mobile' && (
                <MobileAccessPage />
              )}

              {activeNav === 'feed' && (
                <LiveTrades onCoinClick={handleCoinClick} />
              )}

              {activeNav === 'history' && (
                <TransactionHistory />
              )}
              
              {activeNav === 'settings' && (
                <SettingsLayout />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
