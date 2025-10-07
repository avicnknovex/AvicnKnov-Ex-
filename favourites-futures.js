/* ==========================================================
   favourites-futures.js – User Favourite Tokens (max: unlimited)
   - Select from master 50 token list
   - Live INR prices (CoinGecko)
   - Supabase wallet connect (user_wallets)
   - Shared holdings (local now; flip MODE to 'supa' later)
   - Buy / Sell modal (INR <-> Qty auto)
   - Trade log -> user_trades (Supabase)
   - Remove favourite
   - Simple 30D line chart
   ========================================================== */
(function(){

  /* ---------- CONFIG ---------- */
  const SUPA_URL  = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
  const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

  const MODE             = 'local';          // holdings: 'local' | 'supa'
  const MIN_INR          = 100;
  const PRICE_REFRESH_MS = 30000;
  const HOLD_KEY         = 'AVX_holdings_test'; // shared w/ favourites-all.js
  const FAV_KEY          = 'AVX_futures_favs';  // store fav token syms

  /* ---------- MASTER TOKENS (sym, name, coingecko id) ---------- */
  const TOKENS = [
    ['BTC','Bitcoin','bitcoin'],['ETH','Ethereum','ethereum'],['BNB','BNB','binancecoin'],
    ['SOL','Solana','solana'],['XRP','XRP','ripple'],['ADA','Cardano','cardano'],
    ['DOGE','Dogecoin','dogecoin'],['MATIC','Polygon','matic-network'],['DOT','Polkadot','polkadot'],
    ['LTC','Litecoin','litecoin'],['TRX','TRON','tron'],['AVAX','Avalanche','avalanche-2'],
    ['SHIB','Shiba Inu','shiba-inu'],['ATOM','Cosmos','cosmos'],['XLM','Stellar','stellar'],
    ['LINK','Chainlink','chainlink'],['UNI','Uniswap','uniswap'],['ETC','Ethereum Classic','ethereum-classic'],
    ['FIL','Filecoin','filecoin'],['APT','Aptos','aptos'],['NEAR','NEAR Protocol','near'],
    ['ICP','Internet Computer','internet-computer'],['SAND','The Sandbox','the-sandbox'],
    ['AAVE','Aave','aave'],['AXS','Axie Infinity','axie-infinity'],['QNT','Quant','quant-network'],
    ['EGLD','MultiversX','elrond-erd-2'],['MKR','Maker','maker'],['RUNE','THORChain','thorchain'],
    ['ALGO','Algorand','algorand'],['FTM','Fantom','fantom'],['CRV','Curve DAO','curve-dao-token'],
    ['HBAR','Hedera','hedera-hashgraph'],['VET','VeChain','vechain'],['GRT','The Graph','the-graph'],
    ['FLOW','Flow','flow'],['SNX','Synthetix','synthetix-network-token'],['DYDX','dYdX','dydx'],
    ['ZEC','Zcash','zcash'],['BAT','Basic Attention Token','basic-attention-token'],
    ['1INCH','1inch','1inch'],['COMP','Compound','compound-governance-token'],
    ['ENS','ENS','ethereum-name-service'],['KAVA','Kava','kava'],['ZIL','Zilliqa','zilliqa'],
    ['CELO','Celo','celo'],['OMG','OMG Network','omisego'],['ANKR','Ankr','ankr'],
    ['STX','Stacks','blockstack'],['WAVES','Waves','waves'],['CHZ','Chiliz','chiliz']
  ];
  const CG_ID_MAP={};TOKENS.forEach(([s,_,id])=>CG_ID_MAP[s]=id);

  /* ---------- SUPABASE CLIENT ---------- */
  const supaLib = window.supabase || (window.parent && window.parent.supabase);
  if(!supaLib){ console.error('Supabase lib not found.'); return; }
  const supa = supaLib.createClient(SUPA_URL,SUPA_KEY);

  /* ---------- PRICE CACHE ---------- */
  const livePrices={}; // {SYM:inr}

  /* ---------- UTILS ---------- */
  const fmtINR = v=>'₹'+Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  function getTokenMeta(sym){return TOKENS.find(t=>t[0]===sym)||null;}

  function toast(msg,ok=true){
    let t=document.getElementById('avxfut-toast');
    if(!t){
      t=document.createElement('div');
      t.id='avxfut-toast';
      document.body.appendChild(t);
    }
    t.textContent=msg;
    t.className=ok?'ok':'err';
    t.style.opacity='1';
    setTimeout(()=>{t.style.opacity='0';},2200);
  }

  /* ---------- FAV STORAGE ---------- */
  function favGet(){
    try{const a=JSON.parse(localStorage.getItem(FAV_KEY)||'[]');return Array.isArray(a)?a:[];}
    catch(_){return [];}
  }
  function favSet(arr){localStorage.setItem(FAV_KEY,JSON.stringify(arr));}
  function favAdd(sym){
    sym=sym.toUpperCase();
    const f=favGet();
    if(!f.includes(sym)){f.push(sym);favSet(f);}
  }
  function favRemove(sym){
    sym=sym.toUpperCase();
    let f=favGet().filter(s=>s!==sym);
    favSet(f);
  }

  /* ---------- HOLDINGS LOCAL ---------- */
  function localGetHoldings(){try{return JSON.parse(localStorage.getItem(HOLD_KEY))||{};}catch(_){return {};}}
  function localSetHoldings(o){localStorage.setItem(HOLD_KEY,JSON.stringify(o));}

  /* ---------- HOLDINGS SUPA (future) ---------- */
  async function supaGetHoldingsMap(){
    const {data:{user}}=await supa.auth.getUser();if(!user)return{};
    const {data,error}=await supa.from('user_holdings').select('symbol,qty,cost_inr').eq('user_id',user.id);
    if(error){console.warn('supa holdings error',error);return{};}
    const map={};data.forEach(r=>map[r.symbol.toUpperCase()]={qty:Number(r.qty||0),cost_inr:Number(r.cost_inr||0)});
    return map;
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
    symbol=symbol.toUpperCase();const h=await getHoldingsMap();const r=h[symbol];
    if(!r)return{qty:0,cost_inr:0};
    return{qty:Number(r.qty||0),cost_inr:Number(r.cost_inr||0)};
  }

  /* ---------- WALLET (Supabase) ---------- */
  async function getUser(){const {data:{user}}=await supa.auth.getUser();return user;}
  async function getWalletINR(){
    const u=await getUser();if(!u)return 0;
    const {data,error}=await supa.from('user_wallets').select('balance').eq('uid',u.id).single();
    if(error){console.error('wallet fetch error',error);return 0;}
    return Number(data?.balance||0);
  }
  async function setWalletINR(newBal){
    const u=await getUser();if(!u)return;
    const {error}=await supa.from('user_wallets').update({balance:newBal}).eq('uid',u.id);
    if(error)console.error('wallet update error',error);
    if(typeof window.updateWalletBalance==='function')window.updateWalletBalance();
    else if(window.parent&&typeof window.parent.updateWalletBalance==='function')window.parent.updateWalletBalance();
  }

  /* ---------- TRADE HISTORY SAVE (user_trades) ---------- */
  async function saveTrade(action,symbol,qty,amt,price){
    try{
      const {data:{user}}=await supa.auth.getUser();if(!user)return;
      const {error}=await supa.from('user_trades').insert([{user_id:user.id,action,symbol,qty,price_inr:price,amount_inr:amt}]);
      if(error)console.error('trade save error',error);
    }catch(e){console.error('saveTrade fail',e);}
  }

  /* ---------- PRICE REFRESH ---------- */
  async function refreshPrices(){
    try{
      const ids=TOKENS.map(t=>t[2]).join(',');
      const r=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=inr`);
      const j=await r.json();
      TOKENS.forEach(([sym,_,id])=>{
        const p=Number(j[id]?.inr||0);livePrices[sym]=p;
        const el=document.getElementById('fut-price-'+sym);if(el)el.textContent=fmtINR(p);
      });
    }catch(e){console.error('price fetch fail',e);}
  }

  /* ---------- RENDER LIST ---------- */
  function getContainer(){
    return document.getElementById('futures')
        || document.getElementById('all')
        || document.body;
  }
  function renderList(){
    const c=getContainer();if(!c)return;
    const favs=favGet();
    if(!favs.length){
      c.innerHTML=`
        <div class="avxfut-empty">
          <p>No favourite tokens yet.</p>
          <button class="avxfut-add-btn" onclick="AVXFUT_openAddFav()">+ Add Favourite Token</button>
        </div>`;
      return;
    }
    c.innerHTML=`
      <div class="avxfut-topbar">
        <button class="avxfut-add-btn" onclick="AVXFUT_openAddFav()">+ Add Favourite Token</button>
      </div>
      ${favs.map(sym=>{
        const meta=getTokenMeta(sym)||[sym,sym];
        return `
          <div class="avxfut-row">
            <div class="avxfut-left" onclick="AVXFUT_showTokenGraph('${sym}')">
              <div class="avxfut-sym">${sym}</div>
              <div class="avxfut-name">${meta[1]||sym}</div>
              <div class="avxfut-price" id="fut-price-${sym}">₹--</div>
            </div>
            <div class="avxfut-actions">
              <button class="avxfut-buy"  onclick="AVXFUT_buyToken('${sym}')">Buy</button>
              <button class="avxfut-sell" onclick="AVXFUT_sellToken('${sym}')">Sell</button>
              <button class="avxfut-rem"  onclick="AVXFUT_remove('${sym}')">✕</button>
            </div>
          </div>`;
      }).join('')}
    `;
  }

  /* ---------- ADD-FAV MODAL ---------- */
  function buildAddFavModal(){
    const m=document.createElement('div');
    m.id='avxfut-add-modal';
    m.innerHTML=`
      <div class="avxfut-a-overlay"></div>
      <div class="avxfut-a-box">
        <div class="avxfut-a-head">
          <span>Select Token</span>
          <button id="avxfut-a-close">×</button>
        </div>
        <input id="avxfut-a-search" type="text" placeholder="Search token..."/>
        <div id="avxfut-a-list" class="avxfut-a-list"></div>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('.avxfut-a-overlay').onclick=closeAddFavModal;
    m.querySelector('#avxfut-a-close').onclick=closeAddFavModal;
    m.querySelector('#avxfut-a-search').addEventListener('input',renderAddFavList);
    return m;
  }
  function openAddFavModal(){
    const m=document.getElementById('avxfut-add-modal')||buildAddFavModal();
    renderAddFavList();
    m.style.display='block';requestAnimationFrame(()=>m.classList.add('show'));
  }
  function closeAddFavModal(){
    const m=document.getElementById('avxfut-add-modal');if(!m)return;
    m.classList.remove('show');setTimeout(()=>{m.style.display='none';},150);
  }
  function renderAddFavList(){
    const m=document.getElementById('avxfut-add-modal');if(!m)return;
    const list=m.querySelector('#avxfut-a-list');
    const q=m.querySelector('#avxfut-a-search').value.trim().toLowerCase();
    const favs=favGet();
    const avail=TOKENS.filter(([sym,name])=>{
      if(favs.includes(sym))return false;
      return !q || sym.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    });
    if(!avail.length){
      list.innerHTML='<div class="avxfut-a-none">No tokens found.</div>';
      return;
    }
    list.innerHTML=avail.map(([sym,name])=>`
      <div class="avxfut-a-item" onclick="AVXFUT_addFav('${sym}')">
        <span class="sym">${sym}</span>
        <span class="nm">${name}</span>
      </div>`).join('');
  }

  /* ---------- CHART MODAL ---------- */
  function buildChartModal(){
    const wrap=document.createElement('div');
    wrap.id='avxfut-chart-modal';
    wrap.innerHTML=`
      <div class="avxfut-c-overlay"></div>
      <div class="avxfut-c-box">
        <div class="avxfut-c-head">
          <span id="avxfut-c-title">Chart</span>
          <button id="avxfut-c-close">×</button>
        </div>
        <canvas id="avxfut-canvas" width="400" height="220"></canvas>
        <div class="avxfut-c-range-msg">Last 30 days (INR)</div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('.avxfut-c-overlay').onclick=hideChartModal;
    wrap.querySelector('#avxfut-c-close').onclick=hideChartModal;
    return wrap;
  }
  function hideChartModal(){
    const m=document.getElementById('avxfut-chart-modal');if(!m)return;
    m.classList.remove('show');setTimeout(()=>{m.style.display='none';},150);
  }
  async function showChart(sym){
    const m=document.getElementById('avxfut-chart-modal')||buildChartModal();
    m.querySelector('#avxfut-c-title').textContent=`${sym} Chart`;
    m.style.display='block';requestAnimationFrame(()=>m.classList.add('show'));
    const id=CG_ID_MAP[sym];
    if(!id){toast('No chart data.',false);return;}
    try{
      const r=await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=inr&days=30&interval=daily`);
      const j=await r.json();
      const pts=(j.prices||[]).map(p=>Number(p[1]));
      drawSimpleLine('avxfut-canvas',pts);
    }catch(e){toast('Chart load failed.',false);}
  }
  function drawSimpleLine(canvasId,data){
    const cv=document.getElementById(canvasId);if(!cv)return;
    const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);
    if(!data.length)return;
    const pad=20,w=cv.width-pad*2,h=cv.height-pad*2;
    const min=Math.min(...data),max=Math.max(...data),rng=max-min||1;
    ctx.strokeStyle='#ccc';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pad,cv.height-pad);ctx.lineTo(cv.width-pad,cv.height-pad);ctx.stroke();
    ctx.beginPath();ctx.moveTo(pad,pad);ctx.lineTo(pad,cv.height-pad);ctx.stroke();
    ctx.strokeStyle='#3b82f6';ctx.lineWidth=2;ctx.beginPath();
    data.forEach((v,i)=>{
      const x=pad+(i/(data.length-1))*w;
      const y=pad+(1-((v-min)/rng))*h;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    });
    ctx.stroke();
  }

  /* ---------- TRADE MODAL ---------- */
  function buildTradeModal(){
    const m=document.createElement('div');
    m.id='avxfut-trade-modal';
    m.innerHTML=`
      <div class="avxfut-t-overlay"></div>
      <div class="avxfut-t-box">
        <div class="avxfut-t-head">
          <span id="avxfut-t-title">Trade</span>
          <button id="avxfut-t-close">×</button>
        </div>
        <div class="avxfut-t-bal"  id="avxfut-t-bal">Balance: ₹--</div>
        <div class="avxfut-t-hold" id="avxfut-t-hold">You hold: --</div>
        <div class="avxfut-t-price" id="avxfut-t-price">Live Price: ₹--</div>

        <label class="avxfut-t-lbl">INR Amount</label>
        <div class="avxfut-input-wrap">
          <input type="number" id="avxfut-t-amt" placeholder="Enter amount in INR"/>
          <button type="button" id="avxfut-t-amt-max" class="avxfut-max-btn">MAX</button>
        </div>

        <label class="avxfut-t-lbl">Token Qty</label>
        <div class="avxfut-input-wrap">
          <input type="number" id="avxfut-t-qty" placeholder="Enter token qty"/>
          <button type="button" id="avxfut-t-qty-max" class="avxfut-max-btn">MAX</button>
        </div>

        <div class="avxfut-t-min">Min ₹${MIN_INR}</div>
        <button id="avxfut-t-confirm" class="avxfut-t-confirm">Confirm</button>
      </div>`;
    document.body.appendChild(m);

    m.querySelector('.avxfut-t-overlay').onclick=hideTradeModal;
    m.querySelector('#avxfut-t-close').onclick=hideTradeModal;

    const amt=m.querySelector('#avxfut-t-amt');
    const qty=m.querySelector('#avxfut-t-qty');
    amt.addEventListener('input',()=>{
      const price=Number(m.dataset.price||0);
      if(price>0)qty.value=amt.value?(Number(amt.value)/price).toFixed(8):'';
    });
    qty.addEventListener('input',()=>{
      const price=Number(m.dataset.price||0);
      if(price>0)amt.value=qty.value?(Number(qty.value)*price).toFixed(2):'';
    });

    m.querySelector('#avxfut-t-amt-max').onclick=async()=>{
      if(m.dataset.mode!=='buy')return;
      const bal=await getWalletINR();amt.value=bal.toFixed(2);
      const price=Number(m.dataset.price||0);
      qty.value=price?(bal/price).toFixed(8):'';
    };
    m.querySelector('#avxfut-t-qty-max').onclick=async()=>{
      if(m.dataset.mode!=='sell')return;
      const sym=m.dataset.sym;
      const hold=await getHolding(sym);
      qty.value=hold.qty;
      const price=Number(m.dataset.price||0);
      amt.value=price?(hold.qty*price).toFixed(2):'';
    };

    m.querySelector('#avxfut-t-confirm').onclick=confirmTrade;
    return m;
  }
  function showTradeModal({mode,sym,price,bal,holdQty}){
    const m=document.getElementById('avxfut-trade-modal')||buildTradeModal();
    m.dataset.mode=mode;m.dataset.sym=sym;m.dataset.price=price;
    const title=m.querySelector('#avxfut-t-title');
    const btn=m.querySelector('#avxfut-t-confirm');
    if(mode==='buy'){title.textContent=`Buy ${sym}`;btn.textContent='Buy Now';btn.classList.remove('sell');btn.classList.add('buy');}
    else{title.textContent=`Sell ${sym}`;btn.textContent='Sell Now';btn.classList.remove('buy');btn.classList.add('sell');}
    m.querySelector('#avxfut-t-bal').textContent=`Balance: ${fmtINR(bal)}`;
    m.querySelector('#avxfut-t-hold').textContent=`You hold: ${holdQty.toFixed(8)} ${sym}`;
    m.querySelector('#avxfut-t-price').textContent=`Live Price: ${fmtINR(price)}`;
    m.querySelector('#avxfut-t-amt').value='';
    m.querySelector('#avxfut-t-qty').value='';
    m.style.display='block';requestAnimationFrame(()=>m.classList.add('show'));
  }
  function hideTradeModal(){
    const m=document.getElementById('avxfut-trade-modal');if(!m)return;
    m.classList.remove('show');setTimeout(()=>{m.style.display='none';},150);
  }

  /* ---------- CONFIRM TRADE ---------- */
  async function confirmTrade(){
    const m=document.getElementById('avxfut-trade-modal');if(!m)return;
    const mode=m.dataset.mode,sym=m.dataset.sym;
    const price=Number(m.dataset.price||0);
    const amt=Number(m.querySelector('#avxfut-t-amt').value||0);
    const qty=Number(m.querySelector('#avxfut-t-qty').value||0);
    if(price<=0){toast('Live price missing.',false);return;}

    if(mode==='buy'){
      if(isNaN(amt)||amt<MIN_INR){toast(`Min ₹${MIN_INR}`,false);return;}
      const bal=await getWalletINR();
      if(amt>bal){toast('Insufficient balance.',false);return;}
      const buyQty=amt/price;
      const cur=await getHolding(sym);
      await setWalletINR(bal-amt);
      await updateHolding(sym,cur.qty+buyQty,cur.cost_inr+amt);
      await saveTrade('buy',sym,buyQty,amt,price);
      toast('Token Buy Done ✅',true);
    }else{
      if(isNaN(qty)||qty<=0){toast('Enter quantity.',false);return;}
      if((qty*price)<MIN_INR){toast(`Min ₹${MIN_INR}`,false);return;}
      const cur=await getHolding(sym);
      if(qty>cur.qty){toast('Not enough token.',false);return;}
      const bal=await getWalletINR();
      const sellAmt=qty*price;
      const avgCost=cur.qty?cur.cost_inr/cur.qty:0;
      const newQty=cur.qty-qty;
      const newCost=newQty>0?cur.cost_inr-(qty*avgCost):0;
      await setWalletINR(bal+sellAmt);
      await updateHolding(sym,newQty,newCost);
      await saveTrade('sell',sym,qty,sellAmt,price);
      toast('Token Sell Done ✅',true);
    }
    hideTradeModal();
  }

  /* ---------- GLOBAL HANDLERS (for inline HTML) ---------- */
  window.AVXFUT_buyToken = async sym=>{
    const bal=await getWalletINR();const price=livePrices[sym]||0;const hold=await getHolding(sym);
    showTradeModal({mode:'buy',sym,price,bal,holdQty:hold.qty});
  };
  window.AVXFUT_sellToken = async sym=>{
    const bal=await getWalletINR();const price=livePrices[sym]||0;const hold=await getHolding(sym);
    showTradeModal({mode:'sell',sym,price,bal,holdQty:hold.qty});
  };
  window.AVXFUT_showTokenGraph = showChart;
  window.AVXFUT_remove = sym=>{
    if(!confirm(`Remove ${sym} from favourites?`))return;
    favRemove(sym);renderList();refreshPrices();
  };
  window.AVXFUT_openAddFav = openAddFavModal;
  window.AVXFUT_addFav = sym=>{
    favAdd(sym);closeAddFavModal();renderList();refreshPrices();toast(`${sym} added!`);
  };

  /* ---------- STYLE ---------- */
  function injectCSS(){
    if(document.getElementById('avxfut-style'))return;
    const s=document.createElement('style');s.id='avxfut-style';s.textContent=`
      .avxfut-topbar{text-align:right;padding:8px;}
      .avxfut-add-btn{padding:6px 12px;font-size:13px;border:none;border-radius:6px;background:#3b82f6;color:#fff;cursor:pointer;}
      .avxfut-empty{text-align:center;padding:24px 8px;font-size:15px;color:#666;}
      .avxfut-empty p{margin-bottom:12px;}

      .avxfut-row{display:flex;justify-content:space-between;align-items:center;padding:10px 8px;border-bottom:1px solid #eee;font-size:15px;}
      .avxfut-row:nth-child(even){background:#fafafa;}
      .avxfut-left{text-align:left;cursor:pointer;}
      .avxfut-sym{font-weight:600;}
      .avxfut-name{font-size:12px;opacity:.7;margin-top:1px;}
      .avxfut-price{font-size:13px;margin-top:2px;}
      .avxfut-actions{display:flex;gap:6px;}
      .avxfut-actions button{padding:4px 10px;font-size:13px;border:none;border-radius:5px;color:#fff;cursor:pointer;}
      .avxfut-buy{background:#3b82f6;}
      .avxfut-sell{background:#ef4444;}
      .avxfut-rem{background:#6b7280;}

      #avxfut-trade-modal{position:fixed;inset:0;display:none;z-index:9999;opacity:0;transition:opacity .15s;}
      #avxfut-trade-modal.show{opacity:1;}
      #avxfut-trade-modal .avxfut-t-overlay{position:absolute;inset:0;background:rgba(0,0,0,.4);}
      #avxfut-trade-modal .avxfut-t-box{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;width:90%;max-width:420px;padding:20px;border-radius:12px;box-shadow:0 4px 25px rgba(0,0,0,.25);font-size:15px;}
      .avxfut-t-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-weight:600;font-size:18px;}
      #avxfut-t-close{background:none;border:none;font-size:22px;line-height:1;cursor:pointer;}
      .avxfut-t-bal,.avxfut-t-hold,.avxfut-t-price{margin-bottom:8px;font-size:14px;}
      .avxfut-t-price{opacity:.8;}
      .avxfut-t-lbl{display:block;margin-top:12px;font-size:13px;font-weight:600;opacity:.8;}
      .avxfut-input-wrap{display:flex;align-items:center;gap:8px;margin-top:4px;}
      .avxfut-input-wrap input{flex:1;padding:8px;font-size:16px;border:1px solid #ccc;border-radius:8px;text-align:right;}
      .avxfut-max-btn{padding:6px 10px;border:none;border-radius:6px;font-size:13px;cursor:pointer;background:#e5e5e5;}
      .avxfut-t-min{text-align:right;margin-top:10px;font-size:12px;opacity:.7;}
      .avxfut-t-confirm{margin-top:16px;width:100%;padding:10px;font-size:16px;border:none;border-radius:8px;color:#fff;cursor:pointer;font-weight:600;}
      .avxfut-t-confirm.buy{background:#3b82f6;}
      .avxfut-t-confirm.sell{background:#ef4444;}

      #avxfut-toast{position:fixed;top:10px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:6px;font-size:14px;color:#fff;background:#3b82f6;z-index:10000;opacity:0;transition:opacity .25s;pointer-events:none;}
      #avxfut-toast.ok{background:#10b981;}
      #avxfut-toast.err{background:#ef4444;}

      #avxfut-add-modal{position:fixed;inset:0;display:none;z-index:9999;opacity:0;transition:opacity .15s;}
      #avxfut-add-modal.show{opacity:1;}
      #avxfut-add-modal .avxfut-a-overlay{position:absolute;inset:0;background:rgba(0,0,0,.45);}
      #avxfut-add-modal .avxfut-a-box{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;width:90%;max-width:420px;padding:16px 16px 24px;border-radius:12px;box-shadow:0 4px 25px rgba(0,0,0,.25);font-size:15px;}
      .avxfut-a-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:600;font-size:18px;}
      #avxfut-a-close{background:none;border:none;font-size:22px;line-height:1;cursor:pointer;}
      #avxfut-a-search{width:100%;padding:8px 10px;font-size:15px;border:1px solid #ccc;border-radius:8px;margin-bottom:10px;}
      .avxfut-a-list{max-height:260px;overflow-y:auto;border:1px solid #eee;border-radius:8px;}
      .avxfut-a-item{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid #f0f0f0;cursor:pointer;font-size:15px;}
      .avxfut-a-item:hover{background:#f5f5f5;}
      .avxfut-a-item .sym{font-weight:600;}
      .avxfut-a-none{text-align:center;padding:16px;color:#666;}

      #avxfut-chart-modal{position:fixed;inset:0;display:none;z-index:9999;opacity:0;transition:opacity .15s;}
      #avxfut-chart-modal.show{opacity:1;}
      #avxfut-chart-modal .avxfut-c-overlay{position:absolute;inset:0;background:rgba(0,0,0,.45);}
      #avxfut-chart-modal .avxfut-c-box{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;width:94%;max-width:500px;padding:16px 16px 24px;border-radius:12px;box-shadow:0 4px 25px rgba(0,0,0,.25);}
      .avxfut-c-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:600;font-size:18px;}
      #avxfut-c-close{background:none;border:none;font-size:22px;line-height:1;cursor:pointer;}
      .avxfut-c-range-msg{text-align:center;font-size:12px;opacity:.7;margin-top:8px;}
    `;
    document.head.appendChild(s);
  }

  /* ---------- INIT ---------- */
  async function init(){
    injectCSS();
    renderList();
    await refreshPrices();
    setInterval(refreshPrices,PRICE_REFRESH_MS);
  }
  document.addEventListener('DOMContentLoaded',init);

})();