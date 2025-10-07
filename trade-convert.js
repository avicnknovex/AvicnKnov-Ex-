/* ==========================================================
   trade-convert.js – Advanced Token Trading & Conversion System
   Supabase wallet + local holdings + token conversion + buy/sell + charts
   ========================================================== */
(function(){
'use strict';

/* ---------- CONFIG ---------- */
const SUPA_URL = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

const MODE = 'local';
const MIN_INR = 100;
const PRICE_REFRESH_MS = 30000;
const HOLD_KEY = 'AVX_convert_holdings_test';

/* ---------- TOKENS ---------- */
const TOKENS = [
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
  ['APT','Aptos','aptos']
];

const CG_ID_MAP = {};
TOKENS.forEach(([s,_,id])=>CG_ID_MAP[s]=id);

/* ---------- SUPABASE CLIENT ---------- */
const supaLib = window.supabase || (window.parent && window.parent.supabase);
if(!supaLib){console.error('Supabase lib not found.');return;}
const supa = supaLib.createClient(SUPA_URL, SUPA_KEY);

/* ---------- PRICE CACHE ---------- */
let livePrices = {};

/* ---------- UTILS ---------- */
const fmtINR = v => '₹' + Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
function toast(msg, ok=true){
  let t = document.getElementById('avx-toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'avx-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = ok?'ok':'err';
  t.style.opacity = '1';
  setTimeout(()=>{t.style.opacity='0';},3000);
}

/* ---------- HOLDINGS LOCAL ---------- */
function localGetHoldings(){
  try{return JSON.parse(localStorage.getItem(HOLD_KEY)) || {};}
  catch(e){return {};}
}
function localSetHoldings(obj){
  localStorage.setItem(HOLD_KEY, JSON.stringify(obj));
}

/* ---------- HOLDINGS SUPA (future) ---------- */
async function supaGetHoldingsMap(){
  const {data:{user}} = await supa.auth.getUser();
  if(!user) return {};
  const {data,error} = await supa.from('user_holdings').select('symbol,qty,cost_inr').eq('user_id',user.id);
  if(error){console.warn('supa holdings error',error);return {};}
  const map = {};
  data.forEach(r=>map[r.symbol.toUpperCase()]={qty:Number(r.qty||0),cost_inr:Number(r.cost_inr||0)});
  return map;
}
async function supaUpsertHolding(symbol,qty,cost_inr){
  const {data:{user}} = await supa.auth.getUser();
  if(!user) return;
  if(qty<=0){
    await supa.from('user_holdings').delete().eq('user_id',user.id).eq('symbol',symbol);
    return;
  }
  await supa.from('user_holdings').upsert({user_id:user.id,symbol,qty,cost_inr},{onConflict:'user_id,symbol'});
}

async function getHoldingsMap(){return MODE==='supa'?await supaGetHoldingsMap():localGetHoldings();}
async function updateHolding(symbol,qty,cost_inr){
  symbol = symbol.toUpperCase();
  if(MODE==='supa'){await supaUpsertHolding(symbol,qty,cost_inr);}
  else{
    const h = localGetHoldings();
    if(qty<=0) delete h[symbol];
    else h[symbol] = {qty,cost_inr};
    localSetHoldings(h);
  }
}
async function getHolding(symbol){
  symbol = symbol.toUpperCase();
  const map = await getHoldingsMap();
  const r = map[symbol];
  if(!r) return {qty:0,cost_inr:0};
  return {qty:Number(r.qty||0),cost_inr:Number(r.cost_inr||0)};
}

/* ---------- WALLET (Supabase) ---------- */
async function getUser(){
  const {data:{user}} = await supa.auth.getUser();
  return user;
}
async function getWalletINR(){
  const u = await getUser();
  if(!u) return 0;
  const {data,error} = await supa.from('user_wallets').select('balance').eq('uid',u.id).single();
  if(error){console.error('wallet fetch error',error);return 0;}
  return Number(data?.balance||0);
}
async function setWalletINR(newBal){
  const u = await getUser();
  if(!u) return;
  const {error} = await supa.from('user_wallets').update({balance:newBal}).eq('uid',u.id);
  if(error) console.error('wallet update error',error);
  if(typeof window.updateWalletBalance==='function'){window.updateWalletBalance();}
  else if(window.parent && typeof window.parent.updateWalletBalance==='function'){window.parent.updateWalletBalance();}
}

/* ---------- SAVE TRADE -> user_trades ---------- */
async function saveTrade(action,symbol,qty,amount_inr,price_inr){
  try{
    const {data:{user}} = await supa.auth.getUser();
    if(!user) return;
    const {error} = await supa.from('user_trades').insert([{
      user_id:user.id,action,symbol,qty,price_inr,amount_inr,created_at:new Date().toISOString()
    }]);
    if(error) console.error('trade save error',error);
  }catch(e){console.error('saveTrade fail',e);}
}

/* ---------- PRICE REFRESH ---------- */
async function refreshPrices(){
  try{
    const ids = TOKENS.map(t=>t[2]).join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=inr`);
    const data = await res.json();
    TOKENS.forEach(([sym,_,id])=>{
      const p = Number(data[id]?.inr||0);
      livePrices[sym] = p;
      const el = document.getElementById('price-convert-'+sym);
      if(el) el.textContent = fmtINR(p);
    });
    console.log('Prices updated:', livePrices);
  }catch(e){console.error('convert price fetch fail',e);}
}

/* ---------- RENDER UI ---------- */
function renderUI(){
  const container = document.getElementById('convert');
  if(!container) return;
  
  container.innerHTML = `
    <!-- CONVERT SECTION (TOP) -->
    <div class="avx-convert-section">
      <div class="avx-convert-header">
        <h2>🔄 Advanced Token Converter</h2>
        <p>Convert any token to any other token (Min ₹${MIN_INR})</p>
      </div>
      
      <div class="avx-convert-box">
        <div class="avx-convert-row">
          <div class="avx-convert-col">
            <label>From Token</label>
            <select id="avx-from-token" class="avx-token-select">
              <option value="">Select Token</option>
              ${TOKENS.map(([sym,name])=>`<option value="${sym}">${sym} - ${name}</option>`).join('')}
            </select>
            <div class="avx-token-info">
              <span id="avx-from-balance">Balance: 0</span>
              <span id="avx-from-price">Price: ₹0</span>
            </div>
          </div>
          
          <div class="avx-convert-arrow">
            <button id="avx-swap-tokens" class="avx-swap-btn">⇄</button>
          </div>
          
          <div class="avx-convert-col">
            <label>To Token</label>
            <select id="avx-to-token" class="avx-token-select">
              <option value="">Select Token</option>
              ${TOKENS.map(([sym,name])=>`<option value="${sym}">${sym} - ${name}</option>`).join('')}
            </select>
            <div class="avx-token-info">
              <span id="avx-to-balance">Balance: 0</span>
              <span id="avx-to-price">Price: ₹0</span>
            </div>
          </div>
        </div>
        
        <div class="avx-convert-amounts">
          <div class="avx-amount-group">
            <label>Amount to Convert</label>
            <div class="avx-input-group">
              <input type="number" id="avx-from-amount" placeholder="0.00" step="0.00000001" />
              <button id="avx-max-convert" class="avx-max-btn">MAX</button>
            </div>
          </div>
          
          <div class="avx-convert-result">
            <div class="avx-result-label">You will receive</div>
            <div id="avx-to-amount" class="avx-result-amount">0.00</div>
            <div id="avx-conversion-rate" class="avx-conversion-rate">Rate: 1 = 0</div>
          </div>
        </div>
        
        <button id="avx-convert-btn" class="avx-convert-btn" disabled>
          🔄 Convert Tokens
        </button>
      </div>
    </div>

    <!-- TRADING SECTION (BOTTOM) -->
    <div class="avx-trading-section">
      <div class="avx-trading-header">
        <h3>💰 Buy & Sell Tokens</h3>
      </div>
      
      <div class="avx-token-list" id="avx-token-list">
        ${TOKENS.map(([sym,name])=>`
          <div class="avx-token-row">
            <div class="avx-token-left" onclick="AVX_convertShowChart('${sym}')">
              <div class="avx-token-symbol">${sym}</div>
              <div class="avx-token-name">${name}</div>
              <div class="avx-token-price" id="price-convert-${sym}">₹--</div>
            </div>
            <div class="avx-token-actions">
              <button class="avx-buy-btn" onclick="AVX_convertBuyToken('${sym}')">Buy</button>
              <button class="avx-sell-btn" onclick="AVX_convertSellToken('${sym}')">Sell</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  setupConvertEvents();
}

/* ---------- CONVERT EVENTS ---------- */
function setupConvertEvents(){
  const fromSelect = document.getElementById('avx-from-token');
  const toSelect = document.getElementById('avx-to-token');
  const fromAmount = document.getElementById('avx-from-amount');
  const convertBtn = document.getElementById('avx-convert-btn');
  const swapBtn = document.getElementById('avx-swap-tokens');
  const maxBtn = document.getElementById('avx-max-convert');
  
  if(fromSelect) fromSelect.addEventListener('change', updateConvertInfo);
  if(toSelect) toSelect.addEventListener('change', updateConvertInfo);
  if(fromAmount) fromAmount.addEventListener('input', calculateConversion);
  if(convertBtn) convertBtn.addEventListener('click', executeConversion);
  if(swapBtn) swapBtn.addEventListener('click', swapTokens);
  if(maxBtn) maxBtn.addEventListener('click', setMaxAmount);
}

async function updateConvertInfo(){
  const fromToken = document.getElementById('avx-from-token')?.value;
  const toToken = document.getElementById('avx-to-token')?.value;
  
  if(fromToken){
    const holding = await getHolding(fromToken);
    const price = livePrices[fromToken] || 0;
    const balanceEl = document.getElementById('avx-from-balance');
    const priceEl = document.getElementById('avx-from-price');
    if(balanceEl) balanceEl.textContent = `Balance: ${holding.qty.toFixed(8)} ${fromToken}`;
    if(priceEl) priceEl.textContent = `Price: ${fmtINR(price)}`;
  }
  
  if(toToken){
    const holding = await getHolding(toToken);
    const price = livePrices[toToken] || 0;
    const balanceEl = document.getElementById('avx-to-balance');
    const priceEl = document.getElementById('avx-to-price');
    if(balanceEl) balanceEl.textContent = `Balance: ${holding.qty.toFixed(8)} ${toToken}`;
    if(priceEl) priceEl.textContent = `Price: ${fmtINR(price)}`;
  }
  
  calculateConversion();
  updateConvertButton();
}

function calculateConversion(){
  const fromTokenEl = document.getElementById('avx-from-token');
  const toTokenEl = document.getElementById('avx-to-token');
  const fromAmountEl = document.getElementById('avx-from-amount');
  const toAmountEl = document.getElementById('avx-to-amount');
  const conversionRateEl = document.getElementById('avx-conversion-rate');
  
  if(!fromTokenEl || !toTokenEl || !fromAmountEl || !toAmountEl || !conversionRateEl) return;
  
  const fromToken = fromTokenEl.value;
  const toToken = toTokenEl.value;
  const fromAmount = Number(fromAmountEl.value || 0);
  
  if(!fromToken || !toToken || fromAmount <= 0){
    toAmountEl.textContent = '0.00';
    conversionRateEl.textContent = 'Rate: 1 = 0';
    return;
  }
  
  const fromPrice = livePrices[fromToken] || 0;
  const toPrice = livePrices[toToken] || 0;
  
  if(fromPrice > 0 && toPrice > 0){
    const inrValue = fromAmount * fromPrice;
    const toAmount = inrValue / toPrice;
    const rate = fromPrice / toPrice;
    
    toAmountEl.textContent = toAmount.toFixed(8);
    conversionRateEl.textContent = `Rate: 1 ${fromToken} = ${rate.toFixed(8)} ${toToken}`;
  } else {
    toAmountEl.textContent = '0.00';
    conversionRateEl.textContent = 'Rate: Price loading...';
  }
}

function updateConvertButton(){
  const fromTokenEl = document.getElementById('avx-from-token');
  const toTokenEl = document.getElementById('avx-to-token');
  const fromAmountEl = document.getElementById('avx-from-amount');
  const convertBtnEl = document.getElementById('avx-convert-btn');
  
  if(!fromTokenEl || !toTokenEl || !fromAmountEl || !convertBtnEl) return;
  
  const fromToken = fromTokenEl.value;
  const toToken = toTokenEl.value;
  const fromAmount = Number(fromAmountEl.value || 0);
  
  // Check if same token selected
  if(fromToken && toToken && fromToken === toToken){
    convertBtnEl.textContent = '❌ Cannot convert same token to same token';
    convertBtnEl.disabled = true;
    convertBtnEl.style.background = '#dc3545';
    return;
  }
  
  const canConvert = fromToken && toToken && fromToken !== toToken && fromAmount > 0;
  convertBtnEl.disabled = !canConvert;
  
  if(canConvert){
    convertBtnEl.textContent = '🔄 Convert Tokens';
    convertBtnEl.style.background = '#28a745';
  } else {
    convertBtnEl.textContent = '🔄 Select tokens and amount';
    convertBtnEl.style.background = '#6c757d';
  }
}

async function setMaxAmount(){
  const fromTokenEl = document.getElementById('avx-from-token');
  const fromAmountEl = document.getElementById('avx-from-amount');
  
  if(!fromTokenEl || !fromAmountEl) return;
  
  const fromToken = fromTokenEl.value;
  if(!fromToken) {
    toast('Please select a token first', false);
    return;
  }
  
  const holding = await getHolding(fromToken);
  fromAmountEl.value = holding.qty.toString();
  calculateConversion();
  updateConvertButton();
}

function swapTokens(){
  const fromSelectEl = document.getElementById('avx-from-token');
  const toSelectEl = document.getElementById('avx-to-token');
  
  if(!fromSelectEl || !toSelectEl) return;
  
  const temp = fromSelectEl.value;
  fromSelectEl.value = toSelectEl.value;
  toSelectEl.value = temp;
  
  updateConvertInfo();
}

async function executeConversion(){
  const fromTokenEl = document.getElementById('avx-from-token');
  const toTokenEl = document.getElementById('avx-to-token');
  const fromAmountEl = document.getElementById('avx-from-amount');
  
  if(!fromTokenEl || !toTokenEl || !fromAmountEl) return;
  
  const fromToken = fromTokenEl.value;
  const toToken = toTokenEl.value;
  const fromAmount = Number(fromAmountEl.value || 0);
  
  if(!fromToken || !toToken){
    toast('Please select both tokens', false);
    return;
  }
  
  if(fromToken === toToken){
    toast('Cannot convert same token to same token', false);
    return;
  }
  
  if(fromAmount <= 0){
    toast('Please enter a valid amount', false);
    return;
  }
  
  const fromPrice = livePrices[fromToken] || 0;
  const toPrice = livePrices[toToken] || 0;
  
  if(fromPrice <= 0 || toPrice <= 0){
    toast('Price data not available. Please wait...', false);
    return;
  }
  
  const inrValue = fromAmount * fromPrice;
  if(inrValue < MIN_INR){
    toast(`Minimum conversion amount is ₹${MIN_INR}`, false);
    return;
  }
  
  const fromHolding = await getHolding(fromToken);
  if(fromAmount > fromHolding.qty){
    toast(`Insufficient ${fromToken} balance`, false);
    return;
  }
  
  const toAmount = inrValue / toPrice;
  const toHolding = await getHolding(toToken);
  
  try {
    // Execute conversion
    const newFromQty = fromHolding.qty - fromAmount;
    const avgFromCost = fromHolding.qty ? fromHolding.cost_inr / fromHolding.qty : 0;
    const newFromCost = newFromQty > 0 ? fromHolding.cost_inr - (fromAmount * avgFromCost) : 0;
    
    await updateHolding(fromToken, newFromQty, newFromCost);
    await updateHolding(toToken, toHolding.qty + toAmount, toHolding.cost_inr + inrValue);
    
    // Save trades
    await saveTrade('convert_sell', fromToken, fromAmount, inrValue, fromPrice);
    await saveTrade('convert_buy', toToken, toAmount, inrValue, toPrice);
    
    toast(`✅ Converted ${fromAmount.toFixed(8)} ${fromToken} to ${toAmount.toFixed(8)} ${toToken}`, true);
    
    // Reset form
    fromAmountEl.value = '';
    updateConvertInfo();
    
  } catch(e) {
    console.error('Conversion error:', e);
    toast('Conversion failed. Please try again.', false);
  }
}

/* ---------- TRADE MODAL (BUY/SELL) ---------- */
function buildTradeModal(){
  const m = document.createElement('div');
  m.id = 'avx-convert-trade-modal';
  m.innerHTML = `
    <div class="avx-modal-overlay"></div>
    <div class="avx-modal-box">
      <div class="avx-modal-header">
        <span id="avx-modal-title">Trade</span>
        <button id="avx-modal-close">×</button>
      </div>
      <div class="avx-modal-info">
        <div id="avx-modal-balance">Balance: ₹--</div>
        <div id="avx-modal-holding">Holdings: --</div>
        <div id="avx-modal-price">Price: ₹--</div>
      </div>
      
      <div class="avx-modal-inputs">
        <label>INR Amount</label>
        <div class="avx-input-group">
          <input type="number" id="avx-modal-inr" placeholder="Enter INR amount" step="0.01" />
          <button id="avx-modal-inr-max" class="avx-max-btn">MAX</button>
        </div>
        
        <label>Token Quantity</label>
        <div class="avx-input-group">
          <input type="number" id="avx-modal-qty" placeholder="Enter quantity" step="0.00000001" />
          <button id="avx-modal-qty-max" class="avx-max-btn">MAX</button>
        </div>
        
        <div class="avx-modal-min">Min ₹${MIN_INR}</div>
      </div>
      
      <button id="avx-modal-confirm" class="avx-modal-confirm">Confirm</button>
    </div>
  `;
  document.body.appendChild(m);
  
  m.querySelector('.avx-modal-overlay').onclick = hideTradeModal;
  m.querySelector('#avx-modal-close').onclick = hideTradeModal;
  
  const inrInput = m.querySelector('#avx-modal-inr');
  const qtyInput = m.querySelector('#avx-modal-qty');
  
  inrInput.addEventListener('input', ()=>{
    const price = Number(m.dataset.price || 0);
    if(price > 0 && inrInput.value) {
      qtyInput.value = (Number(inrInput.value) / price).toFixed(8);
    } else {
      qtyInput.value = '';
    }
  });
  
  qtyInput.addEventListener('input', ()=>{
    const price = Number(m.dataset.price || 0);
    if(price > 0 && qtyInput.value) {
      inrInput.value = (Number(qtyInput.value) * price).toFixed(2);
    } else {
      inrInput.value = '';
    }
  });
  
  m.querySelector('#avx-modal-inr-max').onclick = async()=>{
    if(m.dataset.mode !== 'buy') return;
    const bal = await getWalletINR();
    inrInput.value = bal.toFixed(2);
    const price = Number(m.dataset.price || 0);
    if(price > 0) qtyInput.value = (bal / price).toFixed(8);
  };
  
  m.querySelector('#avx-modal-qty-max').onclick = async()=>{
    if(m.dataset.mode !== 'sell') return;
    const sym = m.dataset.sym;
    const hold = await getHolding(sym);
    qtyInput.value = hold.qty.toString();
    const price = Number(m.dataset.price || 0);
    if(price > 0) inrInput.value = (hold.qty * price).toFixed(2);
  };
  
  m.querySelector('#avx-modal-confirm').onclick = confirmTradeModal;
  return m;
}

async function showTradeModal({mode, sym, price}){
  const m = document.getElementById('avx-convert-trade-modal') || buildTradeModal();
  m.dataset.mode = mode;
  m.dataset.sym = sym;
  m.dataset.price = price;
  
  const bal = await getWalletINR();
  const hold = await getHolding(sym);
  
  const title = m.querySelector('#avx-modal-title');
  const btn = m.querySelector('#avx-modal-confirm');
  
  if(mode === 'buy'){
    title.textContent = `Buy ${sym}`;
    btn.textContent = 'Buy Now';
    btn.classList.remove('sell');
    btn.classList.add('buy');
  } else {
    title.textContent = `Sell ${sym}`;
    btn.textContent = 'Sell Now';
    btn.classList.remove('buy');
    btn.classList.add('sell');
  }
  
  m.querySelector('#avx-modal-balance').textContent = `Balance: ${fmtINR(bal)}`;
  m.querySelector('#avx-modal-holding').textContent = `Holdings: ${hold.qty.toFixed(8)} ${sym}`;
  m.querySelector('#avx-modal-price').textContent = `Price: ${fmtINR(price)}`;
  
  m.querySelector('#avx-modal-inr').value = '';
  m.querySelector('#avx-modal-qty').value = '';
  
  m.style.display = 'block';
  requestAnimationFrame(()=>m.classList.add('show'));
}

function hideTradeModal(){
  const m = document.getElementById('avx-convert-trade-modal');
  if(!m) return;
  m.classList.remove('show');
  setTimeout(()=>{m.style.display = 'none';}, 150);
}

async function confirmTradeModal(){
  const m = document.getElementById('avx-convert-trade-modal');
  if(!m) return;
  
  const mode = m.dataset.mode;
  const sym = m.dataset.sym;
  const price = Number(m.dataset.price || 0);
  const inrAmt = Number(m.querySelector('#avx-modal-inr').value || 0);
  const qty = Number(m.querySelector('#avx-modal-qty').value || 0);
  
  if(price <= 0){
    toast('Price not available', false);
    return;
  }
  
  if(mode === 'buy'){
    if(isNaN(inrAmt) || inrAmt < MIN_INR){
      toast(`Min ₹${MIN_INR}`, false);
      return;
    }
    
    const bal = await getWalletINR();
    if(inrAmt > bal){
      toast('Insufficient balance', false);
      return;
    }
    
    const buyQty = inrAmt / price;
    const cur = await getHolding(sym);
    
    await setWalletINR(bal - inrAmt);
    await updateHolding(sym, cur.qty + buyQty, cur.cost_inr + inrAmt);
    await saveTrade('buy', sym, buyQty, inrAmt, price);
    
    toast(`✅ Bought ${buyQty.toFixed(8)} ${sym}`, true);
  } else {
    if(isNaN(qty) || qty <= 0){
      toast('Enter valid quantity', false);
      return;
    }
    
    if((qty * price) < MIN_INR){
      toast(`Min ₹${MIN_INR}`, false);
      return;
    }
    
    const cur = await getHolding(sym);
    if(qty > cur.qty){
      toast('Insufficient tokens', false);
      return;
    }
    
    const bal = await getWalletINR();
    const sellAmt = qty * price;
    const avgCost = cur.qty ? cur.cost_inr / cur.qty : 0;
    const newQty = cur.qty - qty;
    const newCost = newQty > 0 ? cur.cost_inr - (qty * avgCost) : 0;
    
    await setWalletINR(bal + sellAmt);
    await updateHolding(sym, newQty, newCost);
    await saveTrade('sell', sym, qty, sellAmt, price);
    
    toast(`✅ Sold ${qty.toFixed(8)} ${sym}`, true);
  }
  
  hideTradeModal();
}

/* ---------- CHART MODAL ---------- */
function buildChartModal(){
  const wrap = document.createElement('div');
  wrap.id = 'avx-convert-chart-modal';
  wrap.innerHTML = `
    <div class="avx-chart-overlay"></div>
    <div class="avx-chart-box">
      <div class="avx-chart-header">
        <span id="avx-chart-title">Chart</span>
        <button id="avx-chart-close">×</button>
      </div>
      <canvas id="avx-convert-chart-canvas" width="400" height="220"></canvas>
      <div class="avx-chart-range">Last 30 days (INR)</div>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector('.avx-chart-overlay').onclick = hideChartModal;
  wrap.querySelector('#avx-chart-close').onclick = hideChartModal;
  return wrap;
}

function hideChartModal(){
  const m = document.getElementById('avx-convert-chart-modal');
  if(!m) return;
  m.classList.remove('show');
  setTimeout(()=>{m.style.display = 'none';}, 150);
}

async function showChart(sym){
  const m = document.getElementById('avx-convert-chart-modal') || buildChartModal();
  m.querySelector('#avx-chart-title').textContent = `${sym} Chart`;
  m.style.display = 'block';
  requestAnimationFrame(()=>m.classList.add('show'));
  
  const id = CG_ID_MAP[sym];
  if(!id){
    toast('Chart data not available', false);
    return;
  }
  
  try{
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=inr&days=30&interval=daily`);
    const j = await r.json();
    const pts = (j.prices || []).map(p => Number(p[1]));
    drawChart('avx-convert-chart-canvas', pts);
  }catch(e){
    toast('Chart load failed', false);
  }
}

function drawChart(canvasId, data){
  const cv = document.getElementById(canvasId);
  if(!cv) return;
  
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  
  if(!data.length) return;
  
  const pad = 20;
  const w = cv.width - pad * 2;
  const h = cv.height - pad * 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  
  // Draw axes
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, cv.height - pad);
  ctx.lineTo(cv.width - pad, cv.height - pad);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, cv.height - pad);
  ctx.stroke();
  
  // Draw line
  ctx.strokeStyle = '#007bff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  data.forEach((v, i) => {
    const x = pad + i * w / (data.length - 1);
    const y = cv.height - pad - (v - min) * h / rng;
    if(i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  
  ctx.stroke();
}

/* ---------- GLOBAL API FUNCTIONS ---------- */
window.AVX_convertBuyToken = async(sym) => {
  const price = livePrices[sym] || 0;
  if(price <= 0){
    toast('Price not loaded', false);
    return;
  }
  showTradeModal({mode: 'buy', sym, price});
};

window.AVX_convertSellToken = async(sym) => {
  const price = livePrices[sym] || 0;
  if(price <= 0){
    toast('Price not loaded', false);
    return;
  }
  showTradeModal({mode: 'sell', sym, price});
};

window.AVX_convertShowChart = (sym) => showChart(sym);

/* ---------- CSS STYLES ---------- */
if(!document.getElementById('avx-convert-styles')){
  const s = document.createElement('style');
  s.id = 'avx-convert-styles';
  s.textContent = `
    .avx-convert-section {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 15px;
      padding: 25px;
      margin-bottom: 25px;
      color: white;
    }
    .avx-convert-header h2 {
      margin: 0 0 5px 0;
      font-size: 24px;
      font-weight: bold;
    }
    .avx-convert-header p {
      margin: 0;
      opacity: 0.9;
      font-size: 14px;
    }
    .avx-convert-box {
      background: rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 20px;
      margin-top: 20px;
      backdrop-filter: blur(10px);
    }
    .avx-convert-row {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 20px;
    }
    .avx-convert-col {
      flex: 1;
    }
    .avx-convert-col label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
    }
    .avx-token-select {
      width: 100%;
      padding: 12px;
      border: 2px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(255,255,255,0.1);
      color: white;
      font-size: 14px;
      backdrop-filter: blur(5px);
    }
    .avx-token-select option {
      background: #333;
      color: white;
    }
    .avx-token-info {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 12px;
      opacity: 0.9;
    }
    .avx-convert-arrow {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avx-swap-btn {
      background: rgba(255,255,255,0.2);
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      width: 45px;
      height: 45px;
      color: white;
      font-size: 18px;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .avx-swap-btn:hover {
      background: rgba(255,255,255,0.3);
      transform: rotate(180deg);
    }
    .avx-convert-amounts {
      display: flex;
      gap: 20px;
      align-items: center;
      margin: 20px 0;
    }
    .avx-amount-group {
      flex: 1;
    }
    .avx-amount-group label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
    }
    .avx-input-group {
      display: flex;
      gap: 8px;
    }
    .avx-input-group input {
      flex: 1;
      padding: 12px;
      border: 2px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(255,255,255,0.1);
      color: white;
      font-size: 16px;
    }
    .avx-input-group input::placeholder {
      color: rgba(255,255,255,0.6);
    }
    .avx-max-btn {
      padding: 12px 15px;
      background: rgba(255,255,255,0.2);
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 6px;
      color: white;
      font-size: 12px;
      cursor: pointer;
      font-weight: 500;
    }
    .avx-max-btn:hover {
      background: rgba(255,255,255,0.3);
    }
    .avx-convert-result {
      flex: 1;
      text-align: center;
    }
    .avx-result-label {
      font-size: 14px;
      opacity: 0.8;
      margin-bottom: 8px;
    }
    .avx-result-amount {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .avx-conversion-rate {
      font-size: 12px;
      opacity: 0.7;
    }
    .avx-convert-btn {
      width: 100%;
      padding: 15px;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-top: 20px;
    }
    .avx-convert-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* TRADING SECTION */
    .avx-trading-section {
      background: white;
      border-radius: 15px;
      padding: 20px;
      box-shadow: 0 5px 15px rgba(0,0,0,0.1);
    }
    .avx-trading-header h3 {
      margin: 0 0 20px 0;
      font-size: 20px;
      color: #333;
    }
    .avx-token-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px;
      border-bottom: 1px solid #eee;
      transition: background 0.2s ease;
    }
    .avx-token-row:hover {
      background: #f8f9fa;
    }
    .avx-token-left {
      cursor: pointer;
      flex: 1;
    }
    .avx-token-symbol {
      font-weight: bold;
      font-size: 16px;
      color: #333;
    }
    .avx-token-name {
      font-size: 12px;
      color: #666;
      margin-top: 2px;
    }
    .avx-token-price {
      font-size: 14px;
      color: #28a745;
      margin-top: 4px;
      font-weight: 500;
    }
    .avx-token-actions {
      display: flex;
      gap: 8px;
    }
    .avx-buy-btn, .avx-sell-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .avx-buy-btn {
      background: #28a745;
      color: white;
    }
    .avx-buy-btn:hover {
      background: #218838;
    }
    .avx-sell-btn {
      background: #dc3545;
      color: white;
    }
    .avx-sell-btn:hover {
      background: #c82333;
    }

    /* MODAL STYLES */
    #avx-convert-trade-modal, #avx-convert-chart-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    #avx-convert-trade-modal.show, #avx-convert-chart-modal.show {
      opacity: 1;
    }
    .avx-modal-overlay, .avx-chart-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
    }
    .avx-modal-box, .avx-chart-box {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      padding: 25px;
      width: 90%;
      max-width: 400px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .avx-modal-header, .avx-chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      font-weight: bold;
      font-size: 18px;
    }
    #avx-modal-close, #avx-chart-close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
    }
    .avx-modal-info > div {
      margin-bottom: 10px;
      color: #555;
    }
    .avx-modal-inputs label {
      display: block;
      margin: 15px 0 5px 0;
      font-weight: 500;
    }
    .avx-modal-inputs input {
      flex: 1;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 16px;
    }
    .avx-modal-min {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }
    .avx-modal-confirm {
      width: 100%;
      padding: 15px;
      margin-top: 20px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }
    .avx-modal-confirm.buy {
      background: #28a745;
      color: white;
    }
    .avx-modal-confirm.sell {
      background: #dc3545;
      color: white;
    }
    .avx-chart-range {
      text-align: center;
      margin-top: 10px;
      font-size: 12px;
      color: #666;
    }

    /* TOAST */
    #avx-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
      max-width: 350px;
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    }
    #avx-toast.ok {
      background: #28a745;
    }
    #avx-toast.err {
      background: #dc3545;
    }

    /* RESPONSIVE */
    @media (max-width: 768px) {
      .avx-convert-row {
        flex-direction: column;
        gap: 10px;
      }
      .avx-convert-amounts {
        flex-direction: column;
        gap: 15px;
      }
      .avx-convert-arrow {
        order: -1;
      }
      .avx-swap-btn {
        transform: rotate(90deg);
      }
      .avx-token-actions {
        flex-direction: column;
        gap: 5px;
      }
    }
  `;
  document.head.appendChild(s);
}

/* ---------- INITIALIZATION ---------- */
function init(){
  renderUI();
  refreshPrices();
  setInterval(refreshPrices, PRICE_REFRESH_MS);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();