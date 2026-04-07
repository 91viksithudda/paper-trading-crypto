const API = 'http://localhost:5000/api';
let token = localStorage.getItem('ag_token');
let currentUser = JSON.parse(localStorage.getItem('ag_user') || 'null');
let marketData = [];
let tradeState = { type:'BUY',coin:'',symbol:'',price:0 };

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
    const d=await r.json();
    if(!r.ok) return showAuthError(d.error||'Login failed');
    token=d.token; currentUser=d.user;
    localStorage.setItem('ag_token',token);
    localStorage.setItem('ag_user',JSON.stringify(currentUser));
    enterApp();
  } catch(err) { showAuthError('Cannot connect to server. Make sure the backend is running.'); }
});

document.getElementById('signup-form').addEventListener('submit', async(e)=>{
  e.preventDefault();
  const username=document.getElementById('signup-username').value;
  const email=document.getElementById('signup-email').value;
  const password=document.getElementById('signup-password').value;
  try {
    const r=await fetch(`${API}/auth/signup`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,email,password})});
    const d=await r.json();
    if(!r.ok) return showAuthError(d.error||'Signup failed');
    token=d.token; currentUser=d.user;
    localStorage.setItem('ag_token',token);
    localStorage.setItem('ag_user',JSON.stringify(currentUser));
    enterApp();
  } catch(err) { showAuthError('Cannot connect to server.'); }
});

function logout() {
  token=null; currentUser=null;
  localStorage.removeItem('ag_token');
  localStorage.removeItem('ag_user');
  document.getElementById('auth-screen').style.display='flex';
  document.getElementById('app').classList.remove('active');
}

// ==================== APP ENTRY ====================
function enterApp() {
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app').classList.add('active');
  document.getElementById('top-avatar').textContent=(currentUser.username||'U')[0].toUpperCase();
  loadMarket();
  setInterval(loadMarket,15000);
}

// ==================== NAVIGATION ====================
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.getElementById('nav-'+page).classList.add('active');
  if(page==='market') loadMarket();
  if(page==='portfolio') loadPortfolio();
  if(page==='trades') loadTrades();
  if(page==='leaderboard') loadLeaderboard();
  if(page==='ai') loadSuggestions();
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
  try {
    const r=await fetch(`${API}/market/prices`);
    const d=await r.json();
    marketData=d.data||[];
    renderMarket();
    renderMarketStats();
    updateBalance();
  } catch(err) { console.error('Market load failed:',err); }
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
  if(!marketData.length) { body.innerHTML='<tr><td colspan="6" class="empty-state"><div class="spinner"></div></td></tr>'; return; }
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
        <button class="trade-btn-sm buy" onclick="event.stopPropagation();openTradeModal('${c.coin}','${c.symbol}',${c.price},'BUY')">Buy</button>
        <button class="trade-btn-sm sell" onclick="event.stopPropagation();openTradeModal('${c.coin}','${c.symbol}',${c.price},'SELL')">Sell</button>
      </td>
    </tr>`;
  }).join('');
}

// ==================== TRADE MODAL ====================
let tvChartObj = null;
let tradeInterval = null;

function openTradeModal(coin,symbol,price,type) {
  tradeState={type:type||'BUY',coin,symbol,price};
  document.getElementById('modal-coin-name').textContent='Trade '+coin;
  document.getElementById('modal-live-price').textContent=fmt(price);
  document.getElementById('trade-amount').value='';
  document.getElementById('modal-estimate').textContent='0.000';
  setTradeType(tradeState.type);
  updateModalBalance();
  document.getElementById('trade-modal').classList.add('active');
  
  if(tradeInterval) clearInterval(tradeInterval);
  
  // Wait for the modal layout to be visible before rendering chart
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
      
      const amt = document.getElementById('trade-amount').value;
      if(amt) document.getElementById('modal-estimate').textContent = fmtQty(parseFloat(amt)/newPrice) + ' ' + tradeState.coin;
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

function setTradeType(type) {
  tradeState.type=type;
  const buyBtn=document.getElementById('toggle-buy');
  const sellBtn=document.getElementById('toggle-sell');
  const execBtn=document.getElementById('execute-trade-btn');
  buyBtn.classList.toggle('active',type==='BUY');
  sellBtn.classList.toggle('active',type==='SELL');
  execBtn.className=type==='BUY'?'btn btn-buy':'btn btn-sell';
  execBtn.textContent=type==='BUY'?'Confirm Buy':'Confirm Sell';
  updateModalBalance();
}

function updateModalBalance() {
  if(currentUser) document.getElementById('modal-balance').textContent=fmt(currentUser.cashBalance);
}

document.getElementById('trade-amount').addEventListener('input', function() {
  const usd=parseFloat(this.value)||0;
  const qty=tradeState.price>0? usd/tradeState.price : 0;
  document.getElementById('modal-estimate').textContent=fmtQty(qty)+' '+tradeState.coin;
});

async function executeTrade() {
  const amount=parseFloat(document.getElementById('trade-amount').value);
  if(!amount||amount<=0) return toast('Enter a valid amount','error');
  try {
    const r=await fetch(`${API}/trade/execute`,{method:'POST',headers:authHeaders(),body:JSON.stringify({type:tradeState.type,symbol:tradeState.symbol,coin:tradeState.coin,quantityInUSD:amount})});
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
  if(!holdings.length) { el.innerHTML='<div class="empty-state"><div class="empty-state-icon">💰</div><div class="empty-state-text">No holdings yet. Start trading!</div></div>'; return; }
  el.innerHTML=holdings.map(h=>{
    const color=COIN_COLORS[h.coin]||'#6366f1';
    const up=h.pnl>=0;
    return `<div class="holding-card">
      <div class="holding-left">
        <div class="coin-icon" style="background:${color}">${h.coin.slice(0,2)}</div>
        <div><div class="coin-name">${h.coin}</div><div class="coin-symbol">${fmtQty(h.quantity)} coins</div></div>
      </div>
      <div class="holding-right">
        <div class="holding-value">${fmt(h.currentValue)}</div>
        <div class="holding-pnl ${up?'positive':'negative'}">${up?'+':''}${fmt(h.pnl)} (${h.pnlPercent}%)</div>
      </div>
    </div>`;
  }).join('');
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

// ==================== INIT ====================
if(token && currentUser) { enterApp(); }
