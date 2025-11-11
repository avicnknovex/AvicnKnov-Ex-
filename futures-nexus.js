/* ==========================================================
   futures-nexus.js – NEXUS Futures Trading with AVICNKNOV AI
   Complete Trading System + Intelligent AI Assistant
   ========================================================== */
(function(){

  /* ---------- CONFIG ---------- */
  const SUPA_URL  = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
  const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

  const MODE              = 'local';     // flip to 'supa' when holdings table ready
  const MIN_INR           = 100;
  const PRICE_REFRESH_MS  = 30000;
  const HOLD_KEY          = 'AVX_nexus_holdings'; // localStorage holdings map

  /* ---------- NEXUS TOKENS (Premium Trading Pairs) ---------- */
  const NEXUS_TOKENS = [
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
    ['ZEC','Zcash','zcash'],
    ['COMP','Compound','compound-governance-token'],
    ['ENS','ENS','ethereum-name-service'],
    ['KAVA','Kava','kava'],
    ['CELO','Celo','celo'],
    ['STX','Stacks','blockstack'],
    ['WAVES','Waves','waves']
  ];

  const CG_ID_MAP = {};
  NEXUS_TOKENS.forEach(([s,_,id])=>{ CG_ID_MAP[s]=id; });

  /* ---------- SUPABASE CLIENT ---------- */
  const supaLib = window.supabase || (window.parent && window.parent.supabase);
  if(!supaLib){ console.error("Supabase lib not found."); return; }
  const supa = supaLib.createClient(SUPA_URL, SUPA_KEY);

  /* ---------- PRICE CACHE ---------- */
  let livePrices = {}; // {SYM:inr}

  /* ---------- UTILS ---------- */
  const fmtINR = v => '₹' + Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});

  function toast(msg, ok=true){
    let t = document.getElementById('nexus-toast');
    if(!t){
      t = document.createElement('div');
      t.id='nexus-toast';
      t.style.cssText=`position:fixed;top:20px;right:20px;background:#333;color:white;padding:12px 20px;border-radius:8px;z-index:99999;opacity:0;transition:opacity 0.3s;`;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = ok ? '#28a745' : '#dc3545';
    t.style.opacity = '1';
    setTimeout(()=>{t.style.opacity='0';},3000);
  }

  /* ---------- HOLDINGS LOCAL ---------- */
  function localGetHoldings(){
    try{ return JSON.parse(localStorage.getItem(HOLD_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function localSetHoldings(obj){
    localStorage.setItem(HOLD_KEY, JSON.stringify(obj));
  }

  /* ---------- HOLDINGS MANAGEMENT ---------- */
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

  /* ---------- LIVE PRICE REFRESH ---------- */
  async function refreshPrices(){
    try{
      const ids = NEXUS_TOKENS.map(t=>t[2]).join(',');
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=inr`);
      const data = await res.json();
      NEXUS_TOKENS.forEach(([sym,_,id])=>{
        const p = Number(data[id]?.inr||0);
        livePrices[sym]=p;
        const el=document.getElementById('nexus-price-'+sym);
        if(el) el.textContent=fmtINR(p);
      });
    }catch(e){ console.error('NEXUS price fetch fail',e); }
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
      if(error){ console.error('NEXUS trade insert error',error); }
    }catch(e){
      console.error('NEXUS saveTrade fail',e);
    }
  }

  /* ---------- RENDER NEXUS INTERFACE ---------- */
  function renderNexusInterface(){
    const c=document.getElementById('nexus'); 
    if(!c) return;

    c.innerHTML = `
      <div class="nexus-header">
        <div class="nexus-title">
          <h2>🚀 NEXUS FUTURES</h2>
          <p>Advanced Trading Platform</p>
        </div>
        <div class="nexus-ai-btn" onclick="NEXUS_openAI()">
          <span class="ai-icon">🤖</span>
          <span class="ai-text">AVICNKNOV AI</span>
        </div>
      </div>
      
      <div class="nexus-tokens">
        ${NEXUS_TOKENS.map(([sym,name])=>`
          <div class="nexus-token-card">
            <div class="token-info">
              <div class="token-symbol">${sym}</div>
              <div class="token-name">${name}</div>
              <div class="token-price" id="nexus-price-${sym}">₹--</div>
            </div>
            <div class="token-actions">
              <button class="nexus-buy-btn" onclick="NEXUS_buyToken('${sym}')">Buy</button>
              <button class="nexus-sell-btn" onclick="NEXUS_sellToken('${sym}')">Sell</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    addNexusStyles();
  }

  /* ---------- ADD NEXUS STYLES ---------- */
  function addNexusStyles(){
    if(document.getElementById('nexus-styles')) return;
    const style = document.createElement('style');
    style.id = 'nexus-styles';
    style.textContent = `
      .nexus-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        margin-bottom: 20px;
        color: white;
      }
      
      .nexus-title h2 {
        margin: 0;
        font-size: 24px;
        font-weight: bold;
      }
      
      .nexus-title p {
        margin: 5px 0 0 0;
        opacity: 0.9;
        font-size: 14px;
      }
      
      .nexus-ai-btn {
        background: rgba(255,255,255,0.2);
        border: 2px solid rgba(255,255,255,0.3);
        border-radius: 50px;
        padding: 12px 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.3s;
        backdrop-filter: blur(10px);
      }
      
      .nexus-ai-btn:hover {
        background: rgba(255,255,255,0.3);
        transform: scale(1.05);
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
      }
      
      .ai-icon {
        font-size: 18px;
      }
      
      .ai-text {
        font-weight: bold;
        font-size: 14px;
      }
      
      .nexus-tokens {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 15px;
        padding: 0 10px;
      }
      
      .nexus-token-card {
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 12px;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.08);
        transition: transform 0.2s;
      }
      
      .nexus-token-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.12);
      }
      
      .token-symbol {
        font-size: 18px;
        font-weight: bold;
        color: #333;
      }
      
      .token-name {
        font-size: 14px;
        color: #666;
        margin-top: 2px;
      }
      
      .token-price {
        font-size: 16px;
        font-weight: bold;
        color: #28a745;
        margin-top: 8px;
      }
      
      .token-actions {
        display: flex;
        gap: 10px;
      }
      
      .nexus-buy-btn, .nexus-sell-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s;
        font-size: 14px;
      }
      
      .nexus-buy-btn {
        background: #28a745;
        color: white;
      }
      
      .nexus-buy-btn:hover {
        background: #218838;
        transform: scale(1.05);
      }
      
      .nexus-sell-btn {
        background: #dc3545;
        color: white;
      }
      
      .nexus-sell-btn:hover {
        background: #c82333;
        transform: scale(1.05);
      }

      /* AI CHAT STYLES */
      .ai-chat-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10000;
        display: none;
        backdrop-filter: blur(5px);
      }
      
      .ai-chat-container {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 500px;
        height: 600px;
        background: white;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        display: flex;
        flex-direction: column;
      }
      
      .ai-chat-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .ai-chat-title {
        font-size: 18px;
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .ai-close-btn {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        transition: all 0.3s;
      }
      
      .ai-close-btn:hover {
        background: rgba(255,255,255,0.3);
        transform: scale(1.1);
      }
      
      .ai-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 15px;
      }
      
      .ai-message, .user-message {
        max-width: 80%;
        padding: 12px 16px;
        border-radius: 18px;
        word-wrap: break-word;
      }
      
      .ai-message {
        align-self: flex-start;
        background: #f0f0f0;
        color: #333;
      }
      
      .user-message {
        align-self: flex-end;
        background: #667eea;
        color: white;
      }
      
      .ai-input-container {
        padding: 20px;
        border-top: 1px solid #e0e0e0;
        display: flex;
        gap: 10px;
      }
      
      .ai-input {
        flex: 1;
        padding: 12px 16px;
        border: 2px solid #e0e0e0;
        border-radius: 25px;
        outline: none;
        font-size: 14px;
        transition: all 0.3s;
      }
      
      .ai-input:focus {
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }
      
      .ai-send-btn {
        background: #667eea;
        color: white;
        border: none;
        width: 45px;
        height: 45px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        transition: all 0.3s;
      }
      
      .ai-send-btn:hover {
        background: #5a6fd8;
        transform: scale(1.05);
      }

      /* TRADE MODAL STYLES */
      .nexus-trade-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
        display: none;
        backdrop-filter: blur(5px);
      }
      
      .nexus-trade-container {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 400px;
        background: white;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      
      .nexus-trade-header {
        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
        color: white;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .nexus-trade-header.sell {
        background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%);
      }
      
      .nexus-trade-body {
        padding: 20px;
      }
      
      .nexus-trade-info {
        background: #f8f9fa;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 20px;
      }
      
      .nexus-trade-input {
        width: 100%;
        padding: 12px 16px;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        margin-bottom: 15px;
        font-size: 16px;
        outline: none;
        transition: all 0.3s;
      }
      
      .nexus-trade-input:focus {
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }
      
      .nexus-confirm-btn {
        width: 100%;
        padding: 12px;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s;
        color: white;
      }
      
      .nexus-confirm-btn.buy {
        background: #28a745;
      }
      
      .nexus-confirm-btn.buy:hover {
        background: #218838;
      }
      
      .nexus-confirm-btn.sell {
        background: #dc3545;
      }
      
      .nexus-confirm-btn.sell:hover {
        background: #c82333;
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------- AI CHAT SYSTEM ---------- */
  let aiChatState = {
    isOpen: false,
    awaitingQuantity: false,
    awaitingPrice: false,
    currentAction: null, // 'buy' or 'sell'
    currentToken: null,
    currentTokenPrice: 0
  };

  function NEXUS_openAI(){
    if(aiChatState.isOpen) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'ai-chat-overlay';
    overlay.innerHTML = `
      <div class="ai-chat-container">
        <div class="ai-chat-header">
          <div class="ai-chat-title">
            <span>🤖</span>
            AVICNKNOV AI
          </div>
          <button class="ai-close-btn" onclick="NEXUS_closeAI()">×</button>
        </div>
        <div class="ai-chat-messages" id="ai-messages">
          <div class="ai-message">
            Hello! I'm AVICNKNOV AI, your trading assistant. I can help you with:
            <br>• Buy/Sell tokens
            <br>• Check token prices
            <br>• View your balance
            <br>• Show your holdings
            <br><br>What would you like to know?
          </div>
        </div>
        <div class="ai-input-container">
          <input type="text" class="ai-input" id="ai-input" placeholder="Ask me anything about trading..." />
          <button class="ai-send-btn" onclick="NEXUS_sendMessage()">➤</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    overlay.style.display = 'block';
    aiChatState.isOpen = true;
    
    document.getElementById('ai-input').addEventListener('keypress', function(e){
      if(e.key === 'Enter') NEXUS_sendMessage();
    });
    
    setTimeout(() => document.getElementById('ai-input').focus(), 100);
  }

  function NEXUS_closeAI(){
    const overlay = document.querySelector('.ai-chat-overlay');
    if(overlay) overlay.remove();
    aiChatState.isOpen = false;
    aiChatState.awaitingQuantity = false;
    aiChatState.awaitingPrice = false;
    aiChatState.currentAction = null;
    aiChatState.currentToken = null;
  }

  async function NEXUS_sendMessage(){
    const input = document.getElementById('ai-input');
    if(!input) return;
    
    const message = input.value.trim();
    if(!message) return;
    
    addAIMessage(message, 'user');
    input.value = '';
    
    const response = await processAIMessage(message.toLowerCase());
    addAIMessage(response, 'ai');
  }

  function addAIMessage(message, type){
    const messagesContainer = document.getElementById('ai-messages');
    if(!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'user' ? 'user-message' : 'ai-message';
    messageDiv.innerHTML = message;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  async function processAIMessage(message){
    // Handle quantity input
    if(aiChatState.awaitingQuantity){
      const qty = parseFloat(message);
      if(isNaN(qty) || qty <= 0){
        return "Please enter a valid quantity number.";
      }
      
      const token = aiChatState.currentToken;
      const price = livePrices[token] || 0;
      const amount = qty * price;
      
      if(aiChatState.currentAction === 'buy'){
        const balance = await getWalletINR();
        if(amount > balance){
          aiChatState.awaitingQuantity = false;
          return `Insufficient balance. You have ${fmtINR(balance)} but need ${fmtINR(amount)}.`;
        }
        
        await executeTrade('buy', token, qty, amount, price);
        aiChatState.awaitingQuantity = false;
        return `Successfully bought ${qty} ${token} for ${fmtINR(amount)}!`;
      } else if(aiChatState.currentAction === 'sell'){
        const holding = await getHolding(token);
        if(qty > holding.qty){
          aiChatState.awaitingQuantity = false;
          return `You only hold ${holding.qty} ${token}. Cannot sell ${qty}.`;
        }
        
        await executeTrade('sell', token, qty, amount, price);
        aiChatState.awaitingQuantity = false;
        return `Successfully sold ${qty} ${token} for ${fmtINR(amount)}!`;
      }
    }
    
    // Check for token names
    const tokenFound = NEXUS_TOKENS.find(([sym]) => 
      message.includes(sym.toLowerCase()) || message.includes(sym)
    );
    
    if(tokenFound){
      const [sym, name] = tokenFound;
      const price = livePrices[sym] || 0;
      
      // Token price inquiry
      if(message.includes('price')){
        if(price > 0){
          return `${name} (${sym}) current price: ${fmtINR(price)}`;
        } else {
          return `Unable to fetch ${sym} price right now. Please try again.`;
        }
      }
      
      // Buy request
      if(message.includes('buy')){
        aiChatState.currentAction = 'buy';
        aiChatState.currentToken = sym;
        aiChatState.awaitingQuantity = true;
        return `You want to buy ${name} (${sym}). Current price: ${fmtINR(price)}<br>How much quantity would you like to buy?`;
      }
      
      // Sell request
      if(message.includes('sell')){
        const holding = await getHolding(sym);
        if(holding.qty <= 0){
          return `You don't hold any ${sym} tokens to sell.`;
        }
        
        aiChatState.currentAction = 'sell';
        aiChatState.currentToken = sym;
        aiChatState.awaitingQuantity = true;
        return `You want to sell ${name} (${sym}). You hold: ${holding.qty} ${sym}<br>Current price: ${fmtINR(price)}<br>How much quantity would you like to sell?`;
      }
      
      // Token details
      if(message.includes('detail')){
        const holding = await getHolding(sym);
        return `${name} (${sym})<br>Current Price: ${fmtINR(price)}<br>Your Holdings: ${holding.qty} ${sym}<br>Investment Value: ${fmtINR(holding.cost_inr)}`;
      }
      
      // General token inquiry
      return `${name} (${sym}) - Current price: ${fmtINR(price)}<br>Would you like to buy, sell, or get more details about this token?`;
    }
    
    // Balance inquiry
    if(message.includes('balance') || message.includes('wallet')){
      const balance = await getWalletINR();
      return `Your current wallet balance: ${fmtINR(balance)}`;
    }
    
    // Holdings inquiry
    if(message.includes('holding') || message.includes('portfolio')){
      const holdings = await getHoldingsMap();
      const holdingsList = Object.keys(holdings);
      
      if(holdingsList.length === 0){
        return "You don't have any token holdings currently.";
      }
      
      let response = "Your current holdings:<br>";
      for(const sym of holdingsList){
        const holding = holdings[sym];
        const currentPrice = livePrices[sym] || 0;
        const currentValue = holding.qty * currentPrice;
        response += `• ${sym}: ${holding.qty} tokens (Value: ${fmtINR(currentValue)})<br>`;
      }
      return response;
    }
    
    // Help
    if(message.includes('help')){
      return `I can help you with:<br>• Ask token prices: "BTC price"<br>• Buy tokens: "buy BTC"<br>• Sell tokens: "sell ETH"<br>• Check balance: "wallet balance"<br>• View holdings: "my holdings"<br>• Token details: "BTC details"<br><br>What would you like to do?`;
    }
    
    // Default response for unrecognized queries
    return "No signal. I can help you with token trading, prices, balance, and holdings. What else can I help you with?";
  }

  /* ---------- EXECUTE TRADE ---------- */
  async function executeTrade(action, symbol, qty, amount, price){
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
  function NEXUS_buyToken(symbol){
    showTradeModal('buy', symbol);
  }

  function NEXUS_sellToken(symbol){
    showTradeModal('sell', symbol);
  }

  async function showTradeModal(action, symbol){
    const price = livePrices[symbol] || 0;
    if(price <= 0){
      toast('Price not available', false);
      return;
    }

    const balance = await getWalletINR();
    const holding = await getHolding(symbol);

    const modal = document.createElement('div');
    modal.className = 'nexus-trade-modal';
    modal.innerHTML = `
      <div class="nexus-trade-container">
        <div class="nexus-trade-header ${action}">
          <h3>${action === 'buy' ? 'Buy' : 'Sell'} ${symbol}</h3>
          <button onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="nexus-trade-body">
          <div class="nexus-trade-info">
            <div>Balance: ${fmtINR(balance)}</div>
            <div>Holdings: ${holding.qty} ${symbol}</div>
            <div>Live Price: ${fmtINR(price)}</div>
          </div>
          <input type="number" class="nexus-trade-input" id="trade-amount" placeholder="Enter INR amount" />
          <input type="number" class="nexus-trade-input" id="trade-qty" placeholder="Enter quantity" />
          <button class="nexus-confirm-btn ${action}" onclick="NEXUS_confirmTrade('${action}', '${symbol}', ${price})">
            ${action === 'buy' ? 'Buy Now' : 'Sell Now'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Auto-calculate quantity/amount
    const amountInput = document.getElementById('trade-amount');
    const qtyInput = document.getElementById('trade-qty');

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

  async function NEXUS_confirmTrade(action, symbol, price){
    const amount = parseFloat(document.getElementById('trade-amount')?.value || 0);
    const qty = parseFloat(document.getElementById('trade-qty')?.value || 0);

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

    await executeTrade(action, symbol, qty, amount, price);
    
    // Close modal
    document.querySelector('.nexus-trade-modal')?.remove();
    
    toast(`Successfully ${action === 'buy' ? 'bought' : 'sold'} ${qty} ${symbol}!`, true);
  }

  /* ---------- GLOBAL FUNCTIONS ---------- */
  window.NEXUS_openAI = NEXUS_openAI;
  window.NEXUS_closeAI = NEXUS_closeAI;
  window.NEXUS_sendMessage = NEXUS_sendMessage;
  window.NEXUS_buyToken = NEXUS_buyToken;
  window.NEXUS_sellToken = NEXUS_sellToken;
  window.NEXUS_confirmTrade = NEXUS_confirmTrade;

  /* ---------- INITIALIZATION ---------- */
  function initNexus(){
    renderNexusInterface();
    refreshPrices();
    setInterval(refreshPrices, PRICE_REFRESH_MS);
  }

  // Auto-initialize when DOM is ready
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initNexus);
  } else {
    initNexus();
  }

})();