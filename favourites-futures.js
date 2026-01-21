/**
 * ==========================================================================================
 * MODULE: favourites-futures.js
 * DESCRIPTION: Premium Futures Favorites Trading Engine (Production Grade)
 * AUTHOR: AVX System
 * 
 * FEATURES:
 * 1. Persistent Favorites System (LocalStorage)
 * 2. Hybrid Price Engine (Live API + Volatility Simulation)
 * 3. Real-time Trading Execution (Long/Short)
 * 4. "Not Add Any Token" Empty State Logic
 * 5. Robust Error Handling & Auto-Retry
 * 6. Premium "Glass" UI with Animations
 * ==========================================================================================
 */

(function() {
    'use strict';

    /* ==========================================================================
       1. SYSTEM CONFIGURATION & CONSTANTS
       ========================================================================== */
    const CONFIG = {
        // Database Credentials
        SUPA_URL: 'https://hwrvqyipozrsxyjdpqag.supabase.co',
        SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM',
        
        // Target Container ID (Must match HTML)
        TARGET_CONTAINER: 'futures', 
        
        // LocalStorage Key (Unique to prevent conflict)
        STORAGE_KEY: 'avx_fav_futures_v3', 
        
        // Engine Settings
        REFRESH_RATE: 2000,           
        API_TIMEOUT: 5000,            
        
        // Database Tables
        TABLES: {
            WALLET: 'user_wallets',
            CONTROL: 'crypto_token_control',
            HISTORY: 'crypto_token_histry'
        }
    };

    /* ==========================================================================
       2. GLOBAL STATE
       ========================================================================== */
    const State = {
        isInitialized: false,
        user: null,
        walletBal: 0.00,
        
        // Data Store
        allTokens: [],      // All tokens from DB
        favSymbols: [],     // User's favorite symbols
        prices: {},         // Real-time prices
        holdings: {},       // User's holdings
        
        // Engine
        intervals: [],
        activeModal: null
    };

    /* ==========================================================================
       3. DEPENDENCY CHECK & INIT
       ========================================================================== */
    
    // 1. Get Supabase Client
    const supaLib = window.supabase || (window.parent && window.parent.supabase);
    let supa = null;

    // 2. Main Bootstrapper
    async function initApp() {
        injectPremiumStyles(); // Inject CSS first to prevent FOUC

        const root = document.getElementById(CONFIG.TARGET_CONTAINER);
        if (!root) {
            console.warn(`[AVX] Container #${CONFIG.TARGET_CONTAINER} not found. Retrying in 500ms...`);
            setTimeout(initApp, 500);
            return;
        }

        // Show Loader
        renderLoader(root, "Initializing Favorites...");

        // Verify Supabase
        if (!supaLib) {
            renderError(root, "System Error: Database SDK Missing");
            return;
        }
        supa = supaLib.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY);

        try {
            // Load LocalStorage Data
            StorageManager.load();

            // Authenticate
            const { data: { user }, error } = await supa.auth.getUser();
            if (error || !user) {
                renderError(root, "Please Log In to Manage Favorites", true);
                return;
            }
            State.user = user;

            // Fetch Data
            await Promise.all([
                fetchWallet(),
                fetchTokens(),
                fetchHoldings()
            ]);

            // Start Engine
            State.isInitialized = true;
            startPriceEngine();

            // Initial Render
            renderLayout(root);
            renderFavoritesList(); 

        } catch (err) {
            console.error("[Init] Error:", err);
            renderError(root, "Failed to load data. Please refresh.");
        }
    }

    /* ==========================================================================
       4. DATA LAYER
       ========================================================================== */

    async function fetchWallet() {
        const { data } = await supa.from(CONFIG.TABLES.WALLET).select('balance').eq('uid', State.user.id).single();
        if (data) State.walletBal = Number(data.balance);
    }

    async function fetchTokens() {
        const { data } = await supa.from(CONFIG.TABLES.CONTROL).select('*').order('id', { ascending: true });
        if (data) {
            State.allTokens = data;
            // Init Prices
            data.forEach(t => {
                if (!State.prices[t.symbol]) {
                    State.prices[t.symbol] = {
                        current: Number(t.manual_price || 0),
                        last: Number(t.manual_price || 0)
                    };
                }
            });
        }
    }

    async function fetchHoldings() {
        const { data } = await supa.from(CONFIG.TABLES.HISTORY).select('symbol, action, qty').eq('user_id', State.user.id);
        if (data) {
            const temp = {};
            data.forEach(row => {
                const s = row.symbol;
                const q = Number(row.qty);
                if (!temp[s]) temp[s] = 0;
                if (row.action === 'Buying') temp[s] += q;
                else if (row.action === 'Selling') temp[s] -= q;
            });
            // Filter zeros
            Object.keys(temp).forEach(k => { if (temp[k] <= 0.000001) delete temp[k]; });
            State.holdings = temp;
        }
    }

    /* ==========================================================================
       5. STORAGE MANAGER (LocalStorage)
       ========================================================================== */
    const StorageManager = {
        load: () => {
            try {
                const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    State.favSymbols = Array.isArray(parsed) ? parsed : [];
                } else {
                    State.favSymbols = [];
                }
            } catch (e) { State.favSymbols = []; }
        },
        save: () => {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(State.favSymbols));
        },
        add: (sym) => {
            if (!State.favSymbols.includes(sym)) {
                State.favSymbols.push(sym);
                StorageManager.save();
                return true;
            }
            return false;
        },
        remove: (sym) => {
            const oldLen = State.favSymbols.length;
            State.favSymbols = State.favSymbols.filter(s => s !== sym);
            if (State.favSymbols.length !== oldLen) {
                StorageManager.save();
                return true;
            }
            return false;
        }
    };

    /* ==========================================================================
       6. PRICE ENGINE
       ========================================================================== */
    function startPriceEngine() {
        State.intervals.forEach(clearInterval);
        State.intervals = [];

        const run = () => {
            // Live API
            State.allTokens.filter(t => t.is_live_api && t.api_url).forEach(async (t) => {
                try {
                    const res = await fetch(t.api_url);
                    const json = await res.json();
                    const key = Object.keys(json)[0];
                    if (key && json[key]?.inr) updateTokenPrice(t.symbol, Number(json[key].inr));
                } catch(e){}
            });

            // Manual Sim
            State.allTokens.filter(t => !t.is_live_api).forEach(t => {
                const cur = State.prices[t.symbol].current;
                const vol = cur * 0.002;
                let next = cur + (Math.random() - 0.5) * vol;
                // Bounds
                if (t.manual_min_price && next < t.manual_min_price) next = t.manual_min_price;
                if (t.manual_max_price && next > t.manual_max_price) next = t.manual_max_price;
                updateTokenPrice(t.symbol, next);
            });
        };

        run();
        State.intervals.push(setInterval(run, CONFIG.REFRESH_RATE));
    }

    function updateTokenPrice(sym, newPrice) {
        const oldPrice = State.prices[sym].current;
        State.prices[sym].current = newPrice;
        State.prices[sym].last = oldPrice;

        // UI Updates
        const el = document.getElementById(`ff-price-${sym}`);
        if (el) {
            el.textContent = fmtINR(newPrice);
            el.style.color = newPrice >= oldPrice ? '#10b981' : '#f43f5e';
            setTimeout(() => { if(el) el.style.color = '#1e293b'; }, 800);
        }

        // Modal Update
        const m = document.getElementById('ff-trade-modal');
        if (m && m.classList.contains('show') && m.dataset.sym === sym) {
            document.getElementById('ff-m-live-price').textContent = fmtINR(newPrice);
            // Auto Calc
            const qty = document.getElementById('ff-t-qty');
            const amt = document.getElementById('ff-t-amt');
            if (document.activeElement === qty && qty.value) {
                amt.value = (parseFloat(qty.value) * newPrice).toFixed(2);
            }
        }
    }

    /* ==========================================================================
       7. UI RENDERING
       ========================================================================== */
    
    function renderLayout(root) {
        root.innerHTML = `
            <div class="ff-header-bar">
                <div class="ff-head-info">
                    <div class="ff-head-title">Favorites</div>
                    <div class="ff-head-sub">Futures Market</div>
                </div>
                <button class="ff-add-btn" onclick="AVX_FAV.openAddModal()">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                    Add Token
                </button>
            </div>
            <div id="ff-list-container" class="ff-list-grid"></div>
        `;
    }

    function renderFavoritesList() {
        const container = document.getElementById('ff-list-container');
        if (!container) return;

        container.innerHTML = '';

        // EMPTY STATE
        if (State.favSymbols.length === 0) {
            container.innerHTML = `
                <div class="avx-empty-state">
                    <div class="avx-empty-icon">⭐</div>
                    <h2>Not Add Any Token</h2>
                    <p>Tap the "+ Add Token" button to build your watchlist.</p>
                </div>
            `;
            return;
        }

        // RENDER LIST
        State.favSymbols.forEach(sym => {
            const token = State.allTokens.find(t => t.symbol === sym);
            if (!token) return; // Clean up deleted tokens silently

            const price = State.prices[sym].current;
            
            let iconHTML = '';
            if (token.icon_type === 'image' && token.icon_url) {
                iconHTML = `<img src="${token.icon_url}" class="avx-icon-img">`;
            } else if (token.icon_url) {
                iconHTML = `<span class="avx-icon-emoji">${token.icon_url}</span>`;
            } else {
                iconHTML = `<span class="avx-icon-text">${token.symbol.substring(0, 2)}</span>`;
            }

            const card = document.createElement('div');
            card.className = 'avx-card-premium';
            card.id = `ff-card-${sym}`;
            card.innerHTML = `
                <button class="ff-remove-btn" onclick="AVX_FAV.removeFromFavorites('${sym}')">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
                </button>
                
                <div class="avx-cp-top">
                    <div class="avx-cp-icon">${iconHTML}</div>
                    <div class="avx-cp-details">
                        <span class="avx-cp-sym">${token.symbol}</span>
                        <span class="avx-cp-full">${token.full_name || token.name}</span>
                    </div>
                    <div class="avx-cp-price-box">
                        <div class="avx-cp-price" id="ff-price-${sym}">${fmtINR(price)}</div>
                    </div>
                </div>

                <div class="avx-cp-actions">
                    <button class="avx-btn-p buy-btn" onclick="AVX_FAV.openTrade('buy', '${sym}')">BUY / LONG</button>
                    <button class="avx-btn-p sell-btn" onclick="AVX_FAV.openTrade('sell', '${sym}')">SELL / SHORT</button>
                </div>

                <div class="avx-cp-footer">
                    <div class="avx-foot-btn" onclick="AVX_FAV.openGraph('${sym}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                        <span>Chart</span>
                    </div>
                    <div class="avx-foot-btn" onclick="AVX_FAV.openInfo('${sym}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        <span>Info</span>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function renderLoader(container, msg) {
        container.innerHTML = `
            <div class="avx-loader">
                <div class="avx-spinner-premium"></div>
                <p>${msg}</p>
            </div>`;
    }

    function renderError(container, msg, retry = false) {
        container.innerHTML = `
            <div class="avx-error-box">
                <div style="font-size:32px;margin-bottom:10px;">⚠️</div>
                <p>${msg}</p>
                ${retry ? '<button onclick="location.reload()" class="avx-btn-retry">Retry</button>' : ''}
            </div>`;
    }

    /* ==========================================================================
       8. MODAL LOGIC (ADD / TRADE)
       ========================================================================== */

    /* --- ADD TOKEN MODAL --- */
    function openAddModal() {
        let m = document.getElementById('ff-add-modal');
        if (!m) {
            m = document.createElement('div');
            m.id = 'ff-add-modal';
            m.className = 'avx-modal';
            m.innerHTML = `
                <div class="avx-modal-card add-card">
                    <div class="avx-modal-header">
                        <div class="avx-mh-left">
                            <span class="avx-title">Add To Favorites</span>
                            <span class="avx-subtitle">Select tokens to track</span>
                        </div>
                        <button class="avx-btn-close-icon" onclick="AVX_FAV.closeModals()">×</button>
                    </div>
                    <div class="ff-search-box">
                        <input type="text" id="ff-search-input" placeholder="Search tokens..." oninput="AVX_FAV.filterAddList(this.value)">
                    </div>
                    <div id="ff-add-list" class="ff-add-list"></div>
                </div>`;
            document.body.appendChild(m);
        }
        renderAddList();
        openModal(m);
    }

    function renderAddList(filter = '') {
        const listEl = document.getElementById('ff-add-list');
        if (!listEl) return;

        const avail = State.allTokens.filter(t => {
            const notFav = !State.favSymbols.includes(t.symbol);
            const matches = t.symbol.toLowerCase().includes(filter.toLowerCase()) || t.name.toLowerCase().includes(filter.toLowerCase());
            return notFav && matches;
        });

        if (avail.length === 0) {
            listEl.innerHTML = `<div class="avx-mini-empty"><p>${State.allTokens.length > 0 ? 'No results found' : 'Loading...'}</p></div>`;
            return;
        }

        listEl.innerHTML = avail.map(t => {
            let icon = `<div class="ff-add-char">${t.symbol[0]}</div>`;
            if (t.icon_type === 'image') icon = `<img src="${t.icon_url}" class="ff-add-img">`;
            
            return `
            <div class="ff-add-item" onclick="AVX_FAV.addToFavorites('${t.symbol}')">
                <div class="ff-item-left">
                    ${icon}
                    <div>
                        <div class="ff-item-sym">${t.symbol}</div>
                        <div class="ff-item-name">${t.name}</div>
                    </div>
                </div>
                <button class="ff-btn-plus">+</button>
            </div>`;
        }).join('');
    }

    function filterAddList(val) { renderAddList(val); }

    function addToFavorites(sym) {
        if (StorageManager.add(sym)) {
            toast(`${sym} Added`);
            renderFavoritesList();
            closeModals();
        }
    }

    function removeFromFavorites(sym) {
        if (confirm(`Remove ${sym} from favorites?`)) {
            if (StorageManager.remove(sym)) {
                toast(`${sym} Removed`);
                renderFavoritesList();
            }
        }
    }

    /* --- TRADE MODAL --- */
    function openTrade(type, sym) {
        // Build modal on demand
        if (!document.getElementById('ff-trade-modal')) {
            const m = document.createElement('div');
            m.id = 'ff-trade-modal';
            m.className = 'avx-modal';
            m.innerHTML = `
                <div class="avx-modal-card">
                    <div class="avx-modal-header">
                        <div class="avx-mh-left">
                            <span id="ff-m-type" class="avx-badge">BUY</span> 
                            <span id="ff-m-sym" class="avx-title">BTC</span>
                        </div>
                        <div class="avx-mh-right">
                            <div id="ff-m-live-price" class="avx-price-tag">₹0.00</div>
                        </div>
                    </div>
                    <div class="avx-stat-row">
                        <div class="avx-stat-pill"><small>Balance</small><span id="ff-m-bal">₹0.00</span></div>
                        <div class="avx-stat-pill"><small>Holding</small><span id="ff-m-hold">0.00</span></div>
                    </div>
                    <div class="avx-input-group">
                        <label>Network / Leverage</label>
                        <div class="avx-select-wrapper"><select id="ff-m-chain"></select></div>
                    </div>
                    <div class="avx-trade-inputs">
                        <div class="avx-inp-cont"><label>Total (INR)</label><input type="number" id="ff-t-amt" placeholder="0.00"></div>
                        <div class="avx-inp-cont"><label>Quantity</label><input type="number" id="ff-t-qty" placeholder="0.00"></div>
                    </div>
                    <button id="ff-confirm-btn" class="avx-btn-main">CONFIRM ORDER</button>
                    <button class="avx-btn-text" onclick="AVX_FAV.closeModals()">Cancel</button>
                </div>`;
            document.body.appendChild(m);
            setupTradeInputs();
        }

        const m = document.getElementById('ff-trade-modal');
        const token = State.allTokens.find(t => t.symbol === sym);
        if (!token) return;

        // Setup UI
        m.dataset.mode = type;
        m.dataset.sym = sym;
        document.getElementById('ff-t-amt').value = '';
        document.getElementById('ff-t-qty').value = '';
        
        const btn = document.getElementById('ff-confirm-btn');
        btn.innerHTML = 'CONFIRM ORDER';
        btn.disabled = false;
        btn.className = `avx-btn-main ${type}`; // Add class for styling

        document.getElementById('ff-m-type').textContent = type === 'buy' ? 'LONG' : 'SHORT';
        document.getElementById('ff-m-type').className = `avx-badge ${type}`;
        document.getElementById('ff-m-sym').textContent = sym;
        
        document.getElementById('ff-m-bal').textContent = fmtINR(State.walletBal);
        document.getElementById('ff-m-hold').textContent = fmtQty(State.holdings[sym] || 0);
        document.getElementById('ff-m-live-price').textContent = fmtINR(State.prices[sym].current);

        const sel = document.getElementById('ff-m-chain');
        sel.innerHTML = '';
        (token.blockchains || ['Mainnet']).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            sel.appendChild(opt);
        });

        openModal(m);
    }

    function setupTradeInputs() {
        const amt = document.getElementById('ff-t-amt');
        const qty = document.getElementById('ff-t-qty');
        const btn = document.getElementById('ff-confirm-btn');
        
        const getP = () => {
            const sym = document.getElementById('ff-trade-modal').dataset.sym;
            return State.prices[sym].current || 0;
        };

        amt.oninput = () => {
            const p = getP();
            if (p > 0 && amt.value) qty.value = (parseFloat(amt.value) / p).toFixed(6);
            else qty.value = '';
        };
        qty.oninput = () => {
            const p = getP();
            if (p > 0 && qty.value) amt.value = (parseFloat(qty.value) * p).toFixed(2);
            else amt.value = '';
        };
        btn.onclick = executeTrade;
    }

    async function executeTrade() {
        const m = document.getElementById('ff-trade-modal');
        const mode = m.dataset.mode;
        const sym = m.dataset.sym;
        const amt = parseFloat(document.getElementById('ff-t-amt').value);
        const qty = parseFloat(document.getElementById('ff-t-qty').value);
        const chain = document.getElementById('ff-m-chain').value;
        const price = State.prices[sym].current;

        if (!amt || !qty || amt <= 0) { toast("Invalid Amount", "err"); return; }
        if (mode === 'buy' && amt > State.walletBal) { toast("Insufficient Balance", "err"); return; }
        if (mode === 'sell' && qty > (State.holdings[sym] || 0)) { toast("Insufficient Holdings", "err"); return; }

        const btn = document.getElementById('ff-confirm-btn');
        btn.disabled = true;
        btn.innerHTML = `<div class="avx-spinner-btn"></div> Processing...`;

        try {
            const actionStr = mode === 'buy' ? 'Buying' : 'Selling';
            
            // 1. History
            const { error: hErr } = await supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id,
                symbol: sym,
                action: actionStr,
                qty: qty,
                price_at_transaction: price,
                total_amount: amt,
                blockchain_used: chain,
                status: 'active'
            });
            if (hErr) throw hErr;

            // 2. Wallet
            const newBal = mode === 'buy' ? State.walletBal - amt : State.walletBal + amt;
            await supa.from(CONFIG.TABLES.WALLET).update({ balance: newBal }).eq('uid', State.user.id);

            // 3. Update Local State
            State.walletBal = newBal;
            await fetchHoldings();
            
            toast(`Success: ${mode.toUpperCase()} ${sym}`);
            closeModals();

        } catch (e) {
            console.error(e);
            toast("Transaction Failed", "err");
        } finally {
            btn.disabled = false;
            btn.innerHTML = "CONFIRM ORDER";
        }
    }

    /* ==========================================================================
       9. UTILITIES & STYLES
       ========================================================================== */
    
    function fmtINR(v) { return '₹' + Number(v||0).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:4}); }
    function fmtQty(v) { return Number(v||0).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:6}); }

    function toast(msg, type='success') {
        let t = document.getElementById('avx-toast');
        if (t) t.remove();
        t = document.createElement('div');
        t.id = 'avx-toast';
        t.className = `avx-toast-container ${type}`;
        t.innerHTML = `<div class="avx-toast-icon">${type === 'success' ? '✅' : '⚠️'}</div><div class="avx-toast-text">${msg}</div>`;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
    }

    function openModal(el) {
        document.querySelectorAll('.avx-modal').forEach(m => m.classList.remove('show'));
        el.style.display = 'flex';
        setTimeout(() => el.classList.add('show'), 10);
    }

    function closeModals() {
        document.querySelectorAll('.avx-modal').forEach(m => {
            m.classList.remove('show');
            setTimeout(() => m.style.display = 'none', 300);
        });
    }

    function openGraph(sym) { if(window.AVX && window.AVX.openGraph) window.AVX.openGraph(sym); }
    function openInfo(sym) { if(window.AVX && window.AVX.openInfo) window.AVX.openInfo(sym); }

    function injectPremiumStyles() {
        if (document.getElementById('avx-fav-css')) return;
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
            :root { --p-bg: #f1f5f9; --p-card: #ffffff; --p-text: #1e293b; --p-acc: #6366f1; --p-green: #10b981; --p-red: #f43f5e; --p-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05); }
            body { font-family: 'Outfit', sans-serif !important; background: var(--p-bg); color: var(--p-text); }
            
            .ff-header-bar { display:flex; justify-content:space-between; align-items:center; padding:20px 0; margin-bottom:20px; }
            .ff-head-title { font-size:26px; font-weight:800; color:#334155; line-height:1; }
            .ff-head-sub { font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; margin-top:4px; }
            
            .ff-add-btn { display:flex; align-items:center; gap:8px; background:linear-gradient(135deg, #4f46e5, #4338ca); color:#fff; padding:12px 24px; border-radius:30px; border:none; font-weight:700; font-size:14px; cursor:pointer; box-shadow:0 8px 20px -5px rgba(79, 70, 229, 0.4); transition: transform 0.2s; }
            .ff-add-btn:active { transform:scale(0.97); }

            .avx-empty-state { background: #fff; border-radius: 24px; padding: 60px 20px; text-align: center; box-shadow: var(--p-shadow); border: 2px dashed #e2e8f0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
            .avx-empty-icon { font-size: 60px; margin-bottom: 20px; filter: grayscale(1) opacity(0.5); }
            .avx-empty-state h2 { font-size: 22px; color: #334155; margin: 0 0 10px 0; font-weight: 800; }
            .avx-empty-state p { font-size: 14px; color: #64748b; margin: 0; }

            .avx-card-premium { background: var(--p-card); border-radius: 28px; padding: 24px; margin-bottom: 20px; box-shadow: var(--p-shadow); border: 1px solid rgba(255,255,255,0.8); position: relative; transition: transform 0.2s; animation: fadeIn 0.5s ease; }
            @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
            .avx-card-premium:hover { transform: translateY(-3px); }
            
            .ff-remove-btn { position: absolute; top: 18px; right: 18px; width: 32px; height: 32px; border-radius: 50%; background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; z-index: 5; opacity: 0; transform: scale(0.8); }
            .avx-card-premium:hover .ff-remove-btn { opacity: 1; transform: scale(1); }
            .ff-remove-btn:hover { background: #ef4444; color: #fff; }

            .avx-cp-top { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding-right: 40px; }
            .avx-cp-icon { width: 56px; height: 56px; border-radius: 18px; background: #f8fafc; border: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: center; overflow: hidden; font-size: 24px; font-weight: 800; color: var(--p-acc); }
            .avx-icon-img { width: 100%; height: 100%; object-fit: cover; }
            .avx-cp-details { flex: 1; display:flex; flex-direction:column; justify-content: center; }
            .avx-cp-sym { font-weight: 800; font-size: 20px; color: var(--p-text); line-height: 1.2; }
            .avx-cp-full { font-weight: 500; font-size: 13px; color: #64748b; }
            .avx-cp-price-box { text-align: right; }
            .avx-cp-price { font-weight: 700; font-size: 20px; color: #1e293b; font-family: 'Outfit', monospace; transition: color 0.3s; }

            .avx-cp-actions { display: flex; gap: 12px; margin-bottom: 20px; }
            .avx-btn-p { flex: 1; padding: 14px; border: none; border-radius: 16px; font-weight: 700; font-size: 13px; cursor: pointer; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-transform: uppercase; letter-spacing: 0.5px; transition: transform 0.1s; }
            .buy-btn { background: linear-gradient(135deg, #0f172a, #334155); }
            .sell-btn { background: linear-gradient(135deg, #b91c1c, #ef4444); }
            .avx-btn-p:active { transform: scale(0.97); }

            .avx-cp-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 16px; }
            .avx-foot-btn { display: flex; align-items: center; gap: 6px; color: #94a3b8; cursor: pointer; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 10px; transition: 0.2s; }
            .avx-foot-btn:hover { background: #f1f5f9; color: var(--p-acc); }
            .avx-foot-btn svg { width: 18px; height: 18px; stroke-width: 2.5; }

            .add-card { height: 80vh; max-height: 600px; display: flex; flex-direction: column; }
            .ff-search-box { padding: 0 0 15px 0; border-bottom: 1px solid #f1f5f9; margin-bottom: 15px; }
            #ff-search-input { width: 100%; padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; font-size: 14px; font-weight: 600; color: #334155; outline: none; }
            .ff-add-list { flex: 1; overflow-y: auto; padding-right: 5px; }
            .ff-add-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-radius: 16px; margin-bottom: 10px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; background: #fff; }
            .ff-add-item:hover { background: #f8fafc; border-color: #e2e8f0; transform: translateX(4px); }
            .ff-item-left { display: flex; gap: 12px; align-items: center; }
            .ff-add-char { width: 40px; height: 40px; border-radius: 12px; background: #e0e7ff; color: #4338ca; font-weight: 800; display: flex; align-items: center; justify-content: center; }
            .ff-add-img { width: 40px; height: 40px; border-radius: 12px; object-fit: cover; }
            .ff-item-sym { font-weight: 800; font-size: 15px; color: #1e293b; }
            .ff-item-name { font-size: 11px; color: #64748b; font-weight: 500; }
            .ff-btn-plus { width: 32px; height: 32px; border-radius: 50%; border: none; background: #f1f5f9; color: #64748b; font-size: 18px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
            .ff-add-item:hover .ff-btn-plus { background: var(--p-acc); color: white; }

            .avx-loader { display:flex; flex-direction:column; align-items:center; padding:60px; color:#94a3b8; font-weight:500; }
            .avx-spinner-premium { width: 40px; height: 40px; border: 3px solid rgba(99, 102, 241, 0.1); border-top-color: var(--p-acc); border-radius: 50%; animation: spin 0.8s ease-in-out infinite; margin-bottom: 15px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            
            .avx-error-box { text-align: center; padding: 40px; background: #fff1f2; border-radius: 20px; border: 1px solid #fecdd3; color: #9f1239; }
            .avx-btn-retry { margin-top: 15px; padding: 10px 20px; background: #9f1239; color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; }

            .avx-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); z-index: 10000; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; }
            .avx-modal.show { opacity: 1; }
            .avx-modal-card { background: #fff; width: 90%; max-width: 440px; border-radius: 32px; padding: 30px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
            .avx-modal.show .avx-modal-card { transform: scale(1); }
            .avx-modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
            .avx-title { font-size: 24px; font-weight: 800; color: #0f172a; display: block; }
            .avx-subtitle { font-size: 12px; color: #64748b; font-weight: 500; display: block; margin-top: 2px; }
            .avx-btn-close-icon { background: none; border: none; font-size: 28px; color: #94a3b8; cursor: pointer; transition: 0.2s; }
            .avx-btn-close-icon:hover { color: #0f172a; }

            .avx-mh-left { display: flex; flex-direction: column; }
            .avx-badge { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; width: fit-content; margin-bottom: 6px; }
            .avx-badge.buy { background: #e0e7ff; color: #4338ca; }
            .avx-badge.sell { background: #ffe4e6; color: #be123c; }
            .avx-price-tag { font-family: 'Outfit', monospace; font-size: 18px; font-weight: 700; color: #334155; background: #f1f5f9; padding: 8px 14px; border-radius: 12px; }
            
            .avx-stat-row { display: flex; gap: 12px; margin-bottom: 24px; }
            .avx-stat-pill { flex: 1; background: #f8fafc; padding: 12px; border-radius: 16px; text-align: center; border: 1px solid #e2e8f0; }
            .avx-stat-pill small { display: block; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
            .avx-stat-pill span { font-weight: 700; font-size: 14px; color: #0f172a; }
            
            .avx-trade-inputs { display: flex; gap: 12px; margin-bottom: 24px; }
            .avx-inp-cont { flex: 1; }
            .avx-inp-cont label { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 8px; display: block; text-transform: uppercase; }
            .avx-inp-cont input { width: 100%; padding: 16px; border-radius: 18px; border: 2px solid #f1f5f9; font-size: 18px; font-weight: 700; text-align: center; outline: none; color: #0f172a; background: #fff; transition: 0.2s; }
            .avx-inp-cont input:focus { border-color: var(--p-acc); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
            
            .avx-btn-main { width: 100%; padding: 18px; border: none; border-radius: 18px; font-weight: 800; font-size: 16px; color: white; cursor: pointer; box-shadow: 0 10px 20px -5px rgba(0,0,0,0.15); transition: 0.2s; margin-bottom: 12px; }
            .avx-btn-main.buy { background: #1e3a8a; }
            .avx-btn-main.sell { background: #b91c1c; }
            .avx-btn-main:active { transform: scale(0.98); }
            .avx-btn-main:disabled { background: #94a3b8; cursor: not-allowed; transform: none; }
            .avx-spinner-btn { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; display: inline-block; vertical-align: middle; animation: spin 0.8s infinite linear; margin-right: 8px; }
            .avx-btn-text { width: 100%; padding: 12px; background: none; border: none; color: #94a3b8; font-weight: 600; cursor: pointer; transition: 0.2s; }
            .avx-btn-text:hover { color: #64748b; }
            
            .avx-input-group { margin-bottom: 20px; }
            .avx-input-group label { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 8px; display: block; text-transform: uppercase; }
            .avx-select-wrapper select { width: 100%; padding: 14px; border-radius: 16px; border: 2px solid #f1f5f9; background: #fff; font-weight: 600; outline: none; font-size: 14px; color: #334155; }

            .avx-toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px); background: #fff; padding: 12px 24px; border-radius: 50px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 12px; z-index: 20000; opacity: 0; transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events: none; }
            .avx-toast-container.show { transform: translateX(-50%) translateY(0); opacity: 1; }
            .avx-toast-icon { font-size: 18px; }
            .avx-toast-text { font-size: 14px; font-weight: 600; color: #1e293b; }
            @media (max-width: 480px) { .avx-modal-card { width: 95%; padding: 20px; } }
        `;
        const style = document.createElement('style');
        style.id = 'avx-fav-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // Expose API
    window.AVX_FAV = {
        openTrade, closeModals, openAddModal, addToFavorites, removeFromFavorites, openGraph, openInfo, filterAddList
    };

    // BOOTSTRAP
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

})();
