
/* ==========================================================
   wallet-convert.js – Ultimate Token Conversion Engine (Final Fix)
   • Fix 1: Database Actions are now 'Buying' / 'Selling'
   • Fix 2: Real Live API Fetching for market tokens
   • Auto-Retry Connection & Strict UI Refresh
   ========================================================== */
(function() {

    /* ---------- CONFIGURATION ---------- */
    const CONFIG = {
        SUPA_URL: 'https://hwrvqyipozrsxyjdpqag.supabase.co',
        SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM',
        TARGET_ID: 'convert-root', 
        REFRESH_RATE: 4000, // 4 Seconds for Price Updates
        TABLES: {
            CONTROL: 'wallet_crypto_token_control',
            HISTORY: 'wallet_crypto_token_histry'
        }
    };

    /* ---------- STATE ---------- */
    const State = {
        supa: null,
        user: null,
        tokens: [],
        prices: {},
        holdings: {},
        // Selection State
        from: { sym: '', chain: '', qty: '' },
        to:   { sym: '', chain: '', qty: '' },
        lastEdited: 'from', // 'from' | 'to'
        isProcessing: false,
        intervals: []
    };

    /* ---------- INITIALIZATION ENGINE ---------- */
    function initApp() {
        injectStyles();
        const el = document.getElementById(CONFIG.TARGET_ID);
        if (!el) return;

        el.innerHTML = `
            <div class="cv-loader">
                <div class="cv-spin"></div>
                <span>Connecting Exchange...</span>
            </div>`;

        // 1. Robust Supabase Connection (Auto-Retry)
        connectSupabase(0).then(async (client) => {
            State.supa = client;
            
            // 2. Auth Check
            const { data: { user } } = await State.supa.auth.getUser();
            if (!user) {
                el.innerHTML = `<div class="cv-empty"><h3>Login Required</h3><p>Please login to convert assets.</p></div>`;
                return;
            }
            State.user = user;

            // 3. Load Data
            await loadMarketData();

            // 4. Setup Defaults
            if(State.tokens.length > 0) {
                State.from.sym = State.tokens[0].symbol;
                State.to.sym = State.tokens.length > 1 ? State.tokens[1].symbol : State.tokens[0].symbol;
                setDefaultChain('from');
                setDefaultChain('to');
            }

            // 5. Start App
            renderUI();
            startPriceEngine();

        }).catch(err => {
            console.error(err);
            el.innerHTML = `<div class="cv-error">
                <h3>Connection Error</h3>
                <p>Database not responding.</p>
                <button onclick="location.reload()" class="cv-retry-btn">Retry Connection</button>
            </div>`;
        });
    }

    /* Retry Logic */
    function connectSupabase(attempt) {
        return new Promise((resolve, reject) => {
            if (window.supabase) {
                resolve(window.supabase.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY));
            } else if (window.parent && window.parent.supabase) {
                resolve(window.parent.supabase.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY));
            } else {
                if (attempt < 10) {
                    setTimeout(() => connectSupabase(attempt + 1).then(resolve).catch(reject), 500);
                } else {
                    reject("Supabase SDK missing");
                }
            }
        });
    }

    /* ---------- DATA HANDLING ---------- */
    async function loadMarketData() {
        // 1. Tokens
        const { data: tData } = await State.supa.from(CONFIG.TABLES.CONTROL).select('*').order('id');
        if (tData) {
            State.tokens = tData;
            // Init Prices
            State.tokens.forEach(t => {
                State.prices[t.symbol] = {
                    val: Number(t.manual_price || 0),
                    prev: Number(t.manual_price || 0)
                };
            });
        }

        // 2. Holdings
        await refreshHoldings();
    }

    async function refreshHoldings() {
        const { data } = await State.supa.from(CONFIG.TABLES.HISTORY)
            .select('symbol, action, qty')
            .eq('user_id', State.user.id);

        if (data) {
            const h = {};
            data.forEach(r => {
                const s = r.symbol;
                const q = Number(r.qty);
                if (!h[s]) h[s] = 0;
                
                // Logic strictly matches Buying/Selling now
                if (r.action === 'Buying') h[s] += q;
                else if (r.action === 'Selling') h[s] -= q;
            });
            // Clean zeros
            Object.keys(h).forEach(k => {
                if (h[k] <= 0.0000001) delete h[k];
            });
            State.holdings = h;
        }
    }

    function setDefaultChain(side) {
        const sym = side === 'from' ? State.from.sym : State.to.sym;
        const t = State.tokens.find(tk => tk.symbol === sym);
        if (t) {
            const chains = Array.isArray(t.blockchains) ? t.blockchains : ['Mainnet'];
            if (side === 'from') State.from.chain = chains[0];
            else State.to.chain = chains[0];
        }
    }

    /* ---------- PRICE ENGINE (FIXED: LIVE API + MANUAL) ---------- */
    function startPriceEngine() {
        // Clear existing
        State.intervals.forEach(i => clearInterval(i));
        
        // Initial Fetch
        fetchPrices();

        // Loop
        const interval = setInterval(() => {
            fetchPrices();
        }, CONFIG.REFRESH_RATE);
        
        State.intervals.push(interval);
    }

    async function fetchPrices() {
        // We use a map of promises for live tokens to fetch concurrently
        const updates = State.tokens.map(async (t) => {
            const oldP = State.prices[t.symbol]?.val || 0;
            let newP = oldP;

            if (t.is_live_api && t.api_url) {
                // --- LIVE API FETCH ---
                try {
                    const res = await fetch(t.api_url);
                    const json = await res.json();
                    // Assumes Structure: { "bitcoin": { "inr": 5000000 } }
                    const key = Object.keys(json)[0]; 
                    if(key && json[key] && json[key].inr) {
                        newP = Number(json[key].inr);
                    }
                } catch (e) { 
                    // If fetch fails, keep old price or slightly flutter it
                    // console.log('API Error', t.symbol); 
                }
            } else {
                // --- MANUAL SIMULATION ---
                const base = Number(t.manual_price || 0);
                const volatility = base * 0.002; 
                const change = (Math.random() - 0.5) * volatility;
                newP = oldP === 0 ? base : oldP + change; // Drift from current simulated price
                
                // Keep it near manual base to avoid infinite drift
                if(Math.abs(newP - base) > (base * 0.05)) {
                    newP = base; 
                }

                // Bounds
                if (t.manual_min_price && newP < t.manual_min_price) newP = t.manual_min_price;
                if (t.manual_max_price && newP > t.manual_max_price) newP = t.manual_max_price;
            }

            // Update State
            State.prices[t.symbol] = { val: newP, prev: oldP };
            
            // Update UI
            updatePriceUI(t.symbol, newP, oldP);
        });

        await Promise.all(updates);

        // Auto-Calculate inputs if user has typed something
        if(document.getElementById('inp-from') && document.getElementById('inp-from').value !== '') {
            calculateLogic();
        }
    }

    function updatePriceUI(sym, newP, oldP) {
        // Only update DOM if the token is currently selected in UI
        if (State.from.sym === sym) {
            const el = document.getElementById('live-price-from');
            if(el) animatePrice(el, newP, oldP);
        }
        if (State.to.sym === sym) {
            const el = document.getElementById('live-price-to');
            if(el) animatePrice(el, newP, oldP);
        }
    }

    function animatePrice(el, newP, oldP) {
        el.textContent = `1 = ${fmtMoney(newP)}`;
        // Color update based on change
        if (newP > oldP) el.style.color = '#10b981'; // Green
        else if (newP < oldP) el.style.color = '#f43f5e'; // Red
        
        // Reset color slightly after
        // setTimeout(() => { if(el) el.style.color = '#64748b'; }, 1500); 
    }

    /* ---------- UI RENDERER ---------- */
    function renderUI() {
        const root = document.getElementById(CONFIG.TARGET_ID);
        if(!root) return;

        // Get Current Tokens Data
        const tFrom = State.tokens.find(t => t.symbol === State.from.sym);
        const tTo = State.tokens.find(t => t.symbol === State.to.sym);

        if(!tFrom || !tTo) return;

        // HTML Construction
        root.innerHTML = `
            <div class="cv-wrapper">
                
                <!-- TOP CARD (Convert From / Selling) -->
                <div class="cv-card top">
                    <div class="cv-header">
                        <span class="cv-lbl">You Convert</span>
                        <span class="cv-bal">Available: <b>${fmtQty(State.holdings[tFrom.symbol] || 0)}</b></span>
                    </div>
                    <div class="cv-row">
                        ${renderSelector('from', tFrom)}
                        <div class="cv-input-box">
                            <input type="number" id="inp-from" placeholder="0.00" value="${State.from.qty}" oninput="AVX_CV.handleInput('from', this.value)">
                            <div class="cv-live-p" id="live-price-from">1 = ${fmtMoney(State.prices[tFrom.symbol]?.val)}</div>
                        </div>
                    </div>
                </div>

                <!-- SWAP BUTTON -->
                <div class="cv-swap-circle" onclick="AVX_CV.swap()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                </div>

                <!-- BOTTOM CARD (Convert To / Buying) -->
                <div class="cv-card bottom">
                    <div class="cv-header">
                        <span class="cv-lbl">You Receive</span>
                        <span class="cv-bal">Balance: <b>${fmtQty(State.holdings[tTo.symbol] || 0)}</b></span>
                    </div>
                    <div class="cv-row">
                        ${renderSelector('to', tTo)}
                        <div class="cv-input-box">
                            <input type="number" id="inp-to" placeholder="0.00" value="${State.to.qty}" oninput="AVX_CV.handleInput('to', this.value)">
                            <div class="cv-live-p" id="live-price-to">1 = ${fmtMoney(State.prices[tTo.symbol]?.val)}</div>
                        </div>
                    </div>
                </div>

                <!-- ACTION BUTTON -->
                <button class="cv-btn-action" onclick="AVX_CV.execute()">
                    CONVERT NOW
                </button>

                <!-- FOOTER -->
                <div class="cv-footer" onclick="window.location.href='help.html'">
                    Need Help? <span>Contact Support</span>
                </div>

            </div>
        `;

        // Restore Focus
        const focusId = State.lastEdited === 'from' ? 'inp-from' : 'inp-to';
        const el = document.getElementById(focusId);
        if(el && document.activeElement && document.activeElement.tagName === 'INPUT') {
            el.focus();
        }
    }

    function renderSelector(side, token) {
        // Filter list: Don't show the token selected in the other box
        const otherSym = side === 'from' ? State.to.sym : State.from.sym;
        const list = State.tokens.filter(t => t.symbol !== otherSym);
        
        // Icon Logic
        let iconHTML = `<span class="cv-tok-txt">${token.symbol.substring(0,2)}</span>`;
        if (token.icon_type === 'image' && token.icon_url) {
            iconHTML = `<img src="${token.icon_url}" class="cv-tok-img">`;
        } else if (token.icon_url) {
            iconHTML = `<span class="cv-tok-emoji">${token.icon_url}</span>`;
        }

        // Chains
        const currentChain = side === 'from' ? State.from.chain : State.to.chain;
        const chains = Array.isArray(token.blockchains) ? token.blockchains : ['Mainnet'];

        return `
            <div class="cv-sel-col">
                <div class="cv-tok-display">
                    <div class="cv-icon-box">${iconHTML}</div>
                    <div class="cv-tok-info">
                        <select class="cv-select-tok" onchange="AVX_CV.changeToken('${side}', this.value)">
                            ${list.map(t => `<option value="${t.symbol}" ${t.symbol === token.symbol ? 'selected' : ''}>${t.symbol}</option>`).join('')}
                        </select>
                        <div class="cv-chain-sel">
                            <select onchange="AVX_CV.changeChain('${side}', this.value)">
                                ${chains.map(c => `<option value="${c}" ${c === currentChain ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /* ---------- LOGIC & CALCULATION ---------- */
    
    function changeToken(side, newSym) {
        if (side === 'from') {
            State.from.sym = newSym;
            setDefaultChain('from');
        } else {
            State.to.sym = newSym;
            setDefaultChain('to');
        }
        
        // RESET INPUTS (Strict Refresh)
        State.from.qty = '';
        State.to.qty = '';
        
        renderUI();
    }

    function changeChain(side, newChain) {
        if(side === 'from') State.from.chain = newChain;
        else State.to.chain = newChain;
        // No need to clear inputs just for chain change, but re-render needed
        renderUI(); 
    }

    function swap() {
        const tSym = State.from.sym;
        State.from.sym = State.to.sym;
        State.to.sym = tSym;

        const tChain = State.from.chain;
        State.from.chain = State.to.chain;
        State.to.chain = tChain;

        // Clear values to force fresh calculation
        State.from.qty = '';
        State.to.qty = '';

        renderUI();
    }

    function handleInput(side, val) {
        State.lastEdited = side;
        if (side === 'from') State.from.qty = val;
        else State.to.qty = val;
        calculateLogic();
    }

    function calculateLogic() {
        const pFrom = State.prices[State.from.sym]?.val || 0;
        const pTo = State.prices[State.to.sym]?.val || 0;

        if (pFrom <= 0 || pTo <= 0) return; 

        if (State.lastEdited === 'from') {
            const qty = parseFloat(State.from.qty);
            if (!qty) { State.to.qty = ''; updateInputDOM('inp-to', ''); return; }
            
            // Formula: (Qty * PriceFrom) / PriceTo
            const totalVal = qty * pFrom;
            const res = totalVal / pTo;
            
            State.to.qty = res.toFixed(6);
            updateInputDOM('inp-to', State.to.qty);

        } else {
            const qty = parseFloat(State.to.qty);
            if (!qty) { State.from.qty = ''; updateInputDOM('inp-from', ''); return; }
            
            // Formula: (Qty * PriceTo) / PriceFrom
            const totalVal = qty * pTo;
            const res = totalVal / pFrom;
            
            State.from.qty = res.toFixed(6);
            updateInputDOM('inp-from', State.from.qty);
        }
    }

    function updateInputDOM(id, val) {
        const el = document.getElementById(id);
        if(el) el.value = val;
    }

    /* ---------- EXECUTION (FIXED ACTIONS) ---------- */
    async function execute() {
        const btn = document.querySelector('.cv-btn-action');
        const fQty = parseFloat(State.from.qty);
        const tQty = parseFloat(State.to.qty);
        
        const symFrom = State.from.sym;
        const symTo = State.to.sym;
        
        const pFrom = State.prices[symFrom].val;
        const pTo = State.prices[symTo].val;

        // Validations
        if(!pFrom || !pTo) return toast("Fetching Price...", "err");
        if(!fQty || fQty <= 0) return toast("Enter Valid Amount", "err");
        
        // Check Funds
        const owned = State.holdings[symFrom] || 0;
        if(fQty > owned) return toast(`Insufficient ${symFrom}`, "err");

        // Lock UI
        btn.innerHTML = '<div class="cv-spin" style="width:20px;height:20px;border-width:2px;"></div> Processing...';
        btn.disabled = true;

        try {
            const totalINR = fQty * pFrom;

            // 1. SELL Source Token (Reduces Qty)
            // Using 'Selling' so other files recognize it as a deduction
            const { error: e1 } = await State.supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id,
                symbol: symFrom,
                action: 'Selling', 
                qty: fQty,
                price_at_transaction: pFrom,
                total_amount: totalINR,
                blockchain_used: State.from.chain,
                status: 'converted'
            });
            if(e1) throw e1;

            // 2. BUY Target Token (Adds Qty)
            // Using 'Buying' so other files recognize it as an addition
            const { error: e2 } = await State.supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id,
                symbol: symTo,
                action: 'Buying',
                qty: tQty,
                price_at_transaction: pTo,
                total_amount: totalINR,
                blockchain_used: State.to.chain,
                status: 'active'
            });
            if(e2) throw e2;

            // Success
            toast(`Success: ${fQty} ${symFrom} -> ${tQty} ${symTo}`);
            
            // Clear inputs & Refresh
            State.from.qty = '';
            State.to.qty = '';
            await refreshHoldings();
            renderUI();

        } catch (e) {
            console.error(e);
            toast("Transaction Failed", "err");
        }

        btn.disabled = false;
        btn.innerHTML = "CONVERT NOW";
    }

    /* ---------- STYLES ---------- */
    function injectStyles() {
        if(document.getElementById('cv-style')) return;
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
            .cv-wrapper { font-family:'Outfit', sans-serif; max-width:480px; margin:0 auto; padding:15px; color:#0f172a; }
            
            /* CARDS */
            .cv-card { background:#fff; border-radius:24px; padding:20px; border:1px solid #e2e8f0; position:relative; box-shadow:0 10px 20px -5px rgba(0,0,0,0.05); }
            .cv-card.top { z-index:2; margin-bottom:-20px; padding-bottom:35px; }
            .cv-card.bottom { z-index:1; padding-top:35px; background:#f8fafc; }
            
            .cv-header { display:flex; justify-content:space-between; margin-bottom:15px; font-size:12px; }
            .cv-lbl { font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; }
            .cv-bal b { color:#4f46e5; }

            .cv-row { display:flex; gap:15px; align-items:center; }
            
            /* SELECTOR */
            .cv-sel-col { width:45%; }
            .cv-tok-display { display:flex; gap:10px; align-items:flex-start; }
            .cv-icon-box { width:42px; height:42px; border-radius:12px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid #e2e8f0; flex-shrink:0; font-size:18px; color:#4f46e5; font-weight:800; }
            .cv-tok-img { width:100%; height:100%; object-fit:cover; }
            
            .cv-tok-info { display:flex; flex-direction:column; gap:4px; flex:1; }
            .cv-select-tok { font-size:18px; font-weight:800; color:#0f172a; border:none; background:transparent; width:100%; outline:none; cursor:pointer; padding:0; margin:0; appearance:none; }
            .cv-chain-sel select { font-size:10px; font-weight:700; color:#64748b; background:#e2e8f0; border:none; padding:2px 6px; border-radius:6px; outline:none; cursor:pointer; max-width:100%; }

            /* INPUTS */
            .cv-input-box { flex:1; text-align:right; }
            .cv-input-box input { width:100%; border:none; background:transparent; text-align:right; font-size:24px; font-weight:700; color:#0f172a; outline:none; padding:0; font-family:'Outfit', sans-serif; }
            .cv-input-box input::placeholder { color:#cbd5e1; }
            .cv-live-p { font-size:11px; font-weight:600; color:#64748b; margin-top:4px; transition:color 0.3s; }

            /* SWAP BUTTON */
            .cv-swap-circle { width:44px; height:44px; border-radius:50%; background:#4f46e5; color:#fff; border:4px solid #f8fafc; position:relative; margin:0 auto; z-index:10; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 5px 15px rgba(79, 70, 229, 0.3); transition:0.2s; }
            .cv-swap-circle:active { transform:rotate(180deg) scale(0.95); }
            .cv-swap-circle svg { width:20px; height:20px; }

            /* ACTION BTN */
            .cv-btn-action { width:100%; margin-top:25px; padding:18px; border-radius:18px; background:linear-gradient(135deg, #4f46e5, #4338ca); color:#fff; border:none; font-size:16px; font-weight:800; cursor:pointer; box-shadow:0 10px 25px -5px rgba(79, 70, 229, 0.4); text-transform:uppercase; letter-spacing:1px; transition:transform 0.1s; display:flex; align-items:center; justify-content:center; gap:8px; }
            .cv-btn-action:active { transform:scale(0.98); }
            .cv-btn-action:disabled { background:#94a3b8; box-shadow:none; cursor:not-allowed; }

            .cv-footer { margin-top:25px; text-align:center; font-size:12px; color:#64748b; cursor:pointer; }
            .cv-footer span { border-bottom:1px dashed #cbd5e1; padding-bottom:1px; }

            /* LOADER & UTILS */
            .cv-loader { padding:60px; text-align:center; color:#64748b; font-weight:600; display:flex; flex-direction:column; align-items:center; }
            .cv-spin { width:30px; height:30px; border:3px solid #e2e8f0; border-top-color:#4f46e5; border-radius:50%; animation:cvspin 0.8s linear infinite; margin-bottom:15px; }
            @keyframes cvspin { to { transform:rotate(360deg); } }
            .cv-error { color:#ef4444; text-align:center; padding:30px; }
            .cv-retry-btn { margin-top:10px; padding:8px 16px; background:#4f46e5; color:white; border:none; border-radius:8px; font-weight:700; cursor:pointer; }

            /* TOAST */
            #avx-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px); background: #fff; padding: 12px 24px; border-radius: 50px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 10px; opacity: 0; transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 99999; pointer-events: none; }
            #avx-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
            .avx-toast-msg { font-size: 13px; font-weight: 700; color: #0f172a; }
        `;
        const s = document.createElement('style'); s.id='cv-style'; s.textContent=css; document.head.appendChild(s);
    }

    /* ---------- UTILS ---------- */
    const fmtMoney = (v) => '₹' + Number(v||0).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:4});
    const fmtQty = (v) => Number(v||0).toLocaleString('en-US', {maximumFractionDigits:6});

    function toast(msg, type='success') {
        let t = document.getElementById('avx-toast');
        if(!t) { t=document.createElement('div'); t.id='avx-toast'; document.body.appendChild(t); }
        t.innerHTML = `<div class="avx-toast-icon">${type==='success'?'✅':'⚠️'}</div><div class="avx-toast-msg">${msg}</div>`;
        t.className='show'; setTimeout(()=>t.classList.remove('show'),3000);
    }

    /* ---------- API ---------- */
    window.AVX_CV = { changeToken, changeChain, swap, handleInput, execute };

    /* ---------- START ---------- */
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initApp);
    else initApp();

})();
