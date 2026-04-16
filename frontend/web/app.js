const API = '/api';
let token = localStorage.getItem('ag_token');
let currentUser = JSON.parse(localStorage.getItem('ag_user') || 'null');
let marketData = [];
let tradeState = { type:'BUY',coin:'',symbol:'',price:0 };

const urlParams = new URLSearchParams(window.location.search);
const refParam = urlParams.get('ref');
if (refParam) {
  localStorage.setItem('ag_referral', refParam);
  setTimeout(() => { if (typeof showSignup === 'function') showSignup(); }, 150);
}

const COIN_COLORS = {BTC:'#f7931a',ETH:'#627eea',SOL:'#14f195',BNB:'#f3ba2f',XRP:'#00aae4',ADA:'#0033ad',DOGE:'#c2a633',AVAX:'#e84142',DOT:'#e6007a',MATIC:'#8247e5',LINK:'#2a5ada',LTC:'#bfbbbb',UNI:'#ff007a',ATOM:'#2e3148',XLM:'#08b5e5',ALGO:'#000',VET:'#15bdff',FTM:'#1969ff',NEAR:'#00c08b',SAND:'#04adef'};

// ==================== AUTH ====================
function showLogin() {
  document.getElementById('login-form').style.display='block';
  document.getElementById('signup-form').style.display='none';
  document.getElementById('auth-error').style.display='none';
}
function showSignup() {
  document.getElementById('login-form').style.display='none';
  document.getElementById('signup-form').style.display='block';
  document.getElementById('auth-error').style.display='none';
}
function showAuthError(msg) {
  const el=document.getElementById('auth-error');
  el.textContent=msg; el.style.display='block';
}

document.getElementById('login-form').addEventListener('submit', async(e)=>{
  e.preventDefault();
  const email=document.getElementById('login-email').value;
  const password=document.getElementById('login-password').value;
  try {
    const r=await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const text=await r.text();
    let d;
    try { d=JSON.parse(text); } catch(e) { d={error: 'Server returned non-JSON: ' + text.slice(0,100)}; }
    
    if(!r.ok) return showAuthError(d.error||'Login failed');
    token=d.token; currentUser=d.user;
    localStorage.setItem('ag_token',token);
    localStorage.setItem('ag_user',JSON.stringify(currentUser));
    enterApp();
  } catch(err) { 
    console.error('Login error:', err);
    showAuthError('Connection error: ' + err.message); 
  }
});

document.getElementById('signup-form').addEventListener('submit', async(e)=>{
  e.preventDefault();
  const username=document.getElementById('signup-username').value;
  const email=document.getElementById('signup-email').value;
  const password=document.getElementById('signup-password').value;
  const referredBy = localStorage.getItem('ag_referral') || undefined;
  try {
    const r=await fetch(`${API}/auth/signup`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,email,password,referredBy})});
    const text=await r.text();
    let d;
    try { d=JSON.parse(text); } catch(e) { d={error: 'Server returned non-JSON: ' + text.slice(0,100)}; }
    
    if(!r.ok) return showAuthError(d.error||'Signup failed');
    token=d.token; currentUser=d.user;
    localStorage.setItem('ag_token',token);
    localStorage.setItem('ag_user',JSON.stringify(currentUser));
    enterApp();
  } catch(err) { 
    console.error('Signup error:', err);
    showAuthError('Connection error: ' + err.message); 
  }
});

function logout() {
  token=null; currentUser=null;
  localStorage.removeItem('ag_token');
  localStorage.removeItem('ag_user');
  // Hard reload to ensure all memory/DOM state is wiped clean
  window.location.reload();
}

// ==================== APP ENTRY ====================
function enterApp() {
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app').classList.add('active');
  document.getElementById('top-avatar').textContent=(currentUser.username||'U')[0].toUpperCase();
  
  // Clear any leftover data in global variables
  marketData = [];
  
  // Initial loads
  loadMarket();
  loadPortfolio(); // Start fresh
  
  setInterval(loadMarket,15000);
}

// ==================== CLOSE TRADE ====================
async function closePosition(coin, symbol, quantity) {
  const targetPrice = prompt(`Enter price to close ${coin} (leave empty to close at Market Price):`);
  
  // If user cancelled the prompt
  if (targetPrice === null) return;

  // Case 1: Limit Close (User specified a price)
  if (targetPrice.trim() !== '') {
    const price = parseFloat(targetPrice);
    if (isNaN(price)) return toast('Invalid price entered', 'error');
    
    try {
      const r = await fetch(`${API}/portfolio/set-exit-price`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ coin, price })
      });
      const d = await r.json();
      if (!r.ok) return toast(d.error || 'Failed to set exit price', 'error');
      toast(d.message, 'success');
      loadPortfolio();
      return;
    } catch (err) {
      return toast('Connection error', 'error');
    }
  }

  // Case 2: Market Close (User left price empty)
  if(!confirm(`Are you sure you want to close your ${coin} position at Market Price?`)) return;
  
  try {
    const r = await fetch(`${API}/trade/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        type: 'SELL',
        symbol: symbol,
        coin: coin,
        quantityInCoin: quantity // Added quantity to fix validation error
      })
    });
    
    const d = await r.json();
    if(!r.ok) return toast(d.error || 'Failed to close position', 'error');
    
    toast(d.message || 'Position closed successfully', 'success');
    if(d.cashBalance != null) { currentUser.cashBalance = d.cashBalance; updateBalance(); }
    loadPortfolio();
  } catch(err) {
    console.error('Close error:', err);
    toast('Connection error while closing position', 'error');
  }
}

// ==================== CANCEL EXIT ORDER ====================
async function cancelExitOrder(coin) {
  try {
    const r = await fetch(`${API}/portfolio/cancel-exit-price`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ coin })
    });
    const d = await r.json();
    if (!r.ok) return toast(d.error || 'Failed to cancel order', 'error');
    toast(d.message, 'success');
    loadPortfolio();
  } catch (err) {
    toast('Connection error', 'error');
  }
}

// ==================== NAVIGATION ====================
function switchPage(page) {
  // Close any open modals when switching pages
  closeTradeModal();
  
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.getElementById('nav-'+page).classList.add('active');
  if(page==='market') loadMarket();
  if(page==='portfolio') loadPortfolio();
  if(page==='trades') loadTrades();
  if(page==='leaderboard') loadLeaderboard();
  if(page==='ai') loadSuggestions();
  if(page==='referral') loadReferrals();
}

// ==================== TOAST ====================
function toast(msg,type='info') {
  const c=document.getElementById('toast-container');
  const t=document.createElement('div');
  t.className='toast '+type; t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(40px)'; setTimeout(()=>t.remove(),300); },3500);
}

// ==================== HELPERS ====================
const fmt = (n) => {
  if(n==null) return '$0.00';
  if(n>=1) return '$'+parseFloat(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  return '$'+parseFloat(n).toFixed(6);
};
const fmtQty = (n) => parseFloat(n)<0.001 ? parseFloat(n).toFixed(8) : parseFloat(n).toFixed(4);
const authHeaders = () => ({'Content-Type':'application/json','Authorization':'Bearer '+token});

// ==================== MARKET ====================
async function loadMarket() {
  const lastUpdateEl = document.getElementById('last-update');
  try {
    if (lastUpdateEl) lastUpdateEl.textContent = 'Updating...';
    const r=await fetch(`${API}/market/prices`);
    if (!r.ok) throw new Error('Backend update failed');
    const d=await r.json();
    marketData=d.data||[];
    
    if (lastUpdateEl) {
      if (marketData.length > 0) {
        lastUpdateEl.textContent = 'Live';
        lastUpdateEl.style.background = 'var(--green-glow)';
      } else {
        lastUpdateEl.textContent = 'No Data';
        lastUpdateEl.style.background = 'var(--red-glow)';
      }
    }
    
    renderMarket();
    renderMarketStats();
    updateBalance();
  } catch(err) { 
    console.error('Market load failed:',err);
    if (lastUpdateEl) {
      lastUpdateEl.textContent = 'Error';
      lastUpdateEl.style.background = 'var(--red-glow)';
    }
  }
}

function renderMarketStats() {
  if(!marketData.length) return;
  const top=marketData.slice(0,3);
  const html=top.map(c=>`
    <div class="stat-card" onclick="openTradeModal('${c.coin}','${c.symbol}',${c.price})">
      <div class="stat-value" style="color:${COIN_COLORS[c.coin]||'#fff'}">${fmt(c.price)}</div>
      <div class="stat-label">${c.coin} <span class="${c.change24h>=0?'positive':'negative'}">${c.change24h>=0?'+':''}${c.change24h.toFixed(2)}%</span></div>
    </div>`).join('') + `
    <div class="stat-card">
      <div class="stat-value" style="color:var(--cyan)">${marketData.length}</div>
      <div class="stat-label">Coins Tracked</div>
    </div>`;
  document.getElementById('market-stats').innerHTML=html;
}

function renderMarket() {
  const body=document.getElementById('market-body');
  if(!marketData.length) { 
    body.innerHTML='<tr><td colspan="6" class="empty-state"><div class="spinner"></div><div style="margin-top:10px; color:var(--text-muted)">Waiting for market data...</div><button class="btn btn-sm" style="margin-top:10px; font-size:10px" onclick="loadMarket()">RETRY</button></td></tr>'; 
    return; 
  }
  body.innerHTML=marketData.map(c=>{
    const color=COIN_COLORS[c.coin]||'#6366f1';
    const up=c.change24h>=0;
    return `<tr onclick="openTradeModal('${c.coin}','${c.symbol}',${c.price})">
      <td><div class="coin-cell">
        <div class="coin-icon" style="background:${color}">${c.coin.slice(0,2)}</div>
        <div><div class="coin-name">${c.name}</div><div class="coin-symbol">${c.coin}</div></div>
      </div></td>
      <td class="price-cell">${fmt(c.price)}</td>
      <td><span class="change-badge ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(c.change24h).toFixed(2)}%</span></td>
      <td class="price-cell" style="color:var(--text-secondary)">${fmt(c.high24h)}</td>
      <td class="price-cell" style="color:var(--text-secondary)">${fmt(c.low24h)}</td>
      <td>
        <button class="trade-btn-sm buy" onclick="event.stopPropagation();openTradeModal('${c.coin}','${c.symbol}',${c.price},'LONG')">Buy</button>
        <button class="trade-btn-sm sell" onclick="event.stopPropagation();openTradeModal('${c.coin}','${c.symbol}',${c.price},'SHORT')">Sell</button>
      </td>
    </tr>`;
  }).join('');
}

// ==================== TRADE MODAL ====================
let tvChartObj = null;
let tradeInterval = null;

function openTradeModal(coin,symbol,price,type) {
  tradeState={type:type||'LONG',coin,symbol,price};
  document.getElementById('modal-coin-name').textContent='Trade '+coin;
  document.getElementById('modal-live-price').textContent=fmt(price);
  document.getElementById('trade-amount').value='';
  setTradeType(tradeState.type);
  updateModalBalance();
  document.getElementById('trade-modal').classList.add('active');
  
  if(tradeInterval) clearInterval(tradeInterval);
  
  setTimeout(() => {
    try {
      if (window.TradingView) {
        initChart(symbol);
      } else {
        document.getElementById('tv-chart').innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">TradingView library blocked. Check AdBlock or VPN.</div>';
      }
    } catch(e) {
      console.error('Chart Load Error:', e);
    }
    
    // Always start orderbook & live price independently so it works even if chart fails!
    fetchLivePriceAndOrderBook(symbol);
    tradeInterval = setInterval(() => {
      fetchLivePriceAndOrderBook(symbol);
    }, 2000);
  }, 50);
}

function closeTradeModal() {
  if(tradeInterval) clearInterval(tradeInterval);
  document.getElementById('trade-modal').classList.remove('active');
}

function initChart(symbol) {
  const container = document.getElementById('tv-chart');
  container.innerHTML = '';
  const tvSymbol = symbol.toUpperCase().includes('BINANCE:') ? symbol : `BINANCE:${symbol}`;
  
  tvChartObj = new TradingView.widget({
    "autosize": true,
    "symbol": tvSymbol,
    "interval": "1",
    "timezone": "Etc/UTC",
    "theme": "dark",
    "style": "1",
    "locale": "en",
    "enable_publishing": false,
    "backgroundColor": "rgba(0, 0, 0, 0)",
    "gridColor": "#2a3050",
    "hide_top_toolbar": false,
    "hide_legend": false,
    "save_image": false,
    "container_id": "tv-chart"
  });
}

async function fetchLivePriceAndOrderBook(symbol) {
  try {
    let priceRes = await fetch(`${API}/market/proxy/ticker/price?symbol=${symbol}`);
    if(!priceRes.ok) priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    
    let obRes = await fetch(`${API}/market/proxy/depth?symbol=${symbol}&limit=15`);
    if(!obRes.ok) obRes = await fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=15`);
    
    if(priceRes.ok) {
      const priceData = await priceRes.json();
      const newPrice = parseFloat(priceData.price);
      tradeState.price = newPrice;
      document.getElementById('modal-live-price').textContent = fmt(newPrice);
      calcTradeData();
    }
    if(obRes.ok) {
      const obData = await obRes.json();
      renderOrderBook(obData.bids, obData.asks);
    }
  } catch(e) { console.error('Orderbook Data Error', e); }
}

function renderOrderBook(bids, asks) {
  if(!bids || !asks || (!bids.length && !asks.length)) return;
  const maxVolume = Math.max(...bids.concat(asks).map(x => parseFloat(x[1])));
  const renderRows = (arr, type) => arr.map(x => {
    const price = parseFloat(x[0]), qty = parseFloat(x[1]);
    const w = (qty / maxVolume) * 100;
    return `<div class="ob-row ${type}"><div class="ob-price">${fmtQty(price)}</div><div class="ob-qty">${fmtQty(qty)}</div><div class="ob-bar" style="width:${w}%"></div></div>`;
  }).join('');
  document.getElementById('ob-bids').innerHTML = renderRows(bids, 'bid');
  document.getElementById('ob-asks').innerHTML = renderRows(asks, 'ask');
}

function updateModalBalance() {
  if(currentUser) document.getElementById('modal-balance').textContent=fmt(currentUser.cashBalance);
}

let currentLeverage = 1;

function setTradeType(type) {
  tradeState.type = type;
  document.getElementById('type-long').classList.toggle('active', type === 'LONG');
  document.getElementById('type-short').classList.toggle('active', type === 'SHORT');
  
  const btn = document.querySelector('.trade-actions .btn');
  if (btn) {
    btn.className = `btn btn-${type === 'SHORT' ? 'sell' : 'buy'}`;
    btn.textContent = 'Confirm Order';
  }
  calcTradeData();
}

function updateLeverage(val) {
  currentLeverage = parseInt(val);
  document.getElementById('leverage-val').innerText = `${val}x`;
  calcTradeData();
}

function toggleBracketOptions() {
  const options = document.getElementById('bracket-options');
  const arrow = document.getElementById('bracket-arrow');
  options.classList.toggle('active');
  arrow.style.transform = options.classList.contains('active') ? 'rotate(180deg)' : '';
}

function calcTradeData() {
  const amount = parseFloat(document.getElementById('trade-amount').value) || 0;
  const symbol = tradeState.symbol;
  const price = tradeState.price || 0;
  
  if (price > 0 && amount > 0) {
    const margin = amount / currentLeverage;
    const qty = amount / price;
    
    document.getElementById('modal-qty').innerText = qty.toFixed(4);
    document.getElementById('modal-margin').innerText = `$${margin.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    
    let liqPrice;
    if (tradeState.type === 'SHORT') {
      liqPrice = price * (1 + 0.9 / currentLeverage);
    } else {
      liqPrice = price * (1 - 0.9 / currentLeverage);
    }
    document.getElementById('modal-liq').innerText = `$${liqPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  } else {
    document.getElementById('modal-qty').innerText = '0.000';
    document.getElementById('modal-margin').innerText = '$0.00';
    document.getElementById('modal-liq').innerText = '--';
  }
}

async function executeTrade() {
  const amount = parseFloat(document.getElementById('trade-amount').value);
  if (!amount || amount <= 0) return toast('Enter valid amount','error');

  const sl = parseFloat(document.getElementById('sl-price').value) || null;
  const tp = parseFloat(document.getElementById('tp-price').value) || null;

  try {
    const r=await fetch(`${API}/trade/execute`,{
      method:'POST',
      headers:authHeaders(),
      body:JSON.stringify({
        type: tradeState.type,
        symbol: tradeState.symbol,
        coin: tradeState.coin,
        quantityInUSD: amount,
        leverage: currentLeverage,
        stopLoss: sl,
        takeProfit: tp
      })
    });
    
    const d=await r.json();
    if(!r.ok) return toast(d.error||'Trade failed','error');
    
    toast(d.message,'success');
    if(d.cashBalance!=null) { currentUser.cashBalance=d.cashBalance; updateBalance(); }
    closeTradeModal();
    loadMarket();
  } catch(err) { toast('Trade failed','error'); }
}


function updateBalance() {
  if(currentUser) document.getElementById('top-balance').textContent=fmt(currentUser.cashBalance);
}

// ==================== PORTFOLIO ====================
async function loadPortfolio() {
  try {
    const [pr,sr]=await Promise.all([
      fetch(`${API}/portfolio`,{headers:authHeaders()}),
      fetch(`${API}/portfolio/stats`,{headers:authHeaders()})
    ]);
    const p=await pr.json(), s=await sr.json();
    if(pr.ok) {
      currentUser.cashBalance=p.cashBalance;
      updateBalance();
      renderPortfolioStats(p,s);
      renderHoldings(p.holdings||[]);
    }
  } catch(err) { console.error(err); }
}

function renderPortfolioStats(p,s) {
  const up=p.totalPnL>=0;
  document.getElementById('portfolio-stats').innerHTML=`
    <div class="stat-card"><div class="stat-value">${fmt(p.totalPortfolioValue)}</div><div class="stat-label">Total Value</div></div>
    <div class="stat-card"><div class="stat-value">${fmt(p.cashBalance)}</div><div class="stat-label">Cash Balance</div></div>
    <div class="stat-card"><div class="stat-value ${up?'positive':'negative'}">${up?'+':''}${fmt(p.totalPnL)}</div><div class="stat-label">Total P&L (${p.totalPnLPercent}%)</div></div>
    <div class="stat-card"><div class="stat-value">${s.totalTrades||0}</div><div class="stat-label">Total Trades</div></div>`;
}

function renderHoldings(holdings) {
  const el=document.getElementById('holdings-list');
  const pel=document.getElementById('pending-orders-list');
  
  // Clear lists before rendering
  el.innerHTML = '';
  pel.innerHTML = '';
  
  if(!holdings || !holdings.length) { 
    el.innerHTML='<div class="empty-state"><div class="empty-state-icon">💰</div><div class="empty-state-text">No holdings yet. Start trading!</div></div>'; 
    pel.innerHTML='<div class="empty-state"><div class="empty-state-text" style="font-size:12px">No active exit orders.</div></div>';
    return; 
  }
  
  // Render Holdings
  el.innerHTML=holdings.map(h=>{
    const color=COIN_COLORS[h.coin]||'#6366f1';
    const up=h.pnl>=0;
    const typeLabel = h.type || 'LONG';
    return `<div class="holding-card">
      <div class="holding-left">
        <div class="coin-icon" style="background:${color}">${h.coin.slice(0,2)}</div>
        <div>
          <div class="coin-name">${h.coin} <span class="badge" style="background:${typeLabel==='SHORT'?'var(--red-glow)':'var(--green-glow)'};color:${typeLabel==='SHORT'?'var(--red)':'var(--green)'}">${typeLabel} ${h.leverage}x</span></div>
          <div class="coin-symbol">${fmtQty(h.quantity)} coins</div>
          <div style="font-size:11px; margin-top:4px; color:var(--text-muted)">
            <span>Entry: ${fmt(h.avgBuyPrice)}</span>
            ${h.liquidationPrice ? `<span style="margin-left:8px; color:var(--red)">Liq: ${fmt(h.liquidationPrice)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="holding-right" style="display:flex; align-items:center; gap:20px;">
        <div style="text-align:right">
          <div class="holding-value">${fmt(h.currentValue)}</div>
          <div class="holding-pnl ${up?'positive':'negative'}">${up?'+':''}${fmt(h.pnl)} (${h.pnlPercent}%)</div>
        </div>
        <button class="trade-btn-sm sell" onclick="closePosition('${h.coin}','${h.symbol}',${h.quantity})" style="background:var(--red); color:#fff; border-radius:4px; padding:8px 12px; font-weight:700;">CLOSE</button>
      </div>
    </div>`;
  }).join('');

  // Render Pending Orders (Extract TP/SL from positions)
  const pending = [];
  holdings.forEach(h => {
    if (h.takeProfit) pending.push({ coin: h.coin, type: 'TP', price: h.takeProfit });
    if (h.stopLoss) pending.push({ coin: h.coin, type: 'SL', price: h.stopLoss });
  });

  if (!pending.length) {
    pel.innerHTML = '<div class="empty-state"><div class="empty-state-text" style="font-size:12px">No active exit orders.</div></div>';
  } else {
    pel.innerHTML = pending.map(o => `
      <div class="order-card">
        <div class="order-info">
          <span class="order-type ${o.type.toLowerCase()}">${o.type === 'TP' ? 'Take Profit' : 'Stop Loss'}</span>
          <span class="order-price">${o.coin} @ ${fmt(o.price)}</span>
        </div>
        <button class="order-cancel" onclick="cancelExitOrder('${o.coin}')" title="Cancel Order">&times;</button>
      </div>
    `).join('');
  }
}

// ==================== TRADES ====================
async function loadTrades() {
  try {
    const r=await fetch(`${API}/trade/history`,{headers:authHeaders()});
    const d=await r.json();
    if(!r.ok) return;
    const body=document.getElementById('trades-body');
    if(!d.data||!d.data.length) { body.innerHTML='<tr><td colspan="7" class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">No trades yet.</div></td></tr>'; return; }
    body.innerHTML=d.data.map(t=>{
      const up=t.profitLoss>=0;
      return `<tr>
        <td style="font-size:13px;color:var(--text-secondary)">${new Date(t.timestamp).toLocaleString()}</td>
        <td><span class="change-badge ${t.type==='BUY'?'up':'down'}">${t.type}</span></td>
        <td><strong>${t.coin}</strong></td>
        <td class="price-cell">${fmtQty(t.quantity)}</td>
        <td class="price-cell">${fmt(t.price)}</td>
        <td class="price-cell">${fmt(t.totalValue)}</td>
        <td class="price-cell ${up?'positive':'negative'}">${up?'+':''}${fmt(t.profitLoss)}</td>
      </tr>`;
    }).join('');
  } catch(err) { console.error(err); }
}

// ==================== LEADERBOARD ====================
async function loadLeaderboard() {
  try {
    const r=await fetch(`${API}/leaderboard`,{headers:authHeaders()});
    const d=await r.json();
    if(!r.ok) return;
    const el=document.getElementById('leaderboard-list');
    if(!d.data||!d.data.length) { el.innerHTML='<div class="empty-state"><div class="empty-state-icon">🏆</div><div class="empty-state-text">No one on the leaderboard yet. Be the first!</div></div>'; return; }
    el.innerHTML=d.data.map(e=>{
      const cls=e.rank===1?'gold':e.rank===2?'silver':e.rank===3?'bronze':'';
      const up=e.totalPnL>=0;
      return `<div class="leaderboard-row">
        <div class="leaderboard-rank ${cls}">${e.rank}</div>
        <div class="leaderboard-info"><div class="leaderboard-name">${e.username}</div><div style="font-size:12px" class="${up?'positive':'negative'}">${up?'+':''}${e.totalPnLPercent}% P&L</div></div>
        <div class="leaderboard-value">${fmt(e.totalValue)}</div>
      </div>`;
    }).join('');
  } catch(err) { console.error(err); }
}

// ==================== AI SIGNALS ====================
async function loadSuggestions() {
  try {
    const r=await fetch(`${API}/trade/suggestions`,{headers:authHeaders()});
    const d=await r.json();
    if(!r.ok) return;
    document.getElementById('suggestions-list').innerHTML=(d.data||[]).map(s=>`
      <div class="suggestion-card">
        <div class="suggestion-header">
          <div class="coin-icon" style="background:${COIN_COLORS[s.coin]||'#6366f1'};width:30px;height:30px;font-size:11px">${s.coin.slice(0,2)}</div>
          <strong>${s.coin}</strong>
          <span class="suggestion-action ${s.action}">${s.action}</span>
          <span style="margin-left:auto;font-size:12px;color:var(--text-muted)">${s.confidence}% confidence</span>
        </div>
        <div class="suggestion-reason">${s.reason}</div>
        <div class="confidence-bar"><div class="confidence-fill" style="width:${s.confidence}%"></div></div>
      </div>`).join('') + `<p style="font-size:12px;color:var(--text-muted);margin-top:16px">${d.disclaimer||''}</p>`;
  } catch(err) { console.error(err); }
}

// ==================== DAILY REWARD ====================
async function claimDailyReward() {
  try {
    const r=await fetch(`${API}/auth/daily-reward`,{method:'POST',headers:authHeaders()});
    const d=await r.json();
    if(!r.ok) return toast(d.error||'Failed','error');
    toast(d.message,'success');
    if(d.cashBalance!=null) { currentUser.cashBalance=d.cashBalance; updateBalance(); }
  } catch(err) { toast('Cannot claim reward','error'); }
}

// ==================== FULLSCREEN ====================
function toggleFullScreen() {
  const elem = document.querySelector('.trading-chart-container');
  if (!document.fullscreenElement) {
    elem.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable full-screen mode: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

// ==================== FUNDS ====================
async function addFunds() {
  try {
    const r = await fetch(`${API}/payment/create-order`, { method: 'POST', headers: authHeaders() });
    const orderData = await r.json();
    if (!r.ok) return toast(orderData.error || 'Failed to create order', 'error');

    const options = {
      key: 'rzp_test_Sdn9iB87FQlSrb',
      amount: orderData.amount,
      currency: 'INR',
      name: 'Paper Trading',
      description: 'Buy $1000 Virtual Funds',
      order_id: orderData.id,
      handler: async function (response) {
        try {
          const verifyR = await fetch(`${API}/payment/verify`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          const verifyData = await verifyR.json();
          if (!verifyR.ok) return toast(verifyData.error || 'Payment verification failed', 'error');
          toast(verifyData.message, 'success');
          if (verifyData.balance) {
            currentUser.cashBalance = verifyData.balance;
            updateBalance();
          }
        } catch (err) {
          toast('Verification connection error', 'error');
        }
      },
      prefill: {
        name: currentUser.username,
        email: currentUser.email,
        contact: '9999999999'
      },
      theme: { color: '#6366f1' }
    };
    const rzp = new Razorpay(options);
    rzp.on('payment.failed', function (response) {
      toast('Payment Failed: ' + response.error.description, 'error');
    });
    rzp.open();
  } catch (err) {
    toast('Connection error', 'error');
  }
}

// ==================== SHARE TARGET ====================
async function shareWebsite() {
  let shareUrl = window.location.origin + window.location.pathname;
  if (currentUser && currentUser.referralCode) shareUrl += '?ref=' + currentUser.referralCode;

  const shareData = {
    title: 'Paper Trading — Crypto Paper Trader',
    text: 'Practice crypto trading risk-free! Sign up with my referral link to get started and we both earn rewards!',
    url: shareUrl
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      toast('Thanks for sharing!', 'success');
    } catch (err) {
      if(err.name !== 'AbortError') toast('Error sharing website', 'error');
    }
  } else {
    // Fallback if Web Share API is not supported
    navigator.clipboard.writeText(shareUrl).then(() => {
      toast('Website link copied to clipboard!', 'success');
    }).catch(() => {
      toast('Failed to copy link', 'error');
    });
  }
}

// ==================== REFERRALS ====================
async function loadReferrals() {
  try {
    const r = await fetch(`${API}/referral/stats`, { headers: authHeaders() });
    const d = await r.json();
    if (!r.ok) return;
    
    // Update UI Stats
    document.getElementById('ref-code').textContent = d.referralCode || 'N/A';
    document.getElementById('ref-earnings').textContent = '₹' + (d.referralEarnings || 0);
    document.getElementById('ref-count').textContent = d.totalReferred || 0;

    let refCode = d.referralCode || (currentUser ? currentUser.referralCode : null);
    if (!refCode) {
      document.getElementById('ref-link').value = 'Generating code...';
      // If code is missing, maybe suggest the user to refresh or wait
      return;
    }

    let linkUrl = window.location.origin + window.location.pathname + '?ref=' + refCode;
    document.getElementById('ref-link').value = linkUrl;

    const body = document.getElementById('referral-history-body');
    if (!d.earningsHistory || !d.earningsHistory.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">No referrals yet. Invite your friends!</div></td></tr>';
      return;
    }
    
    body.innerHTML = d.earningsHistory.map(h => {
      return `<tr>
        <td style="font-size:13px;color:var(--text-secondary)">${new Date(h.createdAt).toLocaleDateString()}</td>
        <td><strong>${h.referredUserId ? h.referredUserId.username : 'Unknown'}</strong></td>
        <td class="price-cell positive">+₹${h.commissionAmount}</td>
        <td><span class="badge" style="background:var(--green-glow);color:var(--green)">${h.status.toUpperCase()}</span></td>
      </tr>`;
    }).join('');

  } catch(err) { console.error('Referral Load Error:', err); }
}

function copyReferralLink() {
  const linkUrl = document.getElementById('ref-link').value;
  if (!linkUrl) return;
  navigator.clipboard.writeText(linkUrl).then(() => {
    toast('Referral link copied!', 'success');
  }).catch(() => toast('Failed to copy', 'error'));
}

async function customizeReferralCode() {
  const newCode = prompt("Enter your new Custom Coupon Code (Letters and Numbers only):");
  if (!newCode) return;
  
  try {
    const r = await fetch(`${API}/referral/customize-code`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ newCode })
    });
    const d = await r.json();
    if (!r.ok) return toast(d.error || 'Failed to update code', 'error');
    
    toast(d.message, 'success');
    if(currentUser) currentUser.referralCode = d.referralCode;
    loadReferrals();
  } catch(err) {
    toast('Connection error', 'error');
  }
}

// ==================== INIT ====================
if(token && currentUser) { enterApp(); }
