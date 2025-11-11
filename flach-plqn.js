/* ==========================================================
   flash-plqn.js – PLQN Flash Trading with Advanced AI
   Ultra-Attractive Trading System + PLQN AI Assistant
   ========================================================== */
(function(){

  /* ---------- CONFIG ---------- */
  const SUPA_URL  = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
  const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

  const MODE              = 'local';
  const MIN_INR           = 100;
  const PRICE_REFRESH_MS  = 25000; // More frequent updates for flash trading
  const HOLD_KEY          = 'AVX_plqn_holdings';

  /* ---------- PLQN FLASH TOKENS (High-Performance Trading) ---------- */
  const PLQN_TOKENS = [
    ['BTC','Bitcoin','bitcoin'],
    ['ETH','Ethereum','ethereum'],
    ['BNB','BNB','binancecoin'],
    ['SOL','Solana','solana'],
    ['XRP','XRP','ripple'],
    ['ADA','Cardano','cardano'],
    ['DOGE','Dogecoin','dogecoin'],
    ['MATIC','Polygon','matic-network'],
    ['DOT','Polkadot','polkadot'],
    ['AVAX','Avalanche','avalanche-2'],
    ['SHIB','Shiba Inu','shiba-inu'],
    ['ATOM','Cosmos','cosmos'],
    ['LINK','Chainlink','chainlink'],
    ['UNI','Uniswap','uniswap'],
    ['LTC','Litecoin','litecoin'],
    ['TRX','TRON','tron'],
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
    ['STX','Stacks','blockstack']
  ];

  const CG_ID_MAP = {};
  PLQN_TOKENS.forEach(([s,_,id])=>{ CG_ID_MAP[s]=id; });

  /* ---------- SUPABASE CLIENT ---------- */
  const supaLib = window.supabase || (window.parent && window.parent.supabase);
  if(!supaLib){ console.error("Supabase lib not found."); return; }
  const supa = supaLib.createClient(SUPA_URL, SUPA_KEY);

  /* ---------- PRICE & MARKET DATA CACHE ---------- */
  let livePrices = {}; // {SYM:inr}
  let marketData = {}; // {SYM: {market_cap, price_change_24h, ...}}

  /* ---------- UTILS ---------- */
  const fmtINR = v => '₹' + Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const fmtNumber = v => Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0});

  function toast(msg, ok=true){
    let t = document.getElementById('plqn-toast');
    if(!t){
      t = document.createElement('div');
      t.id='plqn-toast';
      t.style.cssText=`position:fixed;top:20px;right:20px;background:#333;color:white;padding:12px 20px;border-radius:12px;z-index:99999;opacity:0;transition:all 0.4s cubic-bezier(0.4, 0, 0.2, 1);box-shadow:0 10px 30px rgba(0,0,0,0.3);`;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = ok ? 'linear-gradient(135deg, #28a745, #20c997)' : 'linear-gradient(135deg, #dc3545, #fd7e14)';
    t.style.opacity = '1';
    t.style.transform = 'translateX(0)';
    setTimeout(()=>{
      t.style.opacity='0';
      t.style.transform='translateX(100px)';
    },3500);
  }

  /* ---------- HOLDINGS MANAGEMENT ---------- */
  function localGetHoldings(){
    try{ return JSON.parse(localStorage.getItem(HOLD_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function localSetHoldings(obj){
    localStorage.setItem(HOLD_KEY, JSON.stringify(obj));
  }

  async function getHoldingsMap(){
    return localGetHoldings();
  }
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
      const ids = PLQN_TOKENS.map(t=>t[2]).join(',');
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&ids=${ids}&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`);
      const data = await res.json();
      
      data.forEach(coin => {
        const token = PLQN_TOKENS.find(([_,__,id]) => id === coin.id);
        if(!token) return;
        
        const [sym] = token;
        livePrices[sym] = Number(coin.current_price || 0);
        marketData[sym] = {
          market_cap: coin.market_cap || 0,
          price_change_24h: coin.price_change_percentage_24h || 0,
          volume_24h: coin.total_volume || 0,
          market_cap_rank: coin.market_cap_rank || 0
        };
        
        // Update price display
        const priceEl = document.getElementById('plqn-price-'+sym);
        if(priceEl) priceEl.textContent = fmtINR(livePrices[sym]);
        
        // Update change display
        const changeEl = document.getElementById('plqn-change-'+sym);
        if(changeEl) {
          const change = marketData[sym].price_change_24h;
          changeEl.textContent = (change > 0 ? '+' : '') + change.toFixed(2) + '%';
          changeEl.className = `token-change ${change >= 0 ? 'positive' : 'negative'}`;
        }
      });
    }catch(e){ 
      console.error('PLQN price/market data fetch fail',e); 
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
      if(error){ console.error('PLQN trade insert error',error); }
    }catch(e){
      console.error('PLQN saveTrade fail',e);
    }
  }

  /* ---------- RENDER PLQN ULTRA-ATTRACTIVE INTERFACE ---------- */
  function renderPLQNInterface(){
    const c=document.getElementById('plqn'); 
    if(!c) return;

    c.innerHTML = `
      <div class="plqn-hero">
        <div class="plqn-hero-bg"></div>
        <div class="plqn-hero-content">
          <div class="plqn-title-section">
            <h1 class="plqn-main-title">⚡ PLQN FLASH</h1>
            <p class="plqn-subtitle">Lightning-Speed Trading Platform</p>
            <div class="plqn-stats">
              <div class="plqn-stat">
                <span class="stat-value">30+</span>
                <span class="stat-label">Assets</span>
              </div>
              <div class="plqn-stat">
                <span class="stat-value">24/7</span>
                <span class="stat-label">Trading</span>
              </div>
              <div class="plqn-stat">
                <span class="stat-value">⚡</span>
                <span class="stat-label">Fast</span>
              </div>
            </div>
          </div>
          <div class="plqn-ai-section">
            <button class="plqn-ai-btn" onclick="PLQN_openAI()">
              <div class="ai-btn-content">
                <span class="ai-icon">🧠</span>
                <div class="ai-text">
                  <span class="ai-title">PLQN AI</span>
                  <span class="ai-desc">Advanced Trading Assistant</span>
                </div>
              </div>
              <div class="ai-btn-glow"></div>
            </button>
          </div>
        </div>
      </div>
      
      <div class="plqn-tokens-section">
        <div class="section-header">
          <h2>🚀 Premium Assets</h2>
          <div class="live-indicator">
            <span class="live-dot"></span>
            Live Market Data
          </div>
        </div>
        
        <div class="plqn-tokens-grid">
          ${PLQN_TOKENS.map(([sym,name])=>`
            <div class="plqn-token-card">
              <div class="token-card-bg"></div>
              <div class="token-header">
                <div class="token-info">
                  <div class="token-symbol">${sym}</div>
                  <div class="token-name">${name}</div>
                </div>
                <div class="token-rank" id="plqn-rank-${sym}">#--</div>
              </div>
              
              <div class="token-price-section">
                <div class="token-price" id="plqn-price-${sym}">₹--</div>
                <div class="token-change" id="plqn-change-${sym}">--%</div>
              </div>
              
              <div class="token-actions">
                <button class="plqn-buy-btn" onclick="PLQN_buyToken('${sym}')">
                  <span>Buy</span>
                  <div class="btn-shine"></div>
                </button>
                <button class="plqn-sell-btn" onclick="PLQN_sellToken('${sym}')">
                  <span>Sell</span>
                  <div class="btn-shine"></div>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    addPLQNStyles();
  }

  /* ---------- ULTRA-ATTRACTIVE PLQN STYLES ---------- */
  function addPLQNStyles(){
    if(document.getElementById('plqn-styles')) return;
    const style = document.createElement('style');
    style.id = 'plqn-styles';
    style.textContent = `
      @keyframes plqnFloat {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
      }
      
      @keyframes plqnGlow {
        0%, 100% { box-shadow: 0 0 20px rgba(106, 17, 203, 0.3); }
        50% { box-shadow: 0 0 40px rgba(106, 17, 203, 0.6); }
      }
      
      @keyframes livePulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      @keyframes shine {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }

      .plqn-hero {
        position: relative;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #6a11cb 100%);
        border-radius: 24px;
        margin-bottom: 30px;
        overflow: hidden;
        min-height: 200px;
        display: flex;
        align-items: center;
      }
      
      .plqn-hero-bg {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="25" cy="25" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="75" cy="75" r="3" fill="rgba(255,255,255,0.08)"/><circle cx="85" cy="25" r="1" fill="rgba(255,255,255,0.12)"/></svg>');
        animation: plqnFloat 6s ease-in-out infinite;
      }
      
      .plqn-hero-content {
        position: relative;
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 30px;
        color: white;
      }
      
      .plqn-main-title {
        font-size: 36px;
        font-weight: 900;
        margin: 0;
        background: linear-gradient(45deg, #fff, #f0f8ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 2px 10px rgba(0,0,0,0.3);
      }
      
      .plqn-subtitle {
        font-size: 16px;
        margin: 8px 0 20px 0;
        opacity: 0.9;
        font-weight: 500;
      }
      
      .plqn-stats {
        display: flex;
        gap: 20px;
        margin-top: 15px;
      }
      
      .plqn-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: rgba(255,255,255,0.1);
        padding: 10px 15px;
        border-radius: 12px;
        backdrop-filter: blur(10px);
      }
      
      .stat-value {
        font-size: 20px;
        font-weight: bold;
      }
      
      .stat-label {
        font-size: 12px;
        opacity: 0.8;
      }
      
      .plqn-ai-btn {
        background: linear-gradient(135deg, #ff6b6b, #ee5a24);
        border: none;
        border-radius: 20px;
        padding: 20px;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        animation: plqnGlow 3s ease-in-out infinite;
        min-width: 200px;
      }
      
      .plqn-ai-btn:hover {
        transform: scale(1.05) rotate(1deg);
        box-shadow: 0 15px 35px rgba(255, 107, 107, 0.4);
      }
      
      .ai-btn-content {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 15px;
        color: white;
      }
      
      .ai-icon {
        font-size: 24px;
      }
      
      .ai-title {
        font-size: 18px;
        font-weight: bold;
        display: block;
      }
      
      .ai-desc {
        font-size: 12px;
        opacity: 0.9;
        display: block;
      }
      
      .ai-btn-glow {
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
        animation: plqnFloat 4s ease-in-out infinite;
      }
      
      .plqn-tokens-section {
        margin-top: 20px;
      }
      
      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding: 0 10px;
      }
      
      .section-header h2 {
        margin: 0;
        font-size: 24px;
        font-weight: bold;
        color: #333;
      }
      
      .live-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        color: #666;
      }
      
      .live-dot {
        width: 8px;
        height: 8px;
        background: #28a745;
        border-radius: 50%;
        animation: livePulse 2s infinite;
      }
      
      .plqn-tokens-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 20px;
        padding: 0 10px;
      }
      
      .plqn-token-card {
        position: relative;
        background: white;
        border-radius: 20px;
        padding: 25px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.2);
      }
      
      .plqn-token-card:hover {
        transform: translateY(-8px) scale(1.02);
        box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      }
      
      .token-card-bg {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, #667eea, #764ba2, #6a11cb);
      }
      
      .token-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
      }
      
      .token-symbol {
        font-size: 20px;
        font-weight: 900;
        color: #333;
        margin-bottom: 4px;
      }
      
      .token-name {
        font-size: 14px;
        color: #666;
        font-weight: 500;
      }
      
      .token-rank {
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: bold;
      }
      
      .token-price-section {
        margin-bottom: 20px;
      }
      
      .token-price {
        font-size: 22px;
        font-weight: bold;
        color: #333;
        margin-bottom: 8px;
      }
      
      .token-change {
        font-size: 14px;
        font-weight: bold;
        padding: 4px 8px;
        border-radius: 12px;
        display: inline-block;
      }
      
      .token-change.positive {
        background: #d4edda;
        color: #28a745;
      }
      
      .token-change.negative {
        background: #f8d7da;
        color: #dc3545;
      }
      
      .token-actions {
        display: flex;
        gap: 12px;
      }
      
      .plqn-buy-btn, .plqn-sell-btn {
        flex: 1;
        padding: 12px 0;
        border: none;
        border-radius: 12px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        font-size: 14px;
      }
      
      .plqn-buy-btn {
        background: linear-gradient(135deg, #28a745, #20c997);
        color: white;
      }
      
      .plqn-buy-btn:hover {
        background: linear-gradient(135deg, #218838, #1da88a);
        transform: scale(1.05);
        box-shadow: 0 8px 25px rgba(40, 167, 69, 0.3);
      }
      
      .plqn-sell-btn {
        background: linear-gradient(135deg, #dc3545, #fd7e14);
        color: white;
      }
      
      .plqn-sell-btn:hover {
        background: linear-gradient(135deg, #c82333, #e8680a);
        transform: scale(1.05);
        box-shadow: 0 8px 25px rgba(220, 53, 69, 0.3);
      }
      
      .btn-shine {
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
        transition: left 0.5s;
      }
      
      .plqn-buy-btn:hover .btn-shine,
      .plqn-sell-btn:hover .btn-shine {
        left: 100%;
        animation: shine 0.5s ease-in-out;
      }

      /* ENHANCED AI CHAT STYLES */
      .ai-chat-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.8));
        z-index: 10000;
        display: none;
        backdrop-filter: blur(15px);
        animation: fadeIn 0.3s ease-out;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      .ai-chat-container {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 95%;
        max-width: 550px;
        height: 400px;
        background: white;
        border-radius: 25px;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,0.4);
        display: flex;
        flex-direction: column;
        animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      @keyframes slideUp {
        from { 
          opacity: 0;
          transform: translate(-50%, -30%) scale(0.9);
        }
        to { 
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }
      
      .ai-chat-header {
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
        color: white;
        padding: 25px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: relative;
        overflow: hidden;
      }
      
      .ai-chat-header::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
        animation: plqnFloat 8s ease-in-out infinite;
      }
      
      .ai-chat-title {
        font-size: 20px;
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 1;
        position: relative;
      }
      
      .ai-close-btn {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 35px;
        height: 35px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        transition: all 0.3s;
        z-index: 1;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .ai-close-btn:hover {
        background: rgba(255,255,255,0.3);
        transform: scale(1.1) rotate(90deg);
      }
      
      .ai-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 25px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        background: #f8f9fa;
      }
      
      .ai-message, .user-message {
        max-width: 85%;
        padding: 15px 20px;
        border-radius: 20px;
        word-wrap: break-word;
        font-size: 14px;
        line-height: 1.5;
        animation: messageSlide 0.3s ease-out;
      }
      
      @keyframes messageSlide {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .ai-message {
        align-self: flex-start;
        background: white;
        color: #333;
        border: 1px solid #e0e7ff;
        box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      }
      
      .user-message {
        align-self: flex-end;
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
      }
      
      .ai-input-container {
        padding: 25px;
        border-top: 1px solid #e0e0e0;
        display: flex;
        gap: 15px;
        background: white;
      }
      
      .ai-input {
        flex: 1;
        padding: 15px 20px;
        border: 2px solid #e0e7ff;
        border-radius: 25px;
        outline: none;
        font-size: 14px;
        transition: all 0.3s;
        background: #f8f9fa;
      }
      
      .ai-input:focus {
        border-color: #667eea;
        background: white;
        box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
      }
      
      .ai-send-btn {
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        border: none;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        transition: all 0.3s;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
      }
      
      .ai-send-btn:hover {
        background: linear-gradient(135deg, #5a6fd8, #6a5acd);
        transform: scale(1.05);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
      }

      /* TRADE MODAL STYLES */
      .plqn-trade-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, rgba(0,0,0,0.7), rgba(102, 126, 234, 0.3));
        z-index: 9999;
        display: none;
        backdrop-filter: blur(10px);
      }
      
      .plqn-trade-container {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 95%;
        max-width: 450px;
        background: white;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,0.4);
        animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .plqn-trade-header {
        background: linear-gradient(135deg, #28a745, #20c997);
        color: white;
        padding: 25px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: relative;
      }
      
      .plqn-trade-header.sell {
        background: linear-gradient(135deg, #dc3545, #fd7e14);
      }
      
      .plqn-trade-header h3 {
        margin: 0;
        font-size: 20px;
        font-weight: bold;
      }
      
      .plqn-trade-body {
        padding: 25px;
      }
      
      .plqn-trade-info {
        background: linear-gradient(135deg, #f8f9fa, #e9ecef);
        padding: 20px;
        border-radius: 15px;
        margin-bottom: 25px;
        border-left: 4px solid #667eea;
      }
      
      .plqn-trade-info div {
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 500;
      }
      
      .plqn-trade-input {
        width: 100%;
        padding: 15px 20px;
        border: 2px solid #e0e7ff;
        border-radius: 12px;
        margin-bottom: 18px;
        font-size: 16px;
        outline: none;
        transition: all 0.3s;
        background: #f8f9fa;
        box-sizing: border-box;
      }
      
      .plqn-trade-input:focus {
        border-color: #667eea;
        background: white;
        box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
        transform: scale(1.02);
      }
      
      .plqn-confirm-btn {
        width: 100%;
        padding: 15px;
        border: none;
        border-radius: 12px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s;
        color: white;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      
      .plqn-confirm-btn.buy {
        background: linear-gradient(135deg, #28a745, #20c997);
        box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
      }
      
      .plqn-confirm-btn.buy:hover {
        background: linear-gradient(135deg, #218838, #1da88a);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(40, 167, 69, 0.4);
      }
      
      .plqn-confirm-btn.sell {
        background: linear-gradient(135deg, #dc3545, #fd7e14);
        box-shadow: 0 4px 15px rgba(220, 53, 69, 0.3);
      }
      
      .plqn-confirm-btn.sell:hover {
        background: linear-gradient(135deg, #c82333, #e8680a);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(220, 53, 69, 0.4);
      }

      /* Responsive Design */
      @media (max-width: 768px) {
        .plqn-hero-content {
          flex-direction: column;
          text-align: center;
          gap: 20px;
        }
        
        .plqn-main-title {
          font-size: 28px;
        }
        
        .plqn-tokens-grid {
          grid-template-columns: 1fr;
        }
        
        .ai-chat-container {
          width: 98%;
          height: 50vh;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------- ENHANCED AI CHAT SYSTEM ---------- */
  let plqnAIChatState = {
    isOpen: false,
    awaitingQuantity: false,
    awaitingPrice: false,
    currentAction: null,
    currentToken: null,
    currentTokenPrice: 0
  };

  function PLQN_openAI(){
    if(plqnAIChatState.isOpen) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'ai-chat-overlay';
    overlay.innerHTML = `
      <div class="ai-chat-container">
        <div class="ai-chat-header">
          <div class="ai-chat-title">
            <span>🧠</span>
            PLQN AI Assistant
          </div>
          <button class="ai-close-btn" onclick="PLQN_closeAI()">×</button>
        </div>
        <div class="ai-chat-messages" id="plqn-ai-messages">
          <div class="ai-message">
            Hello! I'm PLQN AI, your advanced trading assistant. I can help you with:
            <br><br>
            🔹 Buy/Sell any token<br>
            🔹 Check live token prices<br>
            🔹 View market cap data<br>
            🔹 24-hour price changes<br>
            🔹 Your wallet balance<br>
            🔹 Portfolio holdings<br>
            🔹 Token details & rankings<br>
            <br>
            What would you like to know today?
          </div>
        </div>
        <div class="ai-input-container">
          <input type="text" class="ai-input" id="plqn-ai-input" placeholder="Ask me anything about trading or market data..." />
          <button class="ai-send-btn" onclick="PLQN_sendMessage()">➤</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    overlay.style.display = 'block';
    plqnAIChatState.isOpen = true;
    
    document.getElementById('plqn-ai-input').addEventListener('keypress', function(e){
      if(e.key === 'Enter') PLQN_sendMessage();
    });
    
    setTimeout(() => document.getElementById('plqn-ai-input').focus(), 100);
  }

  function PLQN_closeAI(){
    const overlay = document.querySelector('.ai-chat-overlay');
    if(overlay) overlay.remove();
    plqnAIChatState.isOpen = false;
    plqnAIChatState.awaitingQuantity = false;
    plqnAIChatState.awaitingPrice = false;
    plqnAIChatState.currentAction = null;
    plqnAIChatState.currentToken = null;
  }

  async function PLQN_sendMessage(){
    const input = document.getElementById('plqn-ai-input');
    if(!input) return;
    
    const message = input.value.trim();
    if(!message) return;
    
    addPLQNAIMessage(message, 'user');
    input.value = '';
    
    const response = await processPLQNAIMessage(message.toLowerCase());
    addPLQNAIMessage(response, 'ai');
  }

  function addPLQNAIMessage(message, type){
    const messagesContainer = document.getElementById('plqn-ai-messages');
    if(!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'user' ? 'user-message' : 'ai-message';
    messageDiv.innerHTML = message;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  async function processPLQNAIMessage(message){
    // Handle quantity input
    if(plqnAIChatState.awaitingQuantity){
      const qty = parseFloat(message);
      if(isNaN(qty) || qty <= 0){
        return "Please enter a valid quantity number.";
      }
      
      const token = plqnAIChatState.currentToken;
      const price = livePrices[token] || 0;
      const amount = qty * price;
      
      if(plqnAIChatState.currentAction === 'buy'){
        const balance = await getWalletINR();
        if(amount > balance){
          plqnAIChatState.awaitingQuantity = false;
          return `Insufficient balance. You have ${fmtINR(balance)} but need ${fmtINR(amount)}.`;
        }
        
        await executePLQNTrade('buy', token, qty, amount, price);
        plqnAIChatState.awaitingQuantity = false;
        return `✅ Successfully bought ${qty} ${token} for ${fmtINR(amount)}!`;
      } else if(plqnAIChatState.currentAction === 'sell'){
        const holding = await getHolding(token);
        if(qty > holding.qty){
          plqnAIChatState.awaitingQuantity = false;
          return `You only hold ${holding.qty} ${token}. Cannot sell ${qty}.`;
        }
        
        await executePLQNTrade('sell', token, qty, amount, price);
        plqnAIChatState.awaitingQuantity = false;
        return `✅ Successfully sold ${qty} ${token} for ${fmtINR(amount)}!`;
      }
    }
    
    // Check for token names
    const tokenFound = PLQN_TOKENS.find(([sym]) => 
      message.includes(sym.toLowerCase()) || message.includes(sym)
    );
    
    if(tokenFound){
      const [sym, name] = tokenFound;
      const price = livePrices[sym] || 0;
      const marketInfo = marketData[sym] || {};
      
      // Market cap inquiry
      if(message.includes('market cap') || message.includes('marketcap')){
        if(marketInfo.market_cap){
          const marketCap = marketInfo.market_cap;
          const rank = marketInfo.market_cap_rank || 'N/A';
          return `📊 ${name} (${sym}) Market Data:<br>
                  💰 Market Cap: ₹${fmtNumber(marketCap)}<br>
                  🏆 Rank: #${rank}<br>
                  💵 Current Price: ${fmtINR(price)}`;
        } else {
          return `Unable to fetch market cap data for ${sym} right now.`;
        }
      }
      
      // 24h change inquiry
      if(message.includes('24') || message.includes('change') || message.includes('growth')){
        if(marketInfo.price_change_24h !== undefined){
          const change = marketInfo.price_change_24h;
          const changeIcon = change >= 0 ? '📈' : '📉';
          const changeText = change >= 0 ? 'gained' : 'lost';
          return `${changeIcon} ${name} (${sym}) 24h Performance:<br>
                  📊 Price Change: ${(change >= 0 ? '+' : '')}${change.toFixed(2)}%<br>
                  💵 Current Price: ${fmtINR(price)}<br>
                  📈 ${sym} has ${changeText} ${Math.abs(change).toFixed(2)}% in the last 24 hours.`;
        } else {
          return `Unable to fetch 24h change data for ${sym} right now.`;
        }
      }
      
      // Token price inquiry
      if(message.includes('price')){
        if(price > 0){
          const change = marketInfo.price_change_24h || 0;
          const changeIcon = change >= 0 ? '📈' : '📉';
          return `💵 ${name} (${sym}) Live Price: ${fmtINR(price)}<br>
                  ${changeIcon} 24h Change: ${(change >= 0 ? '+' : '')}${change.toFixed(2)}%`;
        } else {
          return `Unable to fetch ${sym} price right now. Please try again.`;
        }
      }
      
      // Buy request
      if(message.includes('buy')){
        plqnAIChatState.currentAction = 'buy';
        plqnAIChatState.currentToken = sym;
        plqnAIChatState.awaitingQuantity = true;
        return `🛒 You want to buy ${name} (${sym})<br>
                💵 Current price: ${fmtINR(price)}<br>
                📊 24h change: ${(marketInfo.price_change_24h >= 0 ? '+' : '')}${(marketInfo.price_change_24h || 0).toFixed(2)}%<br><br>
                How much quantity would you like to buy?`;
      }
      
      // Sell request
      if(message.includes('sell')){
        const holding = await getHolding(sym);
        if(holding.qty <= 0){
          return `❌ You don't hold any ${sym} tokens to sell.`;
        }
        
        plqnAIChatState.currentAction = 'sell';
        plqnAIChatState.currentToken = sym;
        plqnAIChatState.awaitingQuantity = true;
        return `💰 You want to sell ${name} (${sym})<br>
                📦 Your holdings: ${holding.qty} ${sym}<br>
                💵 Current price: ${fmtINR(price)}<br>
                📊 Potential value: ${fmtINR(holding.qty * price)}<br><br>
                How much quantity would you like to sell?`;
      }
      
      // Token details with enhanced info
      if(message.includes('detail')){
        const holding = await getHolding(sym);
        const change = marketInfo.price_change_24h || 0;
        const marketCap = marketInfo.market_cap || 0;
        const rank = marketInfo.market_cap_rank || 'N/A';
        
        return `📋 ${name} (${sym}) Complete Details:<br><br>
                💵 Current Price: ${fmtINR(price)}<br>
                📊 24h Change: ${(change >= 0 ? '+' : '')}${change.toFixed(2)}%<br>
                💰 Market Cap: ₹${fmtNumber(marketCap)}<br>
                🏆 Market Rank: #${rank}<br>
                📦 Your Holdings: ${holding.qty} ${sym}<br>
                💎 Investment Value: ${fmtINR(holding.cost_inr)}<br>
                📈 Current Value: ${fmtINR(holding.qty * price)}`;
      }
      
      // General token inquiry
      const change = marketInfo.price_change_24h || 0;
      const changeIcon = change >= 0 ? '📈' : '📉';
      return `${changeIcon} ${name} (${sym})<br>
              💵 Price: ${fmtINR(price)}<br>
              📊 24h: ${(change >= 0 ? '+' : '')}${change.toFixed(2)}%<br><br>
              Would you like to buy, sell, or get more details?`;
    }
    
    // Balance inquiry
    if(message.includes('balance') || message.includes('wallet')){
      const balance = await getWalletINR();
      return `💰 Your current wallet balance: ${fmtINR(balance)}`;
    }
    
    // Holdings inquiry with enhanced display
    if(message.includes('holding') || message.includes('portfolio')){
      const holdings = await getHoldingsMap();
      const holdingsList = Object.keys(holdings);
      
      if(holdingsList.length === 0){
        return "📦 You don't have any token holdings currently.";
      }
      
      let response = "📊 Your Portfolio Holdings:<br><br>";
      let totalValue = 0;
      
      for(const sym of holdingsList){
        const holding = holdings[sym];
        const currentPrice = livePrices[sym] || 0;
        const currentValue = holding.qty * currentPrice;
        const change = marketData[sym]?.price_change_24h || 0;
        const changeIcon = change >= 0 ? '📈' : '📉';
        
        totalValue += currentValue;
        response += `${changeIcon} ${sym}: ${holding.qty} tokens<br>`;
        response += `   💰 Value: ${fmtINR(currentValue)} (${(change >= 0 ? '+' : '')}${change.toFixed(2)}%)<br><br>`;
      }
      
      response += `📊 Total Portfolio Value: ${fmtINR(totalValue)}`;
      return response;
    }
    
    // Help
    if(message.includes('help')){
      return `🤖 PLQN AI Can Help You With:<br><br>
              🔹 Token prices: "BTC price"<br>
              🔹 Market cap: "ETH market cap"<br>
              🔹 24h changes: "SOL 24 hour change"<br>
              🔹 Buy tokens: "buy BTC"<br>
              🔹 Sell tokens: "sell ETH"<br>
              🔹 Check balance: "wallet balance"<br>
              🔹 View portfolio: "my holdings"<br>
              🔹 Token details: "BTC details"<br><br>
              What would you like to explore?`;
    }
    
    // Default response for unrecognized queries
    return "🤖 No signal. I specialize in trading assistance, market data, and portfolio management. What else can I help you with?";
  }

  /* ---------- EXECUTE TRADE ---------- */
  async function executePLQNTrade(action, symbol, qty, amount, price){
    if(action === 'buy'){
      const balance = await getWalletINR();
      const currentHolding = await getHolding(symbol);
      
      await setWalletINR(balance - amount);
      await updateHolding(symbol, currentHolding.qty + qty, currentHolding.cost_inr + amount);
      await saveTrade('buy', symbol, qty, amount, price);
      
    } else if(action === 'sell'){
      const balance = await getWalletINR();
      const currentHolding = await getHolding(symbol);
      
      await setWalletINR(balance + amount);
      await updateHolding(symbol, currentHolding.qty - qty, Math.max(0, currentHolding.cost_inr - amount));
      await saveTrade('sell', symbol, qty, amount, price);
    }
  }

  /* ---------- TRADE MODALS ---------- */
  function PLQN_buyToken(symbol){
    showPLQNTradeModal('buy', symbol);
  }

  function PLQN_sellToken(symbol){
    showPLQNTradeModal('sell', symbol);
  }

  async function showPLQNTradeModal(action, symbol){
    const price = livePrices[symbol] || 0;
    if(price <= 0){
      toast('Price not available', false);
      return;
    }

    const balance = await getWalletINR();
    const holding = await getHolding(symbol);
    const marketInfo = marketData[symbol] || {};
    const change = marketInfo.price_change_24h || 0;

    const modal = document.createElement('div');
    modal.className = 'plqn-trade-modal';
    modal.innerHTML = `
      <div class="plqn-trade-container">
        <div class="plqn-trade-header ${action}">
          <h3>${action === 'buy' ? '🛒 Buy' : '💰 Sell'} ${symbol}</h3>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;">×</button>
        </div>
        <div class="plqn-trade-body">
          <div class="plqn-trade-info">
            <div>💰 Balance: ${fmtINR(balance)}</div>
            <div>📦 Holdings: ${holding.qty} ${symbol}</div>
            <div>💵 Live Price: ${fmtINR(price)}</div>
            <div>📊 24h Change: ${(change >= 0 ? '+' : '')}${change.toFixed(2)}%</div>
          </div>
          <input type="number" class="plqn-trade-input" id="plqn-trade-amount" placeholder="Enter INR amount (Min ₹100)" />
          <input type="number" class="plqn-trade-input" id="plqn-trade-qty" placeholder="Enter token quantity" />
          <button class="plqn-confirm-btn ${action}" onclick="PLQN_confirmTrade('${action}', '${symbol}', ${price})">
            ${action === 'buy' ? '🚀 Buy Now' : '💸 Sell Now'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Auto-calculate quantity/amount
    const amountInput = document.getElementById('plqn-trade-amount');
    const qtyInput = document.getElementById('plqn-trade-qty');

    amountInput.addEventListener('input', () => {
      if(amountInput.value && price > 0){
        qtyInput.value = (parseFloat(amountInput.value) / price).toFixed(8);
      }
    });

    qtyInput.addEventListener('input', () => {
      if(qtyInput.value && price > 0){
        amountInput.value = (parseFloat(qtyInput.value) * price).toFixed(2);
      }
    });
  }

  async function PLQN_confirmTrade(action, symbol, price){
    const amount = parseFloat(document.getElementById('plqn-trade-amount')?.value || 0);
    const qty = parseFloat(document.getElementById('plqn-trade-qty')?.value || 0);

    if(!amount || !qty || amount < MIN_INR){
      toast(`Minimum ${fmtINR(MIN_INR)} required`, false);
      return;
    }

    if(action === 'buy'){
      const balance = await getWalletINR();
      if(amount > balance){
        toast('Insufficient balance', false);
        return;
      }
    } else {
      const holding = await getHolding(symbol);
      if(qty > holding.qty){
        toast('Insufficient holdings', false);
        return;
      }
    }

    await executePLQNTrade(action, symbol, qty, amount, price);
    
    // Close modal
    document.querySelector('.plqn-trade-modal')?.remove();
    
    toast(`Successfully ${action === 'buy' ? 'bought' : 'sold'} ${qty} ${symbol}! 🎉`, true);
  }

  /* ---------- UPDATE MARKET RANKS ---------- */
  function updateMarketRanks(){
    PLQN_TOKENS.forEach(([sym]) => {
      const rankEl = document.getElementById('plqn-rank-' + sym);
      if(rankEl && marketData[sym]){
        rankEl.textContent = '#' + (marketData[sym].market_cap_rank || '--');
      }
    });
  }

  /* ---------- GLOBAL FUNCTIONS ---------- */
  window.PLQN_openAI = PLQN_openAI;
  window.PLQN_closeAI = PLQN_closeAI;
  window.PLQN_sendMessage = PLQN_sendMessage;
  window.PLQN_buyToken = PLQN_buyToken;
  window.PLQN_sellToken = PLQN_sellToken;
  window.PLQN_confirmTrade = PLQN_confirmTrade;

  /* ---------- INITIALIZATION ---------- */
  function initPLQN(){
    renderPLQNInterface();
    refreshPricesAndMarketData();
    updateMarketRanks();
    setInterval(() => {
      refreshPricesAndMarketData();
      updateMarketRanks();
    }, PRICE_REFRESH_MS);
  }

  // Auto-initialize when DOM is ready
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initPLQN);
  } else {
    initPLQN();
  }

})();