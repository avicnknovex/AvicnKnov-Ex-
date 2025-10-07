/* ==========================================================
   futures-usdc.js – Futures > USD-C (top 20 tokens)
   Wallet (Supabase) + local holdings (flip to supa later) + 1M line chart + trade log (user_trades)
   ========================================================== */
(function(){
'use strict';

/* ---------- CONFIG ---------- */
const SUPA_URL ='https://hwrvqyipozrsxyjdpqag.supabase.co';
const SUPA_KEY ='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

const MODE='local';            // flip to 'supa' jab holdings table ready
const MIN_INR=100;
const PRICE_REFRESH_MS=30000;
const HOLD_KEY='AVX_futures_usdc_holdings_test';

/* ---------- TOKENS : sirf 20 ---------- */
const TOKENS=[
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
const CG_ID_MAP={};TOKENS.forEach(([s,_,id])=>CG_ID_MAP[s]=id);

/* ---------- SUPABASE CLIENT ---------- */
const supaLib=window.supabase||(window.parent&&window.parent.supabase);
if(!supaLib){console.error('Supabase lib not found.');return;}
const supa=supaLib.createClient(SUPA_URL,SUPA_KEY);

/* ---------- PRICE CACHE ---------- */
let livePrices={};

/* ---------- UTILS ---------- */
const fmtINR=v=>'₹'+Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
function toast(msg,ok=true){
 let t=document.getElementById('avx-toast');
 if(!t){t=document.createElement('div');t.id='avx-toast';document.body.appendChild(t);}
 t.textContent=msg;t.className=ok?'ok':'err';t.style.opacity='1';
 setTimeout(()=>{t.style.opacity='0';},2000);
}

/* ---------- HOLDINGS LOCAL ---------- */
function localGetHoldings(){try{return JSON.parse(localStorage.getItem(HOLD_KEY))||{};}catch(e){return {};}}
function localSetHoldings(o){localStorage.setItem(HOLD_KEY,JSON.stringify(o));}

/* ---------- HOLDINGS SUPA (future) ---------- */
async function supaGetHoldingsMap(){
 const {data:{user}}=await supa.auth.getUser();if(!user)return {};
 const {data,error}=await supa.from('user_holdings').select('symbol,qty,cost_inr').eq('user_id',user.id);
 if(error){console.warn('supa holdings error',error);return {};}
 const map={};data.forEach(r=>map[r.symbol.toUpperCase()]={qty:+r.qty||0,cost_inr:+r.cost_inr||0});return map;
}
async function supaUpsertHolding(symbol,qty,cost_inr){
 const {data:{user}}=await supa.auth.getUser();if(!user)return;
 if(qty<=0){await supa.from('user_holdings').delete().eq('user_id',user.id).eq('symbol',symbol);return;}
 await supa.from('user_holdings').upsert({user_id:user.id,symbol,qty,cost_inr},{onConflict:'user_id,symbol'});
}
async function getHoldingsMap(){return MODE==='supa'?await supaGetHoldingsMap():localGetHoldings();}
async function updateHolding(symbol,qty,cost_inr){
 symbol=symbol.toUpperCase();
 if(MODE==='supa'){await supaUpsertHolding(symbol,qty,cost_inr);}
 else{const h=localGetHoldings();if(qty<=0)delete h[symbol];else h[symbol]={qty,cost_inr};localSetHoldings(h);}
}
async function getHolding(symbol){
 symbol=symbol.toUpperCase();
 const map=await getHoldingsMap();const r=map[symbol];
 if(!r)return{qty:0,cost_inr:0};
 return{qty:+r.qty||0,cost_inr:+r.cost_inr||0};
}

/* ---------- WALLET (Supabase) ---------- */
async function getUser(){const {data:{user}}=await supa.auth.getUser();return user;}
async function getWalletINR(){
 const u=await getUser();if(!u)return 0;
 const {data,error}=await supa.from('user_wallets').select('balance').eq('uid',u.id).single();
 if(error){console.error('wallet fetch error',error);return 0;}
 return +data?.balance||0;
}
async function setWalletINR(newBal){
 const u=await getUser();if(!u)return;
 const {error}=await supa.from('user_wallets').update({balance:newBal}).eq('uid',u.id);
 if(error)console.error('wallet update error',error);
 if(typeof window.updateWalletBalance==='function'){window.updateWalletBalance();}
 else if(window.parent&&typeof window.parent.updateWalletBalance==='function'){window.parent.updateWalletBalance();}
}

/* ---------- SAVE TRADE -> user_trades ---------- */
async function saveTrade(action,symbol,qty,amount_inr,price_inr){
 try{
  const {data:{user}}=await supa.auth.getUser();if(!user)return;
  const {error}=await supa.from('user_trades').insert([{
   user_id:user.id,action,symbol,qty,price_inr,amount_inr,created_at:new Date().toISOString()
  }]);
  if(error)console.error('trade save error',error);
 }catch(e){console.error('saveTrade fail',e);}
}

/* ---------- PRICE REFRESH ---------- */
async function refreshPrices(){
 try{
  const ids=TOKENS.map(t=>t[2]).join(',');
  const res=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=inr`);
  const data=await res.json();
  TOKENS.forEach(([sym,_,id])=>{
   const p=+data[id]?.inr||0;livePrices[sym]=p;
   const el=document.getElementById('price-futures-usdc-'+sym);if(el)el.textContent=fmtINR(p);
  });
 }catch(e){console.error('futures usdc price fetch fail',e);}
}

/* ---------- RENDER TOKEN LIST ---------- */
function renderList(){
 const c=document.getElementById('usdc');if(!c)return;
 c.innerHTML=TOKENS.map(([sym,name])=>`
  <div class="avx-row">
    <div class="avx-left" onclick="AVX_futuresUsdcShowTokenGraph('${sym}')">
      <div class="avx-sym">${sym}</div>
      <div class="avx-name">${name}</div>
      <div class="avx-price" id="price-futures-usdc-${sym}">₹--</div>
    </div>
    <div class="avx-actions">
      <button class="avx-buy" onclick="AVX_futuresUsdcBuyToken('${sym}')">Long</button>
      <button class="avx-sell" onclick="AVX_futuresUsdcSellToken('${sym}')">Short</button>
    </div>
  </div>`).join('');
}

/* ---------- TRADE MODAL ---------- */
function buildTradeModal(){
 const m=document.createElement('div');m.id='avx-futures-usdc-trade-modal';
 m.innerHTML=`
  <div class="avx-t-overlay"></div>
  <div class="avx-t-box">
    <div class="avx-t-head"><span id="avx-t-title">USD-C Futures</span><button id="avx-t-close">×</button></div>
    <div class="avx-t-bal" id="avx-t-bal">Balance: ₹--</div>
    <div class="avx-t-hold" id="avx-t-hold">Position: --</div>
    <div class="avx-t-price" id="avx-t-price">Live Price: ₹--</div>
    <label class="avx-t-lbl">INR Amount (Margin)</label>
    <div class="avx-input-wrap"><input type="number" id="avx-t-amt" placeholder="Enter margin amount in INR"/><button type="button" id="avx-t-amt-max" class="avx-max-btn">MAX</button></div>
    <label class="avx-t-lbl">Contract Size</label>
    <div class="avx-input-wrap"><input type="number" id="avx-t-qty" placeholder="Enter contract size"/><button type="button" id="avx-t-qty-max" class="avx-max-btn">MAX</button></div>
    <div class="avx-t-min">Min ₹${MIN_INR} margin</div>
    <button id="avx-t-confirm" class="avx-t-confirm">Confirm</button>
  </div>`;
 document.body.appendChild(m);
 m.querySelector('.avx-t-overlay').onclick=hideModal;
 m.querySelector('#avx-t-close').onclick=hideModal;
 const amt=m.querySelector('#avx-t-amt'),qty=m.querySelector('#avx-t-qty');
 amt.addEventListener('input',()=>{const p=+m.dataset.price||0;if(p>0)qty.value=amt.value?(+amt.value/p).toFixed(8):'';});
 qty.addEventListener('input',()=>{const p=+m.dataset.price||0;if(p>0)amt.value=qty.value?(+qty.value*p).toFixed(2):'';});
 m.querySelector('#avx-t-amt-max').onclick=async()=>{
  if(m.dataset.mode!=='long')return;
  const bal=await getWalletINR();amt.value=bal.toFixed(2);
  const p=+m.dataset.price||0;qty.value=p?(bal/p).toFixed(8):'';
 };
 m.querySelector('#avx-t-qty-max').onclick=async()=>{
  if(m.dataset.mode!=='short')return;
  const sym=m.dataset.sym;const hold=await getHolding(sym);qty.value=hold.qty;
  const p=+m.dataset.price||0;amt.value=p?(hold.qty*p).toFixed(2):'';
 };
 m.querySelector('#avx-t-confirm').onclick=confirmTrade;
 return m;
}
function showModal({mode,sym,price,bal,holdQty}){
 const m=document.getElementById('avx-futures-usdc-trade-modal')||buildTradeModal();
 m.dataset.mode=mode;m.dataset.sym=sym;m.dataset.price=price;
 const title=m.querySelector('#avx-t-title');const btn=m.querySelector('#avx-t-confirm');
 if(mode==='long'){title.textContent=`Long ${sym} USD-C`;btn.textContent='Open Long';btn.classList.remove('sell');btn.classList.add('buy');}
 else{title.textContent=`Short ${sym} USD-C`;btn.textContent='Open Short';btn.classList.remove('buy');btn.classList.add('sell');}
 m.querySelector('#avx-t-bal').textContent=`Balance: ${fmtINR(bal)}`;
 m.querySelector('#avx-t-hold').textContent=`Position: ${holdQty.toFixed(8)} ${sym}`;
 m.querySelector('#avx-t-price').textContent=`Live Price: ${fmtINR(price)}`;
 m.querySelector('#avx-t-amt').value='';m.querySelector('#avx-t-qty').value='';
 m.style.display='block';requestAnimationFrame(()=>m.classList.add('show'));
}
function hideModal(){const m=document.getElementById('avx-futures-usdc-trade-modal');if(!m)return;m.classList.remove('show');setTimeout(()=>{m.style.display='none';},150);}

/* ---------- CONFIRM TRADE ---------- */
async function confirmTrade(){
 const m=document.getElementById('avx-futures-usdc-trade-modal');if(!m)return;
 const mode=m.dataset.mode,sym=m.dataset.sym,price=+m.dataset.price||0;
 const amt=+m.querySelector('#avx-t-amt').value||0;
 const qty=+m.querySelector('#avx-t-qty').value||0;
 if(price<=0){toast('Live price missing.',false);return;}
 if(mode==='long'){
  if(isNaN(amt)||amt<MIN_INR){toast(`Min ₹${MIN_INR} margin`,false);return;}
  const bal=await getWalletINR();if(amt>bal){toast('Insufficient balance.',false);return;}
  const longQty=amt/price;const cur=await getHolding(sym);
  await setWalletINR(bal-amt);
  await updateHolding(sym,cur.qty+longQty,cur.cost_inr+amt);
  await saveTrade('long',sym,longQty,amt,price);
  toast('Long Position Opened ✅',true);
 }else{
  if(isNaN(qty)||qty<=0){toast('Enter contract size.',false);return;}
  if((qty*price)<MIN_INR){toast(`Min ₹${MIN_INR} margin`,false);return;}
  const cur=await getHolding(sym);if(qty>cur.qty){toast('Not enough position.',false);return;}
  const bal=await getWalletINR();const sellAmt=qty*price;
  const avgCost=cur.qty?cur.cost_inr/cur.qty:0;
  const newQty=cur.qty-qty;
  const newCost=newQty>0?cur.cost_inr-(qty*avgCost):0;
  await setWalletINR(bal+sellAmt);
  await updateHolding(sym,newQty,newCost);
  await saveTrade('short',sym,qty,sellAmt,price);
  toast('Short Position Opened ✅',true);
 }
 hideModal();
}

/* ---------- CHART MODAL ---------- */
function buildChartModal(){
 const wrap=document.createElement('div');wrap.id='avx-futures-usdc-chart-modal';
 wrap.innerHTML=`
  <div class="avx-c-overlay"></div>
  <div class="avx-c-box">
    <div class="avx-c-head"><span id="avx-c-title">USD-C Chart</span><button id="avx-c-close">×</button></div>
    <canvas id="avx-futures-usdc-canvas" width="400" height="220"></canvas>
    <div class="avx-c-range-msg">Last 30 days (INR) - USD-C Futures</div>
  </div>`;
 document.body.appendChild(wrap);
 wrap.querySelector('.avx-c-overlay').onclick=hideChartModal;
 wrap.querySelector('#avx-c-close').onclick=hideChartModal;
 return wrap;
}
function hideChartModal(){const m=document.getElementById('avx-futures-usdc-chart-modal');if(!m)return;m.classList.remove('show');setTimeout(()=>{m.style.display='none';},150);}
async function showChart(sym){
 const m=document.getElementById('avx-futures-usdc-chart-modal')||buildChartModal();
 m.querySelector('#avx-c-title').textContent=`${sym} USD-C Chart`;
 m.style.display='block';requestAnimationFrame(()=>m.classList.add('show'));
 const id=CG_ID_MAP[sym];if(!id){toast('No chart data.',false);return;}
 try{
  const r=await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=inr&days=30&interval=daily`);
  const j=await r.json();const pts=(j.prices||[]).map(p=>+p[1]);drawSimpleLine('avx-futures-usdc-canvas',pts);
 }catch(e){toast('Chart load failed.',false);}
}
function drawSimpleLine(cid,data){
 const cv=document.getElementById(cid);if(!cv)return;
 const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);if(!data.length)return;
 const pad=20,w=cv.width-pad*2,h=cv.height-pad*2,min=Math.min(...data),max=Math.max(...data),rng=max-min||1;
 ctx.strokeStyle='#ccc';ctx.lineWidth=1;
 ctx.beginPath();ctx.moveTo(pad,cv.height-pad);ctx.lineTo(cv.width-pad,cv.height-pad);ctx.stroke();
 ctx.beginPath();ctx.moveTo(pad,pad);ctx.lineTo(pad,cv.height-pad);ctx.stroke();
 ctx.strokeStyle='#3b82f6';ctx.lineWidth=2;ctx.beginPath();
 data.forEach((v,i)=>{
  const x=pad+i*w/(data.length-1),y=cv.height-pad-(v-min)*h/rng;
  if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
 });ctx.stroke();
}

/* ---------- GLOBAL API FUNCTIONS ---------- */
window.AVX_futuresUsdcBuyToken=async(sym)=>{
 const p=livePrices[sym]||0;if(p<=0){toast('Price not loaded.',false);return;}
 const bal=await getWalletINR();const hold=await getHolding(sym);
 showModal({mode:'long',sym,price:p,bal,holdQty:hold.qty});
};
window.AVX_futuresUsdcSellToken=async(sym)=>{
 const p=livePrices[sym]||0;if(p<=0){toast('Price not loaded.',false);return;}
 const bal=await getWalletINR();const hold=await getHolding(sym);
 showModal({mode:'short',sym,price:p,bal,holdQty:hold.qty});
};
window.AVX_futuresUsdcShowTokenGraph=(sym)=>showChart(sym);

/* ---------- CSS INJECTION ---------- */
if(!document.getElementById('avx-futures-usdc-styles')){
 const s=document.createElement('style');s.id='avx-futures-usdc-styles';s.textContent=`
  .avx-row{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;padding:12px 15px;}
  .avx-left{cursor:pointer;flex:1;}
  .avx-sym{font-weight:bold;font-size:16px;color:#333;}
  .avx-name{font-size:12px;color:#777;margin-top:2px;}
  .avx-price{font-size:14px;color:#555;margin-top:4px;}
  .avx-actions{display:flex;gap:8px;}
  .avx-buy,.avx-sell{padding:6px 12px;border:none;border-radius:4px;font-size:12px;font-weight:bold;cursor:pointer;}
  .avx-buy{background:#4caf50;color:white;}
  .avx-sell{background:#f44336;color:white;}
  #avx-futures-usdc-trade-modal,#avx-futures-usdc-chart-modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;opacity:0;transition:opacity 0.15s;}
  #avx-futures-usdc-trade-modal.show,#avx-futures-usdc-chart-modal.show{opacity:1;}
  .avx-t-overlay,.avx-c-overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);}
  .avx-t-box,.avx-c-box{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border-radius:8px;padding:20px;width:90%;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,0.3);}
  .avx-t-head,.avx-c-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;font-weight:bold;font-size:18px;}
  #avx-t-close,#avx-c-close{background:none;border:none;font-size:24px;cursor:pointer;color:#666;}
  .avx-t-bal,.avx-t-hold,.avx-t-price{margin-bottom:10px;color:#555;}
  .avx-t-lbl{display:block;margin-top:15px;margin-bottom:5px;font-weight:500;}
  .avx-input-wrap{display:flex;align-items:center;gap:5px;}
  #avx-t-amt,#avx-t-qty{flex:1;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:16px;}
  .avx-max-btn{padding:10px 12px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;}
  .avx-t-min{font-size:12px;color:#666;margin-top:5px;}
  .avx-t-confirm{width:100%;padding:12px;margin-top:20px;border:none;border-radius:4px;font-size:16px;font-weight:bold;cursor:pointer;}
  .avx-t-confirm.buy{background:#4caf50;color:white;}
  .avx-t-confirm.sell{background:#f44336;color:white;}
  #avx-toast{position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:4px;color:white;font-weight:bold;z-index:10000;opacity:0;transition:opacity 0.3s;}
  #avx-toast.ok{background:#4caf50;}
  #avx-toast.err{background:#f44336;}
  .avx-c-range-msg{text-align:center;margin-top:10px;font-size:12px;color:#666;}
 `;document.head.appendChild(s);
}

/* ---------- INIT ---------- */
function init(){
 renderList();
 refreshPrices();
 setInterval(refreshPrices,PRICE_REFRESH_MS);
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}
else{init();}

})();