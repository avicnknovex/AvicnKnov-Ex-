/* ==========================================================
   alpha-all.js – Alpha > All (top ~50 tokens)
   Supabase wallet + local holdings (test) + 1M line chart
   ========================================================== */
(function(){

  /* ---------- CONFIG ---------- */
  const SUPA_URL  = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
  const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

  const MODE              = 'local';     // flip to 'supa' jab holdings table ready
  const MIN_INR           = 100;
  const PRICE_REFRESH_MS  = 30000;
  const HOLD_KEY          = 'AVX_alpha_holdings_test'; // localStorage holdings map

  /* ---------- TOKENS (sym, name, coingecko id) ---------- */
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

  const CG_ID_MAP = {};
  TOKENS.forEach(([s,_,id])=>{ CG_ID_MAP[s]=id; });

  /* ---------- SUPABASE CLIENT ---------- */
  const supaLib = window.supabase || (window.parent && window.parent.supabase);
  if(!supaLib){ console.error("Supabase lib not found."); return; }
  const supa = supaLib.createClient(SUPA_URL, SUPA_KEY);

  /* ---------- PRICE CACHE ---------- */
  let livePrices = {}; // {SYM:inr}

  /* ---------- UTILS ---------- */
  const fmtINR = v => '₹' + Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});

  function toast(msg, ok=true){
    let t = document.getElementById('avx-alpha-toast');
    if(!t){
      t = document.createElement('div');
      t.id='avx-alpha-toast';
      t.style.cssText = `
        position:fixed;top:20px;left:50%;transform:translateX(-50%);
        background:#333;color:white;padding:12px 20px;border-radius:8px;
        z-index:9999;opacity:0;transition:opacity 0.3s;
      `;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = ok?'ok':'err';
    t.style.backgroundColor = ok?'#22c55e':'#ef4444';
    t.style.opacity = '1';
    setTimeout(()=>{t.style.opacity='0';},2000);
  }

  /* ---------- HOLDINGS LOCAL (test) ---------- */
  function localGetHoldings(){
    try{ return JSON.parse(localStorage.getItem(HOLD_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function localSetHoldings(obj){
    localStorage.setItem(HOLD_KEY, JSON.stringify(obj));
  }

  /* ---------- HOLDINGS SUPA (later) ---------- */
  async function supaGetHoldingsMap(){
    const {data:{user}} = await supa.auth.getUser();
    if(!user) return {};
    const {data,error} = await supa
      .from('user_holdings')
      .select('symbol,qty,cost_inr')
      .eq('user_id',user.id);
    if(error){ console.warn('supa holdings error',error); return {}; }
    const map={};
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

  async function getHoldingsMap(){
    return (MODE==='supa')?await supaGetHoldingsMap():localGetHoldings();
  }
  async function updateHolding(symbol,qty,cost_inr){
    symbol=symbol.toUpperCase();
    if(MODE==='supa'){ await supaUpsertHolding(symbol,qty,cost_inr); }
    else {
      const h=localGetHoldings();
      if(qty<=0) delete h[symbol];
      else h[symbol]={qty,cost_inr};
      localSetHoldings(h);
    }
  }
  async function getHolding(symbol){
    symbol=symbol.toUpperCase();
    const map=await getHoldingsMap();
    const r=map[symbol];
    if(!r) return {qty:0,cost_inr:0};
    return {qty:Number(r.qty||0),cost_inr:Number(r.cost_inr||0)};
  }

  /* ---------- WALLET (always Supabase / wallet-balance.js) ---------- */
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
      const ids = TOKENS.map(t=>t[2]).join(',');
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=inr`);
      const data = await res.json();
      TOKENS.forEach(([sym,_,id])=>{
        const p = Number(data[id]?.inr||0);
        livePrices[sym]=p;
        const el=document.getElementById('alpha-price-'+sym);
        if(el) el.textContent=fmtINR(p);
      });
    }catch(e){ console.error('price fetch fail',e); }
  }

  /* ---------- SAVE TRADE TO user_trades (ADDED) ---------- */
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
      if(error){ console.error('trade insert error',error); }
    }catch(e){
      console.error('saveTrade fail',e);
    }
  }

  /* ---------- TOKEN LIST RENDER ---------- */
  function renderList(){
    const c=document.getElementById('alpha-all'); if(!c) return;
    c.innerHTML = TOKENS.map(([sym,name])=>`
      <div class="avx-row">
        <div class="avx-left" onclick="AVX_showAlphaTokenGraph('${sym}')">
          <div class="avx-sym">${sym}</div>
          <div class="avx-name">${name}</div>
          <div class="avx-price" id="alpha-price-${sym}">₹--</div>
        </div>
        <div class="avx-actions">
          <button class="avx-buy"  onclick="AVX_buyAlphaToken('${sym}')">Buy</button>
          <button class="avx-sell" onclick="AVX_sellAlphaToken('${sym}')">Sell</button>
        </div>
      </div>
    `).join('');
  }

  /* ---------- TRADE MODAL ---------- */
  function buildTradeModal(){
    const m=document.createElement('div');
    m.id='avx-alpha-trade-modal';
    m.innerHTML=`
      <div class="avx-t-overlay"></div>
      <div class="avx-t-box">
        <div class="avx-t-head">
          <span id="avx-alpha-t-title">Trade</span>
          <button id="avx-alpha-t-close">×</button>
        </div>
        <div class="avx-t-bal"  id="avx-alpha-t-bal">Balance: ₹--</div>
        <div class="avx-t-hold" id="avx-alpha-t-hold">You hold: --</div>
        <div class="avx-t-price" id="avx-alpha-t-price">Live Price: ₹--</div>

        <label class="avx-t-lbl">INR Amount</label>
        <div class="avx-input-wrap">
          <input type="number" id="avx-alpha-t-amt" placeholder="Enter amount in INR"/>
          <button type="button" id="avx-alpha-t-amt-max" class="avx-max-btn">MAX</button>
        </div>

        <label class="avx-t-lbl">Token Qty</label>
        <div class="avx-input-wrap">
          <input type="number" id="avx-alpha-t-qty" placeholder="Enter token qty"/>
          <button type="button" id="avx-alpha-t-qty-max" class="avx-max-btn">MAX</button>
        </div>

        <div class="avx-t-min">Min ₹${MIN_INR}</div>
        <button id="avx-alpha-t-confirm" class="avx-t-confirm">Confirm</button>
      </div>
    `;
    document.body.appendChild(m);

    m.querySelector('.avx-t-overlay').onclick=hideModal;
    m.querySelector('#avx-alpha-t-close').onclick=hideModal;

    const amt=m.querySelector('#avx-alpha-t-amt');
    const qty=m.querySelector('#avx-alpha-t-qty');
    amt.addEventListener('input',()=>{
      const price=Number(m.dataset.price||0);
      if(price>0) qty.value = amt.value? (Number(amt.value)/price).toFixed(8):'';
    });
    qty.addEventListener('input',()=>{
      const price=Number(m.dataset.price||0);
      if(price>0) amt.value = qty.value? (Number(qty.value)*price).toFixed(2):'';
    });

    m.querySelector('#avx-alpha-t-amt-max').onclick=async()=>{
      if(m.dataset.mode!=='buy') return;
      const bal=await getWalletINR();
      amt.value=bal.toFixed(2);
      const price=Number(m.dataset.price||0);
      qty.value=price?(bal/price).toFixed(8):'';
    };
    m.querySelector('#avx-alpha-t-qty-max').onclick=async()=>{
      if(m.dataset.mode!=='sell') return;
      const sym=m.dataset.sym;
      const hold=await getHolding(sym);
      qty.value=hold.qty;
      const price=Number(m.dataset.price||0);
      amt.value=price?(hold.qty*price).toFixed(2):'';
    };

    m.querySelector('#avx-alpha-t-confirm').onclick=confirmTrade;
    return m;
  }

  function showModal({mode,sym,price,bal,holdQty}){
    const m=document.getElementById('avx-alpha-trade-modal')||buildTradeModal();
    m.dataset.mode=mode;
    m.dataset.sym=sym;
    m.dataset.price=price;

    const title=m.querySelector('#avx-alpha-t-title');
    const btn  =m.querySelector('#avx-alpha-t-confirm');
    if(mode==='buy'){
      title.textContent=`Buy ${sym}`;
      btn.textContent='Buy Now';
      btn.classList.remove('sell');btn.classList.add('buy');
    }else{
      title.textContent=`Sell ${sym}`;
      btn.textContent='Sell Now';
      btn.classList.remove('buy');btn.classList.add('sell');
    }

    m.querySelector('#avx-alpha-t-bal').textContent  =`Balance: ${fmtINR(bal)}`;
    m.querySelector('#avx-alpha-t-hold').textContent =`You hold: ${holdQty.toFixed(8)} ${sym}`;
    m.querySelector('#avx-alpha-t-price').textContent=`Live Price: ${fmtINR(price)}`;
    m.querySelector('#avx-alpha-t-amt').value='';
    m.querySelector('#avx-alpha-t-qty').value='';

    m.style.display='block';
    requestAnimationFrame(()=>m.classList.add('show'));
  }

  function hideModal(){
    const m=document.getElementById('avx-alpha-trade-modal'); if(!m) return;
    m.classList.remove('show');
    setTimeout(()=>{m.style.display='none';},150);
  }

  /* ---------- CONFIRM TRADE ---------- */
  async function confirmTrade(){
    const m=document.getElementById('avx-alpha-trade-modal'); if(!m) return;
    const mode = m.dataset.mode;
    const sym  = m.dataset.sym;
    const price= Number(m.dataset.price||0);
    const amt  = Number(m.querySelector('#avx-alpha-t-amt').value||0);
    const qty  = Number(m.querySelector('#avx-alpha-t-qty').value||0);
    if(price<=0){ toast('Live price missing.',false); return; }

    if(mode==='buy'){
      if(isNaN(amt)||amt<MIN_INR){ toast(`Min ₹${MIN_INR}`,false); return; }
      const bal=await getWalletINR();
      if(amt>bal){ toast('Insufficient balance.',false); return; }
      const buyQty=amt/price;
      const cur=await getHolding(sym);
      await setWalletINR(bal-amt);
      await updateHolding(sym,cur.qty+buyQty,cur.cost_inr+amt);
      await saveTrade('buy',sym,buyQty,amt,price);
      toast(`Bought ${buyQty.toFixed(6)} ${sym} for ${fmtINR(amt)}`);
    }else{
      if(isNaN(qty)||qty<=0){ toast('Enter valid qty.',false); return; }
      const hold=await getHolding(sym);
      if(qty>hold.qty){ toast('Not enough tokens.',false); return; }
      const sellAmt=qty*price;
      if(sellAmt<MIN_INR){ toast(`Min sell ${fmtINR(MIN_INR)}`,false); return; }
      const bal=await getWalletINR();
      const newQty=hold.qty-qty;
      const newCost=newQty>0?(hold.cost_inr*(newQty/hold.qty)):0;
      await setWalletINR(bal+sellAmt);
      await updateHolding(sym,newQty,newCost);
      await saveTrade('sell',sym,qty,sellAmt,price);
      toast(`Sold ${qty.toFixed(6)} ${sym} for ${fmtINR(sellAmt)}`);
    }
    hideModal();
  }

  /* ---------- CHART/GRAPH STUB ---------- */
  function showTokenGraph(sym){
    toast(`${sym} chart feature coming soon!`);
  }

  /* ---------- GLOBAL FUNCTIONS ---------- */
  window.AVX_buyAlphaToken = async function(sym){
    const price=livePrices[sym];
    if(!price){ toast('Price not available',false); return; }
    const bal=await getWalletINR();
    const hold=await getHolding(sym);
    showModal({mode:'buy',sym,price,bal,holdQty:hold.qty});
  };

  window.AVX_sellAlphaToken = async function(sym){
    const price=livePrices[sym];
    if(!price){ toast('Price not available',false); return; }
    const bal=await getWalletINR();
    const hold=await getHolding(sym);
    if(hold.qty<=0){ toast('No tokens to sell',false); return; }
    showModal({mode:'sell',sym,price,bal,holdQty:hold.qty});
  };

  window.AVX_showAlphaTokenGraph = function(sym){
    showTokenGraph(sym);
  };

  /* ---------- INITIALIZATION ---------- */
  function init(){
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',init);
      return;
    }
    renderList();
    refreshPrices();
    setInterval(refreshPrices,PRICE_REFRESH_MS);
  }

  init();

})();