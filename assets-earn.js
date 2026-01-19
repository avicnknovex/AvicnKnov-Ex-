
/* ==========================================================
   assets-earn.js – Premium Portfolio & Holdings Manager
   Features: Real-time Holdings Sync, Net Quantity Calculation,
   Instant UI Updates, Premium "8K" Aesthetics
   ========================================================== */
(function() {

    /* ---------- CONFIGURATION ---------- */
    const CONFIG = {
        SUPA_URL: 'https://hwrvqyipozrsxyjdpqag.supabase.co',
        SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM',
        TARGET_CONTAINER: 'earn',           
        CURRENT_FILE: 'assets-earn.js', 
        REFRESH_RATE: 3000, // 3 Seconds for Live Update
        TABLES: {
            WALLET: 'user_wallets',
            CONTROL: 'crypto_token_control',
            HISTORY: 'crypto_token_histry'
        }
    };

    /* ---------- STATE MANAGEMENT ---------- */
    const State = {
        user: null,
        tokens: [],       
        prices: {},       
        holdings: {},     
        walletBal: 0,
        timers: {}
    };

    /* ---------- SUPABASE INIT ---------- */
    const supaLib = window.supabase || (window.parent && window.parent.supabase);
    let supa;
    try {
        if (supaLib) {
            supa = supaLib.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY);
        } else {
            console.error("Supabase SDK not found.");
        }
    } catch (e) {
        console.error("Supabase Init Error:", e);
    }

    /* ---------- UTILITY FUNCTIONS ---------- */
    const fmtINR = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
    });
    const fmtQty = (v) => Number(v || 0).toLocaleString('en-US', {
        maximumFractionDigits: 6
    });

    function toast(msg, type = 'success') {
        let t = document.getElementById('avx-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'avx-toast';
            document.body.appendChild(t);
        }
        t.innerHTML = `
            <div class="avx-toast-icon">${type === 'success' ? '✅' : '⚠️'}</div>
            <div class="avx-toast-msg">${msg}</div>
        `;
        t.className = type;
        t.classList.add('show');
        clearTimeout(State.timers.toast);
        State.timers.toast = setTimeout(() => t.classList.remove('show'), 3000);
    }

    /* ---------- MAIN APP ENGINE ---------- */
    async function initApp() {
        injectPremiumStyles();

        const app = document.getElementById(CONFIG.TARGET_CONTAINER);
        if (!app) return;

        if (!supa) {
            app.innerHTML = '<div style="color:red;padding:20px;text-align:center;">Error: Supabase Library not loaded.</div>';
            return;
        }

        renderLoader(app, "Loading Your Holdings...");

        try {
            const { data: { user }, error: authError } = await supa.auth.getUser();
            if (authError || !user) {
                app.innerHTML = `<div class="avx-empty"><h3>Please Login</h3><p>To view your portfolio</p></div>`;
                return;
            }
            State.user = user;

            await Promise.all([
                fetchWallet(),
                fetchTokens(),
                fetchHoldings()
            ]);

            // Render list first, then start engine
            renderHoldingsList();
            startPriceEngine();
            startAutoRefresh(); // <--- Added Auto Refresh System

        } catch (err) {
            console.error(err);
            app.innerHTML = `<div class="avx-error">⚠️ Connection Error. Refresh page.</div>`;
        }
    }

    /* ---------- AUTO REFRESH SYSTEM (NEW) ---------- */
    function startAutoRefresh() {
        // Runs every 5 seconds to sync holdings from DB
        // This ensures if user buys in Spot/CoinM, it appears here automatically.
        setInterval(async () => {
            if(!State.user) return;
            
            // Silently fetch latest data
            await Promise.all([
                fetchWallet(),
                fetchHoldings()
            ]);
            
            // Re-render list to show added/removed tokens or updated quantities
            // Note: We don't stop the price engine, it runs independently.
            renderHoldingsList(); 
            
        }, 5000); 
    }

    /* ---------- DATA FETCHING ---------- */
    async function fetchWallet() {
        if (!State.user) return;
        const { data } = await supa.from(CONFIG.TABLES.WALLET).select('balance').eq('uid', State.user.id).single();
        if (data) State.walletBal = Number(data.balance);
    }

    async function fetchTokens() {
        const { data } = await supa.from(CONFIG.TABLES.CONTROL).select('*');
        if (data) {
            State.tokens = data;
            State.tokens.forEach(t => {
                // Initialize state prices immediately
                State.prices[t.symbol] = {
                    current: Number(t.manual_price || 0),
                    change: Number(t.manual_change_percent || 0)
                };
            });
        }
    }

    async function fetchHoldings() {
        if (!State.user) return;
        const { data } = await supa
            .from(CONFIG.TABLES.HISTORY)
            .select('symbol, action, qty')
            .eq('user_id', State.user.id);

        if (data) {
            const temp = {};
            data.forEach(row => {
                const sym = row.symbol;
                const qty = Number(row.qty);
                if (!temp[sym]) temp[sym] = 0;
                
                if (row.action === 'Buying') temp[sym] += qty;
                else if (row.action === 'Selling') temp[sym] -= qty;
            });

            const final = {};
            Object.keys(temp).forEach(k => {
                if (temp[k] > 0.000001) final[k] = temp[k];
            });
            State.holdings = final;
        }
    }

    /* ---------- PRICE ENGINE (FIXED: LIVE + MANUAL) ---------- */
    function startPriceEngine() {
        if(!State.tokens || State.tokens.length === 0) return;

        // 1. Immediate Execution
        fetchLivePrices();
        simulateManualPrices();

        // 2. Set Intervals
        // Live Prices (API)
        setInterval(fetchLivePrices, CONFIG.REFRESH_RATE);
        
        // Manual Prices (Simulation)
        setInterval(simulateManualPrices, 2000); 
    }

    // Function to handle Real API Tokens
    async function fetchLivePrices() {
        const apiTokens = State.tokens.filter(t => t.is_live_api && t.api_url);
        if (apiTokens.length === 0) return;

        // Fetch all concurrently
        apiTokens.forEach(async (t) => {
            try {
                const res = await fetch(t.api_url);
                const json = await res.json();
                
                // Flexible parsing: looks for first key, then 'inr'
                const key = Object.keys(json)[0]; 
                if(key && json[key] && json[key].inr) {
                     const price = Number(json[key].inr);
                     updatePriceUI(t.symbol, price);
                }
            } catch (e) {
                // Silent fail or retry logic
            }
        });
    }

    // Function to handle Manual / Table set Tokens
    function simulateManualPrices() {
        const manualTokens = State.tokens.filter(t => !t.is_live_api);
        if (manualTokens.length === 0) return;

        manualTokens.forEach(t => {
            const currentObj = State.prices[t.symbol] || { current: Number(t.manual_price) };
            const current = currentObj.current;
            
            // Simulation Logic
            const volatility = current * 0.002; 
            const change = (Math.random() - 0.5) * volatility;
            let newPrice = current + change;
            
            if (t.manual_min_price && newPrice < t.manual_min_price) newPrice = t.manual_min_price + volatility;
            if (t.manual_max_price && newPrice > t.manual_max_price) newPrice = t.manual_max_price - volatility;

            updatePriceUI(t.symbol, newPrice);
        });
    }

    function updatePriceUI(sym, newPrice) {
        // Update State
        const old = State.prices[sym] ? State.prices[sym].current : newPrice;
        if(!State.prices[sym]) State.prices[sym] = {};
        State.prices[sym].current = newPrice;

        // 1. Update Card Price (UNIQUE ID: hold-price-{sym})
        const el = document.getElementById(`hold-price-${sym}`);
        if (el) {
            el.textContent = fmtINR(newPrice);
            // Flash Effect
            if (newPrice !== old) {
                el.style.color = newPrice >= old ? '#00e396' : '#ff4560';
                setTimeout(() => { if(el) el.style.color = '#1e293b'; }, 800);
            }
        }

        // 2. Update Total Value in Badge
        const holdQty = State.holdings[sym] || 0;
        const valEl = document.getElementById(`hold-val-${sym}`);
        if (valEl && holdQty > 0) {
            valEl.textContent = `≈ ${fmtINR(holdQty * newPrice)}`;
        }

        // 3. Update Modal if Open
        const m = document.getElementById('avx-trade-modal');
        if(m && m.classList.contains('show') && m.dataset.sym === sym){
             const modalPrice = document.getElementById('avx-m-live-price');
             if(modalPrice) {
                 modalPrice.textContent = fmtINR(newPrice);
                 modalPrice.style.color = newPrice >= old ? '#00e396' : '#ff4560';
             }
             
             // Auto-calc inputs in real-time
             const qtyIn = document.getElementById('avx-t-qty');
             const amtIn = document.getElementById('avx-t-amt');
             
             // If user is focused on Qty, update Amount
             if(document.activeElement === qtyIn && qtyIn.value){
                 amtIn.value = (Number(qtyIn.value) * newPrice).toFixed(2);
             }
             // If user is focused on Amount, update Qty
             // Note: Usually we don't update qty while typing amount to avoid cursor jumping, 
             // but strictly following price updates:
             /* 
             else if(document.activeElement === amtIn && amtIn.value) {
                 qtyIn.value = (Number(amtIn.value) / newPrice).toFixed(6);
             } 
             */
        }
    }

    /* ---------- UI RENDERING ---------- */
    function renderLoader(container, msg) {
        container.innerHTML = `
            <div class="avx-loader">
                <div class="avx-spinner-premium"></div>
                <p>${msg}</p>
            </div>`;
    }

    function renderHoldingsList() {
        const app = document.getElementById(CONFIG.TARGET_CONTAINER);
        if (!app) return;

        const symbols = Object.keys(State.holdings);

        if (symbols.length === 0) {
            app.innerHTML = `
                <div class="avx-empty">
                    <div style="font-size:48px; margin-bottom:15px; filter: grayscale(1);">💼</div>
                    <h2>No Active Holdings</h2>
                    <p>Assets you buy will appear here.</p>
                </div>`;
            return;
        }

        app.innerHTML = symbols.map(sym => {
            const t = State.tokens.find(token => token.symbol === sym);
            if (!t) return ''; 

            const price = State.prices[sym] ? State.prices[sym].current : 0;
            const qty = State.holdings[sym];
            const value = qty * price;

            // Icon Logic
            let iconHTML = '';
            if (t.icon_type === 'image' && t.icon_url) {
                iconHTML = `<img src="${t.icon_url}" class="avx-icon-img">`;
            } else if (t.icon_url) {
                iconHTML = `<span class="avx-icon-emoji">${t.icon_url}</span>`;
            } else {
                iconHTML = `<span class="avx-icon-text">${t.symbol.substring(0,2)}</span>`;
            }

            return `
            <div class="avx-card-premium" id="hold-card-${t.symbol}">
                
                <!-- TOP SECTION: Icon | Name | Price (Top Right) -->
                <div class="avx-cp-top">
                    <div class="avx-cp-icon">
                        ${iconHTML}
                    </div>
                    <div class="avx-cp-details">
                        <span class="avx-cp-sym">${t.symbol}</span>
                        <span class="avx-cp-full">${t.full_name || t.name}</span>
                    </div>
                    <!-- Live Price Here -->
                    <div class="avx-cp-price-box">
                        <div class="avx-cp-price" id="hold-price-${t.symbol}">
                            ${fmtINR(price)}
                        </div>
                    </div>
                </div>

                <!-- HOLDINGS INFO STAT PILL -->
                <div class="avx-hold-stat-row">
                    <div class="avx-hs-item">
                        <small>Quantity</small>
                        <span>${fmtQty(qty)}</span>
                    </div>
                    <div class="avx-hs-item">
                        <small>Total Value</small>
                        <span id="hold-val-${t.symbol}" style="color:var(--p-acc)">≈ ${fmtINR(value)}</span>
                    </div>
                </div>

                <!-- ACTIONS -->
                <div class="avx-cp-actions">
                    <button class="avx-btn-p buy-btn" onclick="AVX.openTrade('buy', '${t.symbol}')">
                        BUY MORE
                    </button>
                    <button class="avx-btn-p sell-btn" onclick="AVX.openTrade('sell', '${t.symbol}')">
                        SELL
                    </button>
                </div>

                <!-- FOOTER -->
                <div class="avx-cp-footer">
                    <div class="avx-foot-btn" onclick="AVX.openGraph('${t.symbol}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                        <span>Chart</span>
                    </div>
                    <div class="avx-foot-btn" onclick="AVX.openInfo('${t.symbol}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        <span>Info</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    /* ---------- TRADING LOGIC ---------- */
    function buildTradeModal() {
        if(document.getElementById('avx-trade-modal')) return;

        const m = document.createElement('div');
        m.id = 'avx-trade-modal';
        m.className = 'avx-modal';
        m.innerHTML = `
            <div class="avx-modal-card">
                <div class="avx-modal-header">
                    <div class="avx-mh-left">
                        <span id="avx-m-type" class="avx-badge">BUY</span> 
                        <span id="avx-m-sym" class="avx-title">BTC</span>
                    </div>
                    <div class="avx-mh-right">
                        <div id="avx-m-live-price" class="avx-price-tag">₹0.00</div>
                    </div>
                </div>
                
                <div class="avx-stat-row">
                    <div class="avx-stat-pill">
                        <small>Balance</small>
                        <span id="avx-m-bal">₹0.00</span>
                    </div>
                    <div class="avx-stat-pill">
                        <small>Holding</small>
                        <span id="avx-m-hold">0.00</span>
                    </div>
                </div>

                <div class="avx-input-group">
                    <label>Network</label>
                    <div class="avx-select-wrapper">
                        <select id="avx-m-chain"></select>
                    </div>
                </div>

                <div class="avx-trade-inputs">
                    <div class="avx-inp-cont">
                        <label>Total (INR)</label>
                        <input type="number" id="avx-t-amt" placeholder="0.00">
                    </div>
                    <div class="avx-inp-cont">
                        <label>Quantity</label>
                        <input type="number" id="avx-t-qty" placeholder="0.00">
                    </div>
                </div>

                <button id="avx-confirm-btn" class="avx-btn-main">CONFIRM ORDER</button>
                <button class="avx-btn-text" onclick="AVX.closeModals()">Cancel</button>
            </div>`;
        
        document.body.appendChild(m);

        // Inputs
        const amt = m.querySelector('#avx-t-amt');
        const qty = m.querySelector('#avx-t-qty');
        const getPrice = () => State.prices[m.dataset.sym]?.current || 0;

        amt.addEventListener('input', () => {
             const p = getPrice();
             if(p > 0 && amt.value) qty.value = (parseFloat(amt.value) / p).toFixed(6);
             else qty.value = '';
        });
        qty.addEventListener('input', () => {
             const p = getPrice();
             if(p > 0 && qty.value) amt.value = (parseFloat(qty.value) * p).toFixed(2);
             else amt.value = '';
        });

        m.querySelector('#avx-confirm-btn').onclick = executeTrade;
    }

    async function openTrade(type, sym) {
        buildTradeModal();
        const m = document.getElementById('avx-trade-modal');
        const token = State.tokens.find(t => t.symbol === sym);
        if(!token) return;

        // Reset
        m.dataset.mode = type;
        m.dataset.sym = sym;
        document.getElementById('avx-t-amt').value = '';
        document.getElementById('avx-t-qty').value = '';

        // UI Setup
        const typeEl = document.getElementById('avx-m-type');
        typeEl.textContent = type.toUpperCase();
        typeEl.className = type === 'buy' ? 'avx-badge buy' : 'avx-badge sell';
        document.getElementById('avx-m-sym').textContent = sym;
        
        const btn = document.getElementById('avx-confirm-btn');
        btn.textContent = `${type.toUpperCase()} ${sym}`;
        btn.className = type === 'buy' ? 'avx-btn-main buy' : 'avx-btn-main sell';
        btn.disabled = false;

        document.getElementById('avx-m-bal').textContent = fmtINR(State.walletBal);
        document.getElementById('avx-m-hold').textContent = `${fmtQty(State.holdings[sym] || 0)} ${sym}`;
        
        // Ensure initial price is set
        const p = State.prices[sym] ? State.prices[sym].current : 0;
        document.getElementById('avx-m-live-price').textContent = fmtINR(p);

        // Chains
        const sel = document.getElementById('avx-m-chain');
        sel.innerHTML = '';
        if(token.blockchains && Array.isArray(token.blockchains)) {
            token.blockchains.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c; opt.textContent = c;
                sel.appendChild(opt);
            });
        }
        openModal(m);
    }

    async function executeTrade() {
        const m = document.getElementById('avx-trade-modal');
        const mode = m.dataset.mode;
        const sym = m.dataset.sym;
        const amt = parseFloat(document.getElementById('avx-t-amt').value);
        const qty = parseFloat(document.getElementById('avx-t-qty').value);
        const chain = document.getElementById('avx-m-chain').value;
        const price = State.prices[sym].current;

        if(!amt || !qty || amt <= 0) { toast("Invalid Amount", "err"); return; }
        
        if(mode === 'buy') {
            if(amt > State.walletBal) { toast("Insufficient Balance", "err"); return; }
        } else {
            const currentHold = State.holdings[sym] || 0;
            if(qty > currentHold) { toast("Insufficient Holdings", "err"); return; }
        }

        const btn = document.getElementById('avx-confirm-btn');
        btn.disabled = true;
        btn.textContent = "Processing...";

        try {
            const actionStr = mode === 'buy' ? 'Buying' : 'Selling';
            const { error: hErr } = await supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id, symbol: sym, action: actionStr,
                qty: qty, price_at_transaction: price, total_amount: amt,
                blockchain_used: chain, status: 'active'
            });
            if(hErr) throw hErr;

            const newBal = mode === 'buy' ? State.walletBal - amt : State.walletBal + amt;
            const { error: wErr } = await supa.from(CONFIG.TABLES.WALLET)
                .update({ balance: newBal }).eq('uid', State.user.id);
            if(wErr) throw wErr;

            State.walletBal = newBal;
            if(mode === 'buy') {
                State.holdings[sym] = (State.holdings[sym] || 0) + qty;
            } else {
                State.holdings[sym] = (State.holdings[sym] || 0) - qty;
                if(State.holdings[sym] <= 0.000001) delete State.holdings[sym];
            }

            toast(`Successful: ${mode.toUpperCase()} ${sym}`);
            AVX.closeModals();
            renderHoldingsList(); // UI Re-render

        } catch (e) {
            console.error(e);
            toast("Transaction Failed", "err");
        }
        btn.disabled = false;
    }

    /* ---------- GLOBAL UI HELPERS ---------- */
    function openModal(el) {
        document.querySelectorAll('.avx-modal').forEach(m => m.classList.remove('show'));
        el.style.display = 'flex';
        requestAnimationFrame(() => el.classList.add('show'));
    }

    function closeModals() {
        document.querySelectorAll('.avx-modal').forEach(m => {
            m.classList.remove('show');
            setTimeout(() => m.style.display = 'none', 300);
        });
    }

    // Reuse Graph/Info from other modules if available
    function openGraph(sym) {
        if(window.AVX && window.AVX.openGraph) window.AVX.openGraph(sym);
    }
    function openInfo(sym) {
        if(window.AVX && window.AVX.openInfo) window.AVX.openInfo(sym);
    }

    /* ---------- PREMIUM STYLE INJECTION ---------- */
    function injectPremiumStyles() {
        if(document.getElementById('avx-holdings-css')) return;
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
            
            :root { --p-bg: #f1f5f9; --p-card: #ffffff; --p-text: #1e293b; --p-acc: #6366f1; --p-green: #10b981; --p-red: #f43f5e; --p-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05); }
            body { font-family: 'Outfit', sans-serif !important; background: var(--p-bg); color: var(--p-text); -webkit-font-smoothing: antialiased; }
            
            /* LOADER */
            .avx-loader { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px; }
            .avx-spinner-premium { width: 40px; height: 40px; border: 3px solid rgba(99, 102, 241, 0.1); border-top-color: var(--p-acc); border-radius: 50%; animation: spin 0.8s ease-in-out infinite; margin-bottom: 15px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            
            /* EMPTY STATE */
            .avx-empty { text-align:center; padding:60px; color:#94a3b8; }
            .avx-empty h2 { font-size: 22px; margin: 0 0 10px 0; color: #475569; font-weight: 700; }

            /* CARD */
            .avx-card-premium {
                background: var(--p-card); border-radius: 28px; padding: 24px; margin-bottom: 24px;
                box-shadow: var(--p-shadow); border: 1px solid rgba(255,255,255,0.7); position: relative;
                overflow: hidden; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .avx-card-premium:hover { transform: translateY(-3px); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.08); }
            
            /* TOP SECTION */
            .avx-cp-top { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
            .avx-cp-icon { width: 56px; height: 56px; border-radius: 20px; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.03); display: flex; align-items: center; justify-content: center; font-size: 24px; border: 1px solid #f1f5f9; }
            .avx-icon-img { width: 100%; height: 100%; object-fit: cover; }
            .avx-icon-text { font-weight:700; color:var(--p-acc); font-size:20px; text-transform:uppercase; }
            
            .avx-cp-details { flex: 1; display:flex; flex-direction:column; }
            .avx-cp-sym { font-weight: 800; font-size: 20px; color: var(--p-text); line-height: 1.2; }
            .avx-cp-full { font-weight: 500; font-size: 13px; color: #64748b; }
            
            .avx-cp-price-box { text-align: right; }
            .avx-cp-price { font-weight: 700; font-size: 20px; color: #1e293b; font-family: 'Outfit', monospace; transition: color 0.3s; }

            /* HOLD STATS ROW */
            .avx-hold-stat-row { display: flex; background: #f8fafc; border-radius: 16px; padding: 12px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
            .avx-hs-item { flex: 1; text-align: center; }
            .avx-hs-item:first-child { border-right: 1px solid #e2e8f0; }
            .avx-hs-item small { display: block; font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
            .avx-hs-item span { font-weight: 700; font-size: 15px; color: #0f172a; }

            /* ACTIONS */
            .avx-cp-actions { display: flex; gap: 14px; margin-bottom: 20px; }
            .avx-btn-p { 
                flex: 1; border: none; padding: 10px 16px; border-radius: 12px; 
                font-weight: 700; font-size: 12px; cursor: pointer; color: white;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: opacity 0.2s, transform 0.1s;
                display: flex; align-items: center; justify-content: center;
                text-transform: uppercase; letter-spacing: 0.5px;
            }
            .buy-btn { background: linear-gradient(to right, #0f172a, #1e3a8a); box-shadow: 0 4px 10px rgba(30, 58, 138, 0.25); }
            .sell-btn { background: linear-gradient(to right, #b91c1c, #ef4444); box-shadow: 0 4px 10px rgba(239, 68, 68, 0.25); }
            .avx-btn-p:active { opacity: 0.9; transform: scale(0.98); }
            
            /* FOOTER */
            .avx-cp-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 5px; }
            .avx-foot-btn { display: flex; align-items: center; gap: 8px; color: #94a3b8; cursor: pointer; font-size: 13px; font-weight: 600; padding: 4px 8px; border-radius: 8px; transition: 0.2s; }
            .avx-foot-btn:hover { color: var(--p-acc); background: #f8fafc; }
            .avx-foot-btn svg { width: 18px; height: 18px; stroke-width: 2.5; }
            
            /* TOAST */
            #avx-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px); background: #fff; padding: 12px 24px; border-radius: 50px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px; opacity: 0; z-index: 10000; transition: 0.4s; pointer-events: none; }
            #avx-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
            .avx-toast-msg { font-size:14px; font-weight:600; color:#1e293b; }

            /* MODALS (Shared) */
            .avx-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(12px); z-index: 9999; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; }
            .avx-modal.show { opacity: 1; }
            .avx-modal-card { background: #fff; width: 90%; max-width: 440px; border-radius: 32px; padding: 30px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
            .avx-modal.show .avx-modal-card { transform: scale(1); }
            .avx-modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
            .avx-title { font-size: 28px; font-weight: 800; letter-spacing: -1px; line-height: 1; color: #0f172a; }
            .avx-badge { font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 8px; display: inline-block; text-transform: uppercase; letter-spacing: 0.5px; }
            .avx-badge.buy { background: #e0e7ff; color: var(--p-acc); }
            .avx-badge.sell { background: #fee2e2; color: var(--p-red); }
            .avx-price-tag { font-family: 'Outfit', monospace; font-size: 18px; font-weight: 700; color: #334155; background: #f1f5f9; padding: 6px 12px; border-radius: 12px; }
            .avx-stat-row { display: flex; gap: 12px; margin-bottom: 24px; }
            .avx-stat-pill { flex: 1; background: #f8fafc; padding: 12px; border-radius: 16px; text-align: center; border: 1px solid #e2e8f0; }
            .avx-stat-pill small { display: block; font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px; text-transform: uppercase; }
            .avx-stat-pill span { font-weight: 700; font-size: 14px; color: #0f172a; }
            .avx-input-group label, .avx-inp-cont label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; display: block; letter-spacing: 0.5px; }
            .avx-select-wrapper select { width: 100%; padding: 14px; border-radius: 16px; border: 2px solid #f1f5f9; background: #fff; font-weight: 600; outline: none; margin-bottom: 20px; color: #334155; }
            .avx-trade-inputs { display: flex; gap: 16px; margin-bottom: 30px; }
            .avx-inp-cont { flex: 1; }
            .avx-inp-cont input { width: 100%; padding: 16px; border-radius: 18px; border: 2px solid #f1f5f9; font-size: 20px; font-weight: 700; text-align: center; outline: none; transition: 0.2s; color: #0f172a; background: #fff; }
            .avx-inp-cont input:focus { border-color: var(--p-acc); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
            .avx-btn-main { width: 100%; padding: 18px; border: none; border-radius: 20px; font-weight: 700; font-size: 16px; color: white; cursor: pointer; margin-bottom: 12px; transition: transform 0.1s; }
            .avx-btn-main:active { transform: scale(0.98); }
            .avx-btn-main.buy { background: var(--p-acc); }
            .avx-btn-main.sell { background: var(--p-red); }
            .avx-btn-text { background: none; border: none; width: 100%; padding: 12px; color: #94a3b8; font-weight: 600; cursor: pointer; font-size: 14px; transition: color 0.2s; }
            .avx-btn-text:hover { color: #64748b; }
        `;
        const style = document.createElement('style');
        style.id = 'avx-holdings-css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---------- EXPOSE API ---------- */
    window.AVX = window.AVX || {};
    window.AVX.openTrade = openTrade;
    window.AVX.closeModals = closeModals;

    /* ---------- STARTUP ---------- */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initApp);
    } else {
        initApp();
    }

})();
