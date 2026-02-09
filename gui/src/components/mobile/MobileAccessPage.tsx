import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Smartphone,
  Wifi,
  Globe,
  Play,
  Square,
  RefreshCw,
  Copy,
  Check,
  Shield,
  AlertTriangle,
  Info,
  Monitor,
  QrCode,
  Users,
  Lock,
  Zap,
  Eye,
  EyeOff,
  Clock,
  Fingerprint,
  Unplug,
} from 'lucide-react'

interface SessionInfo {
  tokenPrefix: string
  connectedAt: string
  connectedDuration: string
}

interface MobileServerStatus {
  running: boolean
  mode: 'internet' | 'localWifi'
  url: string | null
  pin: string
  connectedClients: number
  controlEnabled: boolean
  qrSvg: string | null
  port: number
  sessions: SessionInfo[]
}

export function MobileAccessPage() {
  const [status, setStatus] = useState<MobileServerStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<'internet' | 'localWifi'>('internet')
  const [showPin, setShowPin] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const s = await invoke<MobileServerStatus>('get_mobile_server_status')
      setStatus(s)
    } catch (e) {
      console.error('Failed to fetch mobile server status:', e)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleStart = async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await invoke<MobileServerStatus>('start_mobile_server', {
        mode,
        port: 9876,
      })
      setStatus(s)
      if (mode === 'internet') {
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 1500))
          await fetchStatus()
        }
      }
    } catch (e: any) {
      setError(e?.toString() || 'Failed to start server')
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    try {
      await invoke('stop_mobile_server')
      await fetchStatus()
    } catch (e: any) {
      setError(e?.toString() || 'Failed to stop server')
    } finally {
      setLoading(false)
    }
  }

  const handleRegeneratePin = async () => {
    try {
      await invoke('regenerate_mobile_pin')
      await fetchStatus()
    } catch (e: any) {
      setError(e?.toString() || 'Failed to regenerate PIN')
    }
  }

  const handleToggleControl = async () => {
    if (!status) return
    try {
      await invoke('set_mobile_control_enabled', {
        enabled: !status.controlEnabled,
      })
      await fetchStatus()
    } catch (e: any) {
      setError(e?.toString() || 'Failed to toggle control')
    }
  }

  const copyUrl = async () => {
    if (!status?.url) return
    await navigator.clipboard.writeText(status.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isRunning = status?.running ?? false
  const hasUrl = status?.url && !status.url.startsWith('Connecting') && !status.url.startsWith('Tunnel failed')
  const isTunnelConnecting = status?.url?.startsWith('Connecting')
  const isTunnelFailed = status?.url?.startsWith('Tunnel failed')

  return (
    <div className="space-y-5 max-w-5xl">
      {/* ── Page Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-violet-500/20">
          <Smartphone className="w-6 h-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Mobile Access</h1>
          <p className="text-sm text-foreground-muted">
            View and control your bot from any phone browser
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-sell/10 border border-sell/20 text-sell text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline opacity-70 hover:opacity-100 ml-3 shrink-0">Dismiss</button>
        </div>
      )}

      {/* ═══ TOP: Connection + QR side-by-side when running ═══ */}
      <div className={`grid gap-5 ${isRunning ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>

        {/* ── Connection Setup (left) ── */}
        <div className={`card ${isRunning ? 'lg:col-span-3' : ''}`}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold">Connection Setup</h2>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
              isRunning ? 'bg-buy/15 text-buy' : 'bg-foreground-muted/15 text-foreground-muted'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-buy animate-pulse' : 'bg-foreground-muted'}`} />
              {isRunning ? 'Running' : 'Stopped'}
            </div>
          </div>

          {/* Mode Selection — only when stopped */}
          {!isRunning && (
            <div className="mb-5">
              <label className="text-sm font-medium text-foreground-muted mb-2 block">
                Connection Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode('internet')}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    mode === 'internet'
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-background-tertiary hover:border-foreground-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Globe className="w-4 h-4 text-violet-400" />
                    <span className="font-semibold text-sm">Internet</span>
                  </div>
                  <p className="text-xs text-foreground-muted leading-relaxed">
                    Access from anywhere via secure tunnel. Your IP stays hidden.
                  </p>
                </button>
                <button
                  onClick={() => setMode('localWifi')}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    mode === 'localWifi'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-background-tertiary hover:border-foreground-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Wifi className="w-4 h-4 text-blue-400" />
                    <span className="font-semibold text-sm">Local WiFi</span>
                  </div>
                  <p className="text-xs text-foreground-muted leading-relaxed">
                    Same network only. Data never leaves your local network.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Start/Stop + Acknowledgment */}
          <div className="flex items-center gap-3">
            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={loading || (!acknowledged && mode === 'internet')}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-buy text-white font-semibold hover:bg-buy/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loading ? 'Starting...' : 'Start Server'}
              </button>
            ) : (
              <button
                onClick={handleStop}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-sell text-white font-semibold hover:bg-sell/80 transition-colors disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                {loading ? 'Stopping...' : 'Stop Server'}
              </button>
            )}

            {!isRunning && mode === 'internet' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="rounded accent-violet-500"
                />
                <span className="text-foreground-muted">
                  I understand this creates a public tunnel
                </span>
              </label>
            )}
          </div>

          {/* ── Connection Details (shown when running) ── */}
          {isRunning && (
            <div className="mt-5 pt-5 border-t border-background-tertiary space-y-4">
              {/* URL */}
              <div>
                <label className="text-xs font-medium text-foreground-muted mb-1.5 block uppercase tracking-wider">
                  Connection URL
                </label>
                {hasUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-background px-3 py-2 rounded-lg text-blue-400 break-all flex-1 border border-background-tertiary">
                      {status?.url}
                    </code>
                    <button
                      onClick={copyUrl}
                      className="p-2 rounded-lg hover:bg-background-tertiary shrink-0 transition-colors"
                      title="Copy URL"
                    >
                      {copied ? <Check className="w-4 h-4 text-buy" /> : <Copy className="w-4 h-4 text-foreground-muted" />}
                    </button>
                  </div>
                ) : isTunnelConnecting ? (
                  <div className="flex items-center gap-2 text-amber-400 text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Establishing secure tunnel… this may take a few seconds</span>
                  </div>
                ) : isTunnelFailed ? (
                  <p className="text-sm text-sell">{status?.url}. Try stopping and restarting.</p>
                ) : null}
              </div>

              {/* PIN */}
              <div>
                <label className="text-xs font-medium text-foreground-muted mb-1.5 block uppercase tracking-wider">
                  Authentication PIN
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 bg-background px-4 py-2 rounded-lg border border-background-tertiary">
                    <Lock className="w-4 h-4 text-foreground-muted" />
                    <code className="text-xl font-mono font-bold tracking-[0.3em] text-amber-400">
                      {showPin ? status?.pin : '• • • • • •'}
                    </code>
                    <button
                      onClick={() => setShowPin(!showPin)}
                      className="p-1 hover:bg-background-tertiary rounded transition-colors ml-1"
                    >
                      {showPin ? <EyeOff className="w-4 h-4 text-foreground-muted" /> : <Eye className="w-4 h-4 text-foreground-muted" />}
                    </button>
                  </div>
                  <button
                    onClick={handleRegeneratePin}
                    className="p-2 rounded-lg hover:bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
                    title="Generate new PIN"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-foreground-muted mt-1.5">
                  PIN rotates every server restart. Click refresh to force a new PIN.
                </p>
              </div>

              {/* How to Connect steps */}
              <div>
                <label className="text-xs font-medium text-foreground-muted mb-2 block uppercase tracking-wider">
                  How to Connect
                </label>
                <div className="space-y-2.5">
                  {[
                    {
                      num: '1',
                      title: mode === 'internet' ? 'Open your phone browser' : 'Connect phone to same WiFi',
                      desc: mode === 'internet'
                        ? 'Works from any network — cellular, WiFi, anywhere'
                        : 'Your phone must be on the same WiFi network as this computer',
                    },
                    { num: '2', title: 'Scan QR code or enter the URL above', desc: 'Use your phone camera to scan the QR code on the right' },
                    { num: '3', title: 'Enter the 6-digit PIN to authenticate', desc: 'PIN is shown above — share it only with yourself' },
                  ].map((step) => (
                    <div key={step.num} className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold shrink-0 mt-0.5">
                        {step.num}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{step.title}</p>
                        <p className="text-xs text-foreground-muted">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── QR Code Panel (right, when running) ── */}
        {isRunning && (
          <div className="card lg:col-span-2 flex flex-col items-center justify-center min-h-[340px]">
            <div className="flex items-center gap-2 mb-4 self-start w-full">
              <QrCode className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-semibold">Scan to Connect</h2>
            </div>
            <div className="flex-1 flex items-center justify-center w-full">
              {status?.qrSvg ? (
                <div className="w-full max-w-[260px] aspect-square rounded-2xl overflow-hidden bg-slate-900 p-3">
                  <div
                    className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                    dangerouslySetInnerHTML={{ __html: status.qrSvg }}
                  />
                </div>
              ) : isTunnelConnecting ? (
                <div className="w-full max-w-[260px] aspect-square rounded-2xl bg-background-tertiary flex items-center justify-center">
                  <div className="text-center">
                    <RefreshCw className="w-10 h-10 text-violet-400 animate-spin mx-auto mb-3" />
                    <p className="text-sm text-foreground-muted">Establishing tunnel…</p>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-[260px] aspect-square rounded-2xl bg-background-tertiary flex items-center justify-center">
                  <QrCode className="w-20 h-20 text-foreground-muted/20" />
                </div>
              )}
            </div>
            <p className="text-xs text-foreground-muted mt-3 text-center">
              Open your phone camera and point at the QR code
            </p>
          </div>
        )}
      </div>

      {/* ═══ CONNECTED DEVICES ═══ */}
      {isRunning && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold">Connected Devices</h2>
            </div>
            <span className="text-sm font-medium text-foreground-muted">
              {status?.connectedClients ?? 0} / 3 sessions
            </span>
          </div>

          {(status?.connectedClients ?? 0) === 0 ? (
            <div className="text-center py-6">
              <Unplug className="w-10 h-10 text-foreground-muted/30 mx-auto mb-2" />
              <p className="text-sm text-foreground-muted">
                No devices connected yet. Scan the QR code to connect.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {(status?.sessions ?? []).map((session, i) => (
                <div
                  key={session.tokenPrefix}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-background-tertiary"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-500/15 flex items-center justify-center">
                      <Smartphone className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">Device {i + 1}</span>
                        <span className="w-2 h-2 rounded-full bg-buy" />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-foreground-muted">
                        <span className="flex items-center gap-1">
                          <Fingerprint className="w-3 h-3" />
                          {session.tokenPrefix}…
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Connected {session.connectedDuration}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Remote Control Toggle */}
          <div className="mt-4 pt-4 border-t border-background-tertiary">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Remote Control</p>
                <p className="text-xs text-foreground-muted">
                  Allow trading actions from mobile (disabled = view-only)
                </p>
              </div>
              <button
                onClick={handleToggleControl}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  status?.controlEnabled ? 'bg-buy' : 'bg-background-tertiary'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    status?.controlEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SECURITY INFORMATION ═══ */}
      <div className="card border border-amber-500/15">
        <div className="flex items-center gap-2 mb-5">
          <Shield className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold">Security Information</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* How it works */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-blue-400 mb-3">
              <Info className="w-4 h-4" />
              How this works
            </h3>
            <ul className="space-y-2 text-sm text-foreground-muted">
              {[
                'Creates a private web server inside the app',
                <>
                  <strong className="text-foreground/80">Internet mode:</strong> Uses a secure tunnel (bore.pub) — your real IP is never exposed
                </>,
                <>
                  <strong className="text-foreground/80">Local WiFi mode:</strong> Only accessible from devices on your same WiFi network
                </>,
                'A unique 6-digit PIN is required — changes every restart',
                'Server stops automatically when the app closes',
                'Read-only by default — trading requires explicit opt-in',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Risks */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-400 mb-3">
              <AlertTriangle className="w-4 h-4" />
              Risks to be aware of
            </h3>
            <ul className="space-y-2 text-sm text-foreground-muted">
              {[
                <>
                  <strong className="text-foreground/80">Internet mode:</strong> Anyone with the URL + PIN can view your portfolio
                </>,
                <>
                  <strong className="text-foreground/80">Local mode:</strong> Anyone on your WiFi who knows the PIN can access
                </>,
                <>
                  Public WiFi is <strong className="text-amber-400">NOT recommended</strong> for local mode
                </>,
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5 shrink-0">⚠</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Protections */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-buy mb-3">
              <Zap className="w-4 h-4" />
              Protections implemented
            </h3>
            <ul className="space-y-1.5 text-sm text-foreground-muted">
              {[
                'Server binds to loopback only (127.0.0.1)',
                'Your IP never exposed (bore.pub relays)',
                '6-digit PIN authentication (rotates each start)',
                'Cryptographic session tokens (24h expiry)',
                'Max 3 concurrent devices',
                'Read-only by default',
                'Auto-shutdown with desktop app',
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-buy shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
