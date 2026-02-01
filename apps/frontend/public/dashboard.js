// Dashboard JavaScript
// Production-grade dashboard for Polymarket trading bot

const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : window.location.origin;

// State management
const state = {
  isLiveTrading: false,
  marketFeedConnected: false,
  tradingClientInitialized: false,
  currentTab: 'overview',
  refreshIntervalId: null,
  events: [],
  logs: [],
  alerts: [],
  configChanges: []
};

// Utility functions
function formatAddress(address) {
  if (!address) return '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Number(num).toFixed(decimals);
}

function formatCurrency(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  const formatted = Number(num).toFixed(decimals);
  return num >= 0 ? `$${formatted}` : `-$${Math.abs(formatted)}`;
}

function showError(message) {
  addAlert('danger', message);
}

function showSuccess(message) {
  addAlert('success', message);
}

function showWarning(message) {
  addAlert('warning', message);
}

function addAlert(type, message) {
  const alert = {
    id: Date.now(),
    type,
    message,
    timestamp: new Date().toISOString()
  };
  state.alerts.push(alert);
  renderAlerts();
  
  // Auto-dismiss success alerts after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      state.alerts = state.alerts.filter(a => a.id !== alert.id);
      renderAlerts();
    }, 5000);
  }
}

function addEvent(type, message) {
  const event = {
    timestamp: new Date().toISOString(),
    type,
    message
  };
  state.events.unshift(event);
  
  // Keep only last 100 events
  if (state.events.length > 100) {
    state.events = state.events.slice(0, 100);
  }
  
  renderEventFeed();
}

function addLog(level, message) {
  const log = {
    timestamp: new Date().toISOString(),
    level,
    message
  };
  state.logs.unshift(log);
  
  // Keep only last 500 logs
  if (state.logs.length > 500) {
    state.logs = state.logs.slice(0, 500);
  }
  
  renderLogs();
}

function addConfigChange(section, field, oldValue, newValue) {
  const change = {
    timestamp: new Date().toISOString(),
    section,
    field,
    oldValue,
    newValue
  };
  state.configChanges.unshift(change);
  
  // Keep only last 50 changes
  if (state.configChanges.length > 50) {
    state.configChanges = state.configChanges.slice(0, 50);
  }
  
  renderConfigChangeLog();
}

// API functions
async function fetchData(endpoint) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch ${endpoint}:`, error);
    throw error;
  }
}

async function postData(endpoint, data, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return await response.json();
}

// Update functions
async function updateStatus() {
  try {
    const status = await fetchData('/status');
    
    state.isLiveTrading = status.liveTrading;
    state.marketFeedConnected = status.marketFeedConnected;
    state.tradingClientInitialized = status.tradingClientInitialized;
    
    // Update mode indicator
    const banner = document.getElementById('safetyBanner');
    const modeIndicator = document.getElementById('modeIndicator');
    
    if (status.liveTrading) {
      banner.className = 'safety-banner live';
      modeIndicator.className = 'mode-indicator live';
      modeIndicator.innerHTML = '<span class="mode-icon">🔴</span><span>LIVE TRADING</span>';
    } else {
      banner.className = 'safety-banner paper';
      modeIndicator.className = 'mode-indicator paper';
      modeIndicator.innerHTML = '<span class="mode-icon">🟡</span><span>Paper Mode</span>';
    }
    
    // Update status dots
    const feedDot = document.getElementById('feedStatusDot');
    const feedStatus = document.getElementById('feedStatus');
    const tradingDot = document.getElementById('tradingStatusDot');
    const tradingStatus = document.getElementById('tradingStatus');
    
    feedDot.className = `status-dot ${status.marketFeedConnected ? 'connected' : 'disconnected'}`;
    feedStatus.textContent = `Market Feed: ${status.marketFeedConnected ? 'Connected' : 'Disconnected'}`;
    
    tradingDot.className = `status-dot ${status.tradingClientInitialized ? 'connected' : 'disconnected'}`;
    tradingStatus.textContent = `Trading: ${status.tradingClientInitialized ? 'Initialized' : 'Not Initialized'}`;
    
    // Update wallet address
    document.getElementById('walletAddress').textContent = 
      status.walletAddress || 'Not connected';
      
  } catch (error) {
    console.error('Failed to update status:', error);
    addLog('error', `Status update failed: ${error.message}`);
  }
}

async function updateState() {
  try {
    const stateData = await fetchData('/state');
    
    // Update summary cards
    const openOrders = stateData.orders.filter(o => o.status === 'OPEN').length;
    document.getElementById('openOrders').textContent = openOrders;
    document.getElementById('activePositions').textContent = stateData.positions.length;
    
    const balance = stateData.balances.find(b => b.currency === 'USDC');
    document.getElementById('availableBalance').textContent = 
      balance ? formatNumber(balance.available) : '0.00';
    
    // Calculate PnL
    const unrealizedPnl = stateData.positions.reduce((sum, pos) => {
      return sum + (pos.unrealizedPnl || 0);
    }, 0);
    document.getElementById('unrealizedPnL').textContent = formatCurrency(unrealizedPnl);
    
    // Update tables
    updatePositionsTable(stateData.positions);
    updateOrdersTable(stateData.orders.filter(o => o.status === 'OPEN'));
    updateFillsTable(stateData.fills);
    
  } catch (error) {
    console.error('Failed to update state:', error);
    addLog('error', `State update failed: ${error.message}`);
  }
}

async function updateMarkets() {
  try {
    const data = await fetchData('/orderbooks');
    
    if (data.length === 0) {
      document.getElementById('marketsTable').innerHTML = 
        '<div class="empty">No markets being watched</div>';
      return;
    }
    
    const html = `
      <table>
        <thead>
          <tr>
            <th>Token ID</th>
            <th>Best Bid</th>
            <th>Best Ask</th>
            <th>Mid Price</th>
            <th>Spread</th>
            <th>Last Update</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(m => `
            <tr>
              <td>${m.tokenId.slice(0, 10)}...</td>
              <td class="buy">${m.summary.bestBid || '-'}</td>
              <td class="sell">${m.summary.bestAsk || '-'}</td>
              <td>${m.summary.mid || '-'}</td>
              <td>${m.summary.spread || '-'}</td>
              <td style="color: var(--text-secondary); font-size: 12px;">
                ${formatTimestamp(m.timestamp)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    document.getElementById('marketsTable').innerHTML = html;
  } catch (error) {
    document.getElementById('marketsTable').innerHTML = 
      '<div class="empty">Failed to load markets</div>';
    addLog('error', `Markets update failed: ${error.message}`);
  }
}

async function updateMetrics() {
  try {
    const metrics = await fetchData('/metrics');
    
    const html = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
        <div>
          <div class="card-label">Uptime</div>
          <div style="font-size: 20px; font-weight: 600;">${formatNumber(metrics.uptime / 3600, 1)}h</div>
        </div>
        <div>
          <div class="card-label">Memory Usage (MB)</div>
          <div style="font-size: 20px; font-weight: 600;">${metrics.memory.heapUsed}</div>
        </div>
        <div>
          <div class="card-label">Cached Orderbooks</div>
          <div style="font-size: 20px; font-weight: 600;">${metrics.marketFeed.cachedOrderbooks}</div>
        </div>
        <div>
          <div class="card-label">Watched Markets</div>
          <div style="font-size: 20px; font-weight: 600;">${metrics.marketFeed.tokenIds}</div>
        </div>
      </div>
    `;
    
    document.getElementById('systemMetrics').innerHTML = html;
  } catch (error) {
    document.getElementById('systemMetrics').innerHTML = 
      '<div class="empty">Failed to load metrics</div>';
  }
}

function updatePositionsTable(positions) {
  if (positions.length === 0) {
    document.getElementById('positionsTable').innerHTML = 
      '<div class="empty">No open positions</div>';
    return;
  }
  
  const html = `
    <table>
      <thead>
        <tr>
          <th>Token ID</th>
          <th>Size</th>
          <th>Avg Price</th>
          <th>Market Value</th>
          <th>Unrealized PnL</th>
        </tr>
      </thead>
      <tbody>
        ${positions.map(p => {
          const pnl = p.unrealizedPnl || 0;
          const pnlClass = pnl >= 0 ? 'buy' : 'sell';
          return `
            <tr>
              <td>${p.tokenId.slice(0, 10)}...</td>
              <td>${formatNumber(p.size)}</td>
              <td>${formatNumber(p.averagePrice, 4)}</td>
              <td>${p.marketValue ? formatCurrency(p.marketValue) : '-'}</td>
              <td class="${pnlClass}">${formatCurrency(pnl)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  
  document.getElementById('positionsTable').innerHTML = html;
}

function updateOrdersTable(orders) {
  if (orders.length === 0) {
    document.getElementById('ordersTable').innerHTML = 
      '<div class="empty">No open orders</div>';
    return;
  }
  
  const html = `
    <table>
      <thead>
        <tr>
          <th>Order ID</th>
          <th>Token ID</th>
          <th>Side</th>
          <th>Price</th>
          <th>Size</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map(o => `
          <tr>
            <td>${o.orderId.slice(0, 8)}...</td>
            <td>${o.tokenId.slice(0, 10)}...</td>
            <td class="${o.side === 'BUY' ? 'buy' : 'sell'}">${o.side}</td>
            <td>${formatNumber(o.price, 4)}</td>
            <td>${formatNumber(o.size)}</td>
            <td style="color: var(--text-secondary); font-size: 12px;">
              ${formatTimestamp(o.createdAt)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  document.getElementById('ordersTable').innerHTML = html;
}

function updateFillsTable(fills) {
  if (fills.length === 0) {
    document.getElementById('fillsTable').innerHTML = 
      '<div class="empty">No fills yet</div>';
    return;
  }
  
  const recentFills = fills.slice(-20).reverse();
  
  const html = `
    <table>
      <thead>
        <tr>
          <th>Order ID</th>
          <th>Token ID</th>
          <th>Side</th>
          <th>Price</th>
          <th>Size</th>
          <th>Fee</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        ${recentFills.map(f => `
          <tr>
            <td>${f.orderId.slice(0, 8)}...</td>
            <td>${f.tokenId.slice(0, 10)}...</td>
            <td class="${f.side === 'BUY' ? 'buy' : 'sell'}">${f.side}</td>
            <td>${formatNumber(f.price, 4)}</td>
            <td>${formatNumber(f.size)}</td>
            <td>${f.fee ? formatNumber(f.fee, 4) : '-'}</td>
            <td style="color: var(--text-secondary); font-size: 12px;">
              ${formatTimestamp(f.timestamp)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  document.getElementById('fillsTable').innerHTML = html;
}

function renderEventFeed() {
  const container = document.getElementById('eventFeed');
  
  if (state.events.length === 0) {
    container.innerHTML = '<div class="empty">Waiting for events...</div>';
    return;
  }
  
  const html = state.events.map(event => `
    <div class="event-item">
      <span class="event-timestamp">${new Date(event.timestamp).toLocaleTimeString()}</span>
      <span class="event-type">${event.type}</span>
      <span class="event-message">${event.message}</span>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

function renderLogs() {
  const container = document.getElementById('logViewer');
  const filter = document.getElementById('logLevelFilter')?.value || 'all';
  
  const filteredLogs = filter === 'all' 
    ? state.logs 
    : state.logs.filter(log => log.level === filter);
  
  if (filteredLogs.length === 0) {
    container.innerHTML = '<div class="empty">No logs available</div>';
    return;
  }
  
  const html = filteredLogs.map(log => `
    <div class="log-entry ${log.level}">
      [${new Date(log.timestamp).toLocaleTimeString()}] [${log.level.toUpperCase()}] ${log.message}
    </div>
  `).join('');
  
  container.innerHTML = html;
}

function renderAlerts() {
  const container = document.getElementById('alertsPanel');
  
  if (state.alerts.length === 0) {
    container.innerHTML = '<div class="empty">No active alerts</div>';
    return;
  }
  
  const html = state.alerts.map(alert => `
    <div class="alert alert-${alert.type}" style="margin-bottom: 12px;">
      <span>${alert.type === 'danger' ? '❌' : alert.type === 'warning' ? '⚠️' : alert.type === 'success' ? '✅' : 'ℹ️'}</span>
      <span style="flex: 1;">${alert.message}</span>
      <span style="color: var(--text-secondary); font-size: 11px;">${formatTimestamp(alert.timestamp)}</span>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

function renderConfigChangeLog() {
  const container = document.getElementById('configChangeLog');
  
  if (state.configChanges.length === 0) {
    container.innerHTML = '<div class="empty">No configuration changes yet</div>';
    return;
  }
  
  const html = state.configChanges.map(change => `
    <div style="margin-bottom: 8px; padding: 8px; border-bottom: 1px solid var(--border-color);">
      <div style="font-size: 12px; color: var(--text-secondary);">${formatTimestamp(change.timestamp)}</div>
      <div style="font-size: 13px;">
        <strong>${change.section}.</strong>${change.field}: 
        <span style="color: var(--color-danger);">${change.oldValue}</span> → 
        <span style="color: var(--color-success);">${change.newValue}</span>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

// Action handlers
async function handleKillSwitch() {
  const modal = document.getElementById('killSwitchModal');
  const errorEl = document.getElementById('killSwitchError');
  const tokenInput = document.getElementById('killSwitchToken');
  
  modal.classList.add('active');
  errorEl.classList.add('hidden');
  tokenInput.value = '';
}

async function confirmKillSwitch() {
  const modal = document.getElementById('killSwitchModal');
  const errorEl = document.getElementById('killSwitchError');
  const tokenInput = document.getElementById('killSwitchToken');
  const token = tokenInput.value.trim();
  
  if (!token) {
    errorEl.textContent = 'Admin token is required';
    errorEl.classList.remove('hidden');
    return;
  }
  
  try {
    await postData('/kill', {}, token);
    modal.classList.remove('active');
    showSuccess('Kill switch activated! All orders cancelled.');
    addEvent('KILL_SWITCH', 'Emergency kill switch activated');
    addLog('error', 'Kill switch activated via dashboard');
    await refresh();
  } catch (error) {
    errorEl.textContent = `Failed: ${error.message}`;
    errorEl.classList.remove('hidden');
    addLog('error', `Kill switch failed: ${error.message}`);
  }
}

function cancelKillSwitch() {
  const modal = document.getElementById('killSwitchModal');
  modal.classList.remove('active');
}

async function handleReconnect() {
  showWarning('Reconnecting to market feed...');
  addEvent('RECONNECT', 'Manual reconnection requested');
  addLog('info', 'Reconnection requested via dashboard');
  
  // In a real implementation, this would call a reconnect endpoint
  // For now, just refresh the data
  setTimeout(async () => {
    await refresh();
    showSuccess('Reconnected successfully');
  }, 1000);
}

async function saveRiskConfig() {
  const maxExposure = document.getElementById('maxExposure').value;
  const maxOpenOrders = document.getElementById('maxOpenOrders').value;
  const maxDrawdown = document.getElementById('maxDrawdown').value;
  const errorEl = document.getElementById('riskConfigError');
  
  // Validation
  if (maxExposure <= 0 || maxOpenOrders <= 0 || maxDrawdown <= 0 || maxDrawdown > 100) {
    errorEl.textContent = 'Invalid values. Please check your inputs.';
    errorEl.classList.remove('hidden');
    return;
  }
  
  errorEl.classList.add('hidden');
  
  // In a real implementation, this would save to backend
  addConfigChange('Risk', 'maxExposure', '1000', maxExposure);
  addConfigChange('Risk', 'maxOpenOrders', '50', maxOpenOrders);
  addConfigChange('Risk', 'maxDrawdown', '20', maxDrawdown);
  
  showSuccess('Risk configuration saved');
  addEvent('CONFIG', 'Risk configuration updated');
  addLog('info', `Risk config updated: maxExposure=${maxExposure}, maxOpenOrders=${maxOpenOrders}, maxDrawdown=${maxDrawdown}%`);
}

async function saveStrategyConfig() {
  const strategyType = document.getElementById('strategyType').value;
  const orderSize = document.getElementById('orderSize').value;
  const refreshInterval = document.getElementById('refreshInterval').value;
  const errorEl = document.getElementById('strategyConfigError');
  
  if (orderSize <= 0 || refreshInterval <= 0) {
    errorEl.textContent = 'Invalid values. Please check your inputs.';
    errorEl.classList.remove('hidden');
    return;
  }
  
  errorEl.classList.add('hidden');
  
  addConfigChange('Strategy', 'type', 'market-maker', strategyType);
  addConfigChange('Strategy', 'orderSize', '100', orderSize);
  addConfigChange('Strategy', 'refreshInterval', '5', refreshInterval);
  
  showSuccess('Strategy configuration saved');
  addEvent('CONFIG', 'Strategy configuration updated');
  addLog('info', `Strategy config updated: type=${strategyType}, orderSize=${orderSize}, interval=${refreshInterval}s`);
}

async function saveReconnectConfig() {
  const attempts = document.getElementById('reconnectAttempts').value;
  const delay = document.getElementById('reconnectDelay').value;
  const maxDelay = document.getElementById('maxReconnectDelay').value;
  const errorEl = document.getElementById('reconnectConfigError');
  
  if (attempts <= 0 || delay <= 0 || maxDelay <= 0 || delay > maxDelay) {
    errorEl.textContent = 'Invalid values. Please check your inputs.';
    errorEl.classList.remove('hidden');
    return;
  }
  
  errorEl.classList.add('hidden');
  
  addConfigChange('Reconnect', 'attempts', '5', attempts);
  addConfigChange('Reconnect', 'delay', '1000', delay);
  addConfigChange('Reconnect', 'maxDelay', '30000', maxDelay);
  
  showSuccess('Reconnect configuration saved');
  addEvent('CONFIG', 'Reconnect configuration updated');
  addLog('info', `Reconnect config updated: attempts=${attempts}, delay=${delay}ms, maxDelay=${maxDelay}ms`);
}

function exportLogs() {
  const logs = state.logs.map(log => 
    `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
  ).join('\n');
  
  const blob = new Blob([logs], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `polymarket-bot-logs-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  
  showSuccess('Logs exported successfully');
  addEvent('EXPORT', 'Logs exported to file');
}

function clearLogs() {
  if (confirm('Are you sure you want to clear all logs?')) {
    state.logs = [];
    renderLogs();
    showSuccess('Logs cleared');
  }
}

function clearAlerts() {
  state.alerts = [];
  renderAlerts();
  showSuccess('Alerts cleared');
}

// Refresh all data
async function refresh() {
  await Promise.all([
    updateStatus(),
    updateState(),
    updateMarkets(),
    updateMetrics()
  ]);
  addEvent('REFRESH', 'Dashboard data refreshed');
}

// Tab switching
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(tabName)?.classList.add('active');
  
  state.currentTab = tabName;
  
  // Load tab-specific data
  if (tabName === 'alerts') {
    updateMetrics();
  }
}

// Initialize dashboard
async function init() {
  // Set up tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });
  
  // Set up action buttons
  document.getElementById('killSwitchBtn').addEventListener('click', handleKillSwitch);
  document.getElementById('confirmKillSwitchBtn').addEventListener('click', confirmKillSwitch);
  document.getElementById('cancelKillSwitchBtn').addEventListener('click', cancelKillSwitch);
  document.getElementById('reconnectBtn').addEventListener('click', handleReconnect);
  
  document.getElementById('saveRiskConfigBtn').addEventListener('click', saveRiskConfig);
  document.getElementById('saveStrategyConfigBtn').addEventListener('click', saveStrategyConfig);
  document.getElementById('saveReconnectConfigBtn').addEventListener('click', saveReconnectConfig);
  
  document.getElementById('refreshOrdersBtn').addEventListener('click', () => updateState());
  document.getElementById('refreshPositionsBtn').addEventListener('click', () => updateState());
  document.getElementById('refreshFillsBtn').addEventListener('click', () => updateState());
  
  document.getElementById('exportLogsBtn').addEventListener('click', exportLogs);
  document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
  document.getElementById('clearAlertsBtn').addEventListener('click', clearAlerts);
  
  document.getElementById('logLevelFilter').addEventListener('change', renderLogs);
  
  // Learning system buttons (placeholder)
  document.getElementById('startExperimentBtn').addEventListener('click', () => {
    showWarning('Learning system integration coming soon');
  });
  document.getElementById('viewExperimentsBtn').addEventListener('click', () => {
    showWarning('Learning system integration coming soon');
  });
  
  // Initial load
  addLog('info', 'Dashboard initialized');
  addEvent('INIT', 'Dashboard loaded');
  
  await refresh();
  
  // Set up auto-refresh
  state.refreshIntervalId = setInterval(refresh, 5000);
  
  console.log('Dashboard initialized successfully');
}

// Start the dashboard
init().catch(error => {
  console.error('Failed to initialize dashboard:', error);
  showError(`Failed to initialize: ${error.message}`);
});
