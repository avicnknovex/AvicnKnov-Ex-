
/* ==========================================================
   alpha-mark.js – Premium Mark Trading Engine
   Features: 
   - Live/Manual Hybrid Prices
   - Normal Instant Trading
   - "Mark" System (Target Price Orders)
   - Auto-Execution logic based on Price Range
   - History with Admin Message Support
   - Premium Alpha UI
   ========================================================== */
(function() {

    /* ---------- CONFIGURATION ---------- */
    const CONFIG = {
        SUPA_URL: 'https://hwrvqyipozrsxyjdpqag.supabase.co',
        SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM',
        
        CURRENT_FILE: 'alpha-mark.js', 
        TARGET_CONTAINER: 'alpha-mark', 
        
        REFRESH_RATE: 2000, 
        AUTO_CANCEL_HOURS: 6, // Auto cancel after 6 hours
        
        TABLES: {
            WALLET: 'user_wallets',
            CONTROL: 'crypto_token_control',
            HISTORY: 'crypto_token_histry',
            MARKS: 'alpha_mark' // Table for Mark Orders
        }
    };

    /* ---------- STATE MANAGEMENT ---------- */
    const State = {
        user: null,
        tokens: [], 
        prices: {}, 
        holdings: {}, 
        marks: [], 
        walletBal: 0,
        activeIntervals: [],
        timers: {}
    };

    /* ---------- SUPABASE INIT ---------- */
    const supaLib = window.supabase || (window.parent && window.parent.supabase);
    const getContainer = () => document.getElementById(CONFIG.TARGET_CONTAINER);

    if (!supaLib) {
        console.error("❌ Supabase Library Missing");
        const el = getContainer();
        if(el) el.innerHTML = '<div style="color:red;padding:20px;">Error: Supabase SDK not found.</div>';
        return;
    }
    const supa = supaLib.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY);

    /* ---------- UTILITY FUNCTIONS ---------- */
    const fmtINR = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
    });
    const fmtQty = (v) => Number(v || 0).toLocaleString('en-US', {
        maximumFractionDigits: 6
    });
    
    const fmtTime = (ts) => {
        return new Date(ts).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

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

    /* ---------- DATA ENGINE ---------- */
    async function initApp() {
        injectStyles();
        const app = getContainer();
        if(!app) { console.warn(`Container #${CONFIG.TARGET_CONTAINER} not found.`); return; }

        renderLoader("Syncing Alpha Mark System...");

        // 1. Auth
        const { data: { user } } = await supa.auth.getUser();
        State.user = user;

        if (!user) {
            renderError("Please Login to Access Mark Trading");
            return;
        }

        // 2. Load Data
        await Promise.all([
            fetchWallet(),
            fetchTokens(),
            fetchHoldings(),
            fetchMarks()
        ]);

        // 3. Start Engines
        startPriceEngine();
        startMarkMonitor(); 

        // 4. Render
        renderHeader(); 
        renderTokenList();
    }

    async function fetchWallet() {
        if (!State.user) return;
        const { data } = await supa.from(CONFIG.TABLES.WALLET).select('balance').eq('uid', State.user.id).single();
        if (data) State.walletBal = Number(data.balance);
    }

    async function fetchTokens() {
        const { data } = await supa.from(CONFIG.TABLES.CONTROL).select('*').order('id', { ascending: true });
        if (data) {
            State.tokens = data.filter(t => !t.nosupported_js || !t.nosupported_js.includes(CONFIG.CURRENT_FILE));
            State.tokens.forEach(t => {
                // Initialize prices if not exists
                if(!State.prices[t.symbol]) {
                    State.prices[t.symbol] = {
                        current: Number(t.manual_price || 0),
                        change: Number(t.manual_change_percent || 0)
                    };
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
            Object.keys(temp).forEach(k => { if (temp[k] <= 0.000001) delete temp[k]; });
            State.holdings = temp;
        }
    }

    async function fetchMarks() {
        if (!State.user) return;
        const { data, error } = await supa
            .from(CONFIG.TABLES.MARKS)
            .select('*')
            .eq('user_id', State.user.id)
            .order('created_at', { ascending: false });
            
        if (!error && data) {
            State.marks = data;
        }
    }

    /* ---------- PRICE ENGINE ---------- */
    function startPriceEngine() {
        const apiTokens = State.tokens.filter(t => t.is_live_api && t.api_url);
        if (apiTokens.length > 0) {
            setInterval(() => {
                apiTokens.forEach(async (t) => {
                    try {
                        const res = await fetch(t.api_url);
                        const json = await res.json();
                        const key = Object.keys(json)[0]; 
                        if(key && json[key].inr) updatePrice(t.symbol, json[key].inr);
                    } catch (e) { }
                });
            }, 10000); 
        }

        const manualTokens = State.tokens.filter(t => !t.is_live_api);
        setInterval(() => {
            manualTokens.forEach(t => {
                const current = State.prices[t.symbol].current;
                const volatility = current * 0.002; 
                const change = (Math.random() - 0.5) * volatility;
                let newPrice = current + change;
                if (t.manual_min_price && newPrice < t.manual_min_price) newPrice = t.manual_min_price + volatility;
                if (t.manual_max_price && newPrice > t.manual_max_price) newPrice = t.manual_max_price - volatility;
                updatePrice(t.symbol, newPrice);
            });
        }, CONFIG.REFRESH_RATE);
    }

    function updatePrice(sym, newPrice) {
        const old = State.prices[sym].current;
        State.prices[sym].current = newPrice;
        
        // DOM Updates - List Card
        const el = document.getElementById(`am-price-${sym}`);
        if (el) {
            el.textContent = fmtINR(newPrice);
            el.style.color = newPrice >= old ? '#00e396' : '#ff4560';
            setTimeout(() => { if(el) el.style.color = '#1e293b'; }, 800);
        }

        // Live update in Trade Modal
        const modal = document.getElementById('am-trade-modal');
        if(modal && modal.classList.contains('show') && modal.dataset.sym === sym) {
            const modalPrice = document.getElementById('am-m-live-price');
            if(modalPrice) {
                modalPrice.textContent = fmtINR(newPrice);
                modalPrice.style.color = newPrice >= old ? '#00e396' : '#ff4560';
            }
            
            // Auto-calc amount if typing
            const qtyIn = document.getElementById('am-t-qty');
            const amtIn = document.getElementById('am-t-amt');
            if(document.activeElement === qtyIn && qtyIn.value){
                amtIn.value = (Number(qtyIn.value) * newPrice).toFixed(2);
            }
        }

        // Live update in Graph Modal
        const graphModal = document.getElementById('am-graph-modal');
        const graphSymEl = document.getElementById('am-g-sym');
        if(graphModal && graphModal.classList.contains('show') && graphSymEl && graphSymEl.textContent === sym) {
            const graphPriceEl = document.getElementById('am-g-price');
            if(graphPriceEl) graphPriceEl.textContent = fmtINR(newPrice);
        }
    }

    /* ---------- MARK MONITOR (THE BRAIN) ---------- */
    function startMarkMonitor() {
        setInterval(async () => {
            if(!State.marks || State.marks.length === 0) return;
            
            // Check for execution logic
            const pendingMarks = State.marks.filter(m => m.status === 'pending');
            let needsRefresh = false;

            for(const mark of pendingMarks) {
                const currentPrice = State.prices[mark.symbol]?.current;
                if(!currentPrice) continue;

                // 1. Check Time Expiry (6 Hours)
                const createdTime = new Date(mark.created_at).getTime();
                const now = new Date().getTime();
                const hoursDiff = (now - createdTime) / (1000 * 60 * 60);
                
                if(hoursDiff >= CONFIG.AUTO_CANCEL_HOURS) {
                    await cancelMark(mark.id, 'Expired');
                    needsRefresh = true;
                    continue;
                }

                // 2. Check Price Trigger
                const lower = Math.min(mark.first_price, mark.last_price);
                const upper = Math.max(mark.first_price, mark.last_price);
                
                // If current price is inside the range
                if (currentPrice >= lower && currentPrice <= upper) {
                    await executeMark(mark, currentPrice);
                    needsRefresh = true;
                }
            }

            // Always fetch marks to update status/messages in real-time
            // Logic: Even if no execution, we check DB for admin messages or status changes
            await fetchMarks(); 
            
            // If History modal is open, refresh it immediately
            if(document.getElementById('am-history-modal')?.classList.contains('show')) {
                renderHistoryList();
            }

            if(needsRefresh) {
                await Promise.all([fetchWallet(), fetchHoldings()]);
            }

        }, 2000); // 2 second cycle for responsive message updates
    }

    async function executeMark(mark, executionPrice) {
        // Double Check Funds/Holdings AT EXECUTION TIME
        await fetchWallet();
        await fetchHoldings();

        if (mark.action === 'Buying') {
            if (State.walletBal < mark.amount) {
                await cancelMark(mark.id, 'Insufficient Balance');
                toast(`Mark ${mark.symbol} Cancelled: Low Funds`, 'err');
                return;
            }
            // Execute Buy
            const newBal = State.walletBal - mark.amount;
            await supa.from(CONFIG.TABLES.WALLET).update({ balance: newBal }).eq('uid', State.user.id);
            await supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id, symbol: mark.symbol, action: 'Buying',
                qty: mark.qty, price_at_transaction: executionPrice, total_amount: mark.amount,
                blockchain_used: mark.blockchain, status: 'active'
            });

        } else {
            // Selling
            const currentHold = State.holdings[mark.symbol] || 0;
            if (currentHold < mark.qty) {
                await cancelMark(mark.id, 'Insufficient Holdings');
                toast(`Mark ${mark.symbol} Cancelled: Low Qty`, 'err');
                return;
            }
            // Execute Sell
            const newBal = State.walletBal + mark.amount;
            await supa.from(CONFIG.TABLES.WALLET).update({ balance: newBal }).eq('uid', State.user.id);
            await supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id, symbol: mark.symbol, action: 'Selling',
                qty: mark.qty, price_at_transaction: executionPrice, total_amount: mark.amount,
                blockchain_used: mark.blockchain, status: 'active'
            });
        }

        // Update Mark Status
        await supa.from(CONFIG.TABLES.MARKS).update({ status: 'completed' }).eq('id', mark.id);
        toast(`Mark Executed: ${mark.action} ${mark.symbol}`);
    }

    async function cancelMark(id, reason = '') {
        await supa.from(CONFIG.TABLES.MARKS)
            .update({ status: 'cancelled', msg_box: reason ? reason : null })
            .eq('id', id);
    }

    /* ---------- UI RENDERER ---------- */
    function renderLoader(msg) {
        const app = getContainer();
        if (app) app.innerHTML = `<div class="avx-loader"><div class="avx-spinner-premium"></div><p>${msg}</p></div>`;
    }
    
    function renderError(msg) {
        const app = getContainer();
        if (app) app.innerHTML = `<div class="avx-error">⚠️ ${msg}</div>`;
    }

    function renderHeader() {
        const app = getContainer();
        if(document.getElementById('am-main-header')) return;
        
        const header = document.createElement('div');
        header.id = 'am-main-header';
        header.className = 'am-header-bar';
        header.innerHTML = `
            <div class="am-head-title">Alpha Markets</div>
            <div class="am-head-hist" onclick="AVX_MARK.openHistory()">
                <span>History</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
        `;
        if(app.firstChild) app.insertBefore(header, app.firstChild);
        else app.appendChild(header);
    }

    function renderTokenList() {
        const app = getContainer();
        if(!app) return;

        const kids = Array.from(app.children);
        kids.forEach(k => {
            if(k.id !== 'am-main-header') k.remove();
        });

        if (State.tokens.length === 0) {
            const div = document.createElement('div');
            div.className = 'avx-empty';
            div.innerHTML = `<h2>🚀 Marketplace Empty</h2><p>Assets are being listed.</p>`;
            app.appendChild(div);
            return;
        }

        State.tokens.forEach(t => {
            const p = State.prices[t.symbol] || { current: 0 };
            
            let iconHTML = '';
            if (t.icon_type === 'image' && t.icon_url) {
                iconHTML = `<img src="${t.icon_url}" class="avx-icon-img">`;
            } else if (t.icon_url) {
                iconHTML = `<span class="avx-icon-emoji">${t.icon_url}</span>`;
            } else {
                iconHTML = `<span class="avx-icon-text">${t.symbol.substring(0,2)}</span>`;
            }

            const card = document.createElement('div');
            card.className = 'avx-card-premium';
            card.id = `am-card-${t.symbol}`;
            card.innerHTML = `
                <div class="avx-cp-top">
                    <div class="avx-cp-icon">${iconHTML}</div>
                    <div class="avx-cp-details">
                        <span class="avx-cp-sym">${t.symbol}</span>
                        <span class="avx-cp-full">${t.full_name || t.name}</span>
                    </div>
                    <div class="avx-cp-price-box">
                        <div class="avx-cp-price" id="am-price-${t.symbol}">${fmtINR(p.current)}</div>
                    </div>
                </div>
                <div class="avx-cp-actions">
                    <button class="avx-btn-p buy-btn" onclick="AVX_MARK.openTrade('buy', '${t.symbol}')">BUY</button>
                    <button class="avx-btn-p sell-btn" onclick="AVX_MARK.openTrade('sell', '${t.symbol}')">SELL</button>
                </div>
                <div class="avx-cp-footer">
                    <div class="avx-foot-btn" onclick="AVX_MARK.openGraph('${t.symbol}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg><span>Chart</span>
                    </div>
                    <div class="avx-foot-btn" onclick="AVX_MARK.openInfo('${t.symbol}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg><span>Info</span>
                    </div>
                </div>`;
            app.appendChild(card);
        });
    }

    /* ---------- MODALS ---------- */
    
    // --- TRADE MODAL ---
    function buildTradeModal() {
        if(document.getElementById('am-trade-modal')) return;

        const m = document.createElement('div');
        m.id = 'am-trade-modal';
        m.className = 'avx-modal';
        m.innerHTML = `
            <div class="avx-modal-card">
                <div class="avx-modal-header">
                    <div class="avx-mh-left">
                        <span id="am-m-type" class="avx-badge">BUY</span> 
                        <span id="am-m-sym" class="avx-title">BTC</span>
                    </div>
                    <div class="am-mark-toggle-box">
                        <span>Mark Order?</span>
                        <label class="am-switch">
                            <input type="checkbox" id="am-mark-switch" onchange="AVX_MARK.toggleMarkMode()">
                            <span class="am-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="avx-stat-row">
                    <div class="avx-stat-pill"><small>Balance</small><span id="am-m-bal">₹0.00</span></div>
                    <div class="avx-stat-pill"><small>Holding</small><span id="am-m-hold">0.00</span></div>
                </div>

                <div class="am-live-price-strip">
                    Live: <span id="am-m-live-price">₹0.00</span>
                </div>

                <div class="avx-input-group">
                    <label>Network</label>
                    <div class="avx-select-wrapper">
                        <select id="am-m-chain"></select>
                    </div>
                </div>

                <div id="am-mark-inputs" style="display:none;">
                    <div class="avx-trade-inputs">
                        <div class="avx-inp-cont">
                            <label>First Target</label>
                            <input type="number" id="am-t-first" placeholder="0.00">
                        </div>
                        <div class="avx-inp-cont">
                            <label>Last Target</label>
                            <input type="number" id="am-t-last" placeholder="0.00">
                        </div>
                    </div>
                </div>

                <div class="avx-trade-inputs">
                    <div class="avx-inp-cont">
                        <label>Total (INR)</label>
                        <input type="number" id="am-t-amt" placeholder="0.00">
                    </div>
                    <div class="avx-inp-cont">
                        <label>Quantity</label>
                        <input type="number" id="am-t-qty" placeholder="0.00">
                    </div>
                </div>

                <button id="am-confirm-btn" class="avx-btn-main">CONFIRM ORDER</button>
                <button class="avx-btn-text" onclick="AVX_MARK.closeModals()">Cancel</button>
            </div>
        `;
        document.body.appendChild(m);
        
        const amt = m.querySelector('#am-t-amt');
        const qty = m.querySelector('#am-t-qty');
        
        const getPrice = () => {
            const sym = m.dataset.sym;
            return State.prices[sym] ? State.prices[sym].current : 0;
        };

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

        m.querySelector('#am-confirm-btn').onclick = handleTradeSubmit;
    }

    function toggleMarkMode() {
        const isMark = document.getElementById('am-mark-switch').checked;
        const markDiv = document.getElementById('am-mark-inputs');
        const btn = document.getElementById('am-confirm-btn');
        const m = document.getElementById('am-trade-modal');
        const type = m.dataset.mode; 

        if(isMark) {
            markDiv.style.display = 'block';
            btn.textContent = "SET MARK";
            btn.style.background = '#334155'; 
        } else {
            markDiv.style.display = 'none';
            btn.textContent = `${type.toUpperCase()} NOW`;
            btn.style.background = type === 'buy' ? 'var(--p-acc)' : 'var(--p-red)';
        }
    }

    function openTrade(type, sym) {
        buildTradeModal();
        let m = document.getElementById('am-trade-modal');
        const token = State.tokens.find(t => t.symbol === sym);
        if(!token) return;

        m.dataset.mode = type;
        m.dataset.sym = sym;
        
        document.getElementById('am-t-amt').value = '';
        document.getElementById('am-t-qty').value = '';
        document.getElementById('am-t-first').value = '';
        document.getElementById('am-t-last').value = '';
        
        const sw = document.getElementById('am-mark-switch');
        sw.checked = false;
        toggleMarkMode();

        const typeEl = document.getElementById('am-m-type');
        typeEl.textContent = type.toUpperCase();
        typeEl.className = type === 'buy' ? 'avx-badge buy' : 'avx-badge sell';
        document.getElementById('am-m-sym').textContent = sym;
        
        document.getElementById('am-m-bal').textContent = fmtINR(State.walletBal);
        const holding = State.holdings[sym] || 0;
        document.getElementById('am-m-hold').textContent = `${fmtQty(holding)} ${sym}`;
        
        const price = State.prices[sym] ? State.prices[sym].current : 0;
        document.getElementById('am-m-live-price').textContent = fmtINR(price);
        
        const sel = document.getElementById('am-m-chain');
        sel.innerHTML = '';
        if(token.blockchains && Array.isArray(token.blockchains)) {
            token.blockchains.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c; opt.textContent = c; sel.appendChild(opt);
            });
        }

        openModal(m);
    }

    async function handleTradeSubmit() {
        const isMark = document.getElementById('am-mark-switch').checked;
        if(isMark) await setMarkOrder();
        else await executeNormalTrade();
    }

    async function executeNormalTrade() {
        const m = document.getElementById('am-trade-modal');
        const mode = m.dataset.mode;
        const sym = m.dataset.sym;
        const amt = parseFloat(document.getElementById('am-t-amt').value);
        const qty = parseFloat(document.getElementById('am-t-qty').value);
        const chain = document.getElementById('am-m-chain').value;
        const price = State.prices[sym].current;

        if(!amt || !qty) { toast("Invalid Amount", "err"); return; }
        
        if(mode === 'buy') {
            if(amt > State.walletBal) { toast("Insufficient Balance", "err"); return; }
        } else {
            const h = State.holdings[sym] || 0;
            if(qty > h) { toast(`Insufficient ${sym}`, "err"); return; }
        }

        const btn = document.getElementById('am-confirm-btn');
        btn.disabled = true; btn.textContent = "Processing...";

        try {
            const actionStr = mode === 'buy' ? 'Buying' : 'Selling';
            const { error: hErr } = await supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id, symbol: sym, action: actionStr,
                qty: qty, price_at_transaction: price, total_amount: amt,
                blockchain_used: chain, status: 'active'
            });
            if(hErr) throw hErr;

            const newBal = mode === 'buy' ? State.walletBal - amt : State.walletBal + amt;
            const { error: wErr } = await supa.from(CONFIG.TABLES.WALLET).update({ balance: newBal }).eq('uid', State.user.id);
            if(wErr) throw wErr;

            State.walletBal = newBal;
            await fetchHoldings();
            
            toast(`Successful: ${mode.toUpperCase()} ${sym}`);
            closeModals();

        } catch (e) {
            console.error(e);
            toast("Trade Failed", "err");
        }
        btn.disabled = false;
    }

    async function setMarkOrder() {
        const m = document.getElementById('am-trade-modal');
        const mode = m.dataset.mode; 
        const sym = m.dataset.sym;
        const amt = parseFloat(document.getElementById('am-t-amt').value);
        const qty = parseFloat(document.getElementById('am-t-qty').value);
        const chain = document.getElementById('am-m-chain').value;
        const first = parseFloat(document.getElementById('am-t-first').value);
        const last = parseFloat(document.getElementById('am-t-last').value);
        const liveP = State.prices[sym].current;

        if(!amt || !qty) { toast("Invalid Amount", "err"); return; }
        if(!first || !last) { toast("Enter Target Prices", "err"); return; }

        if(mode === 'buy' && amt > State.walletBal) { toast("Insufficient Balance", "err"); return; }
        if(mode === 'sell' && qty > (State.holdings[sym] || 0)) { toast("Insufficient Holdings", "err"); return; }

        const btn = document.getElementById('am-confirm-btn');
        btn.disabled = true; btn.textContent = "Setting Mark...";

        try {
            const actionStr = mode === 'buy' ? 'Buying' : 'Selling';
            const { error } = await supa.from(CONFIG.TABLES.MARKS).insert({
                user_id: State.user.id,
                symbol: sym,
                action: actionStr,
                blockchain: chain,
                first_price: first,
                last_price: last,
                entry_price: liveP,
                qty: qty,
                amount: amt,
                status: 'pending'
            });

            if(error) throw error;

            toast(`Mark Pending for ${sym}`);
            await fetchMarks();
            closeModals();

        } catch (e) {
            console.error(e);
            toast("Failed to Set Mark", "err");
        }
        btn.disabled = false;
    }

    /* ---------- HISTORY MODAL ---------- */
    function openHistory() {
        let m = document.getElementById('am-history-modal');
        if(!m) {
            m = document.createElement('div');
            m.id = 'am-history-modal';
            m.className = 'avx-modal full-screen'; 
            m.innerHTML = `
                <div class="avx-modal-card graph-mode" style="background:#f8fafc; height: 90vh;">
                    <div class="avx-graph-top">
                        <h2 style="margin:0;font-size:22px;color:#1e293b;">Mark History</h2>
                        <button class="avx-btn-close-icon" onclick="AVX_MARK.closeModals()">×</button>
                    </div>
                    <div id="am-hist-list" class="am-hist-container"></div>
                </div>
            `;
            document.body.appendChild(m);
        }
        
        renderHistoryList();
        openModal(m);
    }

    function renderHistoryList() {
        const cont = document.getElementById('am-hist-list');
        if(!cont) return;

        if(!State.marks || State.marks.length === 0) {
            cont.innerHTML = `<div class="avx-empty"><p>No Marks Set</p></div>`;
            return;
        }

        cont.innerHTML = State.marks.map(m => {
            const isBuy = m.action === 'Buying';
            const statusClass = m.status === 'completed' ? 'success' : (m.status === 'cancelled' ? 'failed' : 'pending');
            const statusIcon = m.status === 'completed' ? '✅' : (m.status === 'cancelled' ? '❌' : '⏳');
            
            // --- FIX: ROBUST ICON RETRIEVAL ---
            const token = State.tokens.find(t => t.symbol === m.symbol);
            let iconImg = '';
            
            if (token) {
                if (token.icon_type === 'image' && token.icon_url) {
                    iconImg = `<img src="${token.icon_url}" class="am-h-icon">`;
                } else if (token.icon_url) {
                    iconImg = `<div class="am-h-txt" style="background:transparent;font-size:24px;">${token.icon_url}</div>`;
                } else {
                    iconImg = `<div class="am-h-txt">${m.symbol.substring(0,2)}</div>`;
                }
            } else {
                // Fallback if token data is missing
                iconImg = `<div class="am-h-txt">${m.symbol.substring(0,2)}</div>`;
            }

            // --- FIX: ATTRACTIVE ADMIN MSG ---
            let adminMsg = '';
            if(m.msg_box && m.msg_box.trim() !== '') {
                adminMsg = `<div class="am-admin-msg">
                                <span style="display:block;font-size:10px;text-transform:uppercase;color:#3b82f6;margin-bottom:2px;">Support Message</span>
                                ${m.msg_box}
                            </div>`;
            }

            let actionBtn = '';
            if(m.status === 'pending') {
                actionBtn = `<button class="am-cancel-btn" onclick="AVX_MARK.cancelUserMark(${m.id})">Cancel</button>`;
            }

            return `
            <div class="am-hist-card ${statusClass}">
                <div class="am-h-head">
                    <div class="am-h-left">
                        ${iconImg}
                        <div>
                            <div class="am-h-sym">${m.symbol} <span class="am-h-tag ${isBuy?'buy':'sell'}">${m.action}</span></div>
                            <div class="am-h-date">${fmtTime(m.created_at)}</div>
                        </div>
                    </div>
                    <div class="am-h-right">
                        <div class="am-h-status">${statusIcon} ${m.status.toUpperCase()}</div>
                    </div>
                </div>
                <div class="am-h-body">
                    <div class="am-h-row"><span>Target:</span> <b>${m.first_price} - ${m.last_price}</b></div>
                    <div class="am-h-row"><span>Qty:</span> <b>${fmtQty(m.qty)}</b></div>
                    <div class="am-h-row"><span>Total:</span> <b>${fmtINR(m.amount)}</b></div>
                    <div class="am-h-row"><span>Entry Live:</span> <span style="color:#64748b">${fmtINR(m.entry_price)}</span></div>
                </div>
                ${adminMsg}
                ${actionBtn}
            </div>`;
        }).join('');
    }

    async function cancelUserMark(id) {
        if(!confirm("Cancel this mark order?")) return;
        await supa.from(CONFIG.TABLES.MARKS).update({ status: 'cancelled' }).eq('id', id);
        await fetchMarks();
        renderHistoryList();
        toast("Mark Cancelled");
    }

    /* ---------- INFO & GRAPH MODALS ---------- */
    // Info Modal
    function buildInfoModal() {
        if(document.getElementById('am-info-modal')) return;
        const m = document.createElement('div');
        m.id = 'am-info-modal';
        m.className = 'avx-modal';
        m.innerHTML = `
            <div class="avx-modal-card">
                <div class="avx-info-header">
                    <div id="am-i-icon-box" class="avx-glow-icon"></div>
                    <h2 id="am-i-name">BTC</h2>
                    <p id="am-i-full">Bitcoin</p>
                </div>
                <div class="avx-info-grid">
                    <div class="avx-ig-item"><span>Supply</span><b id="am-i-supp">--</b></div>
                    <div class="avx-ig-item"><span>Volume</span><b id="am-i-vol">--</b></div>
                    <div class="avx-ig-item"><span>Holders</span><b id="am-i-hold">--</b></div>
                </div>
                <div class="avx-desc-box" id="am-i-desc"></div>
                <div class="avx-links-row" id="am-i-links"></div>
                <button class="avx-btn-text" onclick="AVX_MARK.closeModals()">Close</button>
            </div>`;
        document.body.appendChild(m);
    }

    function openInfo(sym) {
        buildInfoModal();
        let m = document.getElementById('am-info-modal');
        const t = State.tokens.find(tok => tok.symbol === sym);
        if(!t) return;

        let iconHTML = t.icon_type === 'image' ? `<img src="${t.icon_url}">` : `<span>${t.symbol.substring(0,2)}</span>`;
        document.getElementById('am-i-icon-box').innerHTML = iconHTML;
        document.getElementById('am-i-name').textContent = t.symbol;
        document.getElementById('am-i-full').textContent = t.full_name;
        document.getElementById('am-i-supp').textContent = t.total_supply || 'N/A';
        document.getElementById('am-i-vol').textContent = t.volume || 'N/A';
        document.getElementById('am-i-hold').textContent = t.holders || 'N/A';
        document.getElementById('am-i-desc').textContent = t.description || "No description.";
        
        const linksDiv = document.getElementById('am-i-links');
        linksDiv.innerHTML = '';
        if(t.social_links) {
            Object.entries(t.social_links).forEach(([key, url]) => {
                linksDiv.innerHTML += `<a href="${url}" target="_blank" class="avx-link-chip">${key} ↗</a>`;
            });
        }
        openModal(m);
    }

    // Graph Modal
    function buildGraphModal() {
        if(document.getElementById('am-graph-modal')) return;
        const m = document.createElement('div');
        m.id = 'am-graph-modal';
        m.className = 'avx-modal full-screen';
        m.innerHTML = `
            <div class="avx-modal-card graph-mode">
                <div class="avx-graph-top">
                    <div><span id="am-g-sym">BTC</span> <span id="am-g-price" style="font-weight:700; color:#334155; margin-left:10px;">₹00.00</span></div>
                    <button class="avx-btn-close-icon" onclick="AVX_MARK.closeModals()">×</button>
                </div>
                <div class="avx-graph-ctrls">
                    <button class="active" onclick="AVX_MARK.setGraphType('line')">Line</button>
                    <button onclick="AVX_MARK.setGraphType('candle')">Candle</button>
                </div>
                <div class="avx-canvas-container"><canvas id="am-chart" width="350" height="280"></canvas></div>
                <p class="avx-hint">Swipe to scroll history</p>
            </div>`;
        document.body.appendChild(m);
        initChartInteractions();
    }

    let chartCtx = { type: 'line', data: [], offset: 0, sym: null };

    function openGraph(sym) {
        buildGraphModal();
        let m = document.getElementById('am-graph-modal');
        chartCtx.sym = sym;
        chartCtx.offset = 0;
        document.getElementById('am-g-sym').textContent = sym;
        const currentP = State.prices[sym] ? State.prices[sym].current : 0;
        document.getElementById('am-g-price').textContent = fmtINR(currentP);
        chartCtx.data = generateHistory(currentP);
        openModal(m);
        requestAnimationFrame(drawChart);
    }

    function setGraphType(type) {
        chartCtx.type = type;
        const btns = document.querySelectorAll('#am-graph-modal .avx-graph-ctrls button');
        btns.forEach(b => b.classList.remove('active'));
        if(event && event.target) event.target.classList.add('active');
        drawChart();
    }

    function generateHistory(basePrice) {
        let arr = [];
        let price = basePrice;
        for(let i=0; i<60; i++) {
            let open = price;
            let close = price + (Math.random()-0.5)*(price*0.02);
            let high = Math.max(open, close) + Math.random()*(price*0.01);
            let low = Math.min(open, close) - Math.random()*(price*0.01);
            arr.unshift({ open, close, high, low, time: i });
            price = close + (Math.random()-0.5)*(price*0.01);
        }
        return arr;
    }

    function drawChart() {
        const c = document.getElementById('am-chart');
        if(!c || !c.offsetParent) return;
        const ctx = c.getContext('2d');
        const w = c.width; const h = c.height;
        ctx.clearRect(0,0,w,h);

        const data = chartCtx.data;
        const count = 30; const step = w/count;
        const start = Math.max(0, chartCtx.offset);
        const slice = data.slice(start, start + count);
        if(slice.length === 0) return;

        const maxVal = Math.max(...slice.map(d => d.high));
        const minVal = Math.min(...slice.map(d => d.low));
        const range = maxVal - minVal || 1;
        const pad = 20;
        const getY = (val) => h - pad - ((val - minVal) / range) * (h - 2*pad);

        ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(0, getY(minVal)); ctx.lineTo(w, getY(minVal));
        ctx.moveTo(0, getY(maxVal)); ctx.lineTo(w, getY(maxVal));
        ctx.stroke();

        if(chartCtx.type === 'line') {
            ctx.beginPath(); ctx.strokeStyle = '#334155'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
            slice.forEach((d, i) => {
                const x = w - (i * step) - (step/2);
                const y = getY(d.close);
                if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
            });
            ctx.stroke();
            ctx.lineTo(w - ((slice.length-1)*step), h); ctx.lineTo(w, h);
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, "rgba(51, 65, 85, 0.2)"); grad.addColorStop(1, "rgba(51, 65, 85, 0)");
            ctx.fillStyle = grad; ctx.fill();
        } else {
            const barW = step * 0.5;
            slice.forEach((d, i) => {
                const x = w - (i * step) - (step/2);
                const isGreen = d.close >= d.open;
                ctx.fillStyle = isGreen ? '#00e396' : '#ff4560';
                ctx.fillRect(x-1, getY(d.high), 2, getY(d.low) - getY(d.high));
                const yOpen = getY(d.open); const yClose = getY(d.close);
                ctx.fillRect(x - barW/2, Math.min(yOpen, yClose), barW, Math.abs(yOpen - yClose) || 1);
            });
        }
        if(document.getElementById('am-graph-modal').classList.contains('show')) requestAnimationFrame(drawChart);
    }

    function initChartInteractions() {
        const c = document.getElementById('am-chart');
        let isDrag = false, startX = 0;
        const start = (x) => { isDrag = true; startX = x; };
        const move = (x) => {
            if(!isDrag) return;
            const dx = x - startX;
            if(Math.abs(dx)>5) { chartCtx.offset -= Math.sign(dx); if(chartCtx.offset<0) chartCtx.offset=0; startX=x; }
        };
        c.addEventListener('mousedown', e => start(e.offsetX));
        c.addEventListener('mousemove', e => move(e.offsetX));
        c.addEventListener('mouseup', () => isDrag = false);
        c.addEventListener('touchstart', e => start(e.touches[0].clientX));
        c.addEventListener('touchmove', e => move(e.touches[0].clientX));
    }

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

    /* ---------- STYLES ---------- */
    function injectStyles() {
        if(document.getElementById('avx-mark-css')) return;
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
            :root { --p-bg: #f1f5f9; --p-card: #ffffff; --p-text: #1e293b; --p-acc: #334155; --p-green: #10b981; --p-red: #f43f5e; --p-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05); }
            body { font-family: 'Outfit', sans-serif !important; background: var(--p-bg); color: var(--p-text); -webkit-font-smoothing: antialiased; }
            
            /* HEADER */
            .am-header-bar { display:flex; justify-content:space-between; align-items:center; padding:15px 0; margin-bottom:20px; }
            .am-head-title { font-size:24px; font-weight:800; color:#334155; }
            .am-head-hist { display:flex; align-items:center; gap:6px; background:#fff; padding:8px 16px; border-radius:30px; box-shadow:0 4px 10px rgba(0,0,0,0.05); cursor:pointer; font-weight:700; color:#475569; font-size:13px; }
            .am-head-hist svg { width:18px; }

            /* CARD & LIST */
            .avx-loader { display:flex; flex-direction:column; align-items:center; padding:50px; }
            .avx-spinner-premium { width: 40px; height: 40px; border: 3px solid rgba(51, 65, 85, 0.1); border-top-color: var(--p-acc); border-radius: 50%; animation: spin 0.8s ease-in-out infinite; margin-bottom: 15px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            .avx-empty { text-align:center; padding:40px; color:#94a3b8; }
            .avx-card-premium { background: var(--p-card); border-radius: 28px; padding: 24px; margin-bottom: 24px; box-shadow: var(--p-shadow); border: 1px solid rgba(255,255,255,0.7); position: relative; transition: all 0.3s; }
            .avx-card-premium:hover { transform: translateY(-3px); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08); }
            .avx-cp-top { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
            .avx-cp-icon { width: 56px; height: 56px; border-radius: 20px; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.03); display: flex; align-items: center; justify-content: center; font-size: 24px; overflow: hidden; border: 1px solid #f1f5f9; }
            .avx-icon-img { width: 100%; height: 100%; object-fit: cover; }
            .avx-icon-text { font-weight:700; color:var(--p-acc); font-size:20px; text-transform:uppercase; }
            .avx-cp-details { flex: 1; display:flex; flex-direction:column; }
            .avx-cp-sym { font-weight: 800; font-size: 20px; color: var(--p-text); line-height: 1.2; }
            .avx-cp-full { font-weight: 500; font-size: 13px; color: #64748b; }
            .avx-cp-price-box { text-align: right; }
            .avx-cp-price { font-weight: 700; font-size: 20px; color: #1e293b; font-family: 'Outfit', monospace; }
            .avx-cp-actions { display: flex; gap: 14px; margin-bottom: 20px; }
            .avx-btn-p { flex: 1; border: none; padding: 10px 16px; border-radius: 12px; font-weight: 700; font-size: 12px; cursor: pointer; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-transform: uppercase; letter-spacing: 0.5px; }
            .buy-btn { background: linear-gradient(to right, #0f172a, #1e3a8a); }
            .sell-btn { background: linear-gradient(to right, #b91c1c, #ef4444); }
            .avx-cp-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 5px; }
            .avx-foot-btn { display: flex; align-items: center; gap: 8px; color: #94a3b8; cursor: pointer; font-size: 13px; font-weight: 600; padding: 4px 8px; border-radius: 8px; }
            .avx-foot-btn:hover { color: var(--p-acc); background: #f8fafc; }
            .avx-foot-btn svg { width: 18px; }

            /* MODAL STYLES */
            .avx-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); z-index: 9999; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease; }
            .avx-modal.show { opacity: 1; }
            .avx-modal-card { background: #fff; width: 90%; max-width: 440px; border-radius: 32px; padding: 30px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(0.95); transition: transform 0.3s; }
            .avx-modal.show .avx-modal-card { transform: scale(1); }
            .avx-modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
            .avx-title { font-size: 28px; font-weight: 800; color: #0f172a; }
            .avx-badge { font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 8px; display: inline-block; text-transform: uppercase; margin-bottom:5px; }
            .avx-badge.buy { background: #e0e7ff; color: var(--p-acc); }
            .avx-badge.sell { background: #fee2e2; color: var(--p-red); }
            .avx-price-tag { font-family: 'Outfit', monospace; font-size: 18px; font-weight: 700; color: #334155; background: #f1f5f9; padding: 6px 12px; border-radius: 12px; }
            .avx-stat-row { display: flex; gap: 12px; margin-bottom: 24px; }
            .avx-stat-pill { flex: 1; background: #f8fafc; padding: 12px; border-radius: 16px; text-align: center; border: 1px solid #e2e8f0; }
            .avx-stat-pill small { display: block; font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px; text-transform: uppercase; }
            .avx-stat-pill span { font-weight: 700; font-size: 14px; color: #0f172a; }
            
            /* MARK TOGGLE UI */
            .am-mark-toggle-box { display:flex; flex-direction:column; align-items:flex-end; gap:5px; }
            .am-mark-toggle-box span { font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; }
            .am-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
            .am-switch input { opacity: 0; width: 0; height: 0; }
            .am-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; -webkit-transition: .4s; transition: .4s; border-radius: 34px; }
            .am-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; -webkit-transition: .4s; transition: .4s; border-radius: 50%; box-shadow:0 2px 4px rgba(0,0,0,0.2); }
            input:checked + .am-slider { background-color: #334155; }
            input:checked + .am-slider:before { transform: translateX(20px); }
            
            .am-live-price-strip { text-align:center; background:#f1f5f9; padding:8px; border-radius:12px; margin-bottom:15px; font-size:13px; color:#64748b; font-weight:600; }
            .am-live-price-strip span { color:#0f172a; font-family:'Outfit', monospace; }

            .avx-input-group label, .avx-inp-cont label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; display: block; }
            .avx-select-wrapper select { width: 100%; padding: 14px; border-radius: 16px; border: 2px solid #f1f5f9; background: #fff; font-weight: 600; outline: none; margin-bottom: 20px; }
            .avx-trade-inputs { display: flex; gap: 16px; margin-bottom: 20px; }
            .avx-inp-cont { flex: 1; }
            .avx-inp-cont input { width: 100%; padding: 16px; border-radius: 18px; border: 2px solid #f1f5f9; font-size: 20px; font-weight: 700; text-align: center; outline: none; color: #0f172a; background: #fff; }
            .avx-inp-cont input:focus { border-color: var(--p-acc); box-shadow: 0 0 0 4px rgba(51, 65, 85, 0.1); }
            .avx-btn-main { width: 100%; padding: 18px; border: none; border-radius: 20px; font-weight: 700; font-size: 16px; color: white; cursor: pointer; margin-bottom: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2); }
            .avx-btn-text { background: none; border: none; width: 100%; padding: 12px; color: #94a3b8; font-weight: 600; cursor: pointer; }
            
            /* HISTORY CARD STYLES */
            /* FIX SCROLL */
            .am-hist-container { 
                flex: 1; 
                overflow-y: auto; 
                padding: 10px 5px 40px 5px; 
                -ms-overflow-style: none;  /* IE and Edge */
                scrollbar-width: none;  /* Firefox */
            }
            .am-hist-container::-webkit-scrollbar {
                display: none;
            }

            .am-hist-card { background:#fff; border-radius:20px; padding:16px; margin-bottom:15px; border:1px solid #e2e8f0; position:relative; overflow:hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
            .am-hist-card.success { border-left: 5px solid #10b981; }
            .am-hist-card.failed { border-left: 5px solid #f43f5e; opacity:0.7; }
            .am-hist-card.pending { border-left: 5px solid #f59e0b; }
            
            .am-h-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:12px; border-bottom:1px dashed #f1f5f9; }
            .am-h-left { display:flex; gap:10px; align-items:center; }
            .am-h-icon { width:40px; height:40px; border-radius:12px; object-fit:cover; border:1px solid #f1f5f9; }
            .am-h-txt { width:40px; height:40px; border-radius:12px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; font-weight:800; color:#334155; font-size:16px; text-transform:uppercase; border:1px solid #e2e8f0; }
            
            .am-h-sym { font-weight:800; font-size:16px; color:#1e293b; }
            .am-h-tag { font-size:10px; padding:2px 6px; border-radius:4px; margin-left:5px; text-transform:uppercase; font-weight:700; }
            .am-h-tag.buy { background:#e0e7ff; color:#3730a3; }
            .am-h-tag.sell { background:#fee2e2; color:#991b1b; }
            .am-h-date { font-size:11px; color:#94a3b8; margin-top:2px; }
            .am-h-status { font-size:11px; font-weight:700; color:#64748b; background:#f8fafc; padding:4px 8px; border-radius:6px; }
            
            .am-h-body { display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:13px; }
            .am-h-row { display:flex; justify-content:space-between; }
            .am-h-row span { color:#94a3b8; }
            .am-h-row b { color:#334155; }
            
            .am-cancel-btn { width:100%; margin-top:12px; padding:10px; background:#fef2f2; color:#ef4444; border:1px solid #fee2e2; border-radius:10px; font-weight:700; font-size:12px; cursor:pointer; transition:0.2s; }
            .am-cancel-btn:active { background:#fee2e2; }
            
            /* PREMIUM ADMIN MSG */
            .am-admin-msg { 
                margin-top:12px; 
                padding:12px 16px; 
                background: linear-gradient(to right, #eff6ff, #ffffff);
                border-left: 4px solid #3b82f6;
                color:#1e3a8a; 
                font-size:13px; 
                border-radius:8px; 
                font-weight:600; 
                line-height:1.4;
                box-shadow: 0 2px 5px rgba(0,0,0,0.03);
                animation: fadeIn 0.3s ease;
            }
            @keyframes fadeIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }

            /* TOAST */
            #avx-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px); background: #fff; padding: 12px 24px; border-radius: 50px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px; opacity: 0; transition: 0.4s; z-index: 10000; pointer-events: none; }
            #avx-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
            .avx-toast-msg { font-size:14px; font-weight:600; color:#1e293b; }

            /* GRAPH & INFO MODALS */
            .avx-modal.full-screen .avx-modal-card { height: 85vh; display: flex; flex-direction: column; overflow: hidden; }
            .avx-graph-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .avx-graph-ctrls { display: flex; gap: 6px; margin-bottom: 20px; background: #f1f5f9; padding: 6px; border-radius: 16px; width: fit-content; }
            .avx-graph-ctrls button { padding: 8px 16px; border-radius: 12px; border: none; background: transparent; font-size: 13px; font-weight: 700; color: #64748b; cursor: pointer; }
            .avx-graph-ctrls button.active { background: #fff; color: #0f172a; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
            .avx-canvas-container { flex: 1; width: 100%; position: relative; min-height: 0; }
            .avx-hint { text-align: center; font-size: 12px; color: #cbd5e1; margin-top: 15px; font-weight: 500; }
            .avx-btn-close-icon { font-size: 28px; background: none; border: none; cursor: pointer; color: #94a3b8; }
            
            /* INFO */
            .avx-info-header { text-align: center; margin-bottom: 30px; }
            .avx-glow-icon { width: 80px; height: 80px; margin: 0 auto 16px; border-radius: 28px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: center; font-size: 36px; border: 1px solid #f1f5f9; }
            .avx-glow-icon img { width: 100%; height: 100%; border-radius: 28px; object-fit: cover; }
            .avx-info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; }
            .avx-ig-item { background: #f8fafc; padding: 16px 8px; border-radius: 18px; text-align: center; border: 1px solid #e2e8f0; }
            .avx-ig-item span { display: block; font-size: 10px; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; font-weight: 700; }
            .avx-ig-item b { font-size: 14px; color: #0f172a; font-weight: 700; }
            .avx-desc-box { font-size: 14px; line-height: 1.6; color: #475569; background: #f8fafc; padding: 18px; border-radius: 20px; margin-bottom: 24px; max-height: 140px; overflow-y: auto; border: 1px solid #e2e8f0; }
            .avx-links-row { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 15px; }
            .avx-link-chip { background: #e0e7ff; color: var(--p-acc); padding: 8px 16px; border-radius: 30px; text-decoration: none; font-size: 12px; font-weight: 700; }
        `;
        const style = document.createElement('style');
        style.id = 'avx-mark-css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---------- EXPOSE TO WINDOW ---------- */
    window.AVX_MARK = {
        openTrade,
        closeModals,
        openInfo,
        openGraph,
        setGraphType,
        toggleMarkMode,
        openHistory,
        cancelUserMark
    };

    /* ---------- BOOTSTRAP ---------- */
    document.addEventListener('DOMContentLoaded', initApp);

})();
