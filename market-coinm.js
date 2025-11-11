/* ==========================================================
   market-coinm.js – Market > COIN-M (top 50 meme coins)
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
const HOLD_KEY='AVX_coinm_holdings_test';

/* ---------- MEME COINS : total 50 ---------- */
const TOKENS=[
 // Original 20 meme coins
 ['DOGE','Dogecoin','dogecoin'],
 ['SHIB','Shiba Inu','shiba-inu'],
 ['PEPE','Pepe','pepe'],
 ['FLOKI','Floki','floki'],
 ['BONK','Bonk','bonk'],
 ['WIF','dogwifhat','dogwifhat'],
 ['BRETT','Brett (Based)','based-brett'],
 ['POPCAT','Popcat (SOL)','popcat'],
 ['NEIRO','Neiro','neiro'],
 ['MOG','Mog Coin','mog-coin'],
 ['TURBO','Turbo','turbo'],
 ['MEME','Memecoin','memecoin'],
 ['BABYDOGE','Baby Doge Coin','baby-doge-coin'],
 ['WOJAK','Wojak','wojak'],
 ['LADYS','Milady Meme Coin','milady-meme-coin'],
 ['KISHU','Kishu Inu','kishu-inu'],
 ['ELON','Dogelon Mars','dogelon-mars'],
 ['AKITA','Akita Inu','akita-inu'],
 ['HOKK','Hokkaido Inu','hokkaido-inu'],
 ['SAITAMA','SaitamaInu','saitama-inu'],
 // Additional 30 popular meme coins
 ['SAFE','SafeMoon','safemoon'],
 ['HOGE','Hoge Finance','hoge-finance'],
 ['CATE','Cat in a Dogs World','cat-in-a-dogs-world'],
 ['MYRO','Myro','myro'],
 ['PNUT','Peanut the Squirrel','peanut-the-squirrel'],
 ['GOAT','Goatseus Maximus','goatseus-maximus'],
 ['ACT','Act I The AI Prophecy','act-i-the-ai-prophecy'],
 ['CHILLGUY','Just a chill guy','just-a-chill-guy'],
 ['PONKE','Ponke','ponke'],
 ['BOME','BOOK OF MEME','book-of-meme'],
 ['MEW','cat in a dogs world','cat-in-a-dogs-world'],
 ['SLERF','Slerf','slerf'],
 ['CWIF','Coinwif','coinwif'],
 ['SMOG','Smog','smog'],
 ['WEN','Wen','wen'],
 ['TOSHI','Toshi','toshi'],
 ['MANEKI','Maneki Neko','maneki-neko'],
 ['GIGA','Giga Chad','giga-chad'],
 ['PEPE2','Pepe 2.0','pepe-2-0'],
 ['MAGA','MAGA','maga'],
 ['TRUMP','TrumpCoin','trumpcoin'],
 ['MOON','MoonCoin','mooncoin'],
 ['ROCKET','RocketDoge','rocketdoge'],
 ['DIAMOND','DiamondDoge','diamonddoge'],
 ['GOLD','GoldDoge','golddoge'],
 ['FIRE','FireDoge','firedoge'],
 ['ICE','IceDoge','icedoge'],
 ['RAIN','RainDoge','raindoge'],
 ['SUN','SunDoge','sundoge'],
 ['PICKLE','PickleDoge','pickledoge']
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
   const el=document.getElementById('price-coinm-'+sym);if(el)el.textContent=fmtINR(p);
  });
 }catch(e){console.error('coinm price fetch fail',e);}
}

/* ---------- RENDER TOKEN LIST ---------- */
function renderList(){
 const c=document.getElementById('coinm');if(!c)return;
 c.innerHTML=TOKENS.map(([sym,name])=>`
  <div class="avx-row">
    <div class="avx-left" onclick="AVX_coinmShowTokenGraph('${sym}')">
      <div class="avx-sym">${sym}</div>
      <div class="avx-name">${name}</div>
      <div class="avx-price" id="price-coinm-${sym}">₹--</div>
    </div>
    <div class="avx-actions">
      <button class="avx-buy" onclick="AVX_coinmBuyToken('${sym}')">Buy</button>
      <button class="avx-sell" onclick="AVX_coinmSellToken('${sym}')">Sell</button>
    </div>
  </div>`).join('');
}

/* ---------- TRADE MODAL ---------- */
function buildTradeModal(){
 const m=document.createElement('div');m.id='avx-coinm-trade-modal';
 m.innerHTML=`
  <div class="avx-t-overlay"></div>
  <div class="avx-t-box">
    <div class="avx-t-head"><span id="avx-t-title">Trade</span><button id="avx-t-close">×</button></div>
    <div class="avx-t-bal" id="avx-t-bal">Balance: ₹--</div>
    <div class="avx-t-hold" id="avx-t-hold">You hold: --</div>
    <div class="avx-t-price" id="avx-t-price">Live Price: ₹--</div>
    <label class="avx-t-lbl">INR Amount</label>
    <div class="avx-input-wrap"><input type="number" id="avx-t-amt" placeholder="Enter amount in INR"/><button type="button" id="avx-t-amt-max" class="avx-max-btn">MAX</button></div>
    <label class="avx-t-lbl">Token Qty</label>
    <div class="avx-input-wrap"><input type="number" id="avx-t-qty" placeholder="Enter token qty"/><button type="button" id="avx-t-qty-max" class="avx-max-btn">MAX</button></div>
    <div class="avx-t-min">Min ₹${MIN_INR}</div>
    <button id="avx-t-confirm" class="avx-t-confirm">Confirm</button>
  </div>`;
 document.body.appendChild(m);
 m.querySelector('.avx-t-overlay').onclick=hideModal;
 m.querySelector('#avx-t-close').onclick=hideModal;
 const amt=m.querySelector('#avx-t-amt'),qty=m.querySelector('#avx-t-qty');
 amt.addEventListener('input',()=>{const p=+m.dataset.price||0;if(p>0)qty.value=amt.value?(+amt.value/p).toFixed(8):'';});
 qty.addEventListener('input',()=>{const p=+m.dataset.price||0;if(p>0)amt.value=qty.value?(+qty.value*p).toFixed(2):'';});
 m.querySelector('#avx-t-amt-max').onclick=async()=>{
  if(m.dataset.mode!=='buy')return;
  const bal=await getWalletINR();amt.value=bal.toFixed(2);
  const p=+m.dataset.price||0;qty.value=p?(bal/p).toFixed(8):'';
 };
 m.querySelector('#avx-t-qty-max').onclick=async()=>{
  if(m.dataset.mode!=='sell')return;
  const sym=m.dataset.sym;const hold=await getHolding(sym);qty.value=hold.qty;
  const p=+m.dataset.price||0;amt.value=p?(hold.qty*p).toFixed(2):'';
 };
 m.querySelector('#avx-t-confirm').onclick=confirmTrade;
 return m;
}
function showModal({mode,sym,price,bal,holdQty}){
 const m=document.getElementById('avx-coinm-trade-modal')||buildTradeModal();
 m.dataset.mode=mode;m.dataset.sym=sym;m.dataset.price=price;
 const title=m.querySelector('#avx-t-title');const btn=m.querySelector('#avx-t-confirm');
 if(mode==='buy'){title.textContent=`Buy ${sym}`;btn.textContent='Buy Now';btn.classList.remove('sell');btn.classList.add('buy');}
 else{title.textContent=`Sell ${sym}`;btn.textContent='Sell Now';btn.classList.remove('buy');btn.classList.add('sell');}
 m.querySelector('#avx-t-bal').textContent=`Balance: ${fmtINR(bal)}`;
 m.querySelector('#avx-t-hold').textContent=`You hold: ${holdQty.toFixed(8)} ${sym}`;
 m.querySelector('#avx-t-price').textContent=`Live Price: ${fmtINR(price)}`;
 m.querySelector('#avx-t-amt').value='';m.querySelector('#avx-t-qty').value='';
 m.style.display='block';requestAnimationFrame(()=>m.classList.add('show'));
}
function hideModal(){const m=document.getElementById('avx-coinm-trade-modal');if(!m)return;m.classList.remove('show');setTimeout(()=>{m.style.display='none';},150);}

/* ---------- CONFIRM TRADE ---------- */
async function confirmTrade(){
 const m=document.getElementById('avx-coinm-trade-modal');if(!m)return;
 const mode=m.dataset.mode,sym=m.dataset.sym,price=+m.dataset.price||0;
 const amt=+m.querySelector('#avx-t-amt').value||0;
 const qty=+m.querySelector('#avx-t-qty').value||0;
 if(price<=0){toast('Live price missing.',false);return;}
 if(mode==='buy'){
  if(isNaN(amt)||amt<MIN_INR){toast(`Min ₹${MIN_INR}`,false);return;}
  const bal=await getWalletINR();if(amt>bal){toast('Insufficient balance.',false);return;}
  const buyQty=amt/price;const cur=await getHolding(sym);
  await setWalletINR(bal-amt);
  await updateHolding(sym,cur.qty+buyQty,cur.cost_inr+amt);
  await saveTrade('buy',sym,buyQty,amt,price);
  toast('Token Buy Done ✅',true);
 }else{
  if(isNaN(qty)||qty<=0){toast('Enter quantity.',false);return;}
  if((qty*price)<MIN_INR){toast(`Min ₹${MIN_INR}`,false);return;}
  const cur=await getHolding(sym);if(qty>cur.qty){toast('Not enough token.',false);return;}
  const bal=await getWalletINR();const sellAmt=qty*price;
  const avgCost=cur.qty?cur.cost_inr/cur.qty:0;
  const newQty=cur.qty-qty;
  const newCost=newQty>0?cur.cost_inr-(qty*avgCost):0;
  await setWalletINR(bal+sellAmt);
  await updateHolding(sym,newQty,newCost);
  await saveTrade('sell',sym,qty,sellAmt,price);
  toast('Token Sell Done ✅',true);
 }
 hideModal();
}

/* ---------- CHART MODAL ---------- */
function buildChartModal(){
 const wrap=document.createElement('div');wrap.id='avx-coinm-chart-modal';
 wrap.innerHTML=`
  <div class="avx-c-overlay"></div>
  <div class="avx-c-box">
    <div class="avx-c-head"><span id="avx-c-title">Chart</span><button id="avx-c-close">×</button></div>
    <canvas id="avx-canvas-coinm" width="400" height="220"></canvas>
    <div class="avx-c-range-msg">Last 30 days (INR)</div>
  </div>`;
 document.body.appendChild(wrap);
 wrap.querySelector('.avx-c-overlay').onclick=hideChartModal;
 wrap.querySelector('#avx-c-close').onclick=hideChartModal;
 return wrap;
}
function hideChartModal(){const m=document.getElementById('avx-coinm-chart-modal');if(!m)return;m.classList.remove('show');setTimeout(()=>{m.style.display='none';},150);}
async function showChart(sym){
 const m=document.getElementById('avx-coinm-chart-modal')||buildChartModal();
 m.querySelector('#avx-c-title').textContent=`${sym} Chart`;
 m.style.display='block';requestAnimationFrame(()=>m.classList.add('show'));
 const id=CG_ID_MAP[sym];if(!id){toast('No chart data.',false);return;}
 try{
  const r=await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=inr&days=30&interval=daily`);
  const j=await r.json();const pts=(j.prices||[]).map(p=>+p[1]);drawSimpleLine('avx-canvas-coinm',pts);
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
 data.forEach((val,i)=>{
  const x=pad+(i/(data.length-1))*w;
  const y=cv.height-pad-((val-min)/rng)*h;
  if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
 });
 ctx.stroke();
}

/* ---------- GLOBAL FUNCTIONS ---------- */
window.AVX_coinmBuyToken=async function(sym){
 const price=livePrices[sym];if(!price){toast('Price not available.',false);return;}
 const bal=await getWalletINR();const hold=await getHolding(sym);
 showModal({mode:'buy',sym,price,bal,holdQty:hold.qty});
};
window.AVX_coinmSellToken=async function(sym){
 const price=livePrices[sym];if(!price){toast('Price not available.',false);return;}
 const bal=await getWalletINR();const hold=await getHolding(sym);
 showModal({mode:'sell',sym,price,bal,holdQty:hold.qty});
};
window.AVX_coinmShowTokenGraph=function(sym){showChart(sym);};

/* ---------- STYLING ---------- */
if(!document.getElementById('avx-coinm-styles')){
 const s=document.createElement('style');s.id='avx-coinm-styles';s.textContent=`
  #avx-toast{position:fixed;top:20px;right:20px;padding:10px 16px;color:white;border-radius:6px;z-index:9999;opacity:0;transition:opacity 0.3s;}
  #avx-toast.ok{background:#28a745;}#avx-toast.err{background:#dc3545;}
  .avx-row{display:flex;justify-content:space-between;align-items:center;padding:12px 10px;border-bottom:1px solid #eee;}
  .avx-left{flex:1;cursor:pointer;}.avx-sym{font-weight:bold;font-size:16px;}.avx-name{font-size:13px;color:#666;margin:2px 0;}
  .avx-price{font-size:14px;color:#333;font-weight:500;}.avx-actions{display:flex;gap:8px;}
  .avx-buy,.avx-sell{padding:6px 12px;border:none;border-radius:4px;font-size:12px;font-weight:bold;cursor:pointer;}
  .avx-buy{background:#28a745;color:white;}.avx-sell{background:#dc3545;color:white;}
  #avx-coinm-trade-modal,#avx-coinm-chart-modal{position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;display:none;opacity:0;transition:opacity 0.15s;}
  #avx-coinm-trade-modal.show,#avx-coinm-chart-modal.show{opacity:1;}
  .avx-t-overlay,.avx-c-overlay{position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);}
  .avx-t-box,.avx-c-box{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border-radius:8px;padding:20px;width:90%;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,0.3);}
  .avx-t-head,.avx-c-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;font-weight:bold;font-size:18px;}
  #avx-t-close,#avx-c-close{background:none;border:none;font-size:20px;cursor:pointer;color:#999;}
  .avx-t-bal,.avx-t-hold,.avx-t-price{margin:8px 0;color:#555;}.avx-t-lbl{display:block;margin:12px 0 4px;font-weight:500;}
  .avx-input-wrap{position:relative;}.avx-input-wrap input{width:100%;padding:10px;border:1px solid #ccc;border-radius:4px;font-size:16px;}
  .avx-max-btn{position:absolute;right:5px;top:50%;transform:translateY(-50%);background:#007bff;color:white;border:none;padding:4px 8px;border-radius:3px;font-size:11px;cursor:pointer;}
  .avx-t-min{font-size:12px;color:#666;margin:8px 0;}.avx-t-confirm{width:100%;padding:12px;border:none;border-radius:6px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:15px;}
  .avx-t-confirm.buy{background:#28a745;color:white;}.avx-t-confirm.sell{background:#dc3545;color:white;}
  .avx-c-range-msg{text-align:center;margin-top:10px;font-size:12px;color:#666;}
 `;document.head.appendChild(s);
}

/* ---------- INIT ---------- */
async function init(){
 await refreshPrices();
 renderList();
 setInterval(refreshPrices,PRICE_REFRESH_MS);
}

if(document.readyState==='loading'){
 document.addEventListener('DOMContentLoaded',init);
}else{
 setTimeout(init,100);
}

})();