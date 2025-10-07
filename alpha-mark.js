/* ==========================================================
   alpha-mark.js – Alpha > Markets (top ~50 tokens)
   Advanced Trading with Target Price Orders + Auto Execution
   ========================================================== */
(function(){
'use strict';

/* ---------- CONFIG ---------- */
const SUPA_URL='https://hwrvqyipozrsxyjdpqag.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

const MODE='local';
const MIN_INR=100;
const PRICE_REFRESH_MS=30000;
const HOLD_KEY='AVX_alpha_mark_holdings_test';
const ORDERS_KEY='AVX_alpha_mark_orders_test';

/* ---------- TOKENS ---------- */
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

/* ---------- ORDERS LOCAL ---------- */
function localGetOrders(){try{return JSON.parse(localStorage.getItem(ORDERS_KEY))||[];}catch(e){return [];}}
function localSetOrders(o){localStorage.setItem(ORDERS_KEY,JSON.stringify(o));}

/* ---------- HOLDINGS SUPA ---------- */
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

/* ---------- WALLET ---------- */
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

/* ---------- SAVE TRADE ---------- */
async function saveTrade(action,symbol,qty,amount_inr,price_inr){
 try{
  const {data:{user}}=await supa.auth.getUser();if(!user)return;
  const {error}=await supa.from('user_trades').insert([{
   user_id:user.id,action,symbol,qty,price_inr,amount_inr,created_at:new Date().toISOString()
  }]);
  if(error)console.error('trade save error',error);
 }catch(e){console.error('saveTrade fail',e);}
}

/* ---------- ORDER MANAGEMENT ---------- */
function generateOrderId(){return Date.now()+'-'+Math.random().toString(36).substr(2,9);}

function createOrder(type,symbol,qty,targetPrice,amount){
 return{
  id:generateOrderId(),
  type,symbol,qty:+qty,targetPrice:+targetPrice,amount:+amount,
  status:'pending',created:new Date().toISOString()
 };
}

async function saveOrder(order){
 const orders=localGetOrders();
 orders.push(order);
 localSetOrders(orders);
 toast(`${order.type} order placed for ${order.symbol}`,true);
 renderOrdersList();
}

async function cancelOrder(orderId){
 const orders=localGetOrders();
 const idx=orders.findIndex(o=>o.id===orderId);
 if(idx>=0){
  const order=orders[idx];
  if(order.type==='buy'){
   const bal=await getWalletINR();
   await setWalletINR(bal+order.amount);
  }else{
   const hold=await getHolding(order.symbol);
   await updateHolding(order.symbol,hold.qty+order.qty,hold.cost_inr);
  }
  orders.splice(idx,1);
  localSetOrders(orders);
  toast(`Order cancelled for ${order.symbol}`,true);
  renderOrdersList();
 }
}

async function executeOrder(order){
 try{
  const currentPrice=livePrices[order.symbol]||0;
  if(order.type==='buy'&&currentPrice<=order.targetPrice){
   const hold=await getHolding(order.symbol);
   await updateHolding(order.symbol,hold.qty+order.qty,hold.cost_inr+order.amount);
   await saveTrade('buy',order.symbol,order.qty,order.amount,currentPrice);
   toast(`✅ Buy order executed: ${order.qty.toFixed(6)} ${order.symbol}`,true);
   return true;
  }else if(order.type==='sell'&&currentPrice>=order.targetPrice){
   const bal=await getWalletINR();
   await setWalletINR(bal+order.amount);
   await saveTrade('sell',order.symbol,order.qty,order.amount,currentPrice);
   toast(`✅ Sell order executed: ${order.qty.toFixed(6)} ${order.symbol}`,true);
   return true;
  }
 }catch(e){console.error('execute order error',e);}
 return false;
}

async function checkPendingOrders(){
 const orders=localGetOrders();
 const executed=[];
 for(let i=0;i<orders.length;i++){
  const order=orders[i];
  if(await executeOrder(order)){
   executed.push(i);
  }
 }
 if(executed.length>0){
  const newOrders=orders.filter((_,i)=>!executed.includes(i));
  localSetOrders(newOrders);
  renderOrdersList();
 }
}

/* ---------- PRICE REFRESH ---------- */
async function refreshPrices(){
 try{
  const ids=TOKENS.map(t=>t[2]).join(',');
  const res=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=inr`);
  const data=await res.json();
  TOKENS.forEach(([sym,_,id])=>{
   const p=+data[id]?.inr||0;livePrices[sym]=p;
   const el=document.getElementById('price-alpha-mark-'+sym);if(el)el.textContent=fmtINR(p);
  });
  await checkPendingOrders();
 }catch(e){console.error('alpha mark price fetch fail',e);}
}

/* ---------- RENDER TOKEN LIST ---------- */
function renderList(){
 const c=document.getElementById('alpha-mark');if(!c)return;
 c.innerHTML=TOKENS.map(([sym,name])=>`
  <div class="avx-row">
    <div class="avx-left" onclick="AVX_alphaMarkShowTokenGraph('${sym}')">
      <div class="avx-sym">${sym}</div>
      <div class="avx-name">${name}</div>
      <div class="avx-price" id="price-alpha-mark-${sym}">₹--</div>
    </div>
    <div class="avx-actions">
      <button class="avx-buy" onclick="AVX_alphaMarkBuyToken('${sym}')">Buy</button>
      <button class="avx-sell" onclick="AVX_alphaMarkSellToken('${sym}')">Sell</button>
    </div>
  </div>`).join('');
}

/* ---------- RENDER ORDERS LIST ---------- */
function renderOrdersList(){
 const orders=localGetOrders();
 let ordersContainer=document.getElementById('alpha-mark-orders');
 if(!ordersContainer){
  ordersContainer=document.createElement('div');
  ordersContainer.id='alpha-mark-orders';
  ordersContainer.style.cssText='margin:20px 0;padding:15px;background:#f5f5f5;border-radius:8px;';
  const mainContainer=document.getElementById('alpha-mark');
  if(mainContainer&&mainContainer.parentNode){
   mainContainer.parentNode.insertBefore(ordersContainer,mainContainer);
  }
 }
 
 if(orders.length>0){
  ordersContainer.innerHTML=`
   <h3 style="margin:0 0 15px 0;color:#333;">Pending Orders (${orders.length})</h3>
   <div class="orders-list">
    ${orders.map(order=>`
     <div class="avx-order-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin:5px 0;background:white;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="flex:1;">
       <strong>${order.type.toUpperCase()} ${order.symbol}</strong><br>
       <small>Qty: ${order.qty.toFixed(6)} | Target: ${fmtINR(order.targetPrice)} | Amount: ${fmtINR(order.amount)}</small>
      </div>
      <div>
       <button onclick="AVX_alphaMarkEditOrder('${order.id}')" style="background:#3b82f6;color:white;border:none;padding:5px 10px;margin-right:5px;border-radius:4px;cursor:pointer;font-size:12px;">Edit</button>
       <button onclick="AVX_alphaMarkCancelOrder('${order.id}')" style="background:#ef4444;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Cancel</button>
      </div>
     </div>
    `).join('')}
   </div>`;
 }else{
  ordersContainer.innerHTML='<p style="color:#666;text-align:center;margin:0;">No pending orders</p>';
 }
}

/* ---------- TRADE MODAL ---------- */
function buildTradeModal(){
 const m=document.createElement('div');m.id='avx-alpha-mark-trade-modal';
 m.innerHTML=`
  <div class="avx-t-overlay"></div>
  <div class="avx-t-box">
    <div class="avx-t-head"><span id="avx-t-title">Trade</span><button id="avx-t-close">×</button></div>
    <div class="avx-t-bal" id="avx-t-bal">Balance: ₹--</div>
    <div class="avx-t-hold" id="avx-t-hold">You hold: --</div>
    <div class="avx-t-price" id="avx-t-price">Live Price: ₹--</div>
    
    <div class="avx-order-type" style="margin:15px 0;">
     <label style="margin-right:15px;"><input type="radio" name="orderType" value="market" checked style="margin-right:5px;"> Market Order</label>
     <label><input type="radio" name="orderType" value="limit" style="margin-right:5px;"> Limit Order</label>
    </div>
    
    <div id="avx-target-price-section" style="display:none;margin:10px 0;">
     <label class="avx-t-lbl">Target Price (₹)</label>
     <input type="number" id="avx-t-target" placeholder="Enter target price" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;"/>
    </div>
    
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
 
 const orderTypeInputs=m.querySelectorAll('input[name="orderType"]');
 orderTypeInputs.forEach(input=>{
  input.addEventListener('change',()=>{
   const targetSection=m.querySelector('#avx-target-price-section');
   targetSection.style.display=input.value==='limit'?'block':'none';
  });
 });
 
 const amt=m.querySelector('#avx-t-amt'),qty=m.querySelector('#avx-t-qty');
 amt.addEventListener('input',()=>{
  const price=+m.dataset.price||0;
  if(price>0)qty.value=amt.value?(+amt.value/price).toFixed(8):'';
 });
 qty.addEventListener('input',()=>{
  const price=+m.dataset.price||0;
  if(price>0)amt.value=qty.value?(+qty.value*price).toFixed(2):'';
 });
 
 m.querySelector('#avx-t-amt-max').onclick=async()=>{
  if(m.dataset.mode!=='buy')return;
  const bal=await getWalletINR();amt.value=bal.toFixed(2);
  const price=+m.dataset.price||0;qty.value=price?(bal/price).toFixed(8):'';
 };
 m.querySelector('#avx-t-qty-max').onclick=async()=>{
  if(m.dataset.mode!=='sell')return;
  const sym=m.dataset.sym;const hold=await getHolding(sym);qty.value=hold.qty;
  const price=+m.dataset.price||0;amt.value=price?(hold.qty*price).toFixed(2):'';
 };
 
 m.querySelector('#avx-t-confirm').onclick=confirmTrade;
 return m;
}

function showModal({mode,sym,price,bal,holdQty,editOrder}){
 const m=document.getElementById('avx-alpha-mark-trade-modal')||buildTradeModal();
 m.dataset.mode=mode;m.dataset.sym=sym;m.dataset.price=price;
 if(editOrder)m.dataset.editOrderId=editOrder.id;else delete m.dataset.editOrderId;
 
 const title=m.querySelector('#avx-t-title');const btn=m.querySelector('#avx-t-confirm');
 if(editOrder){
  title.textContent=`Edit ${editOrder.type} ${sym} Order`;
  btn.textContent='Update Order';
 }else if(mode==='buy'){
  title.textContent=`Buy ${sym}`;btn.textContent='Buy Now';btn.classList.remove('sell');btn.classList.add('buy');
 }else{
  title.textContent=`Sell ${sym}`;btn.textContent='Sell Now';btn.classList.remove('buy');btn.classList.add('sell');
 }
 
 m.querySelector('#avx-t-bal').textContent=`Balance: ${fmtINR(bal)}`;
 m.querySelector('#avx-t-hold').textContent=`You hold: ${holdQty.toFixed(8)} ${sym}`;
 m.querySelector('#avx-t-price').textContent=`Live Price: ${fmtINR(price)}`;
 
 if(editOrder){
  m.querySelector('#avx-t-amt').value=editOrder.amount.toFixed(2);
  m.querySelector('#avx-t-qty').value=editOrder.qty.toFixed(8);
  m.querySelector('#avx-t-target').value=editOrder.targetPrice.toFixed(2);
  m.querySelector('input[value="limit"]').checked=true;
  m.querySelector('#avx-target-price-section').style.display='block';
 }else{
  m.querySelector('#avx-t-amt').value='';m.querySelector('#avx-t-qty').value='';m.querySelector('#avx-t-target').value='';
  m.querySelector('input[value="market"]').checked=true;m.querySelector('#avx-target-price-section').style.display='none';
 }
 
 m.style.display='block';requestAnimationFrame(()=>m.classList.add('show'));
}

function hideModal(){const m=document.getElementById('avx-alpha-mark-trade-modal');if(!m)return;m.classList.remove('show');setTimeout(()=>{m.style.display='none';},150);}

/* ---------- CONFIRM TRADE ---------- */
async function confirmTrade(){
 const m=document.getElementById('avx-alpha-mark-trade-modal');if(!m)return;
 const mode=m.dataset.mode,sym=m.dataset.sym,price=+m.dataset.price||0;
 const amt=+m.querySelector('#avx-t-amt').value||0;
 const qty=+m.querySelector('#avx-t-qty').value||0;
 const orderType=m.querySelector('input[name="orderType"]:checked').value;
 const targetPrice=+m.querySelector('#avx-t-target').value||0;
 const editOrderId=m.dataset.editOrderId;
 
 if(price<=0){toast('Live price missing.',false);return;}
 if(isNaN(amt)||amt<MIN_INR){toast(`Min ₹${MIN_INR}`,false);return;}
 if(isNaN(qty)||qty<=0){toast('Enter valid quantity.',false);return;}
 
 if(editOrderId){
  if(!targetPrice||targetPrice<=0){toast('Enter target price.',false);return;}
  const orders=localGetOrders();
  const orderIdx=orders.findIndex(o=>o.id===editOrderId);
  if(orderIdx>=0){
   const oldOrder=orders[orderIdx];
   const balDiff=amt-oldOrder.amount;
   const qtyDiff=qty-oldOrder.qty;
   
   if(oldOrder.type==='buy'){
    const bal=await getWalletINR();
    if(balDiff>bal){toast('Insufficient balance for update.',false);return;}
    await setWalletINR(bal-balDiff);
   }else{
    const hold=await getHolding(sym);
    if(qtyDiff>hold.qty){toast('Not enough tokens for update.',false);return;}
    if(qtyDiff!==0){
     await updateHolding(sym,hold.qty-qtyDiff,hold.cost_inr);
    }
   }
   
   orders[orderIdx]={...oldOrder,qty,targetPrice,amount:amt};
   localSetOrders(orders);
   toast('Order updated successfully',true);
   renderOrdersList();
  }
 }else if(orderType==='market'){
  if(mode==='buy'){
   const bal=await getWalletINR();if(amt>bal){toast('Insufficient balance.',false);return;}
   const buyQty=amt/price;const cur=await getHolding(sym);
   await setWalletINR(bal-amt);
   await updateHolding(sym,cur.qty+buyQty,cur.cost_inr+amt);
   await saveTrade('buy',sym,buyQty,amt,price);
   toast('Token Buy Done ✅',true);
  }else{
   const cur=await getHolding(sym);if(qty>cur.qty){toast('Not enough token.',false);return;}
   const bal=await getWalletINR();const sellAmt=qty*price;
   const avgCost=cur.qty?cur.cost_inr/cur.qty:0;
   const newQty=cur.qty-qty;const newCost=newQty>0?cur.cost_inr-(qty*avgCost):0;
   await setWalletINR(bal+sellAmt);
   await updateHolding(sym,newQty,newCost);
   await saveTrade('sell',sym,qty,sellAmt,price);
   toast('Token Sell Done ✅',true);
  }
 }else{
  if(!targetPrice||targetPrice<=0){toast('Enter target price.',false);return;}
  if(mode==='buy'){
   if(targetPrice>=price){toast('Buy target must be below current price.',false);return;}
   const bal=await getWalletINR();if(amt>bal){toast('Insufficient balance.',false);return;}
   await setWalletINR(bal-amt);
   const order=createOrder('buy',sym,qty,targetPrice,amt);
   await saveOrder(order);
  }else{
   if(targetPrice<=price){toast('Sell target must be above current price.',false);return;}
   const cur=await getHolding(sym);if(qty>cur.qty){toast('Not enough token.',false);return;}
   const avgCost=cur.qty?cur.cost_inr/cur.qty:0;
   const newQty=cur.qty-qty;const newCost=newQty>0?cur.cost_inr-(qty*avgCost):0;
   await updateHolding(sym,newQty,newCost);
   const order=createOrder('sell',sym,qty,targetPrice,amt);
   await saveOrder(order);
  }
 }
 hideModal();
}

/* ---------- CHART MODAL ---------- */
function buildChartModal(){
 const wrap=document.createElement('div');wrap.id='avx-alpha-mark-chart-modal';
 wrap.innerHTML=`
  <div class="avx-c-overlay"></div>
  <div class="avx-c-box">
    <div class="avx-c-head"><span id="avx-c-title">Chart</span><button id="avx-c-close">×</button></div>
    <canvas id="avx-canvas-alpha-mark" width="400" height="220"></canvas>
    <div class="avx-c-range-msg">Last 30 days (INR)</div>
  </div>`;
 document.body.appendChild(wrap);
 wrap.querySelector('.avx-c-overlay').onclick=hideChartModal;
 wrap.querySelector('#avx-c-close').onclick=hideChartModal;
 return wrap;
}
function showChartModal(sym){
 const m=document.getElementById('avx-alpha-mark-chart-modal')||buildChartModal();
 m.querySelector('#avx-c-title').textContent=`${sym} Chart`;
 m.style.display='block';requestAnimationFrame(()=>m.classList.add('show'));
 drawSimpleChart(sym);
}
function hideChartModal(){const m=document.getElementById('avx-alpha-mark-chart-modal');if(!m)return;m.classList.remove('show');setTimeout(()=>{m.style.display='none';},150);}
function drawSimpleChart(sym){
 const canvas=document.getElementById('avx-canvas-alpha-mark');if(!canvas)return;
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#f9f9f9';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.strokeStyle='#ddd';ctx.lineWidth=1;
 for(let i=0;i<=10;i++){const y=i*22;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
 for(let i=0;i<=10;i++){const x=i*40;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
 const mockData=Array.from({length:30},(_,i)=>{
  const base=livePrices[sym]||1000;const noise=(Math.random()-0.5)*0.4*base;const trend=Math.sin(i*0.3)*0.1*base;
  return Math.max(0,base+noise+trend);
 });
 const maxVal=Math.max(...mockData);const minVal=Math.min(...mockData);const range=maxVal-minVal||1;
 ctx.strokeStyle='#059669';ctx.lineWidth=2;ctx.beginPath();
 mockData.forEach((val,i)=>{
  const x=(i/(mockData.length-1))*(canvas.width-40)+20;
  const y=canvas.height-20-((val-minVal)/range)*(canvas.height-40);
  if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
 });
 ctx.stroke();
 ctx.fillStyle='rgba(5,150,105,0.1)';ctx.beginPath();
 mockData.forEach((val,i)=>{
  const x=(i/(mockData.length-1))*(canvas.width-40)+20;
  const y=canvas.height-20-((val-minVal)/range)*(canvas.height-40);
  if(i===0){ctx.moveTo(x,y);}else{ctx.lineTo(x,y);}
 });
 ctx.lineTo(canvas.width-20,canvas.height-20);ctx.lineTo(20,canvas.height-20);ctx.closePath();ctx.fill();
 ctx.fillStyle='#333';ctx.font='12px Arial';
 ctx.fillText(`${sym}: ${fmtINR(livePrices[sym]||0)}`,10,15);
 ctx.fillText(`High: ${fmtINR(maxVal)}`,10,canvas.height-25);
 ctx.fillText(`Low: ${fmtINR(minVal)}`,canvas.width-80,canvas.height-25);
}

/* ---------- GLOBAL FUNCTIONS ---------- */
window.AVX_alphaMarkBuyToken=async function(sym){
 const price=livePrices[sym];if(!price){toast('Price not available',false);return;}
 const bal=await getWalletINR();const hold=await getHolding(sym);
 showModal({mode:'buy',sym,price,bal,holdQty:hold.qty});
};

window.AVX_alphaMarkSellToken=async function(sym){
 const price=livePrices[sym];if(!price){toast('Price not available',false);return;}
 const hold=await getHolding(sym);if(hold.qty<=0){toast('No tokens to sell',false);return;}
 const bal=await getWalletINR();
 showModal({mode:'sell',sym,price,bal,holdQty:hold.qty});
};

window.AVX_alphaMarkShowTokenGraph=function(sym){showChartModal(sym);};

window.AVX_alphaMarkCancelOrder=function(orderId){cancelOrder(orderId);};

window.AVX_alphaMarkEditOrder=async function(orderId){
 const orders=localGetOrders();
 const order=orders.find(o=>o.id===orderId);
 if(!order)return;
 const price=livePrices[order.symbol];if(!price){toast('Price not available',false);return;}
 const bal=await getWalletINR();const hold=await getHolding(order.symbol);
 showModal({mode:order.type,sym:order.symbol,price,bal,holdQty:hold.qty,editOrder:order});
};

/* ---------- INITIALIZATION ---------- */
function init(){
 if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);return;}
 renderList();renderOrdersList();refreshPrices();
 setInterval(refreshPrices,PRICE_REFRESH_MS);
}

init();

})();