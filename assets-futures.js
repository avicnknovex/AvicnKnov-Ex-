/* ==========================================================
   assets-futures.js – ONLY for Futures Tab in assets.html
   30-day live graphs, market cap, price percentage, buy/sell system
   ========================================================== */
(function(){
'use strict';

/* ---------- CONFIG ---------- */
const SUPA_URL = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

const MODE = 'local';
const MIN_INR = 100;
const PRICE_REFRESH_MS = 30000;
const HOLD_KEY = 'AVX_futures_holdings';

/* ---------- TOKENS (50+ tokens) ---------- */
const FUTURES_TOKENS = [
  ['BTC','Bitcoin','bitcoin'],
  ['ETH','Ethereum','ethereum'],
  ['BNB','BNB','binancecoin'],
  ['SOL','Solana','solana'],
  ['XRP','XRP','ripple'],
  ['ADA','Cardano','cardano'],
  ['DOGE','Dogecoin','dogecoin'],
  ['MATIC','Polygon','matic-network'],
  ['DOT','Polkadot','polkadot'],
  ['LTC','Litecoin','litecoin'],
  ['TRX','TRON','tron'],
  ['AVAX','Avalanche','avalanche-2'],
  ['SHIB','Shiba Inu','shiba-inu'],
  ['ATOM','Cosmos','cosmos'],
  ['XLM','Stellar','stellar'],
  ['LINK','Chainlink','chainlink'],
  ['UNI','Uniswap','uniswap'],
  ['ETC','Ethereum Classic','ethereum-classic'],
  ['FIL','Filecoin','filecoin'],
  ['APT','Aptos','aptos'],
  ['NEAR','NEAR Protocol','near'],
  ['ICP','Internet Computer','internet-computer'],
  ['SAND','The Sandbox','the-sandbox'],
  ['AAVE','Aave','aave'],
  ['AXS','Axie Infinity','axie-infinity'],
  ['QNT','Quant','quant-network'],
  ['EGLD','MultiversX','elrond-erd-2'],
  ['MKR','Maker','maker'],
  ['RUNE','THORChain','thorchain'],
  ['ALGO','Algorand','algorand'],
  ['FTM','Fantom','fantom'],
  ['CRV','Curve DAO','curve-dao-token'],
  ['HBAR','Hedera','hedera-hashgraph'],
  ['VET','VeChain','vechain'],
  ['GRT','The Graph','the-graph'],
  ['FLOW','Flow','flow'],
  ['SNX','Synthetix','synthetix-network-token'],
  ['DYDX','dYdX','dydx'],
  ['ZEC','Zcash','zcash'],
  ['BAT','Basic Attention Token','basic-attention-token'],
  ['1INCH','1inch','1inch'],
  ['COMP','Compound','compound-governance-token'],
  ['ENS','ENS','ethereum-name-service'],
  ['KAVA','Kava','kava'],
  ['ZIL','Zilliqa','zilliqa'],
  ['CELO','Celo','celo'],
  ['OMG','OMG Network','omisego'],
  ['ANKR','Ankr','ankr'],
  ['STX','Stacks','blockstack'],
  ['WAVES','Waves','waves'],
  ['CHZ','Chiliz','chiliz']
];

const FUTURES_CG_ID_MAP = {};
FUTURES_TOKENS.forEach(([s,_,id]) => FUTURES_CG_ID_MAP[s] = id);

/* ---------- SUPABASE CLIENT ---------- */
const supaLib = window.supabase || (window.parent && window.parent.supabase);
if(!supaLib){ console.error('Supabase lib not found.'); return; }
const supa = supaLib.createClient(SUPA_URL, SUPA_KEY);

/* ---------- PRICE & DATA CACHE ---------- */
let futuresLivePrices = {}; // {SYM: price}
let futuresMarketCaps = {}; // {SYM: market_cap}
let futuresPriceChanges = {}; // {SYM: price_change_percentage_24h}
let futuresChartData = {}; // {SYM: [price_array]}

/* ---------- UTILS ---------- */
const fmtINR = v => '₹' + Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
const fmtMarketCap = v => {
  const num = Number(v||0);
  if(num >= 1e12) return '₹' + (num/1e12).toFixed(2) + 'T';
  if(num >= 1e9) return '₹' + (num/1e9).toFixed(2) + 'B';
  if(num >= 1e6) return '₹' + (num/1e6).toFixed(2) + 'M';
  if(num >= 1e3) return '₹' + (num/1e3).toFixed(2) + 'K';
  return '₹' + num.toFixed(2);
};

function futuresResize(msg, ok=true){
  let t = document.getElementById('futures-toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'futures-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = ok ? 'ok' : 'err';
  t.style.opacity = '1';
  setTimeout(() => t.style.opacity = '0', 3000);
}

/* ---------- HOLDINGS FUNCTIONS ---------- */
function futuresLocalGetHoldings(){
  try{ return JSON.parse(localStorage.getItem(HOLD_KEY)) || {}; }
  catch(e){ return {}; }
}

function futuresLocalSetHoldings(obj){
  localStorage.setItem(HOLD_KEY, JSON.stringify(obj));
}

async function futuresGetHoldingsMap(){
  return MODE === 'supa' ? await futuresSupaGetHoldingsMap() : futuresLocalGetHoldings();
}

async function futuresUpdateHolding(symbol, qty, cost_inr){
  symbol = symbol.toUpperCase();
  if(MODE === 'supa'){
    await futuresSupaUpsertHolding(symbol, qty, cost_inr);
  } else {
    const h = futuresLocalGetHoldings();
    if(qty <= 0) delete h[symbol];
    else h[symbol] = {qty, cost_inr};
    futuresLocalSetHoldings(h);
  }
}

async function futuresGetHolding(symbol){
  symbol = symbol.toUpperCase();
  const map = await futuresGetHoldingsMap();
  const r = map[symbol];
  if(!r) return {qty:0, cost_inr:0};
  return {qty: Number(r.qty||0), cost_inr: Number(r.cost_inr||0)};
}

/* ---------- WALLET FUNCTIONS ---------- */
async function futuresGetUser(){
  const {data:{user}} = await supa.auth.getUser();
  return user;
}

async function futuresGetWalletINR(){
  const u = await futuresGetUser(); 
  if(!u) return 0;
  const {data,error} = await supa.from('user_wallets').select('balance').eq('uid',u.id).single();
  if(error){ console.error('wallet fetch error',error); return 0; }
  return Number(data?.balance||0);
}

async function futuresSetWalletINR(newBal){
  const u = await futuresGetUser(); 
  if(!u) return;
  const {error} = await supa.from('user_wallets').update({balance:newBal}).eq('uid',u.id);
  if(error) console.error('wallet update error',error);
  if(typeof window.updateWalletBalance === 'function'){ window.updateWalletBalance(); }
}

/* ---------- SAVE TRADE ---------- */
async function futuresSaveTrade(action, symbol, qty, amount_inr, price_inr){
  try{
    const {data:{user}} = await supa.auth.getUser();
    if(!user) return;
    const {error} = await supa.from('user_trades').insert([{
      user_id: user.id,
      action,
      symbol,
      qty,
      price_inr,
      amount_inr,
      created_at: new Date().toISOString()
    }]);
    if(error) console.error('trade save error', error);
  }catch(e){
    console.error('saveTrade fail', e);
  }
}

/* ---------- LIVE DATA REFRESH ---------- */
async function futuresRefreshPricesAndData(){
  try{
    const ids = FUTURES_TOKENS.map(t => t[2]).join(',');
    
    // Fetch current prices with market cap and 24h change
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=inr&include_market_cap=true&include_24hr_change=true`);
    const priceData = await priceRes.json();
    
    FUTURES_TOKENS.forEach(([sym, _, id]) => {
      const tokenData = priceData[id];
      if(tokenData){
        futuresLivePrices[sym] = Number(tokenData.inr || 0);
        futuresMarketCaps[sym] = Number(tokenData.inr_market_cap || 0);
        futuresPriceChanges[sym] = Number(tokenData.inr_24h_change || 0);
        
        futuresUpdateTokenUI(sym);
      }
    });
    
    console.log('Futures prices updated');
  }catch(e){
    console.error('Futures data fetch failed:', e);
  }
}

/* ---------- 30-DAY CHART DATA ---------- */
async function futuresFetch30DayChart(symbol){
  try{
    const coinId = FUTURES_CG_ID_MAP[symbol];
    if(!coinId) return [];
    
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=inr&days=30`);
    const data = await res.json();
    
    if(data.prices){
      futuresChartData[symbol] = data.prices.map(([timestamp, price]) => ({
        time: timestamp,
        price: price
      }));
      return futuresChartData[symbol];
    }
    return [];
  }catch(e){
    console.error(`Futures chart fetch failed for ${symbol}:`, e);
    return [];
  }
}

/* ---------- UPDATE TOKEN UI ---------- */
function futuresUpdateTokenUI(sym){
  const priceEl = document.getElementById(`futures-price-${sym}`);
  const mcapEl = document.getElementById(`futures-mcap-${sym}`);
  const changeEl = document.getElementById(`futures-change-${sym}`);
  
  if(priceEl) priceEl.textContent = fmtINR(futuresLivePrices[sym] || 0);
  if(mcapEl) mcapEl.textContent = fmtMarketCap(futuresMarketCaps[sym] || 0);
  
  if(changeEl){
    const change = futuresPriceChanges[sym] || 0;
    changeEl.innerHTML = `
      <div class="futures-change-box ${change >= 0 ? 'positive' : 'negative'}">
        ${change >= 0 ? '+' : ''}${change.toFixed(2)}%
      </div>
    `;
  }
}

/* ---------- RENDER TOKEN LIST (ONLY FOR FUTURES TAB) ---------- */
function renderFuturesList(){
  // ✅ SPECIFIC CONTAINER FOR FUTURES TAB ONLY
  const container = document.getElementById('futures');
  if(!container) return;
  
  container.innerHTML = `
    <div class="futures-header">
      <h2>🚀 Futures Trading</h2>
      <p>Advanced futures trading with 30-day charts, market caps & live data</p>
    </div>
    
    <div class="futures-token-grid">
      ${FUTURES_TOKENS.map(([sym, name]) => `
        <div class="futures-token-card" id="futures-card-${sym}">
          <div class="futures-token-info" onclick="AVX_showFuturesTokenDetail('${sym}')">
            <div class="futures-token-header">
              <div class="futures-token-symbol">${sym}</div>
              <div class="futures-token-name">${name}</div>
            </div>
            
            <div class="futures-token-price" id="futures-price-${sym}">₹--</div>
            
            <div class="futures-token-stats">
              <div class="futures-market-cap">
                <span class="futures-label">Market Cap:</span>
                <span id="futures-mcap-${sym}">--</span>
              </div>
              
              <div class="futures-price-change" id="futures-change-${sym}">
                <div class="futures-change-box neutral">0.00%</div>
              </div>
            </div>
          </div>
          
          <div class="futures-token-actions">
            <button class="futures-buy-btn" onclick="AVX_futuresBuyToken('${sym}')">Buy</button>
            <button class="futures-sell-btn" onclick="AVX_futuresSellToken('${sym}')">Sell</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  futuresAddStyles();
}

/* ---------- TOKEN DETAIL MODAL (30-DAY CHART) ---------- */
async function showFuturesTokenDetail(symbol){
  const price = futuresLivePrices[symbol] || 0;
  const mcap = futuresMarketCaps[symbol] || 0;
  const change = futuresPriceChanges[symbol] || 0;
  
  futuresResize(`📊 Loading 30-day chart for ${symbol}...`, true);
  
  const chartPoints = await futuresFetch30DayChart(symbol);
  
  const modal = document.createElement('div');
  modal.id = 'futures-token-detail-modal';
  modal.innerHTML = `
    <div class="futures-modal-overlay"></div>
    <div class="futures-modal-content">
      <div class="futures-modal-header">
        <h3>${symbol} - ${FUTURES_TOKENS.find(t => t[0] === symbol)?.[1] || 'Token'}</h3>
        <button class="futures-close-btn" onclick="closeFuturesTokenDetail()">×</button>
      </div>
      
      <div class="futures-token-detail-info">
        <div class="futures-detail-row">
          <span>Current Price:</span>
          <span class="futures-highlight">${fmtINR(price)}</span>
        </div>
        <div class="futures-detail-row">
          <span>Market Cap:</span>
          <span class="futures-highlight">${fmtMarketCap(mcap)}</span>
        </div>
        <div class="futures-detail-row">
          <span>24h Change:</span>
          <span class="futures-highlight ${change >= 0 ? 'positive' : 'negative'}">
            ${change >= 0 ? '+' : ''}${change.toFixed(2)}%
          </span>
        </div>
      </div>
      
      <div class="futures-chart-container">
        <h4>📈 30-Day Price Chart</h4>
        <canvas id="futures-price-chart" width="460" height="200"></canvas>
        <div class="futures-chart-info">Last 30 days price movement</div>
      </div>
      
      <div class="futures-modal-actions">
        <button class="futures-buy-btn-modal" onclick="closeFuturesTokenDetail(); AVX_futuresBuyToken('${symbol}')">
          💰 Buy ${symbol}
        </button>
        <button class="futures-sell-btn-modal" onclick="closeFuturesTokenDetail(); AVX_futuresSellToken('${symbol}')">
          💸 Sell ${symbol}
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'flex';
  
  // Draw 30-day chart
  setTimeout(() => futuresDrawChart(chartPoints), 100);
}

/* ---------- DRAW 30-DAY CHART ---------- */
function futuresDrawChart(dataPoints){
  const canvas = document.getElementById('futures-price-chart');
  if(!canvas || !dataPoints.length) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Find min/max prices
  const prices = dataPoints.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;
  
  // Draw background
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(0, 0, width, height);
  
  // Draw grid lines
  ctx.strokeStyle = '#e9ecef';
  ctx.lineWidth = 1;
  for(let i = 0; i <= 5; i++){
    const y = (height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  
  // Draw price line
  ctx.strokeStyle = '#4f46e5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  
  dataPoints.forEach((point, index) => {
    const x = (width / (dataPoints.length - 1)) * index;
    const y = height - ((point.price - minPrice) / priceRange) * height;
    
    if(index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  
  ctx.stroke();
  
  // Draw price points
  ctx.fillStyle = '#4f46e5';
  dataPoints.forEach((point, index) => {
    if(index % Math.floor(dataPoints.length / 10) === 0){
      const x = (width / (dataPoints.length - 1)) * index;
      const y = height - ((point.price - minPrice) / priceRange) * height;
      
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
  
  // Price labels
  ctx.fillStyle = '#333';
  ctx.font = '12px Arial';
  ctx.fillText(fmtINR(maxPrice), 10, 15);
  ctx.fillText(fmtINR(minPrice), 10, height - 5);
}

function closeFuturesTokenDetail(){
  const modal = document.getElementById('futures-token-detail-modal');
  if(modal) modal.remove();
}

/* ---------- TRADE MODALS ---------- */
function buildFuturesTradeModal(){
  const modal = document.createElement('div');
  modal.id = 'futures-trade-modal';
  modal.innerHTML = `
    <div class="futures-modal-overlay"></div>
    <div class="futures-trade-modal-content">
      <div class="futures-trade-header">
        <span id="futures-trade-title">Trade</span>
        <button onclick="closeFuturesTradeModal()">×</button>
      </div>
      
      <div class="futures-trade-info">
        <div id="futures-wallet-balance">Balance: ₹--</div>
        <div id="futures-token-holding">Holdings: --</div>
        <div id="futures-live-price">Price: ₹--</div>
      </div>
      
      <div class="futures-trade-inputs">
        <label>INR Amount</label>
        <div class="futures-input-group">
          <input type="number" id="futures-inr-amount" placeholder="Enter INR amount" />
          <button id="futures-max-inr" class="futures-max-btn">MAX</button>
        </div>
        
        <label>Token Quantity</label>
        <div class="futures-input-group">
          <input type="number" id="futures-token-qty" placeholder="Enter quantity" />
          <button id="futures-max-qty" class="futures-max-btn">MAX</button>
        </div>
        
        <div class="futures-min-notice">Minimum: ₹${MIN_INR}</div>
      </div>
      
      <button id="futures-confirm-trade" class="futures-confirm-btn">Confirm Trade</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  setupFuturesTradeModalEvents(modal);
  return modal;
}

function setupFuturesTradeModalEvents(modal){
  const inrInput = modal.querySelector('#futures-inr-amount');
  const qtyInput = modal.querySelector('#futures-token-qty');
  
  inrInput.addEventListener('input', () => {
    const price = Number(modal.dataset.price || 0);
    if(price > 0) {
      qtyInput.value = inrInput.value ? (Number(inrInput.value) / price).toFixed(8) : '';
    }
  });
  
  qtyInput.addEventListener('input', () => {
    const price = Number(modal.dataset.price || 0);
    if(price > 0) {
      inrInput.value = qtyInput.value ? (Number(qtyInput.value) * price).toFixed(2) : '';
    }
  });
  
  modal.querySelector('#futures-max-inr').onclick = async () => {
    if(modal.dataset.mode === 'buy') {
      const balance = await futuresGetWalletINR();
      inrInput.value = balance.toFixed(2);
      inrInput.dispatchEvent(new Event('input'));
    }
  };
  
  modal.querySelector('#futures-max-qty').onclick = async () => {
    if(modal.dataset.mode === 'sell') {
      const symbol = modal.dataset.symbol;
      const holding = await futuresGetHolding(symbol);
      qtyInput.value = holding.qty;
      qtyInput.dispatchEvent(new Event('input'));
    }
  };
  
  modal.querySelector('#futures-confirm-trade').onclick = confirmFuturesTrade;
}

async function showFuturesTradeModal(mode, symbol){
  const price = futuresLivePrices[symbol] || 0;
  const balance = await futuresGetWalletINR();
  const holding = await futuresGetHolding(symbol);
  
  const modal = document.getElementById('futures-trade-modal') || buildFuturesTradeModal();
  modal.dataset.mode = mode;
  modal.dataset.symbol = symbol;
  modal.dataset.price = price;
  
  const title = modal.querySelector('#futures-trade-title');
  const confirmBtn = modal.querySelector('#futures-confirm-trade');
  
  if(mode === 'buy') {
    title.textContent = `Buy ${symbol}`;
    confirmBtn.textContent = `Buy ${symbol}`;
    confirmBtn.className = 'futures-confirm-btn buy-mode';
  } else {
    title.textContent = `Sell ${symbol}`;
    confirmBtn.textContent = `Sell ${symbol}`;
    confirmBtn.className = 'futures-confirm-btn sell-mode';
  }
  
  modal.querySelector('#futures-wallet-balance').textContent = `Balance: ${fmtINR(balance)}`;
  modal.querySelector('#futures-token-holding').textContent = `Holdings: ${holding.qty.toFixed(8)} ${symbol}`;
  modal.querySelector('#futures-live-price').textContent = `Price: ${fmtINR(price)}`;
  
  modal.querySelector('#futures-inr-amount').value = '';
  modal.querySelector('#futures-token-qty').value = '';
  
  modal.style.display = 'flex';
}

function closeFuturesTradeModal(){
  const modal = document.getElementById('futures-trade-modal');
  if(modal) modal.style.display = 'none';
}

/* ---------- CONFIRM TRADE ---------- */
async function confirmFuturesTrade(){
  const modal = document.getElementById('futures-trade-modal');
  if(!modal) return;
  
  const mode = modal.dataset.mode;
  const symbol = modal.dataset.symbol;
  const price = Number(modal.dataset.price || 0);
  const inrAmount = Number(modal.querySelector('#futures-inr-amount').value || 0);
  const tokenQty = Number(modal.querySelector('#futures-token-qty').value || 0);
  
  if(price <= 0) {
    futuresResize('❌ Price data unavailable', false);
    return;
  }
  
  if(mode === 'buy') {
    if(inrAmount < MIN_INR) {
      futuresResize(`❌ Minimum ₹${MIN_INR} required`, false);
      return;
    }
    
    const balance = await futuresGetWalletINR();
    if(inrAmount > balance) {
      futuresResize('❌ Insufficient balance', false);
      return;
    }
    
    const buyQty = inrAmount / price;
    const currentHolding = await futuresGetHolding(symbol);
    
    await futuresSetWalletINR(balance - inrAmount);
    await futuresUpdateHolding(symbol, currentHolding.qty + buyQty, currentHolding.cost_inr + inrAmount);
    await futuresSaveTrade('buy', symbol, buyQty, inrAmount, price);
    
    futuresResize(`✅ Bought ${buyQty.toFixed(8)} ${symbol} for ${fmtINR(inrAmount)}`, true);
    
  } else { // sell
    const holding = await futuresGetHolding(symbol);
    if(tokenQty > holding.qty) {
      futuresResize('❌ Insufficient holdings', false);
      return;
    }
    
    const sellValue = tokenQty * price;
    const balance = await futuresGetWalletINR();
    
    await futuresSetWalletINR(balance + sellValue);
    await futuresUpdateHolding(symbol, holding.qty - tokenQty, Math.max(0, holding.cost_inr - sellValue));
    await futuresSaveTrade('sell', symbol, tokenQty, sellValue, price);
    
    futuresResize(`✅ Sold ${tokenQty.toFixed(8)} ${symbol} for ${fmtINR(sellValue)}`, true);
  }
  
  closeFuturesTradeModal();
}

/* ---------- GLOBAL FUNCTIONS (FUTURES-SPECIFIC) ---------- */
window.AVX_showFuturesTokenDetail = showFuturesTokenDetail;
window.AVX_futuresBuyToken = (symbol) => showFuturesTradeModal('buy', symbol);
window.AVX_futuresSellToken = (symbol) => showFuturesTradeModal('sell', symbol);
window.closeFuturesTokenDetail = closeFuturesTokenDetail;
window.closeFuturesTradeModal = closeFuturesTradeModal;

/* ---------- CSS STYLES (FUTURES-SPECIFIC) ---------- */
function futuresAddStyles(){
  if(document.getElementById('futures-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'futures-styles';
  style.textContent = `
    /* FUTURES TOAST NOTIFICATIONS */
    #futures-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-weight: bold;
      transition: opacity 0.3s;
      opacity: 0;
      max-width: 300px;
    }
    #futures-toast.ok { background: #22c55e; }
    #futures-toast.err { background: #ef4444; }
    
    /* FUTURES MAIN CONTAINER */
    .futures-header {
      text-align: center;
      margin-bottom: 30px;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 15px;
    }
    .futures-header h2 {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 700;
    }
    .futures-header p {
      margin: 0;
      opacity: 0.9;
      font-size: 16px;
    }
    
    /* FUTURES TOKEN GRID */
    .futures-token-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
      padding: 20px 0;
    }
    
    /* FUTURES TOKEN CARDS */
    .futures-token-card {
      background: white;
      border-radius: 15px;
      padding: 20px;
      box-shadow: 0 8px 25px rgba(0,0,0,0.1);
      border: 1px solid #f0f0f0;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }
    .futures-token-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
      transition: left 0.5s;
    }
    .futures-token-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 15px 35px rgba(0,0,0,0.15);
    }
    .futures-token-card:hover::before {
      left: 100%;
    }
    
    .futures-token-info {
      cursor: pointer;
      margin-bottom: 15px;
    }
    
    .futures-token-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    
    .futures-token-symbol {
      font-size: 20px;
      font-weight: 700;
      color: #333;
    }
    
    .futures-token-name {
      font-size: 12px;
      color: #666;
      text-align: right;
    }
    
    .futures-token-price {
      font-size: 24px;
      font-weight: 700;
      color: #4f46e5;
      margin-bottom: 15px;
    }
    
    .futures-token-stats {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    
    .futures-market-cap {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .futures-market-cap .futures-label {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .futures-price-change {
      display: flex;
      align-items: center;
    }
    
    .futures-change-box {
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      min-width: 60px;
      text-align: center;
    }
    .futures-change-box.positive {
      background: #dcfce7;
      color: #16a34a;
    }
    .futures-change-box.negative {
      background: #fef2f2;
      color: #dc2626;
    }
    .futures-change-box.neutral {
      background: #f3f4f6;
      color: #6b7280;
    }
    
    .futures-token-actions {
      display: flex;
      gap: 10px;
    }
    
    .futures-buy-btn, .futures-sell-btn {
      flex: 1;
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .futures-buy-btn {
      background: #22c55e;
      color: white;
    }
    .futures-buy-btn:hover {
      background: #16a34a;
      transform: translateY(-1px);
    }
    
    .futures-sell-btn {
      background: #ef4444;
      color: white;
    }
    .futures-sell-btn:hover {
      background: #dc2626;
      transform: translateY(-1px);
    }
    
    /* FUTURES TOKEN DETAIL MODAL */
    #futures-token-detail-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    }
    
    .futures-modal-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
    }
    
    .futures-modal-content {
      background: white;
      border-radius: 20px;
      padding: 30px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
      z-index: 2;
    }
    
    .futures-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .futures-modal-header h3 {
      margin: 0;
      font-size: 24px;
      color: #333;
    }
    
    .futures-close-btn {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #999;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .futures-token-detail-info {
      margin-bottom: 25px;
    }
    
    .futures-detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    
    .futures-detail-row:last-child {
      border-bottom: none;
    }
    
    .futures-highlight {
      font-weight: 600;
      font-size: 16px;
    }
    .futures-highlight.positive { color: #16a34a; }
    .futures-highlight.negative { color: #dc2626; }
    
    .futures-chart-container {
      margin-bottom: 25px;
    }
    
    .futures-chart-container h4 {
      margin: 0 0 15px 0;
      color: #333;
    }
    
    #futures-price-chart {
      width: 100%;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
    }
    
    .futures-chart-info {
      text-align: center;
      font-size: 12px;
      color: #666;
      margin-top: 8px;
    }
    
    .futures-modal-actions {
      display: flex;
      gap: 15px;
    }
    
    .futures-buy-btn-modal, .futures-sell-btn-modal {
      flex: 1;
      padding: 12px 20px;
      border: none;
      border-radius: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .futures-buy-btn-modal {
      background: #22c55e;
      color: white;
    }
    .futures-buy-btn-modal:hover {
      background: #16a34a;
      transform: translateY(-2px);
    }
    
    .futures-sell-btn-modal {
      background: #ef4444;
      color: white;
    }
    .futures-sell-btn-modal:hover {
      background: #dc2626;
      transform: translateY(-2px);
    }
    
    /* FUTURES TRADE MODAL */
    #futures-trade-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 10001;
    }
    
    .futures-trade-modal-content {
      background: white;
      border-radius: 20px;
      padding: 30px;
      max-width: 400px;
      width: 90%;
      position: relative;
    }
    
    .futures-trade-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .futures-trade-header span {
      font-size: 20px;
      font-weight: 600;
      color: #333;
    }
    
    .futures-trade-header button {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #999;
    }
    
    .futures-trade-info {
      margin-bottom: 20px;
    }
    
    .futures-trade-info div {
      padding: 8px 0;
      color: #666;
      font-size: 14px;
    }
    
    .futures-trade-inputs {
      margin-bottom: 20px;
    }
    
    .futures-trade-inputs label {
      display: block;
      margin: 15px 0 8px 0;
      font-weight: 600;
      color: #333;
    }
    
    .futures-input-group {
      display: flex;
      gap: 10px;
    }
    
    .futures-input-group input {
      flex: 1;
      padding: 12px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
    }
    
    .futures-input-group input:focus {
      outline: none;
      border-color: #4f46e5;
    }
    
    .futures-max-btn {
      padding: 12px 16px;
      background: #4f46e5;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    
    .futures-min-notice {
      font-size: 12px;
      color: #666;
      margin-top: 8px;
    }
    
    .futures-confirm-btn {
      width: 100%;
      padding: 15px;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .futures-confirm-btn.buy-mode {
      background: #22c55e;
      color: white;
    }
    .futures-confirm-btn.buy-mode:hover {
      background: #16a34a;
      transform: translateY(-2px);
    }
    
    .futures-confirm-btn.sell-mode {
      background: #ef4444;
      color: white;
    }
    .futures-confirm-btn.sell-mode:hover {
      background: #dc2626;
      transform: translateY(-2px);
    }
    
    /* RESPONSIVE DESIGN */
    @media (max-width: 768px) {
      .futures-token-grid {
        grid-template-columns: 1fr;
        gap: 15px;
      }
      
      .futures-modal-content,
      .futures-trade-modal-content {
        width: 95%;
        padding: 20px;
      }
      
      .futures-modal-actions {
        flex-direction: column;
        gap: 10px;
      }
    }
  `;
  
  document.head.appendChild(style);
}

/* ---------- INITIALIZE FUTURES MODULE ---------- */
function initFuturesModule(){
  // Only initialize if we're on assets.html and futures tab exists
  if(document.getElementById('futures')){
    renderFuturesList();
    futuresRefreshPricesAndData();
    
    // Set up price refresh interval
    setInterval(futuresRefreshPricesAndData, PRICE_REFRESH_MS);
    
    console.log('✅ Futures module initialized');
  }
}

// Initialize when DOM is ready
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initFuturesModule);
} else {
  initFuturesModule();
}

})();