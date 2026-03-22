/* ==========================================================
   wallet-pro.js – Premium Pro Dashboard & Trade Manager
   Features: 7-Currency Switcher, Live Balance Animation, 
   Premium Action Grids, Silent Auto-Refresh, Advanced Trade UI
   ========================================================== */
   (function() {

    /* ---------- CONFIGURATION ---------- */
    const CONFIG = {
        SUPA_URL: 'https://hwrvqyipozrsxyjdpqag.supabase.co',
        SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM',
        TARGET_CONTAINER: 'pro-root',           
        REFRESH_RATE: 3000, // 3 Seconds Silent Refresh
        TABLES: {
            WALLET: 'user_wallet_balance',
            CONTROL: 'wallet_crypto_token_control',
            HISTORY: 'wallet_crypto_token_histry'
        },
        CURRENCIES: {
            'INR': { sym: '₹', rate: 1 },
            'USD': { sym: '$', rate: 0.012 },
            'EUR': { sym: '€', rate: 0.011 },
            'GBP': { sym: '£', rate: 0.0095 },
            'AUD': { sym: 'A$', rate: 0.018 },
            'CAD': { sym: 'C$', rate: 0.016 },
            'JPY': { sym: '¥', rate: 1.8 }
        }
    };

    /* ---------- STATE MANAGEMENT ---------- */
    const State = {
        user: null,
        walletBalBase: 0, // Always stored in INR base
        currency: localStorage.getItem('avx_pro_curr') || 'INR',
        tokens: [],       
        prices: {},       
        holdings: {},     
        isRendering: false
    };

    /* ---------- SUPABASE INIT ---------- */
    const supaLib = window.supabase || (window.parent && window.parent.supabase);
    let supa;
    if (supaLib) {
        supa = supaLib.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY);
    }

    /* ---------- UTILITY FUNCTIONS ---------- */
    const fmtCurr = (v) => {
        const c = CONFIG.CURRENCIES[State.currency];
        const val = Number(v || 0) * c.rate;
        return c.sym + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    };
    const fmtQty = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 6 });

    function showProToast(msg, type = 'success') {
        let t = document.getElementById('pro-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'pro-toast';
            document.body.appendChild(t);
        }
        t.innerHTML = `<div class="pro-t-icon">${type === 'success' ? '✅' : '⚠️'}</div><div class="pro-t-msg">${msg}</div>`;
        t.className = `show ${type}`;
        setTimeout(() => t.classList.remove('show'), 3000);
    }

    /* ---------- MAIN APP ENGINE ---------- */
    async function initProApp() {
        injectProStyles();

        const app = document.getElementById(CONFIG.TARGET_CONTAINER);
        if (!app) return;
        if (!supa) { app.innerHTML = '<div style="color:red;padding:20px;">Supabase Error</div>'; return; }

        const { data: { user } } = await supa.auth.getUser();
        if (!user) {
            app.innerHTML = `<div class="pro-empty"><h3>Please Login</h3></div>`;
            return;
        }
        State.user = user;

        // Render basic skeleton immediately
        renderDashboardSkeleton(app);

        // Fetch Data
        await fetchAllData();
        updateBalanceUI();
        renderTradesList();
        
        // Start Engines
        startPriceEngine();
        startSilentRefresh();
    }

    /* ---------- DATA FETCHING & SYNC ---------- */
    async function fetchAllData() {
        await Promise.all([ fetchWallet(), fetchTokens(), fetchHoldings() ]);
    }

    async function fetchWallet() {
        if (!State.user) return;
        const { data } = await supa.from(CONFIG.TABLES.WALLET).select('balance').eq('uid', State.user.id).single();
        if (data) State.walletBalBase = Number(data.balance);
    }

    async function fetchTokens() {
        const { data } = await supa.from(CONFIG.TABLES.CONTROL).select('*');
        if (data) {
            State.tokens = data;
            data.forEach(t => {
                if(!State.prices[t.symbol]) {
                    State.prices[t.symbol] = { current: Number(t.manual_price || 0) };
                }
            });
        }
    }

    async function fetchHoldings() {
        if (!State.user) return;
        const { data } = await supa.from(CONFIG.TABLES.HISTORY).select('symbol, action, qty').eq('user_id', State.user.id);
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
            Object.keys(temp).forEach(k => { if (temp[k] > 0.000001) final[k] = temp[k]; });
            State.holdings = final;
        }
    }

    /* ---------- SILENT REFRESH ENGINE ---------- */
    function startSilentRefresh() {
        setInterval(async () => {
            if(!State.user) return;
            const oldHoldingsStr = JSON.stringify(State.holdings);
            
            await fetchWallet();
            await fetchHoldings();
            
            // Only update balance number silently
            const balEl = document.getElementById('pro-bal-amount');
            if(balEl && !balEl.classList.contains('animating')) {
                balEl.textContent = fmtCurr(State.walletBalBase);
            }

            // Only re-render trades if holding structure changed (new trade added/removed)
            // If just quantity changed, we update silently without breaking UI
            if(oldHoldingsStr !== JSON.stringify(State.holdings)) {
                renderTradesList();
            } else {
                updateTradesSilently();
            }
        }, CONFIG.REFRESH_RATE);
    }

    /* ---------- UI RENDERING ---------- */
    function renderDashboardSkeleton(container) {
        // Build Currency Options
        const currOpts = Object.keys(CONFIG.CURRENCIES).map(c => 
            `<option value="${c}" ${State.currency === c ? 'selected' : ''}>${c}</option>`
        ).join('');

        container.innerHTML = `
            <div class="pro-bal-card">
                <div class="pro-bal-header">
                    <span class="pro-bal-label">Total Portfolio Value</span>
                    <select id="pro-curr-sel" class="pro-curr-select" onchange="ProApp.changeCurrency(this.value)">
                        ${currOpts}
                    </select>
                </div>
                <div class="pro-bal-display" id="pro-bal-amount">₹0.00</div>
                <div class="pro-glow-effect"></div>
            </div>

            <div class="pro-action-grid">
                <button class="pro-act-btn deposit" onclick="location.href='wallet-deposit.html'">
                    <div class="pro-act-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M19 12l-7 7-7-7"/></svg></div>
                    <span>Deposit</span>
                </button>
                <button class="pro-act-btn withdraw" onclick="location.href='wallet-withdrawal.html'">
                    <div class="pro-act-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 19V5M5 12l7-7 7 7"/></svg></div>
                    <span>Withdrawal</span>
                </button>
                <button class="pro-act-btn history" onclick="location.href='wallet-transaction.html'">
                    <div class="pro-act-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
                    <span>Transactions</span>
                </button>
            </div>

            <div class="pro-trades-section">
                <h3 class="pro-section-title">Your Trades</h3>
                <div id="pro-trades-list">
                    <div class="pro-loader"><div class="spinner"></div></div>
                </div>
            </div>
        `;
    }

    window.ProApp = {
        changeCurrency(newCurr) {
            State.currency = newCurr;
            localStorage.setItem('avx_pro_curr', newCurr);
            updateBalanceUI(true);
            updateTradesSilently(); // Update value text in lists instantly
        },
        openTradeModal: openTradeModal,
        executeTrade: executeTrade,
        closeModals: closeModals,
        render: initProApp // Exposed for bottom nav fast switching
    };

    function updateBalanceUI(animate = false) {
        const el = document.getElementById('pro-bal-amount');
        if(!el) return;
        
        if(animate) {
            el.classList.add('animating');
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                el.textContent = fmtCurr(State.walletBalBase);
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
                setTimeout(() => el.classList.remove('animating'), 300);
            }, 200);
        } else {
            el.textContent = fmtCurr(State.walletBalBase);
        }
    }

    function renderTradesList() {
        const list = document.getElementById('pro-trades-list');
        if(!list) return;

        const symbols = Object.keys(State.holdings);

        if(symbols.length === 0) {
            list.innerHTML = `
                <div class="pro-empty-trade">
                    <div class="pet-icon">📊</div>
                    <h4>No any trade</h4>
                    <p>Start buying tokens to build your portfolio</p>
                </div>
            `;
            return;
        }

        list.innerHTML = symbols.map(sym => {
            const t = State.tokens.find(tk => tk.symbol === sym);
            if(!t) return '';
            
            const qty = State.holdings[sym];
            const price = State.prices[sym]?.current || 0;
            const val = qty * price;

            let iconHtml = t.icon_url && t.icon_type === 'image' 
                ? `<img src="${t.icon_url}" class="ptc-img">` 
                : `<div class="ptc-text">${t.symbol.substring(0,2)}</div>`;

            return `
                <div class="pro-trade-card" id="pro-card-${sym}">
                    <div class="ptc-left">
                        <div class="ptc-icon">${iconHtml}</div>
                        <div class="ptc-info">
                            <span class="ptc-sym">${t.symbol}</span>
                            <span class="ptc-name">${t.full_name || t.name}</span>
                        </div>
                    </div>
                    <div class="ptc-right">
                        <div class="ptc-price-box">
                            <div class="ptc-price" id="pro-price-${sym}">${fmtCurr(price)}</div>
                            <div class="ptc-val" id="pro-val-${sym}">Qty: ${fmtQty(qty)}</div>
                        </div>
                    </div>
                    <div class="ptc-actions">
                        <button class="ptc-btn buy" onclick="ProApp.openTradeModal('buy', '${sym}')">BUY</button>
                        <button class="ptc-btn sell" onclick="ProApp.openTradeModal('sell', '${sym}')">SELL</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function updateTradesSilently() {
        Object.keys(State.holdings).forEach(sym => {
            const price = State.prices[sym]?.current || 0;
            const qty = State.holdings[sym];
            
            const priceEl = document.getElementById(`pro-price-${sym}`);
            if(priceEl) priceEl.textContent = fmtCurr(price);

            const valEl = document.getElementById(`pro-val-${sym}`);
            if(valEl) valEl.textContent = `Qty: ${fmtQty(qty)}`;
        });
    }

    /* ---------- PRICE ENGINE ---------- */
    function startPriceEngine() {
        if(!State.tokens || State.tokens.length === 0) return;
        simulateManualPrices();
        setInterval(simulateManualPrices, 2500); 
    }

    function simulateManualPrices() {
        State.tokens.forEach(t => {
            if(!t.is_live_api) {
                const current = State.prices[t.symbol]?.current || Number(t.manual_price);
                const vol = current * 0.0015; 
                let newP = current + ((Math.random() - 0.5) * vol);
                if (t.manual_min_price && newP < t.manual_min_price) newP = t.manual_min_price + vol;
                if (t.manual_max_price && newP > t.manual_max_price) newP = t.manual_max_price - vol;
                
                State.prices[t.symbol].current = newP;
                updatePriceUI(t.symbol, newP);
            }
        });
    }

    function updatePriceUI(sym, newPrice) {
        const el = document.getElementById(`pro-price-${sym}`);
        if(el) {
            const old = parseFloat(el.textContent.replace(/[^0-9.-]+/g,""));
            el.textContent = fmtCurr(newPrice);
            el.style.color = newPrice >= old ? '#10b981' : '#f43f5e';
            setTimeout(() => { if(el) el.style.color = 'var(--pro-text)'; }, 800);
        }

        // Live update modal if open
        const m = document.getElementById('pro-trade-modal');
        if(m && m.classList.contains('show') && m.dataset.sym === sym) {
            document.getElementById('pro-m-price').textContent = fmtCurr(newPrice);
            const qtyIn = document.getElementById('pro-m-qty');
            const amtIn = document.getElementById('pro-m-amt');
            if(document.activeElement === qtyIn && qtyIn.value) {
                // Calculation done in Base INR internally
                amtIn.value = (Number(qtyIn.value) * newPrice).toFixed(2);
            }
        }
    }

    /* ---------- TRADE MODAL LOGIC ---------- */
    function buildTradeModal() {
        if(document.getElementById('pro-trade-modal')) return;

        const m = document.createElement('div');
        m.id = 'pro-trade-modal';
        m.className = 'pro-modal';
        m.innerHTML = `
            <div class="pro-modal-box">
                <div class="pro-m-header">
                    <div class="pro-m-title">
                        <span id="pro-m-type" class="pm-badge">BUY</span>
                        <span id="pro-m-sym">BTC</span>
                    </div>
                    <div class="pro-m-holdings-badge">
                        <small>Holding</small>
                        <div id="pro-m-hold-qty">0.00</div>
                    </div>
                </div>

                <div class="pro-m-price-row">
                    <span>Current Price</span>
                    <strong id="pro-m-price">₹0.00</strong>
                </div>

                <div class="pro-m-inputs">
                    <div class="pm-inp-grp">
                        <label>Total (<span id="pro-m-curr-lbl">INR</span>)</label>
                        <input type="number" id="pro-m-amt" placeholder="0.00">
                    </div>
                    <div class="pm-inp-grp">
                        <label>Quantity</label>
                        <input type="number" id="pro-m-qty" placeholder="0.00">
                    </div>
                </div>

                <div class="pro-m-bal-info">Avail: <span id="pro-m-avail-bal">₹0.00</span></div>

                <div class="pro-m-actions">
                    <button class="pm-btn pm-cancel" onclick="ProApp.closeModals()">Cancel</button>
                    <button class="pm-btn pm-confirm" id="pro-m-confirm" onclick="ProApp.executeTrade()">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(m);

        // Input sync
        const amt = m.querySelector('#pro-m-amt');
        const qty = m.querySelector('#pro-m-qty');
        
        amt.addEventListener('input', () => {
            const p = State.prices[m.dataset.sym]?.current || 0;
            const rate = CONFIG.CURRENCIES[State.currency].rate;
            // user inputs in their currency, we convert to base INR to calculate qty
            if(p > 0 && amt.value) qty.value = ((parseFloat(amt.value) / rate) / p).toFixed(6);
            else qty.value = '';
        });

        qty.addEventListener('input', () => {
            const p = State.prices[m.dataset.sym]?.current || 0;
            const rate = CONFIG.CURRENCIES[State.currency].rate;
            if(p > 0 && qty.value) amt.value = ((parseFloat(qty.value) * p) * rate).toFixed(2);
            else amt.value = '';
        });
    }

    function openTradeModal(type, sym) {
        buildTradeModal();
        const m = document.getElementById('pro-trade-modal');
        m.dataset.mode = type;
        m.dataset.sym = sym;

        // Reset
        document.getElementById('pro-m-amt').value = '';
        document.getElementById('pro-m-qty').value = '';
        
        // Populate
        const typeEl = document.getElementById('pro-m-type');
        typeEl.textContent = type.toUpperCase();
        typeEl.className = `pm-badge ${type}`;
        
        document.getElementById('pro-m-sym').textContent = sym;
        document.getElementById('pro-m-hold-qty').textContent = fmtQty(State.holdings[sym] || 0) + ' ' + sym;
        document.getElementById('pro-m-price').textContent = fmtCurr(State.prices[sym]?.current || 0);
        document.getElementById('pro-m-curr-lbl').textContent = State.currency;
        document.getElementById('pro-m-avail-bal').textContent = fmtCurr(State.walletBalBase);

        const btn = document.getElementById('pro-m-confirm');
        btn.className = `pm-btn pm-confirm ${type}`;
        btn.textContent = `${type.toUpperCase()} NOW`;

        m.classList.add('show');
    }

    function closeModals() {
        const m = document.getElementById('pro-trade-modal');
        if(m) m.classList.remove('show');
    }

    async function executeTrade() {
        const m = document.getElementById('pro-trade-modal');
        const mode = m.dataset.mode;
        const sym = m.dataset.sym;
        const qty = parseFloat(document.getElementById('pro-m-qty').value);
        const rate = CONFIG.CURRENCIES[State.currency].rate;
        
        const priceInr = State.prices[sym]?.current || 0;
        const totalInr = qty * priceInr; // Always process backend in base INR

        if(!qty || qty <= 0) { showProToast("Enter valid quantity", "err"); return; }
        
        if(mode === 'buy' && totalInr > State.walletBalBase) { 
            showProToast("Insufficient Balance", "err"); return; 
        }
        if(mode === 'sell' && qty > (State.holdings[sym] || 0)) { 
            showProToast("Insufficient Holdings", "err"); return; 
        }

        const btn = document.getElementById('pro-m-confirm');
        btn.disabled = true;
        btn.textContent = "Processing...";

        try {
            const actStr = mode === 'buy' ? 'Buying' : 'Selling';
            await supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id, symbol: sym, action: actStr,
                qty: qty, price_at_transaction: priceInr, total_amount: totalInr,
                status: 'active'
            });

            const newBal = mode === 'buy' ? State.walletBalBase - totalInr : State.walletBalBase + totalInr;
            await supa.from(CONFIG.TABLES.WALLET).update({ balance: newBal }).eq('uid', State.user.id);

            // Update Local State instantly
            State.walletBalBase = newBal;
            State.holdings[sym] = mode === 'buy' 
                ? (State.holdings[sym] || 0) + qty 
                : (State.holdings[sym] || 0) - qty;
            
            if(State.holdings[sym] <= 0.000001) delete State.holdings[sym];

            updateBalanceUI(true);
            renderTradesList(); // Refresh list to show new quantity
            closeModals();
            showProToast(`Successfully ${mode === 'buy' ? 'Bought' : 'Sold'} ${sym}`);

        } catch (e) {
            showProToast("Transaction Failed", "err");
        }
        btn.disabled = false;
    }

    /* ---------- PREMIUM STYLES ---------- */
    function injectProStyles() {
        if(document.getElementById('avx-pro-css')) return;
        const css = `
            :root {
                --pro-bg: #f8fafc;
                --pro-card: #ffffff;
                --pro-text: #0f172a;
                --pro-sub: #64748b;
                --pro-acc: #4f46e5;
                --pro-green: #10b981;
                --pro-red: #ef4444;
            }
            
            /* Balance Card */
            .pro-bal-card {
                background: linear-gradient(145deg, #1e293b, #0f172a);
                border-radius: 28px; padding: 25px; margin-bottom: 20px;
                box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.4);
                position: relative; overflow: hidden; color: #fff;
            }
            .pro-glow-effect {
                position: absolute; width: 200px; height: 200px;
                background: var(--pro-acc); filter: blur(90px);
                top: -50px; right: -50px; opacity: 0.3; pointer-events: none;
            }
            .pro-bal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; position: z-index: 2; }
            .pro-bal-label { font-size: 13px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
            .pro-curr-select {
                background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
                color: #fff; border-radius: 12px; padding: 6px 12px; font-size: 13px;
                font-weight: 700; outline: none; cursor: pointer; backdrop-filter: blur(10px);
            }
            .pro-curr-select option { color: #000; }
            .pro-bal-display { font-size: 42px; font-weight: 800; letter-spacing: -1px; transition: transform 0.3s, opacity 0.3s; position: relative; z-index: 2; }
            
            /* Action Grid */
            .pro-action-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 30px; }
            .pro-act-btn {
                background: var(--pro-card); border: 1px solid #e2e8f0; border-radius: 20px;
                padding: 16px 10px; display: flex; flex-direction: column; align-items: center;
                gap: 10px; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.02);
                transition: 0.2s; font-family: inherit;
            }
            .pro-act-btn:active { transform: scale(0.96); }
            .pro-act-icon { width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
            .pro-act-icon svg { width: 22px; height: 22px; stroke-width: 2.5; }
            .deposit .pro-act-icon { background: #e0e7ff; color: var(--pro-acc); }
            .withdraw .pro-act-icon { background: #d1fae5; color: var(--pro-green); }
            .history .pro-act-icon { background: #ffedd5; color: #f97316; }
            .pro-act-btn span { font-size: 12px; font-weight: 700; color: var(--pro-text); }

            /* Trades Section */
            .pro-trades-section { margin-bottom: 80px; }
            .pro-section-title { font-size: 18px; font-weight: 800; color: var(--pro-text); margin-bottom: 15px; padding-left: 5px; }
            .pro-empty-trade { text-align: center; padding: 40px 20px; background: #fff; border-radius: 24px; border: 1px dashed #cbd5e1; }
            .pet-icon { font-size: 40px; filter: grayscale(1); margin-bottom: 10px; opacity: 0.5; }
            .pro-empty-trade h4 { font-size: 18px; color: var(--pro-text); margin-bottom: 5px; }
            .pro-empty-trade p { font-size: 13px; color: var(--pro-sub); }

            .pro-trade-card {
                background: var(--pro-card); border-radius: 20px; padding: 16px; margin-bottom: 12px;
                display: flex; flex-direction: column; gap: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.03);
                border: 1px solid #f1f5f9; transition: 0.2s;
            }
            .ptc-left { display: flex; align-items: center; gap: 12px; }
            .ptc-icon { width: 46px; height: 46px; border-radius: 14px; background: #f8fafc; overflow: hidden; display: flex; align-items: center; justify-content: center; }
            .ptc-img { width: 100%; height: 100%; object-fit: cover; }
            .ptc-text { font-weight: 800; font-size: 16px; color: var(--pro-acc); text-transform: uppercase; }
            .ptc-info { display: flex; flex-direction: column; }
            .ptc-sym { font-weight: 800; font-size: 16px; color: var(--pro-text); }
            .ptc-name { font-size: 12px; color: var(--pro-sub); font-weight: 500; }
            
            .ptc-right { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 12px; border-radius: 14px; }
            .ptc-price-box { text-align: left; }
            .ptc-price { font-weight: 800; font-size: 18px; color: var(--pro-text); transition: color 0.3s; }
            .ptc-val { font-size: 12px; color: var(--pro-acc); font-weight: 700; margin-top: 2px; }
            
            .ptc-actions { display: flex; gap: 10px; }
            .ptc-btn { flex: 1; padding: 10px; border: none; border-radius: 12px; font-weight: 800; font-size: 12px; cursor: pointer; color: #fff; transition: 0.2s; }
            .ptc-btn.buy { background: var(--pro-text); }
            .ptc-btn.sell { background: var(--pro-red); }
            .ptc-btn:active { transform: scale(0.95); }

            /* Modal Styles */
            .pro-modal { position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; z-index: 99999; opacity: 0; transition: 0.3s; }
            .pro-modal.show { display: flex; opacity: 1; }
            .pro-modal-box { background: #fff; width: 90%; max-width: 400px; border-radius: 32px; padding: 25px; transform: translateY(20px); transition: 0.3s; }
            .pro-modal.show .pro-modal-box { transform: translateY(0); }
            
            .pro-m-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #f1f5f9; }
            .pro-m-title { display: flex; align-items: center; gap: 10px; }
            .pm-badge { font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 6px; }
            .pm-badge.buy { background: #e0e7ff; color: var(--pro-acc); }
            .pm-badge.sell { background: #fee2e2; color: var(--pro-red); }
            #pro-m-sym { font-size: 20px; font-weight: 800; }
            
            .pro-m-holdings-badge { text-align: right; background: #f8fafc; padding: 6px 12px; border-radius: 10px; border: 1px solid #e2e8f0; }
            .pro-m-holdings-badge small { display: block; font-size: 10px; color: var(--pro-sub); font-weight: 700; text-transform: uppercase; }
            #pro-m-hold-qty { font-weight: 800; font-size: 14px; color: var(--pro-acc); }

            .pro-m-price-row { display: flex; justify-content: space-between; background: #f8fafc; padding: 15px; border-radius: 16px; margin-bottom: 20px; font-size: 14px; }
            #pro-m-price { font-size: 18px; color: var(--pro-text); }
            
            .pro-m-inputs { display: flex; gap: 12px; margin-bottom: 15px; }
            .pm-inp-grp { flex: 1; }
            .pm-inp-grp label { display: block; font-size: 11px; font-weight: 700; color: var(--pro-sub); margin-bottom: 6px; text-transform: uppercase; }
            .pm-inp-grp input { width: 100%; padding: 14px; border-radius: 16px; border: 2px solid #f1f5f9; font-size: 16px; font-weight: 700; text-align: center; outline: none; background: #f8fafc; transition: 0.2s; }
            .pm-inp-grp input:focus { border-color: var(--pro-acc); background: #fff; }
            
            .pro-m-bal-info { text-align: center; font-size: 12px; color: var(--pro-sub); font-weight: 600; margin-bottom: 20px; }
            
            .pro-m-actions { display: flex; gap: 10px; }
            .pm-btn { flex: 1; padding: 16px; border-radius: 16px; font-weight: 800; font-size: 14px; cursor: pointer; border: none; transition: 0.2s; }
            .pm-cancel { background: #f1f5f9; color: var(--pro-sub); }
            .pm-confirm { color: #fff; }
            .pm-confirm.buy { background: var(--pro-acc); }
            .pm-confirm.sell { background: var(--pro-red); }
            .pm-btn:active { transform: scale(0.96); }

            /* Toast */
            #pro-toast { position: fixed; top: 20px; left: 50%; transform: translate(-50%, -20px); background: #fff; padding: 12px 24px; border-radius: 50px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 10px; opacity: 0; pointer-events: none; z-index: 999999; transition: 0.3s; }
            #pro-toast.show { transform: translate(-50%, 0); opacity: 1; }
            .pro-t-msg { font-size: 13px; font-weight: 700; color: var(--pro-text); }
        `;
        const style = document.createElement('style');
        style.id = 'avx-pro-css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---------- STARTUP ---------- */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initProApp);
    } else {
        initProApp();
    }

})();
