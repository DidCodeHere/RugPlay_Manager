(function () {
  'use strict';

  let sessionToken = null;
  let sessionRole = 'viewer';
  let currentPage = 'portfolio';
  let autoRefresh = true;
  let refreshTimer = null;
  let tradeType = 'BUY';
  const REFRESH_INTERVAL = 10000;

  const $loader = document.getElementById('loader');
  const $authScreen = document.getElementById('auth-screen');
  const $app = document.getElementById('app');
  const $pinInputs = document.querySelectorAll('#pin-inputs input');
  const $authBtn = document.getElementById('auth-btn');
  const $authError = document.getElementById('auth-error');
  const $refreshIndicator = document.getElementById('refresh-indicator');

  function formatUSD(val) {
    if (val === null || val === undefined || isNaN(val)) return '$0.00';
    const num = parseFloat(val);
    if (Math.abs(num) >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (Math.abs(num) >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (Math.abs(num) >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'K';
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatCompact(val) {
    if (val === null || val === undefined || isNaN(val)) return '0';
    const num = parseFloat(val);
    if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    if (Math.abs(num) < 0.01 && num !== 0) return num.toFixed(6);
    return num.toFixed(2);
  }

  function formatPct(val) {
    if (val === null || val === undefined || isNaN(val)) return '0.00%';
    return (parseFloat(val) >= 0 ? '+' : '') + parseFloat(val).toFixed(2) + '%';
  }

  function timeAgo(ts) {
    if (!ts) return '';
    let then;
    if (typeof ts === 'number') { then = ts > 1e12 ? ts : ts * 1000; }
    else { then = new Date(ts).getTime(); }
    const diff = Math.floor((Date.now() - then) / 1000);
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function nowStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function iconUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return 'https://rugplay.com/' + path;
  }

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const sep = path.includes('?') ? '&' : '?';
    const url = path + sep + 'session=' + encodeURIComponent(sessionToken || '');
    try {
      const res = await fetch(url, { ...options, headers, credentials: 'include' });
      if (res.status === 401) { handleLogout(); return null; }
      if (res.status === 403) return { _forbidden: true };
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error('API error:', path, e);
      return null;
    }
  }

  // ── Role Management ──

  function applyRole(role) {
    sessionRole = (role || 'viewer').toLowerCase();

    // Update badge
    var badge = document.getElementById('role-badge');
    badge.textContent = sessionRole.charAt(0).toUpperCase() + sessionRole.slice(1);
    badge.className = 'role-badge ' + sessionRole;

    // Show/hide nav buttons by role
    var isTrusted = sessionRole === 'trusted' || sessionRole === 'admin';
    var isAdmin = sessionRole === 'admin';

    var navSentinels = document.getElementById('nav-sentinels');
    var navActivity = document.getElementById('nav-activity');
    var navTrade = document.getElementById('nav-trade');

    if (navSentinels) navSentinels.classList.toggle('role-hidden', !isTrusted);
    if (navActivity) navActivity.classList.toggle('role-hidden', !isTrusted);
    if (navTrade) navTrade.classList.toggle('role-hidden', !isAdmin);

    // Update settings display
    var roleInfo = document.getElementById('session-role-info');
    if (roleInfo) roleInfo.textContent = sessionRole.charAt(0).toUpperCase() + sessionRole.slice(1);

    // If current page is now inaccessible, switch to portfolio
    if ((currentPage === 'sentinels' || currentPage === 'activity') && !isTrusted) switchPage('portfolio');
    if (currentPage === 'trade' && !isAdmin) switchPage('portfolio');
  }

  // ── PIN Auth ──

  function initPinInputs() {
    $pinInputs.forEach(function(input, idx) {
      input.addEventListener('input', function(e) {
        var val = e.target.value.replace(/\D/g, '');
        e.target.value = val;
        if (val && idx < 5) $pinInputs[idx + 1].focus();
        updateAuthBtn();
      });
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) {
          $pinInputs[idx - 1].focus();
          $pinInputs[idx - 1].value = '';
          updateAuthBtn();
        }
        if (e.key === 'Enter') attemptAuth();
      });
      input.addEventListener('paste', function(e) {
        e.preventDefault();
        var paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        paste.split('').forEach(function(ch, i) { if ($pinInputs[i]) $pinInputs[i].value = ch; });
        if (paste.length === 6) $pinInputs[5].focus();
        updateAuthBtn();
      });
    });
    $authBtn.addEventListener('click', attemptAuth);
  }

  function getPin() { return Array.from($pinInputs).map(function(i) { return i.value; }).join(''); }
  function updateAuthBtn() { $authBtn.disabled = getPin().length !== 6; }

  function clearPinInputs() {
    $pinInputs.forEach(function(i) { i.value = ''; i.classList.remove('error'); });
    $pinInputs[0].focus();
    updateAuthBtn();
  }

  function showPinError(msg) {
    $pinInputs.forEach(function(i) { i.classList.add('error'); });
    $authError.textContent = msg;
    $authError.style.display = 'block';
    setTimeout(function() { $pinInputs.forEach(function(i) { i.classList.remove('error'); }); }, 600);
  }

  async function attemptAuth() {
    var pin = getPin();
    if (pin.length !== 6) return;
    $authBtn.disabled = true;
    $authBtn.textContent = 'Verifying...';
    $authError.style.display = 'none';

    try {
      var res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin }),
        credentials: 'include',
      });
      var data = await res.json();
      if (data.success && data.sessionToken) {
        sessionToken = data.sessionToken;
        localStorage.setItem('rpm_session', sessionToken);
        applyRole(data.role || 'viewer');
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

  async function fetchAndApplyRole() {
    var data = await api('/api/session/role');
    if (data && data.role) {
      applyRole(data.role);
    } else {
      applyRole('viewer');
    }
  }

  // ── Screen Transitions ──

  function showAuth() {
    $loader.style.display = 'none';
    $authScreen.style.display = 'flex';
    $app.classList.remove('active');
    setTimeout(function() { $pinInputs[0].focus(); }, 100);
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
    sessionRole = 'viewer';
    localStorage.removeItem('rpm_session');
    stopAutoRefresh();
    showAuth();
  }

  // ── Navigation ──

  function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var page = btn.dataset.page;
        if (page === currentPage) return;
        switchPage(page);
      });
    });
  }

  function switchPage(page) {
    currentPage = page;
    document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
    var activeBtn = document.querySelector('.nav-btn[data-page="' + page + '"]');
    if (activeBtn) activeBtn.classList.add('active');
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('page-' + page).classList.add('active');
  }

  // ── Data Loading ──

  async function loadAllData() {
    $refreshIndicator.classList.add('visible');
    var tasks = [loadPortfolio(), loadModules(), loadTrades()];
    var isTrusted = sessionRole === 'trusted' || sessionRole === 'admin';
    if (isTrusted) {
      tasks.push(loadSentinels());
      tasks.push(loadActivity());
    }
    await Promise.all(tasks);
    $refreshIndicator.classList.remove('visible');
  }

  async function loadPortfolio() {
    var data = await api('/api/portfolio');
    if (!data) return;

    var balance = parseFloat(data.baseCurrencyBalance || 0);
    var totalCoinValue = parseFloat(data.totalCoinValue || 0);
    var totalValue = parseFloat(data.totalValue || 0);
    var holdings = data.coinHoldings || [];

    var totalCost = 0;
    holdings.forEach(function(h) { totalCost += parseFloat(h.costBasis || 0); });
    var pnl = totalCoinValue - totalCost;
    var pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

    document.getElementById('stat-balance').textContent = formatUSD(balance);
    document.getElementById('stat-networth').textContent = formatUSD(totalValue);
    document.getElementById('stat-holdings-value').textContent = formatUSD(totalCoinValue);

    var $pnl = document.getElementById('stat-pnl');
    $pnl.textContent = (pnl >= 0 ? '+' : '-') + formatUSD(Math.abs(pnl));
    $pnl.className = 'stat-value ' + (pnl >= 0 ? 'positive' : 'negative');
    document.getElementById('stat-pnl-pct').textContent = formatPct(pnlPct);
    document.getElementById('stat-holdings-count').textContent = holdings.length;

    var $list = document.getElementById('holdings-list');
    if (!holdings.length) {
      $list.innerHTML = '<div class="empty-state"><p>No holdings yet</p></div>';
    } else {
      holdings.sort(function(a, b) { return parseFloat(b.value || 0) - parseFloat(a.value || 0); });
      $list.innerHTML = holdings.map(function(h) {
        var qty = parseFloat(h.quantity || 0);
        var value = parseFloat(h.value || 0);
        var currentPrice = parseFloat(h.currentPrice || 0);
        var costBasis = parseFloat(h.costBasis || 0);
        var holdingPnl = value - costBasis;
        var holdingPnlPct = costBasis > 0 ? (holdingPnl / costBasis) * 100 : 0;
        var symbol = h.symbol || '??';
        var icon = h.icon ? iconUrl(h.icon) : '';

        return '<div class="holding-item">' +
          '<div class="holding-left">' +
            '<div class="holding-icon">' +
              (icon ? '<img src="' + icon + '" alt="' + symbol + '" onerror="this.style.display=\'none\';this.parentElement.textContent=\'' + symbol.charAt(0) + '\'">' : symbol.charAt(0)) +
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

  async function loadModules() {
    var data = await api('/api/dashboard');
    if (!data || !data.modules) return;

    var modules = data.modules;
    var $grid = document.getElementById('module-grid');
    var moduleConfig = [
      { key: 'sentinel', name: 'Sentinel', desc: 'SL/TP Monitor', emoji: '\u{1F6E1}\uFE0F' },
      { key: 'sniper', name: 'Sniper', desc: 'Auto-Buy', emoji: '\u{1F3AF}' },
      { key: 'mirror', name: 'Mirror', desc: 'Copy Trading', emoji: '\u{1F465}' },
      { key: 'harvester', name: 'Harvester', desc: 'Reward Claims', emoji: '\u{1F33E}' },
      { key: 'dipbuyer', name: 'Dip Buyer', desc: 'Buy Dips', emoji: '\u{1F4C9}' },
    ];

    $grid.innerHTML = moduleConfig.map(function(mc) {
      var mod = modules[mc.key];
      var statusClass = 'off';
      var statusText = 'Inactive';
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
        '<div><div class="module-name">' + mc.name + '</div><div class="module-status">' + statusText + '</div></div>' +
      '</div>';
    }).join('');
    document.getElementById('modules-updated').textContent = 'Updated ' + nowStr();
  }

  async function loadTrades() {
    var data = await api('/api/trades/recent?limit=30');
    if (!data) return;

    var $list = document.getElementById('trades-list');
    if (!Array.isArray(data) || !data.length) {
      $list.innerHTML = '<div class="empty-state"><p>No recent trades</p></div>';
      document.getElementById('trades-updated').textContent = 'Updated ' + nowStr();
      return;
    }

    $list.innerHTML = data.map(function(t) {
      var type = (t.tradeType || t.type || '').toUpperCase();
      var isBuy = type === 'BUY';
      var username = t.username || 'Unknown';
      var symbol = t.coinSymbol || t.symbol || '??';
      var coinIcon = t.coinIcon ? iconUrl(t.coinIcon) : '';
      var userImg = t.userImage ? iconUrl(t.userImage) : '';
      var amount = parseFloat(t.amount || 0);
      var totalVal = parseFloat(t.totalValue || t.totalAmount || 0);
      var ts = t.timestamp || t.createdAt || '';

      return '<div class="trade-item">' +
        '<div class="trade-left">' +
          '<div class="trade-user-avatar">' +
            (userImg ? '<img src="' + userImg + '" alt="' + username + '" onerror="this.style.display=\'none\';this.parentElement.textContent=\'' + username.charAt(0).toUpperCase() + '\'">' : username.charAt(0).toUpperCase()) +
          '</div>' +
          '<div class="trade-details">' +
            '<div class="trade-header"><span class="trade-username">' + username + '</span><span class="trade-type ' + (isBuy ? 'buy' : 'sell') + '">' + type + '</span></div>' +
            '<div class="trade-meta">' +
              (coinIcon ? '<img src="' + coinIcon + '" class="trade-coin-icon" onerror="this.style.display=\'none\'">' : '') +
              '<span class="trade-coin-amount">' + formatCompact(amount) + '</span><span class="trade-coin-symbol">$' + symbol + '</span>' +
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

  // ── Sentinels (Trusted+) ──

  async function loadSentinels() {
    var data = await api('/api/sentinels');
    if (!data || data._forbidden) return;

    var $list = document.getElementById('sentinels-list');
    var sentinels = Array.isArray(data) ? data : [];
    document.getElementById('sentinel-count').textContent = sentinels.length;

    if (!sentinels.length) {
      $list.innerHTML = '<div class="empty-state"><p>No sentinels configured</p></div>';
      document.getElementById('sentinels-updated').textContent = 'Updated ' + nowStr();
      return;
    }

    $list.innerHTML = sentinels.map(function(s) {
      var status = s.triggered_at ? 'triggered' : (s.is_active ? 'active' : 'inactive');
      var statusLabel = s.triggered_at ? 'Triggered' : (s.is_active ? 'Active' : 'Inactive');
      var rules = [];
      if (s.stop_loss_pct) rules.push('SL ' + s.stop_loss_pct.toFixed(1) + '%');
      if (s.take_profit_pct) rules.push('TP ' + s.take_profit_pct.toFixed(1) + '%');
      if (s.trailing_stop_pct) rules.push('Trail ' + s.trailing_stop_pct.toFixed(1) + '%');
      rules.push('Sell ' + s.sell_percentage.toFixed(0) + '%');

      return '<div class="sentinel-item">' +
        '<div class="sentinel-top">' +
          '<span class="sentinel-symbol">' + s.symbol + '</span>' +
          '<span class="sentinel-badge ' + status + '">' + statusLabel + '</span>' +
        '</div>' +
        '<div class="sentinel-rules">' +
          rules.map(function(r) { return '<span class="sentinel-rule">' + r + '</span>'; }).join('') +
        '</div>' +
      '</div>';
    }).join('');
    document.getElementById('sentinels-updated').textContent = 'Updated ' + nowStr();
  }

  // ── Activity Log (Trusted+) ──

  async function loadActivity() {
    var data = await api('/api/activity?limit=50');
    if (!data || data._forbidden) return;

    var $list = document.getElementById('activity-list');
    var transactions = data.transactions || [];
    var triggered = data.triggeredSentinels || [];

    // Merge into a single activity list
    var items = [];
    transactions.forEach(function(tx) {
      items.push({
        type: tx.trade_type || tx.tradeType || 'BUY',
        title: (tx.trade_type || tx.tradeType || 'BUY').toUpperCase() + ' ' + tx.symbol,
        detail: formatCompact(tx.coin_amount || tx.coinAmount || 0) + ' coins @ ' + formatUSD(tx.price) + ' = ' + formatUSD(tx.usd_value || tx.usdValue || 0),
        time: tx.timestamp,
        sort: new Date(tx.timestamp || 0).getTime(),
      });
    });
    triggered.forEach(function(s) {
      items.push({
        type: 'SELL',
        title: 'Sentinel triggered: ' + s.symbol,
        detail: 'Sold ' + s.sell_percentage + '% at entry ' + formatUSD(s.entry_price),
        time: s.triggered_at,
        sort: new Date(s.triggered_at || 0).getTime(),
      });
    });

    items.sort(function(a, b) { return b.sort - a.sort; });

    if (!items.length) {
      $list.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
      document.getElementById('activity-updated').textContent = 'Updated ' + nowStr();
      return;
    }

    $list.innerHTML = items.slice(0, 60).map(function(item) {
      var isBuy = item.type.toUpperCase() === 'BUY';
      return '<div class="activity-item">' +
        '<div class="activity-icon ' + (isBuy ? 'buy' : 'sell') + '">' + (isBuy ? '&#8593;' : '&#8595;') + '</div>' +
        '<div class="activity-text">' +
          '<div class="activity-title">' + item.title + '</div>' +
          '<div class="activity-detail">' + item.detail + '</div>' +
        '</div>' +
        '<div class="activity-time">' + timeAgo(item.time) + '</div>' +
      '</div>';
    }).join('');
    document.getElementById('activity-updated').textContent = 'Updated ' + nowStr();
  }

  // ── Trade Form (Admin) ── exposed globally for inline onclick handlers

  window.setTradeType = function(type) {
    tradeType = type;
    var btnBuy = document.getElementById('btn-buy');
    var btnSell = document.getElementById('btn-sell');
    var execBtn = document.getElementById('exec-trade-btn');
    var amountLabel = document.getElementById('amount-label');

    btnBuy.className = 'type-btn' + (type === 'BUY' ? ' sel-buy' : '');
    btnSell.className = 'type-btn' + (type === 'SELL' ? ' sel-sell' : '');
    execBtn.className = 'exec-btn ' + (type === 'BUY' ? 'buy' : 'sell');
    execBtn.textContent = type === 'BUY' ? 'Buy' : 'Sell';
    amountLabel.textContent = type === 'BUY' ? 'Amount (USD)' : 'Amount (Coins)';
  };

  window.executeTrade = async function() {
    var symbol = document.getElementById('trade-symbol').value.trim().toUpperCase();
    var amount = parseFloat(document.getElementById('trade-amount').value);
    var $result = document.getElementById('trade-result');
    var $btn = document.getElementById('exec-trade-btn');

    if (!symbol) { showTradeResult('error', 'Enter a coin symbol'); return; }
    if (!amount || amount <= 0) { showTradeResult('error', 'Enter a valid amount'); return; }

    $btn.disabled = true;
    $btn.textContent = 'Executing...';

    var data = await api('/api/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol: symbol, tradeType: tradeType, amount: amount }),
    });

    $btn.disabled = false;
    $btn.textContent = tradeType === 'BUY' ? 'Buy' : 'Sell';

    if (!data) {
      showTradeResult('error', 'Trade request failed');
    } else if (data._forbidden) {
      showTradeResult('error', 'Admin role required for trading');
    } else if (data.error) {
      showTradeResult('error', data.error);
    } else if (data.success) {
      var resp = data.response || {};
      showTradeResult('success', tradeType + ' executed — new price: ' + formatUSD(resp.newPrice));
      document.getElementById('trade-amount').value = '';
      loadPortfolio();
    } else {
      showTradeResult('error', 'Unexpected response');
    }
  };

  function showTradeResult(type, msg) {
    var $r = document.getElementById('trade-result');
    $r.style.display = 'block';
    $r.className = 'trade-result ' + type;
    $r.textContent = msg;
    if (type === 'success') setTimeout(function() { $r.style.display = 'none'; }, 4000);
  }

  // ── Auto Refresh ──

  function startAutoRefresh() {
    stopAutoRefresh();
    if (!autoRefresh) return;
    refreshTimer = setInterval(function() {
      if (document.visibilityState === 'visible') loadAllData();
    }, REFRESH_INTERVAL);
  }

  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  // ── Settings ──

  function initSettings() {
    var $toggle = document.getElementById('auto-refresh-toggle');
    var $knob = document.getElementById('toggle-knob');

    function updateToggleUI() {
      if ($toggle.checked) {
        $toggle.parentElement.querySelector('span:first-of-type').style.background = 'var(--emerald)';
        $knob.style.transform = 'translateX(20px)';
      } else {
        $toggle.parentElement.querySelector('span:first-of-type').style.background = 'var(--border)';
        $knob.style.transform = 'translateX(0)';
      }
    }

    $toggle.addEventListener('change', function() {
      autoRefresh = $toggle.checked;
      if (autoRefresh) startAutoRefresh(); else stopAutoRefresh();
      updateToggleUI();
    });
    updateToggleUI();

    document.getElementById('connection-info').textContent = window.location.host;
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
  }

  // ── Initialization ──

  async function init() {
    initPinInputs();
    initNavigation();
    initSettings();

    var saved = localStorage.getItem('rpm_session');
    if (saved) {
      sessionToken = saved;
      try {
        var res = await fetch('/api/auth/check?session=' + encodeURIComponent(saved), { credentials: 'include' });
        var data = await res.json();
        if (data.valid) {
          applyRole(data.role || 'viewer');
          showApp();
          return;
        }
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
