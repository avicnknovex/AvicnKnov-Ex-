/* ==========================================================
   trade-margin.js – Trading with Market Cap & 24h Changes
   ========================================================== */
(function(){

  /* ---------- CONFIG ---------- */
  const SUPA_URL  = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
  const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

  const MODE = 'local';
  const MIN_INR = 100;
  const PRICE_REFRESH_MS = 15000;
  const HOLD_KEY = 'AVX_margin_holdings';

  /* ---------- TOKENS ---------- */
  const MARGIN_TOKENS = [
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
    ['AVAX','Avalanche','avalanche-2'],
    ['SHIB','Shiba Inu','shiba-inu'],
    ['ATOM','Cosmos','cosmos'],
    ['LINK','Chainlink','chainlink'],
    ['UNI','Uniswap','uniswap'],
    ['NEAR','NEAR Protocol','near'],
    ['APT','Aptos','aptos'],
    ['SAND','The Sandbox','the-sandbox'],
    ['AAVE','Aave','aave'],
    ['MKR','Maker','maker'],
    ['ALGO','Algorand','algorand'],
    ['FTM','Fantom','fantom'],
    ['VET','VeChain','vechain'],
    ['FLOW','Flow','flow'],
    ['COMP','Compound','compound-governance-token'],
    ['ENS','ENS','ethereum-name-service'],
    ['KAVA','Kava','kava'],
    ['CELO','Celo','celo'],
    ['STX','Stacks','blockstack'],
    ['WAVES','Waves','waves']
  ];

  const CG_ID_MAP = {};
  MARGIN_TOKENS.forEach(([s,_,id])=>{ CG_ID_MAP[s]=id; });

  /* ---------- SUPABASE CLIENT ---------- */
  const supaLib = window.supabase || (window.parent && window.parent.supabase);
  if(!supaLib){ console.error("Supabase lib not found."); return; }
  const supa = supaLib.createClient(SUPA_URL, SUPA_KEY);

  /* ---------- DATA CACHE ---------- */
  let livePrices = {};
  let marketData = {};
  let priceHistory = {};

  /* ---------- UTILS ---------- */
  const fmtINR = v => '₹' + Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const fmtNumber = v => Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0});

  function toast(msg, ok=true){
    let t = document.getElementById('margin-toast');
    if(!t){
      t = document.createElement('div');
      t.id='margin-toast';
      t.style.cssText=`position:fixed;top:20px;right:20px;background:#333;color:white;padding:15px 25px;border-radius:15px;z-index:99999;opacity:0;transition:all 0.5s cubic-bezier(0.4, 0, 0.2, 1);box-shadow:0 15px 40px rgba(0,0,0,0.4);`;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = ok ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)';
    t.style.opacity = '1';
    setTimeout(()=>{t.style.opacity='0';},3000);
  }

  /* ---------- HOLDINGS ---------- */
  function localGetHoldings(){
    try{ return JSON.parse(localStorage.getItem(HOLD_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function localSetHoldings(obj){
    localStorage.setItem(HOLD_KEY, JSON.stringify(obj));
  }

  async function getHoldingsMap(){ return localGetHoldings(); }
  async function updateHolding(symbol,qty,cost_inr){
    symbol=symbol.toUpperCase();
    const h=localGetHoldings();
    if(qty<=0) delete h[symbol];
    else h[symbol]={qty,cost_inr};
    localSetHoldings(h);
  }
  async function getHolding(symbol){
    symbol=symbol.toUpperCase();
    const map=await getHoldingsMap();
    const r=map[symbol];
    if(!r) return {qty:0,cost_inr:0};
    return {qty:Number(r.qty||0),cost_inr:Number(r.cost_inr||0)};
  }

  /* ---------- WALLET ---------- */
  async function getUser(){
    const {data:{user}} = await supa.auth.getUser();
    return user;
  }
  async function getWalletINR(){
    const u=await getUser(); if(!u) return 0;
    const {data,error}=await supa.from('user_wallets').select('balance').eq('uid',u.id).single();
    if(error){ console.error('wallet fetch error',error); return 0; }
    return Number(data?.balance||0);
  }
  async function setWalletINR(newBal){
    const u=await getUser(); if(!u) return;
    const {error}=await supa.from('user_wallets').update({balance:newBal}).eq('uid',u.id);
    if(error) console.error('wallet update error',error);
    if(typeof window.updateWalletBalance==='function'){ window.updateWalletBalance(); }
    else if(window.parent && typeof window.parent.updateWalletBalance==='function'){ window.parent.updateWalletBalance(); }
  }

  /* ---------- ENHANCED PRICE & MARKET DATA REFRESH ---------- */
  async function refreshPricesAndMarketData(){
    try{
      const ids = MARGIN_TOKENS.map(t=>t[2]).join(',');
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&ids=${ids}&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h`);
      const data = await res.json();
      
      data.forEach(coin => {
        const token = MARGIN_TOKENS.find(([_,__,id]) => id === coin.id);
        if(!token) return;
        
        const [sym] = token;
        livePrices[sym] = Number(coin.current_price || 0);
        marketData[sym] = {
          market_cap: coin.market_cap || 0,
          price_change_24h: coin.price_change_percentage_24h || 0,
          volume_24h: coin.total_volume || 0,
          market_cap_rank: coin.market_cap_rank || 0
        };
        
        if(coin.sparkline_in_7d && coin.sparkline_in_7d.price) {
          priceHistory[sym] = coin.sparkline_in_7d.price;
        }
        
        updateDisplays(sym);
        drawChart(sym);
      });
      
    }catch(e){ console.error('Margin price/market data fetch fail',e); }
  }

  function updateDisplays(sym) {
    // Update price
    const priceEl = document.getElementById('margin-price-'+sym);
    if(priceEl) priceEl.textContent = fmtINR(livePrices[sym]);
    
    // Update market cap
    const capEl = document.getElementById('margin-cap-'+sym);
    if(capEl) capEl.textContent = '₹' + fmtNumber(marketData[sym]?.market_cap || 0);
    
    // Update 24h change boxes
    const change = marketData[sym]?.price_change_24h || 0;
    const gainBox = document.getElementById('margin-gain-'+sym);
    const lossBox = document.getElementById('margin-loss-'+sym);
    
    if(gainBox && lossBox) {
      if(change >= 0) {
        gainBox.textContent = '+' + change.toFixed(2) + '%';
        gainBox.style.display = 'block';
        lossBox.style.display = 'none';
      } else {
        lossBox.textContent = change.toFixed(2) + '%';
        lossBox.style.display = 'block';
        gainBox.style.display = 'none';
      }
    }
  }

  /* ---------- SAVE TRADE ---------- */
  async function saveTrade(action,symbol,qty,amount_inr,price_inr){
    try{
      const {data:{user}} = await supa.auth.getUser();
      if(!user) return;
      const {error} = await supa.from('user_trades').insert({
        user_id:user.id,
        action,
        symbol,
        qty,
        price_inr,
        amount_inr
      });
      if(error){ console.error('Margin trade insert error',error); }
    }catch(e){
      console.error('Margin saveTrade fail',e);
    }
  }

  /* ---------- CHART DRAWING ---------- */
  function drawChart(symbol) {
    const canvas = document.getElementById(`margin-chart-${symbol}`);
    if(!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const data = priceHistory[symbol] || generateSampleData();
    if(!data || data.length === 0) return;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(236, 72, 153, 0.1)');
    gradient.addColorStop(1, 'rgba(236, 72, 153, 0.01)');

    ctx.beginPath();
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 2.5;

    data.forEach((price, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((price - min) / range) * height;
      
      if(index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Fill area
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function generateSampleData() {
    const data = [];
    let price = 1000 + Math.random() * 5000;
    for(let i = 0; i < 30; i++) {
      price += (Math.random() - 0.5) * price * 0.05;
      data.push(price);
    }
    return data;
  }

  /* ---------- RENDER INTERFACE ---------- */
  function renderMarginInterface(){
    const c = document.getElementById('margin');
    if(!c) return;

    c.innerHTML = `
      <div class="margin-hero">
        <div class="margin-hero-bg"></div>
        <div class="margin-hero-content">
          <h1 class="margin-title">📊 Margin Trading</h1>
          <p class="margin-subtitle">Advanced Trading with Market Data</p>
          <div class="margin-stats">
            <div class="margin-stat">
              <span class="stat-value">${MARGIN_TOKENS.length}</span>
              <span class="stat-label">Tokens</span>
            </div>
            <div class="margin-stat">
              <span class="stat-value">💰</span>
              <span class="stat-label">Market Cap</span>
            </div>
            <div class="margin-stat">
              <span class="stat-value">📈</span>
              <span class="stat-label">24h Changes</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="margin-tokens-grid" id="margin-tokens-grid"></div>
    `;

    renderTokensGrid();
    addMarginStyles();
  }

  function renderTokensGrid() {
    const container = document.getElementById('margin-tokens-grid');
    if(!container) return;

    container.innerHTML = MARGIN_TOKENS.map(([sym, name]) => `
      <div class="margin-token-card">
        <div class="token-header">
          <div class="token-info">
            <div class="token-symbol">${sym}</div>
            <div class="token-name">${name}</div>
          </div>
          <div class="token-price" id="margin-price-${sym}">₹--</div>
        </div>
        
        <div class="market-cap-display">
          <span class="market-cap-label">Market Cap:</span>
          <span class="market-cap-value" id="margin-cap-${sym}">₹--</span>
        </div>
        
        <div class="token-chart-container">
          <canvas id="margin-chart-${sym}" width="280" height="100"></canvas>
        </div>
        
        <div class="price-change-boxes">
          <div class="price-change-box gain" id="margin-gain-${sym}" style="display:none;">
            +0.00%
          </div>
          <div class="price-change-box loss" id="margin-loss-${sym}" style="display:none;">
            -0.00%
          </div>
        </div>
        
        <div class="token-actions">
          <button class="margin-buy-btn" onclick="MARGIN_buyToken('${sym}')">
            <span>📈</span> Buy
          </button>
          <button class="margin-sell-btn" onclick="MARGIN_sellToken('${sym}')">
            <span>📉</span> Sell
          </button>
        </div>
      </div>
    `).join('');

    // Initialize charts
    setTimeout(() => {
      MARGIN_TOKENS.forEach(([sym]) => {
        drawChart(sym);
      });
    }, 100);
  }

  /* ---------- TRADING FUNCTIONS ---------- */
  async function MARGIN_buyToken(symbol) { await showTradeModal('buy', symbol); }
  async function MARGIN_sellToken(symbol) { await showTradeModal('sell', symbol); }

  async function showTradeModal(action, symbol) {
    const price = livePrices[symbol] || 0;
    if(price <= 0) {
      toast('Price not available', false);
      return;
    }

    const balance = await getWalletINR();
    const holding = await getHolding(symbol);
    const marketCap = marketData[symbol]?.market_cap || 0;
    const change24h = marketData[symbol]?.price_change_24h || 0;

    const modal = document.createElement('div');
    modal.className = 'margin-trade-modal';
    modal.innerHTML = `
      <div class="margin-trade-container">
        <div class="margin-trade-header ${action}">
          <h3>${action === 'buy' ? '📈 Buy' : '📉 Sell'} ${symbol}</h3>
          <button onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="margin-trade-body">
          <div class="margin-trade-info">
            <div class="info-item">
              <span class="label">Balance:</span>
              <span class="value">${fmtINR(balance)}</span>
            </div>
            <div class="info-item">
              <span class="label">Holdings:</span>
              <span class="value">${holding.qty} ${symbol}</span>
            </div>
            <div class="info-item">
              <span class="label">Live Price:</span>
              <span class="value">${fmtINR(price)}</span>
            </div>
            <div class="info-item">
              <span class="label">Market Cap:</span>
              <span class="value">₹${fmtNumber(marketCap)}</span>
            </div>
            <div class="info-item">
              <span class="label">24h Change:</span>
              <span class="value ${change24h >= 0 ? 'positive' : 'negative'}">${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%</span>
            </div>
          </div>
          
          <div class="input-group">
            <label>INR Amount</label>
            <input type="number" class="margin-input" id="margin-amount" placeholder="Enter amount" />
          </div>
          
          <div class="input-group">
            <label>Quantity</label>
            <input type="number" class="margin-input" id="margin-qty" placeholder="Enter quantity" />
          </div>
          
          <button class="margin-confirm-btn ${action}" onclick="MARGIN_confirmTrade('${action}', '${symbol}', ${price})">
            ${action === 'buy' ? 'Buy Now' : 'Sell Now'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Auto-calculate
    const amountInput = document.getElementById('margin-amount');
    const qtyInput = document.getElementById('margin-qty');

    amountInput.addEventListener('input', () => {
      if(amountInput.value && price > 0) {
        qtyInput.value = (parseFloat(amountInput.value) / price).toFixed(8);
      }
    });

    qtyInput.addEventListener('input', () => {
      if(qtyInput.value && price > 0) {
        amountInput.value = (parseFloat(qtyInput.value) * price).toFixed(2);
      }
    });
  }

  async function MARGIN_confirmTrade(action, symbol, price) {
    const amount = parseFloat(document.getElementById('margin-amount')?.value || 0);
    const qty = parseFloat(document.getElementById('margin-qty')?.value || 0);

    if(!amount || !qty || amount < MIN_INR) {
      toast(`Minimum ${fmtINR(MIN_INR)} required`, false);
      return;
    }

    if(action === 'buy') {
      const balance = await getWalletINR();
      if(amount > balance) {
        toast('Insufficient balance', false);
        return;
      }
      
      const currentHolding = await getHolding(symbol);
      await setWalletINR(balance - amount);
      await updateHolding(symbol, currentHolding.qty + qty, currentHolding.cost_inr + amount);
      await saveTrade('buy', symbol, qty, amount, price);
      
    } else {
      const holding = await getHolding(symbol);
      if(qty > holding.qty) {
        toast('Insufficient holdings', false);
        return;
      }
      
      const balance = await getWalletINR();
      await setWalletINR(balance + amount);
      await updateHolding(symbol, holding.qty - qty, Math.max(0, holding.cost_inr - amount));
      await saveTrade('sell', symbol, qty, amount, price);
    }

    document.querySelector('.margin-trade-modal')?.remove();
    toast(`Successfully ${action === 'buy' ? 'bought' : 'sold'} ${qty} ${symbol}!`, true);
  }

  /* ---------- STYLES ---------- */
  function addMarginStyles(){
    if(document.getElementById('margin-styles')) return;
    const style = document.createElement('style');
    style.id = 'margin-styles';
    style.textContent = `
      .margin-hero {
        position: relative;
        background: linear-gradient(135deg, #ec4899 0%, #be185d 100%);
        padding: 60px 20px;
        margin: -20px -20px 30px -20px;
        border-radius: 0 0 30px 30px;
        overflow: hidden;
      }
      
      .margin-hero-bg {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(%23grid)"/></svg>');
        opacity: 0.3;
      }
      
      .margin-hero-content {
        position: relative;
        text-align: center;
        color: white;
      }
      
      .margin-title {
        font-size: 2.5rem;
        font-weight: 800;
        margin: 0 0 10px 0;
        text-shadow: 0 4px 20px rgba(0,0,0,0.3);
      }
      
      .margin-subtitle {
        font-size: 1.2rem;
        opacity: 0.9;
        margin: 0 0 30px 0;
      }
      
      .margin-stats {
        display: flex;
        justify-content: center;
        gap: 40px;
        margin-top: 30px;
      }
      
      .margin-stat {
        text-align: center;
      }
      
      .stat-value {
        display: block;
        font-size: 2rem;
        font-weight: 700;
      }
      
      .stat-label {
        font-size: 0.9rem;
        opacity: 0.8;
      }
      
      .margin-tokens-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 25px;
        padding: 0 20px;
      }
      
      .margin-token-card {
        background: white;
        border-radius: 20px;
        padding: 25px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        border: 1px solid #f1f5f9;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
      }
      
      .margin-token-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, #ec4899, #be185d);
      }
      
      .margin-token-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      }
      
      .token-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
      }
      
      .token-symbol {
        font-size: 1.4rem;
        font-weight: 700;
        color: #1e293b;
      }
      
      .token-name {
        font-size: 0.9rem;
        color: #64748b;
        margin-top: 2px;
      }
      
      .token-price {
        font-size: 1.2rem;
        font-weight: 600;
        color: #059669;
        background: #ecfdf5;
        padding: 8px 12px;
        border-radius: 12px;
      }
      
      .market-cap-display {
        background: linear-gradient(135deg, #fef3c7, #fbbf24);
        padding: 12px 15px;
        border-radius: 12px;
        margin-bottom: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .market-cap-label {
        font-weight: 600;
        color: #92400e;
        font-size: 0.9rem;
      }
      
      .market-cap-value {
        font-weight: 700;
        color: #92400e;
        font-size: 1rem;
      }
      
      .token-chart-container {
        margin: 15px 0;
        background: #f8fafc;
        border-radius: 15px;
        padding: 15px;
      }
      
      .price-change-boxes {
        display: flex;
        gap: 10px;
        margin: 15px 0;
      }
      
      .price-change-box {
        flex: 1;
        padding: 12px 15px;
        border-radius: 12px;
        text-align: center;
        font-weight: 700;
        font-size: 1rem;
        transition: all 0.3s ease;
      }
      
      .price-change-box.gain {
        background: linear-gradient(135deg, #dcfce7, #16a34a);
        color: #14532d;
        box-shadow: 0 4px 15px rgba(34, 197, 94, 0.2);
      }
      
      .price-change-box.loss {
        background: linear-gradient(135deg, #fee2e2, #dc2626);
        color: #7f1d1d;
        box-shadow: 0 4px 15px rgba(239, 68, 68, 0.2);
      }
      
      .token-actions {
        display: flex;
        gap: 12px;
        margin-top: 20px;
      }
      
      .margin-buy-btn, .margin-sell-btn {
        flex: 1;
        padding: 12px 20px;
        border: none;
        border-radius: 12px;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      
      .margin-buy-btn {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
      }
      
      .margin-buy-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(16, 185, 129, 0.4);
      }
      
      .margin-sell-btn {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
      }
      
      .margin-sell-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(239, 68, 68, 0.4);
      }
      
      .margin-trade-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(10px);
      }
      
      .margin-trade-container {
        background: white;
        border-radius: 25px;
        width: 90%;
        max-width: 500px;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,0.3);
      }
      
      .margin-trade-header {
        padding: 25px 30px;
        background: linear-gradient(135deg, #ec4899, #be185d);
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .margin-trade-header.sell {
        background: linear-gradient(135deg, #ef4444, #dc2626);
      }
      
      .margin-trade-header h3 {
        margin: 0;
        font-size: 1.3rem;
        font-weight: 600;
      }
      
      .margin-trade-header button {
        background: none;
        border: none;
        color: white;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 5px;
        border-radius: 50%;
        width: 35px;
        height: 35px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .margin-trade-header button:hover {
        background: rgba(255,255,255,0.2);
      }
      
      .margin-trade-body {
        padding: 30px;
      }
      
      .margin-trade-info {
        background: #f8fafc;
        border-radius: 15px;
        padding: 20px;
        margin-bottom: 25px;
      }
      
      .info-item {
        display: flex;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      
      .info-item:last-child {
        margin-bottom: 0;
      }
      
      .info-item .label {
        color: #64748b;
        font-weight: 500;
      }
      
      .info-item .value {
        color: #1e293b;
        font-weight: 600;
      }
      
      .info-item .value.positive {
        color: #059669;
      }
      
      .info-item .value.negative {
        color: #dc2626;
      }
      
      .input-group {
        margin-bottom: 20px;
      }
      
      .input-group label {
        display: block;
        margin-bottom: 8px;
        color: #374151;
        font-weight: 600;
      }
      
      .margin-input {
        width: 100%;
        padding: 15px;
        border: 2px solid #e5e7eb;
        border-radius: 12px;
        font-size: 1rem;
        transition: all 0.3s ease;
        box-sizing: border-box;
      }
      
      .margin-input:focus {
        outline: none;
        border-color: #ec4899;
        box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.1);
      }
      
      .margin-confirm-btn {
        width: 100%;
        padding: 15px;
        border: none;
        border-radius: 12px;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        margin-top: 10px;
      }
      
      .margin-confirm-btn.buy {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
      }
      
      .margin-confirm-btn.sell {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
      }
      
      .margin-confirm-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0,0,0,0.2);
      }
      
      @media (max-width: 768px) {
        .margin-title {
          font-size: 2rem;
        }
        
        .margin-tokens-grid {
          grid-template-columns: 1fr;
          padding: 0 15px;
        }
        
        .margin-stats {
          gap: 25px;
        }
        
        .margin-trade-container {
          width: 95%;
          margin: 20px;
        }
        
        .price-change-boxes {
          flex-direction: column;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------- GLOBAL FUNCTIONS ---------- */
  window.MARGIN_buyToken = MARGIN_buyToken;
  window.MARGIN_sellToken = MARGIN_sellToken;
  window.MARGIN_confirmTrade = MARGIN_confirmTrade;

  /* ---------- INITIALIZE ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    renderMarginInterface();
    refreshPricesAndMarketData();
    setInterval(refreshPricesAndMarketData, PRICE_REFRESH_MS);
  });

  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderMarginInterface();
      refreshPricesAndMarketData();
      setInterval(refreshPricesAndMarketData, PRICE_REFRESH_MS);
    });
  } else {
    renderMarginInterface();
    refreshPricesAndMarketData();
    setInterval(refreshPricesAndMarketData, PRICE_REFRESH_MS);
  }

})();