
/* ==========================================================
   trade-convert.js – Ultimate Token Conversion Engine
   • Auto-Retry Connection (Fixes "Not Loaded" error)
   • Strict UI Refresh (No stale icons/holdings)
   • Bi-Directional Real-time Math
   ========================================================== */
(function() {

    /* ---------- CONFIGURATION ---------- */
    const CONFIG = {
        SUPA_URL: 'https://hwrvqyipozrsxyjdpqag.supabase.co',
        SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM',
        TARGET_ID: 'convert', 
        REFRESH_RATE: 3000,
        TABLES: {
            CONTROL: 'crypto_token_control',
            HISTORY: 'crypto_token_histry'
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
                <span>Connecting to Exchange...</span>
            </div>`;

        // 1. Robust Supabase Connection
        connectSupabase(0, el).then(async (client) => {
            State.supa = client;
            
            // 2. Auth Check
            const { data: { user } } = await State.supa.auth.getUser();
            if (!user) {
                el.innerHTML = `<div class="cv-empty"><h3>Login Required</h3><p>Please login to access conversion.</p></div>`;
                return;
            }
            State.user = user;

            // 3. Load Data
            await loadMarketData();

            // 4. Setup Default Selection
            if(State.tokens.length > 0) {
                State.from.sym = State.tokens[0].symbol;
                State.to.sym = State.tokens.length > 1 ? State.tokens[1].symbol : State.tokens[0].symbol;
                
                // Set default chains
                setDefaultChain('from');
                setDefaultChain('to');
            }

            // 5. Start App
            renderUI();
            startLivePrices();

        }).catch(err => {
            console.error(err);
            el.innerHTML = `<div class="cv-error">
                <h3>Connection Failed</h3>
                <p>Could not load database.</p>
                <button onclick="location.reload()" style="margin-top:10px;padding:8px 16px;border-radius:8px;border:none;background:#4f46e5;color:#fff;cursor:pointer;">Retry</button>
            </div>`;
        });
    }

    /* Retry Logic for Supabase */
    function connectSupabase(attempt, el) {
        return new Promise((resolve, reject) => {
            if (window.supabase) {
                resolve(window.supabase.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY));
            } else if (window.parent && window.parent.supabase) {
                resolve(window.parent.supabase.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY));
            } else {
                if (attempt < 5) {
                    setTimeout(() => connectSupabase(attempt + 1, el).then(resolve).catch(reject), 500);
                } else {
                    reject("Supabase SDK not found after 5 attempts");
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
                
                if (r.action === 'Buying' || r.action === 'Conversion In') h[s] += q;
                else if (r.action === 'Selling' || r.action === 'Conversion Out') h[s] -= q;
            });
            // Clean
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

    /* ---------- LIVE PRICES ---------- */
    function startLivePrices() {
        // Clear existing
        State.intervals.forEach(i => clearInterval(i));
        
        const interval = setInterval(() => {
            State.tokens.forEach(t => {
                const oldP = State.prices[t.symbol].val;
                let newP = oldP;

                // Simulate if not API (Add API logic here if needed)
                const vol = oldP * 0.001; 
                newP = oldP + (Math.random() - 0.5) * vol;
                
                // Bounds
                if (t.manual_min_price && newP < t.manual_min_price) newP = t.manual_min_price;
                if (t.manual_max_price && newP > t.manual_max_price) newP = t.manual_max_price;

                State.prices[t.symbol] = { val: newP, prev: oldP };
                
                // Update UI Counter
                updatePriceUI(t.symbol, newP, oldP);
            });

            // Auto-Calculate if user has input
            if(document.getElementById('inp-from') && document.getElementById('inp-from').value !== '') {
                calculateLogic();
            }

        }, CONFIG.REFRESH_RATE);
        
        State.intervals.push(interval);
    }

    function updatePriceUI(sym, newP, oldP) {
        // Only update if currently displayed
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
        el.style.color = newP >= oldP ? '#10b981' : '#f43f5e';
        // Reset color after flash
        setTimeout(() => { if(el) el.style.color = '#64748b'; }, 800);
    }

    /* ---------- UI RENDERER ---------- */
    function renderUI() {
        const root = document.getElementById(CONFIG.TARGET_ID);
        if(!root) return;

        // Get Current Tokens
        const tFrom = State.tokens.find(t => t.symbol === State.from.sym);
        const tTo = State.tokens.find(t => t.symbol === State.to.sym);

        if(!tFrom || !tTo) return;

        // HTML Construction
        root.innerHTML = `
            <div class="cv-wrapper">
                
                <!-- TOP CARD -->
                <div class="cv-card top">
                    <div class="cv-header">
                        <span class="cv-lbl">You Convert</span>
                        <span class="cv-bal">Holding: <b>${fmtQty(State.holdings[tFrom.symbol] || 0)}</b></span>
                    </div>
                    <div class="cv-row">
                        ${renderSelector('from', tFrom)}
                        <div class="cv-input-box">
                            <input type="number" id="inp-from" placeholder="0.00" value="${State.from.qty}" oninput="AVX_CV.handleInput('from', this.value)">
                            <div class="cv-live-p" id="live-price-from">1 = ${fmtMoney(State.prices[tFrom.symbol].val)}</div>
                        </div>
                    </div>
                </div>

                <!-- SWAP BTN -->
                <div class="cv-swap-circle" onclick="AVX_CV.swap()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                </div>

                <!-- BOTTOM CARD -->
                <div class="cv-card bottom">
                    <div class="cv-header">
                        <span class="cv-lbl">You Receive</span>
                        <span class="cv-bal">Holding: <b>${fmtQty(State.holdings[tTo.symbol] || 0)}</b></span>
                    </div>
                    <div class="cv-row">
                        ${renderSelector('to', tTo)}
                        <div class="cv-input-box">
                            <input type="number" id="inp-to" placeholder="0.00" value="${State.to.qty}" oninput="AVX_CV.handleInput('to', this.value)">
                            <div class="cv-live-p" id="live-price-to">1 = ${fmtMoney(State.prices[tTo.symbol].val)}</div>
                        </div>
                    </div>
                </div>

                <!-- ACTION -->
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
        // Exclude the other side's token from list
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

    /* ---------- LOGIC (THE BRAIN) ---------- */
    
    function changeToken(side, newSym) {
        if (side === 'from') {
            State.from.sym = newSym;
            setDefaultChain('from');
        } else {
            State.to.sym = newSym;
            setDefaultChain('to');
        }
        
        // REFRESH EVERYTHING - Logic:
        // Clear inputs because price ratio changed drastically.
        // User asked "ek bar sab kuchh refresh ho jaega"
        State.from.qty = '';
        State.to.qty = '';
        
        // Re-render to show correct icon, chains, holdings for new token
        renderUI();
    }

    function changeChain(side, newChain) {
        if(side === 'from') State.from.chain = newChain;
        else State.to.chain = newChain;
        // Just re-render to reflect state if needed
        renderUI(); 
    }

    function swap() {
        // Swap Syms
        const tSym = State.from.sym;
        State.from.sym = State.to.sym;
        State.to.sym = tSym;

        // Swap Chains
        const tChain = State.from.chain;
        State.from.chain = State.to.chain;
        State.to.chain = tChain;

        // Swap Qty (Visual only, need recalc)
        const tQty = State.from.qty;
        State.from.qty = State.to.qty;
        State.to.qty = tQty;

        // Recalculate logic based on new directions
        calculateLogic();
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

        if (pFrom <= 0 || pTo <= 0) return; // Wait for price

        if (State.lastEdited === 'from') {
            const qty = parseFloat(State.from.qty);
            if (!qty) { State.to.qty = ''; updateInputDOM('inp-to', ''); return; }
            
            // Calc
            const totalVal = qty * pFrom;
            const res = totalVal / pTo;
            
            State.to.qty = res.toFixed(6);
            updateInputDOM('inp-to', State.to.qty);

        } else {
            const qty = parseFloat(State.to.qty);
            if (!qty) { State.from.qty = ''; updateInputDOM('inp-from', ''); return; }
            
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

    /* ---------- EXECUTION ---------- */
    async function execute() {
        const btn = document.querySelector('.cv-btn-action');
        const fQty = parseFloat(State.from.qty);
        const tQty = parseFloat(State.to.qty);
        
        const symFrom = State.from.sym;
        const symTo = State.to.sym;
        
        const pFrom = State.prices[symFrom].val;
        const pTo = State.prices[symTo].val;

        // Validations
        if(!pFrom || !pTo) return toast("Price Loading...", "err");
        if(!fQty || fQty <= 0) return toast("Enter Amount", "err");
        
        // Holding Check
        const bal = State.holdings[symFrom] || 0;
        if(fQty > bal) return toast(`Insufficient ${symFrom}`, "err");

        // Lock UI
        btn.innerHTML = '<div class="cv-spin" style="width:20px;height:20px;border-width:2px;"></div> Converting...';
        btn.disabled = true;

        try {
            const totalINR = fQty * pFrom;

            // 1. OUT (-Qty)
            const { error: e1 } = await State.supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id,
                symbol: symFrom,
                action: 'Conversion Out',
                qty: fQty,
                price_at_transaction: pFrom,
                total_amount: totalINR,
                blockchain_used: State.from.chain,
                status: 'converted'
            });
            if(e1) throw e1;

            // 2. IN (+Qty)
            const { error: e2 } = await State.supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id,
                symbol: symTo,
                action: 'Conversion In',
                qty: tQty,
                price_at_transaction: pTo,
                total_amount: totalINR,
                blockchain_used: State.to.chain,
                status: 'active'
            });
            if(e2) throw e2;

            // Success
            toast(`Converted ${fQty} ${symFrom} to ${tQty.toFixed(4)} ${symTo}`);
            State.from.qty = '';
            State.to.qty = '';
            await refreshHoldings();
            renderUI();

        } catch (e) {
            console.error(e);
            toast("Conversion Failed", "err");
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
            
            /* TOKEN SELECTOR AREA */
            .cv-sel-col { width:45%; }
            .cv-tok-display { display:flex; gap:10px; align-items:flex-start; }
            .cv-icon-box { width:42px; height:42px; border-radius:12px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid #e2e8f0; flex-shrink:0; font-size:18px; color:#4f46e5; font-weight:800; }
            .cv-tok-img { width:100%; height:100%; object-fit:cover; }
            
            .cv-tok-info { display:flex; flex-direction:column; gap:4px; flex:1; }
            .cv-select-tok { font-size:18px; font-weight:800; color:#0f172a; border:none; background:transparent; width:100%; outline:none; cursor:pointer; padding:0; margin:0; appearance:none; }
            
            .cv-chain-sel select { font-size:10px; font-weight:700; color:#64748b; background:#e2e8f0; border:none; padding:2px 6px; border-radius:6px; outline:none; cursor:pointer; max-width:100%; }

            /* INPUT AREA */
            .cv-input-box { flex:1; text-align:right; }
            .cv-input-box input { width:100%; border:none; background:transparent; text-align:right; font-size:24px; font-weight:700; color:#0f172a; outline:none; padding:0; font-family:'Outfit', sans-serif; }
            .cv-input-box input::placeholder { color:#cbd5e1; }
            .cv-live-p { font-size:11px; font-weight:600; color:#94a3b8; margin-top:4px; transition:color 0.3s; }

            /* SWAP BUTTON */
            .cv-swap-circle { width:44px; height:44px; border-radius:50%; background:#4f46e5; color:#fff; border:4px solid #f8fafc; position:relative; margin:0 auto; z-index:10; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 5px 15px rgba(79, 70, 229, 0.3); transition:0.2s; }
            .cv-swap-circle svg { width:20px; height:20px; }
            .cv-swap-circle:active { transform:rotate(180deg) scale(0.95); }

            /* MAIN BUTTON */
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
