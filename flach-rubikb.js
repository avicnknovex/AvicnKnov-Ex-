/* ==========================================================
   flash-rubikb.js – RUBIK-B Advanced Trading Platform
   Ultra-Premium Trading System with MOD Features
   ========================================================== */
(function(){

  /* ---------- CONFIG ---------- */
  const SUPA_URL  = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
  const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

  const MODE = 'local';
  const MIN_INR = 100;
  const PRICE_REFRESH_MS = 20000; // Fast updates for RUBIK-B
  const HOLD_KEY = 'AVX_rubikb_holdings';
  const ORDERS_KEY = 'AVX_rubikb_orders';

  /* ---------- RUBIK-B PREMIUM TOKENS ---------- */
  const RUBIK_TOKENS = [
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
  RUBIK_TOKENS.forEach(([s,_,id])=>{ CG_ID_MAP[s]=id; });

  /* ---------- SUPABASE CLIENT ---------- */
  const supaLib = window.supabase || (window.parent && window.parent.supabase);
  if(!supaLib){ console.error("Supabase lib not found."); return; }
  const supa = supaLib.createClient(SUPA_URL, SUPA_KEY);

  /* ---------- DATA CACHE ---------- */
  let livePrices = {};
  let marketData = {};
  let priceHistory = {}; // 30-day price history
  let currentView = 'simple'; // 'simple' or 'mod'

  /* ---------- UTILS ---------- */
  const fmtINR = v => '₹' + Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const fmtNumber = v => Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0});

  function toast(msg, ok=true){
    let t = document.getElementById('rubik-toast');
    if(!t){
      t = document.createElement('div');
      t.id='rubik-toast';
      t.style.cssText=`position:fixed;top:20px;right:20px;background:#333;color:white;padding:15px 25px;border-radius:15px;z-index:99999;opacity:0;transition:all 0.5s cubic-bezier(0.4, 0, 0.2, 1);box-shadow:0 15px 40px rgba(0,0,0,0.4);`;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = ok ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)';
    t.style.opacity = '1';
    t.style.transform = 'translateX(0) scale(1)';
    setTimeout(()=>{
      t.style.opacity='0';
      t.style.transform='translateX(100px) scale(0.8)';
    },4000);
  }

  /* ---------- HOLDINGS MANAGEMENT ---------- */
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

  /* ---------- ORDERS MANAGEMENT ---------- */
  function getOrders(){
    try{ return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveOrders(orders){
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }
  function addOrder(order){
    const orders = getOrders();
    order.id = Date.now().toString();
    order.status = 'pending';
    orders.push(order);
    saveOrders(orders);
    return order.id;
  }
  function removeOrder(orderId){
    const orders = getOrders().filter(o => o.id !== orderId);
    saveOrders(orders);
  }
  function updateOrderStatus(orderId, status){
    const orders = getOrders();
    const order = orders.find(o => o.id === orderId);
    if(order) {
      order.status = status;
      saveOrders(orders);
    }
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
      const ids = RUBIK_TOKENS.map(t=>t[2]).join(',');
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&ids=${ids}&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h`);
      const data = await res.json();
      
      data.forEach(coin => {
        const token = RUBIK_TOKENS.find(([_,__,id]) => id === coin.id);
        if(!token) return;
        
        const [sym] = token;
        livePrices[sym] = Number(coin.current_price || 0);
        marketData[sym] = {
          market_cap: coin.market_cap || 0,
          price_change_24h: coin.price_change_percentage_24h || 0,
          volume_24h: coin.total_volume || 0,
          market_cap_rank: coin.market_cap_rank || 0
        };
        
        // Store 30-day price history from sparkline
        if(coin.sparkline_in_7d && coin.sparkline_in_7d.price) {
          priceHistory[sym] = coin.sparkline_in_7d.price;
        }
        
        // Update price display
        updatePriceDisplays(sym);
      });
      
      // Check and execute pending orders
      checkPendingOrders();
      
    }catch(e){ 
      console.error('RUBIK price/market data fetch fail',e); 
    }
  }

  function updatePriceDisplays(sym) {
    // Simple trading view
    const priceEl = document.getElementById('rubik-price-'+sym);
    if(priceEl) priceEl.textContent = fmtINR(livePrices[sym]);
    
    const changeEl = document.getElementById('rubik-change-'+sym);
    if(changeEl) {
      const change = marketData[sym]?.price_change_24h || 0;
      changeEl.textContent = (change > 0 ? '+' : '') + change.toFixed(2) + '%';
      changeEl.className = `price-change ${change >= 0 ? 'positive' : 'negative'}`;
    }
    
    // MOD view
    const modPriceEl = document.getElementById('mod-price-'+sym);
    if(modPriceEl) modPriceEl.textContent = fmtINR(livePrices[sym]);
    
    const modCapEl = document.getElementById('mod-cap-'+sym);
    if(modCapEl) modCapEl.textContent = '₹' + fmtNumber(marketData[sym]?.market_cap || 0);
    
    const modGainEl = document.getElementById('mod-gain-'+sym);
    const modLossEl = document.getElementById('mod-loss-'+sym);
    const change = marketData[sym]?.price_change_24h || 0;
    if(modGainEl && modLossEl) {
      if(change >= 0) {
        modGainEl.textContent = '+' + change.toFixed(2) + '%';
        modGainEl.style.display = 'block';
        modLossEl.style.display = 'none';
      } else {
        modLossEl.textContent = change.toFixed(2) + '%';
        modLossEl.style.display = 'block';
        modGainEl.style.display = 'none';
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
      if(error){ console.error('RUBIK trade insert error',error); }
    }catch(e){
      console.error('RUBIK saveTrade fail',e);
    }
  }

  /* ---------- PENDING ORDERS CHECK ---------- */
  async function checkPendingOrders(){
    const orders = getOrders().filter(o => o.status === 'pending');
    
    for(const order of orders) {
      const currentPrice = livePrices[order.symbol];
      if(!currentPrice) continue;
      
      let shouldExecute = false;
      
      if(order.type === 'buy' && currentPrice <= order.targetPrice) {
        shouldExecute = true;
      } else if(order.type === 'sell' && currentPrice >= order.targetPrice) {
        shouldExecute = true;
      }
      
      if(shouldExecute) {
        await executeOrder(order);
      }
    }
  }

  async function executeOrder(order){
    try {
      if(order.type === 'buy') {
        const balance = await getWalletINR();
        const amount = order.quantity * order.targetPrice;
        
        if(amount <= balance) {
          const currentHolding = await getHolding(order.symbol);
          await setWalletINR(balance - amount);
          await updateHolding(order.symbol, currentHolding.qty + order.quantity, currentHolding.cost_inr + amount);
          await saveTrade('buy', order.symbol, order.quantity, amount, order.targetPrice);
          
          updateOrderStatus(order.id, 'executed');
          toast(`✅ Order executed: Bought ${order.quantity} ${order.symbol}`, true);
        }
      } else if(order.type === 'sell') {
        const currentHolding = await getHolding(order.symbol);
        
        if(currentHolding.qty >= order.quantity) {
          const balance = await getWalletINR();
          const amount = order.quantity * order.targetPrice;
          
          await setWalletINR(balance + amount);
          await updateHolding(order.symbol, currentHolding.qty - order.quantity, Math.max(0, currentHolding.cost_inr - amount));
          await saveTrade('sell', order.symbol, order.quantity, amount, order.targetPrice);
          
          updateOrderStatus(order.id, 'executed');
          toast(`✅ Order executed: Sold ${order.quantity} ${order.symbol}`, true);
        }
      }
    } catch(e) {
      console.error('Order execution failed:', e);
      updateOrderStatus(order.id, 'failed');
    }
  }

  /* ---------- RENDER MAIN INTERFACE ---------- */
  function renderRubikInterface(){
    const c = document.getElementById('rubikb');
    if(!c) return;

    c.innerHTML = `
      <div class="rubik-hero">
        <div class="rubik-hero-bg"></div>
        <div class="rubik-hero-content">
          <div class="rubik-title-section">
            <h1 class="rubik-main-title">🎯 RUBIK-B</h1>
            <p class="rubik-subtitle">Advanced Trading Platform</p>
            <div class="rubik-stats">
              <div class="rubik-stat">
                <span class="stat-value">${RUBIK_TOKENS.length}</span>
                <span class="stat-label">Tokens</span>
              </div>
              <div class="rubik-stat">
                <span class="stat-value">⚡</span>
                <span class="stat-label">Fast</span>
              </div>
              <div class="rubik-stat">
                <span class="stat-value">🎯</span>
                <span class="stat-label">Precise</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="rubik-mode-switcher">
        <button class="mode-btn active" onclick="RUBIK_switchMode('simple')">
          <span class="mode-icon">📊</span>
          <span class="mode-text">Simple Trading</span>
        </button>
        <button class="mode-btn" onclick="RUBIK_switchMode('mod')">
          <span class="mode-icon">🚀</span>
          <span class="mode-text">RUBIK-B MOD</span>
        </button>
      </div>
      
      <div id="simple-trading" class="trading-section active">
        <div class="section-header">
          <h2>📊 Simple Trading</h2>
          <div class="live-indicator">
            <span class="live-dot"></span>
            Live + 30D Charts
          </div>
        </div>
        <div class="simple-tokens-grid" id="simple-tokens"></div>
      </div>
      
      <div id="mod-trading" class="trading-section">
        <div class="section-header">
          <h2>🚀 RUBIK-B MOD</h2>
          <div class="mod-controls">
            <button class="create-order-btn" onclick="RUBIK_openOrderCreator()">
              <span>➕</span> Create Order
            </button>
            <button class="view-orders-btn" onclick="RUBIK_viewOrders()">
              <span>📋</span> View Orders
            </button>
          </div>
        </div>
        <div class="mod-tokens-grid" id="mod-tokens"></div>
      </div>
    `;

    renderSimpleTokens();
    renderModTokens();
    addRubikStyles();
  }

  /* ---------- RENDER SIMPLE TRADING TOKENS ---------- */
  function renderSimpleTokens() {
    const container = document.getElementById('simple-tokens');
    if(!container) return;

    container.innerHTML = RUBIK_TOKENS.map(([sym, name]) => `
      <div class="simple-token-card">
        <div class="token-header">
          <div class="token-info">
            <div class="token-symbol">${sym}</div>
            <div class="token-name">${name}</div>
          </div>
          <div class="token-price" id="rubik-price-${sym}">₹--</div>
        </div>
        
        <div class="token-chart" onclick="RUBIK_showChart('${sym}')">
          <canvas id="chart-${sym}" width="280" height="80"></canvas>
        </div>
        
        <div class="token-stats">
          <div class="price-change" id="rubik-change-${sym}">--%</div>
        </div>
        
        <div class="token-actions">
          <button class="simple-buy-btn" onclick="RUBIK_buyToken('${sym}')">Buy</button>
          <button class="simple-sell-btn" onclick="RUBIK_sellToken('${sym}')">Sell</button>
        </div>
      </div>
    `).join('');

    // Initialize charts
    RUBIK_TOKENS.forEach(([sym]) => {
      drawMiniChart(sym);
    });
  }

  /* ---------- RENDER MOD TOKENS ---------- */
  function renderModTokens() {
    const container = document.getElementById('mod-tokens');
    if(!container) return;

    container.innerHTML = RUBIK_TOKENS.map(([sym, name]) => `
      <div class="mod-token-card">
        <div class="mod-token-header">
          <div class="mod-token-info">
            <div class="mod-token-symbol">${sym}</div>
            <div class="mod-token-name">${name}</div>
            <div class="mod-token-price" id="mod-price-${sym}">₹--</div>
          </div>
          <div class="mod-token-rank" id="mod-rank-${sym}">#--</div>
        </div>
        
        <div class="mod-market-data">
          <div class="market-cap">
            <span class="label">Market Cap:</span>
            <span class="value" id="mod-cap-${sym}">₹--</span>
          </div>
        </div>
        
        <div class="mod-price-changes">
          <div class="price-change-box gain" id="mod-gain-${sym}" style="display:none;">
            +0.00%
          </div>
          <div class="price-change-box loss" id="mod-loss-${sym}" style="display:none;">
            -0.00%
          </div>
        </div>
        
        <div class="mod-actions">
          <button class="mod-buy-long-btn" onclick="RUBIK_buyLongTerm('${sym}')">
            <span>📈</span> Long Term
          </button>
          <button class="mod-sell-short-btn" onclick="RUBIK_sellShort('${sym}')">
            <span>📉</span> Short Sell
          </button>
        </div>
      </div>
    `).join('');
  }

  /* ---------- MINI CHART DRAWING ---------- */
  function drawMiniChart(symbol) {
    const canvas = document.getElementById(`chart-${symbol}`);
    if(!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Sample data (in real app, use priceHistory[symbol])
    const data = priceHistory[symbol] || generateSampleData();
    if(!data || data.length === 0) return;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    // Draw background
    ctx.fillStyle = 'rgba(102, 126, 234, 0.05)';
    ctx.fillRect(0, 0, width, height);

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;

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

    // Fill area under line
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(102, 126, 234, 0.1)';
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

  /* ---------- MODE SWITCHING ---------- */
  function RUBIK_switchMode(mode) {
    currentView = mode;
    
    // Update buttons
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    event.target.closest('.mode-btn').classList.add('active');
    
    // Update sections
    document.querySelectorAll('.trading-section').forEach(section => section.classList.remove('active'));
    document.getElementById(`${mode}-trading`).classList.add('active');
  }

  /* ---------- ORDER CREATOR ---------- */
  function RUBIK_openOrderCreator() {
    const modal = document.createElement('div');
    modal.className = 'order-creator-modal';
    modal.innerHTML = `
      <div class="order-creator-container">
        <div class="order-creator-header">
          <h3>🎯 Create Order</h3>
          <button onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="order-creator-body">
          <div class="order-form">
            <select id="order-token" class="order-input">
              <option value="">Select Token</option>
              ${RUBIK_TOKENS.map(([sym, name]) => `<option value="${sym}">${sym} - ${name}</option>`).join('')}
            </select>
            
            <select id="order-type" class="order-input">
              <option value="buy">Buy Order</option>
              <option value="sell">Sell Order</option>
            </select>
            
            <input type="number" id="order-target-price" class="order-input" placeholder="Target Price (₹)" />
            <input type="number" id="order-quantity" class="order-input" placeholder="Quantity" />
            
            <button class="create-order-confirm-btn" onclick="RUBIK_createOrder()">
              Create Order
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function RUBIK_createOrder() {
    const token = document.getElementById('order-token').value;
    const type = document.getElementById('order-type').value;
    const targetPrice = parseFloat(document.getElementById('order-target-price').value);
    const quantity = parseFloat(document.getElementById('order-quantity').value);

    if(!token || !targetPrice || !quantity) {
      toast('Please fill all fields', false);
      return;
    }

    const order = {
      symbol: token,
      type: type,
      targetPrice: targetPrice,
      quantity: quantity,
      createdAt: new Date().toISOString()
    };

    const orderId = addOrder(order);
    toast(`Order created successfully! ID: ${orderId}`, true);
    
    // Close modal
    document.querySelector('.order-creator-modal')?.remove();
  }

  /* ---------- VIEW ORDERS ---------- */
  function RUBIK_viewOrders() {
    const orders = getOrders();
    
    const modal = document.createElement('div');
    modal.className = 'orders-view-modal';
    modal.innerHTML = `
      <div class="orders-view-container">
        <div class="orders-view-header">
          <h3>📋 Your Orders</h3>
          <button onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="orders-view-body">
          ${orders.length === 0 ? '<p>No orders found</p>' : orders.map(order => `
            <div class="order-item ${order.status}">
              <div class="order-info">
                <span class="order-symbol">${order.symbol}</span>
                <span class="order-type">${order.type.toUpperCase()}</span>
                <span class="order-details">${order.quantity} @ ₹${order.targetPrice}</span>
              </div>
              <div class="order-actions">
                <span class="order-status">${order.status}</span>
                ${order.status === 'pending' ? `<button onclick="RUBIK_cancelOrder('${order.id}')">Cancel</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function RUBIK_cancelOrder(orderId) {
    removeOrder(orderId);
    toast('Order cancelled', true);
    document.querySelector('.orders-view-modal')?.remove();
  }

  /* ---------- TRADING FUNCTIONS ---------- */
  async function RUBIK_buyToken(symbol) { await showTradeModal('buy', symbol); }
  async function RUBIK_sellToken(symbol) { await showTradeModal('sell', symbol); }
  async function RUBIK_buyLongTerm(symbol) { await showTradeModal('buy', symbol, 'long'); }
  async function RUBIK_sellShort(symbol) { await showTradeModal('sell', symbol, 'short'); }

  async function showTradeModal(action, symbol, type = 'normal') {
    const price = livePrices[symbol] || 0;
    if(price <= 0) {
      toast('Price not available', false);
      return;
    }

    const balance = await getWalletINR();
    const holding = await getHolding(symbol);

    const modal = document.createElement('div');
    modal.className = 'rubik-trade-modal';
    modal.innerHTML = `
      <div class="rubik-trade-container">
        <div class="rubik-trade-header ${action}">
          <h3>${action === 'buy' ? 'Buy' : 'Sell'} ${symbol} ${type === 'long' ? '(Long Term)' : type === 'short' ? '(Short)' : ''}</h3>
          <button onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="rubik-trade-body">
          <div class="rubik-trade-info">
            <div>Balance: ${fmtINR(balance)}</div>
            <div>Holdings: ${holding.qty} ${symbol}</div>
            <div>Live Price: ${fmtINR(price)}</div>
            ${type === 'short' ? '<div class="short-warning">⚠️ Short selling - Instant execution</div>' : ''}
          </div>
          <input type="number" class="rubik-trade-input" id="trade-amount" placeholder="Enter INR amount" />
          <input type="number" class="rubik-trade-input" id="trade-qty" placeholder="Enter quantity" />
          <button class="rubik-confirm-btn ${action}" onclick="RUBIK_confirmTrade('${action}', '${symbol}', ${price}, '${type}')">
            ${action === 'buy' ? 'Buy Now' : type === 'short' ? 'Sell Short' : 'Sell Now'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Auto-calculate
    const amountInput = document.getElementById('trade-amount');
    const qtyInput = document.getElementById('trade-qty');

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

  async function RUBIK_confirmTrade(action, symbol, price, type) {
    const amount = parseFloat(document.getElementById('trade-amount')?.value || 0);
    const qty = parseFloat(document.getElementById('trade-qty')?.value || 0);

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
      if(type !== 'short' && qty > holding.qty) {
        toast('Insufficient holdings', false);
        return;
      }
      
      const balance = await getWalletINR();
      await setWalletINR(balance + amount);
      
      if(type === 'short') {
        // Short selling - can sell more than holdings
        await updateHolding(symbol, Math.max(0, holding.qty - qty), Math.max(0, holding.cost_inr - amount));
      } else {
        await updateHolding(symbol, holding.qty - qty, Math.max(0, holding.cost_inr - amount));
      }
      
      await saveTrade('sell', symbol, qty, amount, price);
    }

    // Close modal
    document.querySelector('.rubik-trade-modal')?.remove();
    
    const typeText = type === 'long' ? ' for long term' : type === 'short' ? ' (short)' : '';
    toast(`Successfully ${action === 'buy' ? 'bought' : 'sold'} ${qty} ${symbol}${typeText}!`, true);
  }

  /* ---------- CHART DISPLAY ---------- */
  function RUBIK_showChart(symbol) {
    // Simple chart popup
    const modal = document.createElement('div');
    modal.className = 'chart-modal';
    modal.innerHTML = `
      <div class="chart-container">
        <div class="chart-header">
          <h3>${symbol} - 30 Day Chart</h3>
          <button onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="chart-body">
          <canvas id="big-chart-${symbol}" width="500" height="300"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Draw larger chart
    setTimeout(() => drawBigChart(symbol), 100);
  }

  function drawBigChart(symbol) {
    const canvas = document.getElementById(`big-chart-${symbol}`);
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

    // Draw grid
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
    ctx.lineWidth = 1;
    for(let i = 0; i <= 10; i++) {
      const y = (i / 10) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw price line
    ctx.beginPath();
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;

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
    ctx.fillStyle = 'rgba(102, 126, 234, 0.2)';
    ctx.fill();
  }

  /* ---------- ULTRA-PREMIUM STYLES ---------- */
  function addRubikStyles() {
    if(document.getElementById('rubik-styles')) return;
    const style = document.createElement('style');
    style.id = 'rubik-styles';
    style.textContent = `
      @keyframes rubikGlow {
        0%, 100% { box-shadow: 0 0 30px rgba(236, 72, 153, 0.3); }
        50% { box-shadow: 0 0 60px rgba(236, 72, 153, 0.6); }
      }
      
      @keyframes rubikFloat {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-8px); }
      }
      
      @keyframes rubikPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      
      .rubik-hero {
        position: relative;
        background: linear-gradient(135deg, #ec4899 0%, #be185d 50%, #831843 100%);
        border-radius: 25px;
        margin-bottom: 30px;
        overflow: hidden;
        min-height: 180px;
        display: flex;
        align-items: center;
        animation: rubikGlow 4s ease-in-out infinite;
      }
      
      .rubik-hero-bg {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="25,25 75,25 50,75" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="20" r="3" fill="rgba(255,255,255,0.08)"/></svg>');
        animation: rubikFloat 8s ease-in-out infinite;
      }
      
      .rubik-hero-content {
        position: relative;
        width: 100%;
        padding: 30px;
        color: white;
        text-align: center;
      }
      
      .rubik-main-title {
        font-size: 42px;
        font-weight: 900;
        margin: 0;
        background: linear-gradient(45deg, #fff, #fce7f3);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 2px 15px rgba(0,0,0,0.3);
        letter-spacing: 2px;
      }
      
      .rubik-subtitle {
        font-size: 18px;
        margin: 10px 0 25px 0;
        opacity: 0.95;
        font-weight: 600;
      }
      
      .rubik-stats {
        display: flex;
        justify-content: center;
        gap: 30px;
        margin-top: 20px;
      }
      
      .rubik-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: rgba(255,255,255,0.15);
        padding: 15px 20px;
        border-radius: 15px;
        backdrop-filter: blur(15px);
        border: 1px solid rgba(255,255,255,0.2);
      }
      
      .stat-value {
        font-size: 24px;
        font-weight: bold;
      }
      
      .stat-label {
        font-size: 13px;
        opacity: 0.9;
        margin-top: 2px;
      }
      
      .rubik-mode-switcher {
        display: flex;
        gap: 15px;
        margin-bottom: 30px;
        padding: 0 10px;
      }
      
      .mode-btn {
        flex: 1;
        padding: 18px 20px;
        border: none;
        border-radius: 18px;
        background: linear-gradient(135deg, #f3f4f6, #e5e7eb);
        cursor: pointer;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 16px;
        font-weight: 600;
        color: #374151;
        position: relative;
        overflow: hidden;
      }
      
      .mode-btn.active {
        background: linear-gradient(135deg, #ec4899, #be185d);
        color: white;
        transform: scale(1.02);
        box-shadow: 0 10px 30px rgba(236, 72, 153, 0.3);
      }
      
      .mode-btn:hover:not(.active) {
        background: linear-gradient(135deg, #e5e7eb, #d1d5db);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0,0,0,0.1);
      }
      
      .mode-icon {
        font-size: 20px;
      }
      
      .trading-section {
        display: none;
      }
      
      .trading-section.active {
        display: block;
      }
      
      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 25px;
        padding: 0 10px;
      }
      
      .section-header h2 {
        margin: 0;
        font-size: 28px;
        font-weight: bold;
        color: #1f2937;
      }
      
      .live-indicator {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        color: #6b7280;
        font-weight: 500;
      }
      
      .live-dot {
        width: 10px;
        height: 10px;
        background: #10b981;
        border-radius: 50%;
        animation: rubikPulse 2s infinite;
      }
      
      .mod-controls {
        display: flex;
        gap: 12px;
      }
      
      .create-order-btn, .view-orders-btn {
        padding: 12px 20px;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
        transition: all 0.3s;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .create-order-btn {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
      }
      
      .create-order-btn:hover {
        background: linear-gradient(135deg, #059669, #047857);
        transform: scale(1.05);
      }
      
      .view-orders-btn {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        color: white;
      }
      
      .view-orders-btn:hover {
        background: linear-gradient(135deg, #1d4ed8, #1e40af);
        transform: scale(1.05);
      }
      
      /* SIMPLE TRADING STYLES */
      .simple-tokens-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
        padding: 0 10px;
      }
      
      .simple-token-card {
        background: white;
        border-radius: 20px;
        padding: 25px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.08);
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        border: 2px solid transparent;
      }
      
      .simple-token-card:hover {
        transform: translateY(-5px) scale(1.02);
        box-shadow: 0 20px 60px rgba(0,0,0,0.12);
        border-color: #ec4899;
      }
      
      .token-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
      }
      
      .token-symbol {
        font-size: 22px;
        font-weight: 900;
        color: #1f2937;
      }
      
      .token-name {
        font-size: 14px;
        color: #6b7280;
        font-weight: 500;
        margin-top: 4px;
      }
      
      .token-price {
        font-size: 20px;
        font-weight: bold;
        color: #10b981;
      }
      
      .token-chart {
        margin-bottom: 20px;
        cursor: pointer;
        padding: 10px;
        border-radius: 12px;
        transition: all 0.3s;
      }
      
      .token-chart:hover {
        background: rgba(102, 126, 234, 0.05);
        transform: scale(1.02);
      }
      
      .token-stats {
        margin-bottom: 20px;
      }
      
      .price-change {
        font-size: 14px;
        font-weight: bold;
        padding: 6px 12px;
        border-radius: 20px;
        display: inline-block;
      }
      
      .price-change.positive {
        background: #d1fae5;
        color: #10b981;
      }
      
      .price-change.negative {
        background: #fee2e2;
        color: #ef4444;
      }
      
      .token-actions {
        display: flex;
        gap: 12px;
      }
      
      .simple-buy-btn, .simple-sell-btn {
        flex: 1;
        padding: 12px 0;
        border: none;
        border-radius: 12px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s;
        font-size: 14px;
        color: white;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .simple-buy-btn {
        background: linear-gradient(135deg, #10b981, #059669);
      }
      
      .simple-buy-btn:hover {
        background: linear-gradient(135deg, #059669, #047857);
        transform: scale(1.05);
        box-shadow: 0 8px 25px rgba(16, 185, 129, 0.3);
      }
      
      .simple-sell-btn {
        background: linear-gradient(135deg, #ef4444, #dc2626);
      }
      
      .simple-sell-btn:hover {
        background: linear-gradient(135deg, #dc2626, #b91c1c);
        transform: scale(1.05);
        box-shadow: 0 8px 25px rgba(239, 68, 68, 0.3);
      }
      
      /* MOD TRADING STYLES */
      .mod-tokens-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 25px;
        padding: 0 10px;
      }
      
      .mod-token-card {
        background: linear-gradient(135deg, #ffffff 0%, #fafafa 100%);
        border-radius: 25px;
        padding: 30px;
        box-shadow: 0 15px 50px rgba(0,0,0,0.1);
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        border: 3px solid transparent;
      }
      
      .mod-token-card:hover {
        transform: translateY(-8px) scale(1.02);
        box-shadow: 0 25px 70px rgba(236, 72, 153, 0.15);
        border-color: #ec4899;
      }
      
      .mod-token-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 5px;
        background: linear-gradient(90deg, #ec4899, #be185d, #831843);
      }
      
      .mod-token-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 25px;
      }
      
      .mod-token-symbol {
        font-size: 24px;
        font-weight: 900;
        color: #1f2937;
        letter-spacing: 1px;
      }
      
      .mod-token-name {
        font-size: 14px;
        color: #6b7280;
        font-weight: 500;
        margin-top: 4px;
      }
      
      .mod-token-price {
        font-size: 18px;
        font-weight: bold;
        color: #ec4899;
        margin-top: 8px;
      }
      
      .mod-token-rank {
        background: linear-gradient(135deg, #ec4899, #be185d);
        color: white;
        padding: 8px 15px;
        border-radius: 25px;
        font-size: 12px;
        font-weight: bold;
      }
      
      .mod-market-data {
        margin-bottom: 20px;
        padding: 15px;
        background: rgba(236, 72, 153, 0.05);
        border-radius: 15px;
        border: 1px solid rgba(236, 72, 153, 0.1);
      }
      
      .market-cap .label {
        color: #6b7280;
        font-size: 14px;
        font-weight: 500;
      }
      
      .market-cap .value {
        color: #1f2937;
        font-size: 16px;
        font-weight: bold;
        margin-left: 8px;
      }
      
      .mod-price-changes {
        display: flex;
        gap: 12px;
        margin-bottom: 25px;
      }
      
      .price-change-box {
        flex: 1;
        padding: 12px 16px;
        border-radius: 15px;
        font-size: 14px;
        font-weight: bold;
        text-align: center;
        transition: all 0.3s;
      }
      
      .price-change-box.gain {
        background: linear-gradient(135deg, #d1fae5, #a7f3d0);
        color: #065f46;
        border: 2px solid #10b981;
      }
      
      .price-change-box.loss {
        background: linear-gradient(135deg, #fee2e2, #fecaca);
        color: #991b1b;
        border: 2px solid #ef4444;
      }
      
      .mod-actions {
        display: flex;
        gap: 15px;
      }
      
      .mod-buy-long-btn, .mod-sell-short-btn {
        flex: 1;
        padding: 15px 12px;
        border: none;
        border-radius: 15px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        font-size: 14px;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .mod-buy-long-btn {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      }
      
      .mod-buy-long-btn:hover {
        background: linear-gradient(135deg, #1d4ed8, #1e40af);
        transform: scale(1.08);
        box-shadow: 0 10px 30px rgba(59, 130, 246, 0.4);
      }
      
      .mod-sell-short-btn {
        background: linear-gradient(135deg, #f59e0b, #d97706);
      }
      
      .mod-sell-short-btn:hover {
        background: linear-gradient(135deg, #d97706, #b45309);
        transform: scale(1.08);
        box-shadow: 0 10px 30px rgba(245, 158, 11, 0.4);
      }
      
      /* MODAL STYLES */
      .rubik-trade-modal, .order-creator-modal, .orders-view-modal, .chart-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, rgba(0,0,0,0.7), rgba(236, 72, 153, 0.2));
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(15px);
      }
      
      .rubik-trade-container, .order-creator-container, .orders-view-container, .chart-container {
        width: 95%;
        max-width: 500px;
        background: white;
        border-radius: 25px;
        overflow: hidden;
        box-shadow: 0 30px 80px rgba(0,0,0,0.4);
        animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .rubik-trade-header, .order-creator-header, .orders-view-header, .chart-header {
        background: linear-gradient(135deg, #ec4899, #be185d);
        color: white;
        padding: 25px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .rubik-trade-header.sell, .order-creator-header.sell {
        background: linear-gradient(135deg, #f59e0b, #d97706);
      }
      
      .rubik-trade-body, .order-creator-body, .orders-view-body, .chart-body {
        padding: 30px;
      }
      
      .rubik-trade-info {
        background: linear-gradient(135deg, #f8fafc, #f1f5f9);
        padding: 20px;
        border-radius: 15px;
        margin-bottom: 25px;
        border-left: 5px solid #ec4899;
      }
      
      .short-warning {
        color: #f59e0b;
        font-weight: bold;
        font-size: 14px;
        margin-top: 10px;
      }
      
      .rubik-trade-input, .order-input {
        width: 100%;
        padding: 15px 20px;
        border: 2px solid #e5e7eb;
        border-radius: 12px;
        margin-bottom: 18px;
        font-size: 16px;
        outline: none;
        transition: all 0.3s;
        background: #f9fafb;
        box-sizing: border-box;
      }
      
      .rubik-trade-input:focus, .order-input:focus {
        border-color: #ec4899;
        background: white;
        box-shadow: 0 0 0 4px rgba(236, 72, 153, 0.1);
        transform: scale(1.02);
      }
      
      .rubik-confirm-btn, .create-order-confirm-btn {
        width: 100%;
        padding: 15px;
        border: none;
        border-radius: 15px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s;
        color: white;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      
      .rubik-confirm-btn.buy, .create-order-confirm-btn {
        background: linear-gradient(135deg, #10b981, #059669);
      }
      
      .rubik-confirm-btn.buy:hover, .create-order-confirm-btn:hover {
        background: linear-gradient(135deg, #059669, #047857);
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(16, 185, 129, 0.4);
      }
      
      .rubik-confirm-btn.sell {
        background: linear-gradient(135deg, #f59e0b, #d97706);
      }
      
      .rubik-confirm-btn.sell:hover {
        background: linear-gradient(135deg, #d97706, #b45309);
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(245, 158, 11, 0.4);
      }
      
      /* ORDER ITEMS */
      .order-item {
        background: #f9fafb;
        padding: 20px;
        border-radius: 15px;
        margin-bottom: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-left: 5px solid #6b7280;
        transition: all 0.3s;
      }
      
      .order-item.pending {
        border-left-color: #f59e0b;
        background: #fffbeb;
      }
      
      .order-item.executed {
        border-left-color: #10b981;
        background: #f0fdf4;
      }
      
      .order-item.failed {
        border-left-color: #ef4444;
        background: #fef2f2;
      }
      
      .order-symbol {
        font-weight: bold;
        font-size: 16px;
        color: #1f2937;
      }
      
      .order-type {
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 8px;
        background: #e5e7eb;
        color: #374151;
        margin: 0 8px;
      }
      
      .order-details {
        font-size: 14px;
        color: #6b7280;
      }
      
      .order-status {
        font-size: 12px;
        padding: 4px 12px;
        border-radius: 20px;
        font-weight: bold;
        text-transform: uppercase;
      }
      
      /* RESPONSIVE */
      @media (max-width: 768px) {
        .rubik-main-title {
          font-size: 32px;
        }
        
        .rubik-stats {
          gap: 15px;
        }
        
        .mode-btn {
          padding: 15px;
          font-size: 14px;
        }
        
        .simple-tokens-grid, .mod-tokens-grid {
          grid-template-columns: 1fr;
        }
        
        .section-header {
          flex-direction: column;
          gap: 15px;
          text-align: center;
        }
        
        .mod-controls {
          flex-direction: column;
          gap: 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------- GLOBAL FUNCTIONS ---------- */
  window.RUBIK_switchMode = RUBIK_switchMode;
  window.RUBIK_openOrderCreator = RUBIK_openOrderCreator;
  window.RUBIK_createOrder = RUBIK_createOrder;
  window.RUBIK_viewOrders = RUBIK_viewOrders;
  window.RUBIK_cancelOrder = RUBIK_cancelOrder;
  window.RUBIK_buyToken = RUBIK_buyToken;
  window.RUBIK_sellToken = RUBIK_sellToken;
  window.RUBIK_buyLongTerm = RUBIK_buyLongTerm;
  window.RUBIK_sellShort = RUBIK_sellShort;
  window.RUBIK_confirmTrade = RUBIK_confirmTrade;
  window.RUBIK_showChart = RUBIK_showChart;

  /* ---------- INITIALIZATION ---------- */
  function initRubik(){
    renderRubikInterface();
    refreshPricesAndMarketData();
    setInterval(refreshPricesAndMarketData, PRICE_REFRESH_MS);
  }

  // Auto-initialize
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initRubik);
  } else {
    initRubik();
  }

})();