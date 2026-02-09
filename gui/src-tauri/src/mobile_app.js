// ═══════════════════════════════════════════════════════════════════
//  RugPlay Manager — Mobile Dashboard JS
//  Self-contained client-side app for remote monitoring
//
//  Portfolio API response fields (from PortfolioResponse):
//    baseCurrencyBalance, totalCoinValue, totalValue
//    coinHoldings[]: symbol, icon, quantity, currentPrice, value,
//                    change24h, avgPurchasePrice, percentageChange, costBasis
//
//  Trades API response fields (from RecentTrade):
//    tradeType, username, userImage, amount, coinSymbol, coinName,
//    coinIcon, totalValue, price, timestamp, userId
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── State ──
  let sessionToken = null;
  let currentPage = 'portfolio';
  let autoRefresh = true;
  let refreshTimer = null;
  const REFRESH_INTERVAL = 10000;

  // ── DOM References ──
  const $loader = document.getElementById('loader');
  const $authScreen = document.getElementById('auth-screen');
  const $app = document.getElementById('app');
  const $pinInputs = document.querySelectorAll('#pin-inputs input');
  const $authBtn = document.getElementById('auth-btn');
  const $authError = document.getElementById('auth-error');
  const $refreshIndicator = document.getElementById('refresh-indicator');

  // ── Format: USD ──
  function formatUSD(val) {
    if (val === null || val === undefined || isNaN(val)) return '$0.00';
    const num = parseFloat(val);
    if (Math.abs(num) >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (Math.abs(num) >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (Math.abs(num) >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'K';
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Format: Compact number ──
  function formatCompact(val) {
    if (val === null || val === undefined || isNaN(val)) return '0';
    const num = parseFloat(val);
    if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    if (Math.abs(num) < 0.01 && num !== 0) return num.toFixed(6);
    return num.toFixed(2);
  }

  // ── Format: Percent ──
  function formatPct(val) {
    if (val === null || val === undefined || isNaN(val)) return '0.00%';
    return (parseFloat(val) >= 0 ? '+' : '') + parseFloat(val).toFixed(2) + '%';
  }

  // ── Format: Time ago ──
  function timeAgo(ts) {
    if (!ts) return '';
    let then;
    if (typeof ts === 'number') {
      // Unix timestamp (seconds or ms)
      then = ts > 1e12 ? ts : ts * 1000;
    } else {
      then = new Date(ts).getTime();
    }
    const diff = Math.floor((Date.now() - then) / 1000);
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function nowStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ── Get full icon URL ──
  function iconUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return 'https://rugplay.com/' + path;
  }

  // ── API Fetch helper ──
  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const sep = path.includes('?') ? '&' : '?';
    const url = path + sep + 'session=' + encodeURIComponent(sessionToken || '');
    try {
      const res = await fetch(url, { ...options, headers, credentials: 'include' });
      if (res.status === 401) { handleLogout(); return null; }
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error('API error:', path, e);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PIN Auth
  // ═══════════════════════════════════════════════════════════════

  function initPinInputs() {
    $pinInputs.forEach((input, idx) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val;
        if (val && idx < 5) $pinInputs[idx + 1].focus();
        updateAuthBtn();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) {
          $pinInputs[idx - 1].focus();
          $pinInputs[idx - 1].value = '';
          updateAuthBtn();
        }
        if (e.key === 'Enter') attemptAuth();
      });
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        paste.split('').forEach((ch, i) => { if ($pinInputs[i]) $pinInputs[i].value = ch; });
        if (paste.length === 6) $pinInputs[5].focus();
        updateAuthBtn();
      });
    });
    $authBtn.addEventListener('click', attemptAuth);
  }

  function getPin() { return Array.from($pinInputs).map(i => i.value).join(''); }
  function updateAuthBtn() { $authBtn.disabled = getPin().length !== 6; }

  function clearPinInputs() {
    $pinInputs.forEach(i => { i.value = ''; i.classList.remove('error'); });
    $pinInputs[0].focus();
    updateAuthBtn();
  }

  function showPinError(msg) {
    $pinInputs.forEach(i => i.classList.add('error'));
    $authError.textContent = msg;
    $authError.style.display = 'block';
    setTimeout(() => $pinInputs.forEach(i => i.classList.remove('error')), 600);
  }

  async function attemptAuth() {
    const pin = getPin();
    if (pin.length !== 6) return;
    $authBtn.disabled = true;
    $authBtn.textContent = 'Verifying…';
    $authError.style.display = 'none';

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && data.sessionToken) {
        sessionToken = data.sessionToken;
        localStorage.setItem('rpm_session', sessionToken);
        showApp();
      } else {
        showPinError(data.message || 'Invalid PIN');
        clearPinInputs();
      }
    } catch (e) {
      showPinError('Connection failed');
      clearPinInputs();
    }
    $authBtn.textContent = 'Unlock';
  }

  // ═══════════════════════════════════════════════════════════════
  //  Screen Transitions
  // ═══════════════════════════════════════════════════════════════

  function showAuth() {
    $loader.style.display = 'none';
    $authScreen.style.display = 'flex';
    $app.classList.remove('active');
    setTimeout(() => $pinInputs[0].focus(), 100);
  }

  function showApp() {
    $loader.style.display = 'none';
    $authScreen.style.display = 'none';
    $app.classList.add('active');
    loadAllData();
    startAutoRefresh();
  }

  function handleLogout() {
    sessionToken = null;
    localStorage.removeItem('rpm_session');
    stopAutoRefresh();
    showAuth();
  }

  // ═══════════════════════════════════════════════════════════════
  //  Navigation
  // ═══════════════════════════════════════════════════════════════

  function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page === currentPage) return;
        switchPage(page);
      });
    });
  }

  function switchPage(page) {
    currentPage = page;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-btn[data-page="' + page + '"]').classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
  }

  // ═══════════════════════════════════════════════════════════════
  //  Data Loading
  // ═══════════════════════════════════════════════════════════════

  async function loadAllData() {
    $refreshIndicator.classList.add('visible');
    await Promise.all([loadPortfolio(), loadModules(), loadTrades()]);
    $refreshIndicator.classList.remove('visible');
  }

  // ── Portfolio ──
  // API shape: { baseCurrencyBalance, totalCoinValue, totalValue, coinHoldings: [...] }
  // CoinHolding: { symbol, icon, quantity, currentPrice, value, change24h, avgPurchasePrice, percentageChange, costBasis }
  async function loadPortfolio() {
    const data = await api('/api/portfolio');
    if (!data) return;

    const balance = parseFloat(data.baseCurrencyBalance || 0);
    const totalCoinValue = parseFloat(data.totalCoinValue || 0);
    const totalValue = parseFloat(data.totalValue || 0);
    const holdings = data.coinHoldings || [];

    // Calculate total P&L from cost basis
    let totalCost = 0;
    holdings.forEach(h => { totalCost += parseFloat(h.costBasis || 0); });
    const pnl = totalCoinValue - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

    // Update stat cards
    document.getElementById('stat-balance').textContent = formatUSD(balance);
    document.getElementById('stat-networth').textContent = formatUSD(totalValue);
    document.getElementById('stat-holdings-value').textContent = formatUSD(totalCoinValue);

    const $pnl = document.getElementById('stat-pnl');
    $pnl.textContent = (pnl >= 0 ? '+' : '-') + formatUSD(Math.abs(pnl));
    $pnl.className = 'stat-value ' + (pnl >= 0 ? 'positive' : 'negative');
    document.getElementById('stat-pnl-pct').textContent = formatPct(pnlPct);

    // Update holdings count
    document.getElementById('stat-holdings-count').textContent = holdings.length;

    // Holdings list
    const $list = document.getElementById('holdings-list');
    if (!holdings.length) {
      $list.innerHTML = '<div class="empty-state"><p>No holdings yet</p></div>';
    } else {
      holdings.sort((a, b) => parseFloat(b.value || 0) - parseFloat(a.value || 0));
      $list.innerHTML = holdings.map(h => {
        const qty = parseFloat(h.quantity || 0);
        const value = parseFloat(h.value || 0);
        const currentPrice = parseFloat(h.currentPrice || 0);
        const costBasis = parseFloat(h.costBasis || 0);
        const holdingPnl = value - costBasis;
        const holdingPnlPct = costBasis > 0 ? (holdingPnl / costBasis) * 100 : 0;
        const symbol = h.symbol || '??';
        const icon = h.icon ? iconUrl(h.icon) : '';

        return '<div class="holding-item">' +
          '<div class="holding-left">' +
            '<div class="holding-icon">' +
              (icon
                ? '<img src="' + icon + '" alt="' + symbol + '" onerror="this.style.display=\'none\';this.parentElement.textContent=\'' + symbol.charAt(0) + '\'">'
                : symbol.charAt(0)) +
            '</div>' +
            '<div>' +
              '<div class="holding-name">' + symbol + '</div>' +
              '<div class="holding-qty">' + formatCompact(qty) + ' @ ' + formatUSD(currentPrice) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="holding-right">' +
            '<div class="holding-value">' + formatUSD(value) + '</div>' +
            '<div class="holding-pnl" style="color:' + (holdingPnlPct >= 0 ? 'var(--emerald)' : 'var(--rose)') + '">' +
              (holdingPnl >= 0 ? '+' : '-') + formatUSD(Math.abs(holdingPnl)) + ' (' + formatPct(holdingPnlPct) + ')' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    document.getElementById('portfolio-updated').textContent = 'Updated ' + nowStr();
  }

  // ── Modules ──
  async function loadModules() {
    const data = await api('/api/dashboard');
    if (!data || !data.modules) return;

    const modules = data.modules;
    const $grid = document.getElementById('module-grid');

    const moduleConfig = [
      { key: 'sentinel', name: 'Sentinel', desc: 'SL/TP Monitor', emoji: '🛡️' },
      { key: 'sniper', name: 'Sniper', desc: 'Auto-Buy', emoji: '🎯' },
      { key: 'mirror', name: 'Mirror', desc: 'Copy Trading', emoji: '👥' },
      { key: 'harvester', name: 'Harvester', desc: 'Reward Claims', emoji: '🌾' },
    ];

    $grid.innerHTML = moduleConfig.map(mc => {
      const mod = modules[mc.key];
      let statusClass = 'off';
      let statusText = 'Inactive';

      if (mod) {
        if (mc.key === 'sentinel') {
          if (mod.isPaused) { statusClass = 'paused'; statusText = 'Paused'; }
          else { statusClass = 'on'; statusText = mod.status || 'Active'; }
        } else if (mod.enabled) { statusClass = 'on'; statusText = 'Active'; }
        else { statusClass = 'off'; statusText = 'Disabled'; }
      }

      return '<div class="module-card">' +
        '<div class="module-emoji">' + mc.emoji + '</div>' +
        '<div class="module-indicator ' + statusClass + '"></div>' +
        '<div>' +
          '<div class="module-name">' + mc.name + '</div>' +
          '<div class="module-status">' + statusText + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    document.getElementById('modules-updated').textContent = 'Updated ' + nowStr();
  }

  // ── Trades ──
  // API shape: [{ tradeType, username, userImage, amount, coinSymbol, coinName, coinIcon, totalValue, price, timestamp, userId }]
  async function loadTrades() {
    const data = await api('/api/trades/recent?limit=30');
    if (!data) return;

    const $list = document.getElementById('trades-list');
    if (!Array.isArray(data) || !data.length) {
      $list.innerHTML = '<div class="empty-state"><p>No recent trades</p></div>';
      document.getElementById('trades-updated').textContent = 'Updated ' + nowStr();
      return;
    }

    $list.innerHTML = data.map(t => {
      const type = (t.tradeType || t.type || '').toUpperCase();
      const isBuy = type === 'BUY';
      const username = t.username || 'Unknown';
      const symbol = t.coinSymbol || t.symbol || '??';
      const coinName = t.coinName || symbol;
      const coinIcon = t.coinIcon ? iconUrl(t.coinIcon) : '';
      const userImg = t.userImage ? iconUrl(t.userImage) : '';
      const amount = parseFloat(t.amount || 0);
      const totalVal = parseFloat(t.totalValue || t.totalAmount || 0);
      const ts = t.timestamp || t.createdAt || '';

      return '<div class="trade-item">' +
        '<div class="trade-left">' +
          '<div class="trade-user-avatar">' +
            (userImg
              ? '<img src="' + userImg + '" alt="' + username + '" onerror="this.style.display=\'none\';this.parentElement.textContent=\'' + username.charAt(0).toUpperCase() + '\'">'
              : username.charAt(0).toUpperCase()) +
          '</div>' +
          '<div class="trade-details">' +
            '<div class="trade-header">' +
              '<span class="trade-username">' + username + '</span>' +
              '<span class="trade-type ' + (isBuy ? 'buy' : 'sell') + '">' + type + '</span>' +
            '</div>' +
            '<div class="trade-meta">' +
              (coinIcon ? '<img src="' + coinIcon + '" class="trade-coin-icon" onerror="this.style.display=\'none\'">' : '') +
              '<span class="trade-coin-amount">' + formatCompact(amount) + '</span>' +
              '<span class="trade-coin-symbol">$' + symbol + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="trade-right">' +
          '<div class="trade-total-value" style="color:' + (isBuy ? 'var(--emerald)' : 'var(--rose)') + '">' + formatUSD(totalVal) + '</div>' +
          '<div class="trade-time">' + timeAgo(ts) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    document.getElementById('trades-updated').textContent = 'Updated ' + nowStr();
  }

  // ═══════════════════════════════════════════════════════════════
  //  Auto Refresh
  // ═══════════════════════════════════════════════════════════════

  function startAutoRefresh() {
    stopAutoRefresh();
    if (!autoRefresh) return;
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') loadAllData();
    }, REFRESH_INTERVAL);
  }

  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Settings
  // ═══════════════════════════════════════════════════════════════

  function initSettings() {
    const $toggle = document.getElementById('auto-refresh-toggle');
    const $knob = document.getElementById('toggle-knob');

    function updateToggleUI() {
      if ($toggle.checked) {
        $toggle.parentElement.querySelector('span:first-of-type').style.background = 'var(--emerald)';
        $knob.style.transform = 'translateX(20px)';
      } else {
        $toggle.parentElement.querySelector('span:first-of-type').style.background = 'var(--border)';
        $knob.style.transform = 'translateX(0)';
      }
    }

    $toggle.addEventListener('change', () => {
      autoRefresh = $toggle.checked;
      if (autoRefresh) startAutoRefresh(); else stopAutoRefresh();
      updateToggleUI();
    });
    updateToggleUI();

    document.getElementById('connection-info').textContent = window.location.host;
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Initialization
  // ═══════════════════════════════════════════════════════════════

  async function init() {
    initPinInputs();
    initNavigation();
    initSettings();

    const saved = localStorage.getItem('rpm_session');
    if (saved) {
      sessionToken = saved;
      try {
        const res = await fetch('/api/auth/check?session=' + encodeURIComponent(saved), { credentials: 'include' });
        const data = await res.json();
        if (data.valid) { showApp(); return; }
      } catch (_) {}
      localStorage.removeItem('rpm_session');
      sessionToken = null;
    }
    showAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
