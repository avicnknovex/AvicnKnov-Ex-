/* ==========================================================
   assets-account.js – User Holdings Display & Management
   Shows tokens user has bought from any trading page + allows buying/selling
   Uses shared holdings system + same trading modal
   ========================================================== */
(function(){
'use strict';

/* ---------- CONFIG ---------- */
const SUPA_URL = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

const MODE = 'local';
const MIN_INR = 100;
const PRICE_REFRESH_MS = 30000;
const HOLD_KEY = 'AVX_holdings_test'; // Same as other files

/* ---------- ALL TOKENS MAP ---------- */
const ALL_TOKENS_MAP = {
  // Main crypto tokens
  'BTC': ['BTC', 'Bitcoin', 'bitcoin'],
  'ETH': ['ETH', 'Ethereum', 'ethereum'],
  'BNB': ['BNB', 'BNB', 'binancecoin'],
  'SOL': ['SOL', 'Solana', 'solana'],
  'XRP': ['XRP', 'XRP', 'ripple'],
  'ADA': ['ADA', 'Cardano', 'cardano'],
  'DOGE': ['DOGE', 'Dogecoin', 'dogecoin'],
  'MATIC': ['MATIC', 'Polygon', 'matic-network'],
  'DOT': ['DOT', 'Polkadot', 'polkadot'],
  'LTC': ['LTC', 'Litecoin', 'litecoin'],
  'TRX': ['TRX', 'TRON', 'tron'],
  'AVAX': ['AVAX', 'Avalanche', 'avalanche-2'],
  'SHIB': ['SHIB', 'Shiba Inu', 'shiba-inu'],
  'ATOM': ['ATOM', 'Cosmos', 'cosmos'],
  'XLM': ['XLM', 'Stellar', 'stellar'],
  'LINK': ['LINK', 'Chainlink', 'chainlink'],
  'UNI': ['UNI', 'Uniswap', 'uniswap'],
  'ETC': ['ETC', 'Ethereum Classic', 'ethereum-classic'],
  'FIL': ['FIL', 'Filecoin', 'filecoin'],
  'APT': ['APT', 'Aptos', 'aptos'],
  'NEAR': ['NEAR', 'NEAR Protocol', 'near'],
  'ICP': ['ICP', 'Internet Computer', 'internet-computer'],
  'SAND': ['SAND', 'The Sandbox', 'the-sandbox'],
  'AAVE': ['AAVE', 'Aave', 'aave'],
  'AXS': ['AXS', 'Axie Infinity', 'axie-infinity'],
  'QNT': ['QNT', 'Quant', 'quant-network'],
  'EGLD': ['EGLD', 'MultiversX', 'elrond-erd-2'],
  'MKR': ['MKR', 'Maker', 'maker'],
  'RUNE': ['RUNE', 'THORChain', 'thorchain'],
  'ALGO': ['ALGO', 'Algorand', 'algorand'],
  'FTM': ['FTM', 'Fantom', 'fantom'],
  'CRV': ['CRV', 'Curve DAO', 'curve-dao-token'],
  'HBAR': ['HBAR', 'Hedera', 'hedera-hashgraph'],
  'VET': ['VET', 'VeChain', 'vechain'],
  'GRT': ['GRT', 'The Graph', 'the-graph'],
  'FLOW': ['FLOW', 'Flow', 'flow'],
  'SNX': ['SNX', 'Synthetix', 'synthetix-network-token'],
  'DYDX': ['DYDX', 'dYdX', 'dydx'],
  'ZEC': ['ZEC', 'Zcash', 'zcash'],
  'BAT': ['BAT', 'Basic Attention Token', 'basic-attention-token'],
  '1INCH': ['1INCH', '1inch', '1inch'],
  'COMP': ['COMP', 'Compound', 'compound-governance-token'],
  'ENS': ['ENS', 'ENS', 'ethereum-name-service'],
  'KAVA': ['KAVA', 'Kava', 'kava'],
  'ZIL': ['ZIL', 'Zilliqa', 'zilliqa'],
  'CELO': ['CELO', 'Celo', 'celo'],
  'OMG': ['OMG', 'OMG Network', 'omisego'],
  'ANKR': ['ANKR', 'Ankr', 'ankr'],
  'STX': ['STX', 'Stacks', 'blockstack'],
  'WAVES': ['WAVES', 'Waves', 'waves'],
  'CHZ': ['CHZ', 'Chiliz', 'chiliz'],
  // Meme tokens
  'PEPE': ['PEPE', 'Pepe', 'pepe'],
  'FLOKI': ['FLOKI', 'Floki', 'floki'],
  'BONK': ['BONK', 'Bonk', 'bonk'],
  'WIF': ['WIF', 'dogwifhat', 'dogwifhat'],
  'BRETT': ['BRETT', 'Brett (Based)', 'based-brett'],
  'POPCAT': ['POPCAT', 'Popcat (SOL)', 'popcat'],
  'NEIRO': ['NEIRO', 'Neiro', 'neiro'],
  'MOG': ['MOG', 'Mog Coin', 'mog-coin'],
  'TURBO': ['TURBO', 'Turbo', 'turbo'],
  'MEME': ['MEME', 'Memecoin', 'memecoin'],
  'BABYDOGE': ['BABYDOGE', 'Baby Doge Coin', 'baby-doge-coin'],
  'WOJAK': ['WOJAK', 'Wojak', 'wojak'],
  'LADYS': ['LADYS', 'Milady Meme Coin', 'milady-meme-coin'],
  'KISHU': ['KISHU', 'Kishu Inu', 'kishu-inu'],
  'ELON': ['ELON', 'Dogelon Mars', 'dogelon-mars'],
  'AKITA': ['AKITA', 'Akita Inu', 'akita-inu'],
  'HOKK': ['HOKK', 'Hokkaido Inu', 'hokkaido-inu'],
  'SAITAMA': ['SAITAMA', 'SaitamaInu', 'saitama-inu'],
  // Additional meme tokens
  'SAFE': ['SAFE', 'SafeMoon', 'safemoon'],
  'HOGE': ['HOGE', 'Hoge Finance', 'hoge-finance'],
  'CATE': ['CATE', 'Cat in a Dogs World', 'cat-in-a-dogs-world'],
  'MYRO': ['MYRO', 'Myro', 'myro'],
  'PNUT': ['PNUT', 'Peanut the Squirrel', 'peanut-the-squirrel'],
  'GOAT': ['GOAT', 'Goatseus Maximus', 'goatseus-maximus'],
  'ACT': ['ACT', 'Act I The AI Prophecy', 'act-i-the-ai-prophecy'],
  'CHILLGUY': ['CHILLGUY', 'Just a chill guy', 'just-a-chill-guy'],
  'PONKE': ['PONKE', 'Ponke', 'ponke'],
  'BOME': ['BOME', 'BOOK OF MEME', 'book-of-meme'],
  'MEW': ['MEW', 'cat in a dogs world', 'cat-in-a-dogs-world'],
  'SLERF': ['SLERF', 'Slerf', 'slerf']
};

const CG_ID_MAP = {};
Object.values(ALL_TOKENS_MAP).forEach(([sym,_,id]) => CG_ID_MAP[sym] = id);

/* ---------- SUPABASE CLIENT ---------- */
const supaLib = window.supabase || (window.parent && window.parent.supabase);
if(!supaLib){ console.error('Supabase lib not found.'); return; }
const supa = supaLib.createClient(SUPA_URL, SUPA_KEY);

/* ---------- PRICE CACHE ---------- */
let livePrices = {};
let currentTradeSymbol = '';
let currentTradeAction = '';

/* ---------- UTILS ---------- */
const fmtINR = v => '₹' + Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});

function toast(msg, ok=true){
  let t = document.getElementById('avx-holdings-toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'avx-holdings-toast';
    t.style.cssText = `
      position:fixed;top:20px;right:20px;z-index:9999;
      padding:12px 20px;border-radius:8px;color:white;font-weight:500;
      opacity:0;transition:opacity 0.3s;pointer-events:none;
    `;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = ok ? 'ok' : 'err';
  t.style.backgroundColor = ok ? '#10b981' : '#ef4444';
  t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

/* ---------- HOLDINGS LOCAL ---------- */
function localGetHoldings(){
  try{ return JSON.parse(localStorage.getItem(HOLD_KEY)) || {}; }
  catch(e){ return {}; }
}
function localSetHoldings(obj){
  localStorage.setItem(HOLD_KEY, JSON.stringify(obj));
}

/* ---------- HOLDINGS SUPA (future) ---------- */
async function supaGetHoldingsMap(){
  const {data:{user}} = await supa.auth.getUser();
  if(!user) return {};
  const {data,error} = await supa.from('user_holdings').select('symbol,qty,cost_inr').eq('user_id',user.id);
  if(error){ console.warn('supa holdings error',error); return {}; }
  const map = {};
  data.forEach(r => map[r.symbol.toUpperCase()] = {qty:Number(r.qty||0), cost_inr:Number(r.cost_inr||0)});
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

async function getHoldingsMap(){
  return MODE==='supa' ? await supaGetHoldingsMap() : localGetHoldings();
}
async function updateHolding(symbol,qty,cost_inr){
  symbol = symbol.toUpperCase();
  if(MODE==='supa'){ await supaUpsertHolding(symbol,qty,cost_inr); }
  else {
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
  return {qty:Number(r.qty||0), cost_inr:Number(r.cost_inr||0)};
}

/* ---------- WALLET (Supabase) ---------- */
async function getUser(){
  const {data:{user}} = await supa.auth.getUser();
  return user;
}
async function getWalletINR(){
  const u = await getUser(); if(!u) return 0;
  const {data,error} = await supa.from('user_wallets').select('balance').eq('uid',u.id).single();
  if(error){ console.error('wallet fetch error',error); return 0; }
  return Number(data?.balance||0);
}
async function setWalletINR(newBal){
  const u = await getUser(); if(!u) return;
  const {error} = await supa.from('user_wallets').update({balance:newBal}).eq('uid',u.id);
  if(error) console.error('wallet update error',error);
  if(typeof window.updateWalletBalance==='function'){ window.updateWalletBalance(); }
  else if(window.parent && typeof window.parent.updateWalletBalance==='function'){ window.parent.updateWalletBalance(); }
}

/* ---------- SAVE TRADE -> user_trades ---------- */
async function saveTrade(action,symbol,qty,amount_inr,price_inr){
  try{
    const {data:{user}} = await supa.auth.getUser();
    if(!user) return;
    const {error} = await supa.from('user_trades').insert([{
      user_id:user.id, action, symbol, qty, price_inr, amount_inr, created_at:new Date().toISOString()
    }]);
    if(error) console.error('trade save error',error);
  }catch(e){ console.error('saveTrade fail',e); }
}

/* ---------- PRICE REFRESH ---------- */
async function refreshPrices(){
  try{
    const holdingsMap = await getHoldingsMap();
    const heldTokens = Object.keys(holdingsMap).filter(sym => holdingsMap[sym].qty > 0);
    if(heldTokens.length === 0) return;
    
    const ids = heldTokens.map(sym => CG_ID_MAP[sym]).filter(id => id).join(',');
    if(!ids) return;
    
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=inr`);
    const data = await res.json();
    
    heldTokens.forEach(sym => {
      const id = CG_ID_MAP[sym];
      if(id && data[id]) {
        const p = Number(data[id].inr || 0);
        livePrices[sym] = p;
        const el = document.getElementById('holdings-price-' + sym);
        if(el) el.textContent = fmtINR(p);
        
        // Update total value
        const holding = holdingsMap[sym];
        if(holding && holding.qty > 0) {
          const totalValueEl = document.getElementById('holdings-value-' + sym);
          if(totalValueEl) totalValueEl.textContent = fmtINR(holding.qty * p);
          
          // Update P&L
          const avgCost = holding.qty > 0 ? holding.cost_inr / holding.qty : 0;
          const pnl = (p - avgCost) * holding.qty;
          const pnlPercent = avgCost > 0 ? ((p - avgCost) / avgCost) * 100 : 0;
          
          const pnlEl = document.getElementById('holdings-pnl-' + sym);
          if(pnlEl) {
            pnlEl.textContent = `${fmtINR(pnl)} (${pnlPercent.toFixed(2)}%)`;
            pnlEl.className = `avx-stat-value ${pnl >= 0 ? 'positive' : 'negative'}`;
          }
        }
      }
    });
    console.log('Holdings prices updated:', livePrices);
  }catch(e){ console.error('holdings price fetch fail',e); }
}

/* ---------- RENDER HOLDINGS LIST ---------- */
async function renderHoldingsList(){
  const container = document.getElementById('account');
  if(!container) return;
  
  const holdingsMap = await getHoldingsMap();
  const heldTokens = Object.keys(holdingsMap).filter(sym => {
    const holding = holdingsMap[sym];
    return holding && holding.qty > 0;
  });
  
  if(heldTokens.length === 0) {
    container.innerHTML = `
      <div class="avx-holdings-empty">
        <div class="avx-empty-icon">📊</div>
        <h3>No Holdings Yet</h3>
        <p>Buy tokens from any trading page to see them here</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="avx-holdings-header">
      <h2>💰 My Token Holdings</h2>
      <p>Manage your cryptocurrency tokens - Buy more or Sell existing holdings</p>
    </div>
    
    <div class="avx-holdings-list">
      ${heldTokens.map(sym => {
        const holding = holdingsMap[sym];
        const tokenInfo = ALL_TOKENS_MAP[sym] || [sym, sym, ''];
        const [symbol, name] = tokenInfo;
        const price = livePrices[sym] || 0;
        const totalValue = holding.qty * price;
        const avgCost = holding.qty > 0 ? holding.cost_inr / holding.qty : 0;
        const pnl = (price - avgCost) * holding.qty;
        const pnlPercent = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;
        
        return `
          <div class="avx-holding-card">
            <div class="avx-holding-header">
              <div class="avx-token-info">
                <div class="avx-token-symbol">${symbol}</div>
                <div class="avx-token-name">${name}</div>
              </div>
            </div>
            
            <div class="avx-holding-stats">
              <div class="avx-stat-row">
                <div class="avx-stat-item">
                  <span class="avx-stat-label">QUANTITY</span>
                  <span class="avx-stat-value">${holding.qty.toFixed(8)}</span>
                </div>
                <div class="avx-stat-item">
                  <span class="avx-stat-label">PRICE</span>
                  <span class="avx-stat-value" id="holdings-price-${sym}">${fmtINR(price)}</span>
                </div>
              </div>
              
              <div class="avx-stat-row">
                <div class="avx-stat-item">
                  <span class="avx-stat-label">TOTAL VALUE</span>
                  <span class="avx-stat-value" id="holdings-value-${sym}">${fmtINR(totalValue)}</span>
                </div>
                <div class="avx-stat-item">
                  <span class="avx-stat-label">AVG COST</span>
                  <span class="avx-stat-value">${fmtINR(avgCost)}</span>
                </div>
              </div>
              
              <div class="avx-stat-row">
                <div class="avx-stat-item full-width">
                  <span class="avx-stat-label">P&L</span>
                  <span class="avx-stat-value ${pnl >= 0 ? 'positive' : 'negative'}" id="holdings-pnl-${sym}">
                    ${fmtINR(pnl)} (${pnlPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
            
            <div class="avx-holding-actions">
              <button class="avx-btn-buy" onclick="openHoldingsTradeModal('${sym}', 'buy')">
                Buy More ${symbol}
              </button>
              <button class="avx-btn-sell" onclick="openHoldingsTradeModal('${sym}', 'sell')">
                Sell ${symbol}
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  
  // Apply CSS styles immediately after rendering
  applyHoldingsStyles();
}

/* ---------- APPLY ATTRACTIVE STYLING ---------- */
function applyHoldingsStyles() {
  if (document.getElementById('avx-holdings-styles')) return;
  
  const styleEl = document.createElement('style');
  styleEl.id = 'avx-holdings-styles';
  styleEl.textContent = `
    .avx-holdings-header {
      text-align: center;
      margin: 20px 0 30px 0;
      padding: 0 20px;
    }

    .avx-holdings-header h2 {
      color: #1f2937;
      font-size: 1.5rem;
      font-weight: 600;
      margin: 0 0 8px 0;
    }

    .avx-holdings-header p {
      color: #6b7280;
      font-size: 0.9rem;
      margin: 0;
    }

    .avx-holdings-list {
      padding: 0 20px;
    }

    .avx-holding-card {
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      margin: 0 0 16px 0;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      transition: all 0.3s ease;
    }

    .avx-holding-card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      transform: translateY(-2px);
    }

    .avx-holding-header {
      margin: 0 0 16px 0;
    }

    .avx-token-info {
      text-align: left;
    }

    .avx-token-symbol {
      font-size: 1.2rem;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 4px 0;
    }

    .avx-token-name {
      font-size: 0.9rem;
      color: #6b7280;
      margin: 0;
    }

    .avx-holding-stats {
      margin: 0 0 20px 0;
    }

    .avx-stat-row {
      display: flex;
      justify-content: space-between;
      margin: 0 0 12px 0;
    }

    .avx-stat-row:last-child {
      margin-bottom: 0;
    }

    .avx-stat-item {
      flex: 1;
      text-align: left;
    }

    .avx-stat-item.full-width {
      flex: 1;
    }

    .avx-stat-item:not(:last-child) {
      margin-right: 16px;
    }

    .avx-stat-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 500;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 4px 0;
    }

    .avx-stat-value {
      display: block;
      font-size: 0.95rem;
      font-weight: 600;
      color: #1f2937;
    }

    .avx-stat-value.positive {
      color: #059669;
    }

    .avx-stat-value.negative {
      color: #dc2626;
    }

    .avx-holding-actions {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }

    .avx-btn-buy,
    .avx-btn-sell {
      flex: 1;
      padding: 12px 16px;
      border: none;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .avx-btn-buy {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
    }

    .avx-btn-buy:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }

    .avx-btn-sell {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }

    .avx-btn-sell:hover {
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    }

    .avx-holdings-empty {
      text-align: center;
      padding: 60px 20px;
      color: #6b7280;
    }

    .avx-empty-icon {
      font-size: 3rem;
      margin: 0 0 16px 0;
    }

    .avx-holdings-empty h3 {
      font-size: 1.2rem;
      font-weight: 600;
      color: #374151;
      margin: 0 0 8px 0;
    }

    .avx-holdings-empty p {
      font-size: 0.9rem;
      margin: 0;
    }

    /* Modal Styles */
    .avx-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }

    .avx-modal.show {
      display: flex;
    }

    .avx-modal-content {
      background: white;
      border-radius: 12px;
      width: 90%;
      max-width: 400px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .avx-modal-header {
      padding: 20px 20px 0 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .avx-modal-header h3 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: #1f2937;
    }

    .avx-modal-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      width: 30px;
      height: 30px;
    }

    .avx-modal-body {
      padding: 20px;
    }

    .avx-form-group {
      margin-bottom: 20px;
    }

    .avx-form-group label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: #374151;
    }

    .avx-form-group input {
      width: 100%;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 1rem;
      box-sizing: border-box;
    }

    .avx-form-group input:focus {
      outline: none;
      border-color: #10b981;
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
    }

    .avx-trade-info {
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .avx-info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .avx-info-row:last-child {
      margin-bottom: 0;
    }

    .avx-info-label {
      color: #6b7280;
      font-size: 0.9rem;
    }

    .avx-info-value {
      font-weight: 600;
      color: #1f2937;
      font-size: 0.9rem;
    }

    .avx-modal-footer {
      padding: 0 20px 20px 20px;
      display: flex;
      gap: 12px;
    }

    .avx-btn-secondary,
    .avx-btn-primary {
      flex: 1;
      padding: 12px 16px;
      border: none;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .avx-btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .avx-btn-secondary:hover {
      background: #e5e7eb;
    }

    .avx-btn-primary {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
    }

    .avx-btn-primary:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
    }

    .avx-btn-primary:disabled {
      background: #d1d5db;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(styleEl);
}

/* ---------- TRADING MODAL ---------- */
function openHoldingsTradeModal(symbol, action) {
  currentTradeSymbol = symbol;
  currentTradeAction = action;
  
  let modal = document.getElementById('avx-holdings-trade-modal');
  if (!modal) {
    modal = createHoldingsTradeModal();
  }
  
  // Update modal content
  modal.querySelector('#trade-symbol').textContent = symbol;
  modal.querySelector('#trade-action').textContent = action.toUpperCase();
  
  // Reset form
  const amountInput = modal.querySelector('#trade-amount');
  amountInput.value = '';
  amountInput.oninput = updateTradeInfo;
  
  // Update trade info
  updateTradeInfo();
  
  // Show modal
  modal.classList.add('show');
}

function createHoldingsTradeModal() {
  const modal = document.createElement('div');
  modal.id = 'avx-holdings-trade-modal';
  modal.className = 'avx-modal';
  modal.innerHTML = `
    <div class="avx-modal-content" onclick="event.stopPropagation()">
      <div class="avx-modal-header">
        <h3><span id="trade-action">BUY</span> <span id="trade-symbol">BTC</span></h3>
        <button class="avx-modal-close" onclick="closeHoldingsTradeModal()">×</button>
      </div>
      
      <div class="avx-modal-body">
        <div class="avx-form-group">
          <label>Amount (INR)</label>
          <input type="number" id="trade-amount" placeholder="Enter amount in INR" min="100">
        </div>
        
        <div class="avx-trade-info">
          <div class="avx-info-row">
            <span class="avx-info-label">Price:</span>
            <span class="avx-info-value" id="trade-price">₹0</span>
          </div>
          <div class="avx-info-row">
            <span class="avx-info-label">Quantity:</span>
            <span class="avx-info-value" id="trade-quantity">0</span>
          </div>
          <div class="avx-info-row">
            <span class="avx-info-label">Total:</span>
            <span class="avx-info-value" id="trade-total">₹0</span>
          </div>
        </div>
      </div>
      
      <div class="avx-modal-footer">
        <button class="avx-btn-secondary" onclick="closeHoldingsTradeModal()">Cancel</button>
        <button class="avx-btn-primary" onclick="executeHoldingsTrade()">Confirm</button>
      </div>
    </div>
  `;
  
  modal.onclick = closeHoldingsTradeModal;
  document.body.appendChild(modal);
  return modal;
}

function closeHoldingsTradeModal() {
  const modal = document.getElementById('avx-holdings-trade-modal');
  if (modal) modal.classList.remove('show');
}

function updateTradeInfo() {
  const modal = document.getElementById('avx-holdings-trade-modal');
  if (!modal) return;
  
  const amount = Number(modal.querySelector('#trade-amount').value || 0);
  const price = livePrices[currentTradeSymbol] || 0;
  const quantity = price > 0 ? amount / price : 0;
  
  modal.querySelector('#trade-price').textContent = fmtINR(price);
  modal.querySelector('#trade-quantity').textContent = quantity.toFixed(8);
  modal.querySelector('#trade-total').textContent = fmtINR(amount);
}

async function executeHoldingsTrade() {
  const modal = document.getElementById('avx-holdings-trade-modal');
  const amount = Number(modal.querySelector('#trade-amount').value || 0);
  
  if (amount < MIN_INR) {
    toast(`Minimum amount is ${fmtINR(MIN_INR)}`, false);
    return;
  }
  
  const price = livePrices[currentTradeSymbol] || 0;
  if (price <= 0) {
    toast('Price not available', false);
    return;
  }
  
  try {
    const walletBalance = await getWalletINR();
    const currentHolding = await getHolding(currentTradeSymbol);
    const quantity = amount / price;
    
    if (currentTradeAction === 'buy') {
      if (walletBalance < amount) {
        toast('Insufficient wallet balance', false);
        return;
      }
      
      // Update holdings
      const newQty = currentHolding.qty + quantity;
      const newCost = currentHolding.cost_inr + amount;
      await updateHolding(currentTradeSymbol, newQty, newCost);
      
      // Update wallet
      await setWalletINR(walletBalance - amount);
      
      toast(`Successfully bought ${quantity.toFixed(8)} ${currentTradeSymbol}`);
      
    } else if (currentTradeAction === 'sell') {
      if (currentHolding.qty < quantity) {
        toast('Insufficient holdings to sell', false);
        return;
      }
      
      // Update holdings
      const newQty = currentHolding.qty - quantity;
      const costReduction = (quantity / currentHolding.qty) * currentHolding.cost_inr;
      const newCost = currentHolding.cost_inr - costReduction;
      await updateHolding(currentTradeSymbol, newQty, newCost);
      
      // Update wallet
      await setWalletINR(walletBalance + amount);
      
      toast(`Successfully sold ${quantity.toFixed(8)} ${currentTradeSymbol}`);
    }
    
    // Save trade record
    await saveTrade(currentTradeAction, currentTradeSymbol, quantity, amount, price);
    
    // Close modal and refresh
    closeHoldingsTradeModal();
    await renderHoldingsList();
    await refreshPrices();
    
  } catch (error) {
    console.error('Trade execution error:', error);
    toast('Trade failed. Please try again.', false);
  }
}

/* ---------- INITIALIZATION ---------- */
document.addEventListener('DOMContentLoaded', async function() {
  console.log('Holdings page initializing...');
  
  // Apply styles immediately
  applyHoldingsStyles();
  
  // Render holdings list
  await renderHoldingsList();
  
  // Start price refresh
  await refreshPrices();
  setInterval(refreshPrices, PRICE_REFRESH_MS);
  
  console.log('Holdings page initialized successfully');
});

// Global functions
window.openHoldingsTradeModal = openHoldingsTradeModal;
window.closeHoldingsTradeModal = closeHoldingsTradeModal;
window.executeHoldingsTrade = executeHoldingsTrade;
window.refreshHoldingsList = renderHoldingsList;
window.refreshHoldingsPrices = refreshPrices;

})();