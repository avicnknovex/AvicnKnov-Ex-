
/* ==========================================================================
   futures-bletfa.js 
   --------------------------------------------------------------------------
   PREMIUM TRADING ENGINE: MANUAL & AI POWERED
   Target Container: <div id="bletfa">
   
   FEATURES:
   1. BLET TRADE: Classic Grid Trading (Original System)
   2. F&A TRADES: AI Chat Trading (New System)
   3. Real-time Database Sync (Supabase)
   4. Multi-Language Support (Hindi/English)
   5. Premium Graph & Info Modals (Fixed)
   
   AUTHOR: AVX AI
   VERSION: 6.0 (Final Polished)
   ========================================================================== */

(function() {
    'use strict';

    /* ==========================================================================
       1. SYSTEM CONFIGURATION
       ========================================================================== */
    const CONFIG = {
        // Database Credentials
        SUPA_URL: 'https://hwrvqyipozrsxyjdpqag.supabase.co',
        SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM',
        
        // System Settings
        CURRENT_FILE: 'futures-bletfa.js', 
        TARGET_CONTAINER: 'bletfa', 
        REFRESH_RATE: 2000, 
        
        // AI Settings
        MIN_TRADE_AMOUNT: 80, // Minimum ₹80
        AI_DELAY_MIN: 3000,   // 3 Seconds
        AI_DELAY_MAX: 5000,   // 5 Seconds
        
        // Database Tables
        TABLES: {
            WALLET: 'user_wallets',
            CONTROL: 'crypto_token_control',
            HISTORY: 'crypto_token_histry',
            AI_CTRL: 'trading_ai_control',
            AI_HIST: 'trading_ai_history'
        }
    };

    /* ==========================================================================
       2. GLOBAL STATE MANAGEMENT
       ========================================================================== */
    const State = {
        user: null,
        tokens: [], 
        prices: {}, 
        holdings: {}, 
        walletBal: 0,
        activeTab: 'manual', // 'manual' | 'ai'
        
        // Chart State
        chart: {
            symbol: null,
            data: [],
            type: 'line', // 'line' or 'candle'
            offset: 0
        },

        // AI Specific State
        ai: {
            name: 'Future Trading AI',
            icon: 'https://cdn-icons-png.flaticon.com/512/4712/4712038.png',
            lang: 'en', // 'en' | 'hi'
            userName: null,
            isTyping: false,
            chatData: []
        },
        
        // Internals
        intervals: [],
        timers: {}
    };

    /* ==========================================================================
       3. INITIALIZATION & SUPABASE CONNECTION
       ========================================================================== */
    const supaLib = window.supabase || (window.parent && window.parent.supabase);
    let supa = null;

    async function initApp() {
        // 1. Inject Styles first for smooth loading
        injectPremiumStyles();

        const app = document.getElementById(CONFIG.TARGET_CONTAINER);
        if (!app) {
            console.error("Target container #bletfa not found!");
            return;
        }

        // 2. Render Loading State
        app.innerHTML = `
            <div class="bf-loader-container">
                <div class="bf-spinner-premium"></div>
                <p>Initializing Premium Engine...</p>
            </div>
        `;

        // 3. Connect Supabase
        if (!supaLib) {
            app.innerHTML = `<div class="bf-error-box">⚠️ Supabase SDK Missing</div>`;
            return;
        }
        supa = supaLib.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY);

        // 4. Authenticate User
        const { data: { user } } = await supa.auth.getUser();
        if (!user) {
            app.innerHTML = `
                <div class="bf-empty-state">
                    <h2>Authentication Required</h2>
                    <p>Please login to access trading features.</p>
                </div>`;
            return;
        }
        State.user = user;

        // 5. Load All Data (Parallel Fetch)
        await Promise.all([
            fetchWallet(),
            fetchTokens(),
            fetchHoldings(),
            fetchAIConfig(),
            fetchAIHistory()
        ]);

        // 6. Build UI Layout
        renderMainLayout();

        // 7. Start Real-time Engines
        startPriceEngine();
        
        console.log("✅ Bletfa System Loaded");
    }

    /* --- Data Fetchers --- */
    async function fetchWallet() {
        const { data } = await supa.from(CONFIG.TABLES.WALLET).select('balance').eq('uid', State.user.id).single();
        if (data) State.walletBal = Number(data.balance);
    }

    async function fetchTokens() {
        const { data } = await supa.from(CONFIG.TABLES.CONTROL).select('*').order('id', { ascending: true });
        if (data) {
            // Filter tokens that support this file
            State.tokens = data.filter(t => {
                if (!t.nosupported_js) return true;
                return !t.nosupported_js.includes(CONFIG.CURRENT_FILE);
            });
            
            // Initialize Prices
            State.tokens.forEach(t => {
                State.prices[t.symbol] = {
                    current: Number(t.manual_price || 0),
                    last: Number(t.manual_price || 0),
                    change: Number(t.manual_change_percent || 0)
                };
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
            Object.keys(temp).forEach(k => { if (temp[k] <= 0.000001) delete temp[k]; });
            State.holdings = temp;
        }
    }

    async function fetchAIConfig() {
        const { data } = await supa.from(CONFIG.TABLES.AI_CTRL).select('*').limit(1).single();
        if (data) {
            State.ai.name = data.ai_name || State.ai.name;
            State.ai.icon = data.ai_icon_url || State.ai.icon;
        }
    }

    async function fetchAIHistory() {
        const { data } = await supa.from(CONFIG.TABLES.AI_HIST)
            .select('*')
            .eq('user_id', State.user.id)
            .order('created_at', { ascending: true });
        
        if (data) State.ai.chatData = data;
    }

    /* ==========================================================================
       4. PRICE ENGINE (HEARTBEAT)
       ========================================================================== */
    function startPriceEngine() {
        // Clear existing
        State.intervals.forEach(i => clearInterval(i));
        State.intervals = [];

        // 1. Live API Poller (10s)
        const apiTokens = State.tokens.filter(t => t.is_live_api && t.api_url);
        if (apiTokens.length > 0) {
            const apiInt = setInterval(() => {
                apiTokens.forEach(async (t) => {
                    try {
                        const res = await fetch(t.api_url);
                        const json = await res.json();
                        const key = Object.keys(json)[0];
                        if (key && json[key].inr) updateGlobalPrice(t.symbol, Number(json[key].inr));
                    } catch(e){}
                });
            }, 10000);
            State.intervals.push(apiInt);
        }

        // 2. Manual Simulation (2s)
        const manualTokens = State.tokens.filter(t => !t.is_live_api);
        const simInt = setInterval(() => {
            manualTokens.forEach(t => {
                const current = State.prices[t.symbol].current;
                const volatility = current * 0.002;
                const change = (Math.random() - 0.5) * volatility;
                let newPrice = current + change;
                
                // Bounds
                if (t.manual_min_price && newPrice < t.manual_min_price) newPrice = t.manual_min_price;
                if (t.manual_max_price && newPrice > t.manual_max_price) newPrice = t.manual_max_price;
                
                updateGlobalPrice(t.symbol, newPrice);
            });
        }, CONFIG.REFRESH_RATE);
        State.intervals.push(simInt);
    }

    function updateGlobalPrice(sym, newPrice) {
        const old = State.prices[sym].current;
        State.prices[sym].current = newPrice;
        State.prices[sym].last = old;
        const isUp = newPrice >= old;

        // 1. Update Manual Grid (BLET TRADE Tab)
        const gridPriceEl = document.getElementById(`bf-price-${sym}`);
        if (gridPriceEl) {
            gridPriceEl.textContent = fmtINR(newPrice);
            gridPriceEl.style.color = isUp ? '#10b981' : '#f43f5e';
        }

        // 2. Update Trade Modal if Open
        const modal = document.getElementById('avx-trade-modal-bf');
        if (modal && modal.classList.contains('show') && modal.dataset.sym === sym) {
            document.getElementById('avx-m-live-price-bf').textContent = fmtINR(newPrice);
            
            // Auto Update Calculation
            const qtyIn = document.getElementById('avx-t-qty-bf');
            const amtIn = document.getElementById('avx-t-amt-bf');
            if (document.activeElement === qtyIn && qtyIn.value) {
                amtIn.value = (parseFloat(qtyIn.value) * newPrice).toFixed(2);
            }
        }

        // 3. Update Graph Modal if Open
        const graphModal = document.getElementById('avx-graph-modal-bf');
        if(graphModal && graphModal.classList.contains('show')) {
            const titleSym = document.getElementById('avx-g-sym-bf').textContent;
            if(titleSym === sym) {
                document.getElementById('avx-g-price-bf').textContent = fmtINR(newPrice);
            }
        }
    }

    /* ==========================================================================
       5. MAIN LAYOUT RENDERING (TABS)
       ========================================================================== */
    function renderMainLayout() {
        const app = document.getElementById(CONFIG.TARGET_CONTAINER);
        app.innerHTML = `
            <!-- TAB NAVIGATION -->
            <div class="bf-nav-container">
                <div class="bf-nav-tabs">
                    <button class="bf-tab-btn active" id="tab-btn-manual" onclick="AVX_BF.switchTab('manual')">
                        <span class="tab-icon">📊</span> BLET TRADE
                    </button>
                    <button class="bf-tab-btn" id="tab-btn-ai" onclick="AVX_BF.switchTab('ai')">
                        <span class="tab-icon">🤖</span> F&A TRADES
                    </button>
                </div>
            </div>

            <!-- VIEW: MANUAL TRADING -->
            <div id="view-manual" class="bf-view active">
                <div id="bf-token-grid" class="bf-grid-layout"></div>
            </div>

            <!-- VIEW: AI TRADING -->
            <div id="view-ai" class="bf-view">
                <div id="bf-ai-interface" class="bf-ai-container"></div>
            </div>
        `;

        // Render contents
        renderManualGrid();
        renderAIInterface();
    }

    function switchTab(tabName) {
        State.activeTab = tabName;
        
        // Update Buttons
        document.querySelectorAll('.bf-tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`tab-btn-${tabName}`).classList.add('active');

        // Update Views
        document.querySelectorAll('.bf-view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${tabName}`).classList.add('active');

        // Trigger Scroll to bottom for AI
        if (tabName === 'ai') scrollChatToBottom();
    }

    /* ==========================================================================
       6. MANUAL TRADING SYSTEM (GRID)
       ========================================================================== */
    function renderManualGrid() {
        const container = document.getElementById('bf-token-grid');
        if (!container) return;

        if (State.tokens.length === 0) {
            container.innerHTML = `<div class="bf-empty">Market Offline</div>`;
            return;
        }

        container.innerHTML = State.tokens.map(t => {
            const p = State.prices[t.symbol] || { current: 0 };
            
            // Icon Logic
            let iconHTML = '';
            if (t.icon_type === 'image' && t.icon_url) {
                iconHTML = `<img src="${t.icon_url}" class="bf-card-img" alt="${t.symbol}">`;
            } else {
                iconHTML = `<span class="bf-card-txt">${t.symbol.substring(0,2)}</span>`;
            }

            return `
            <div class="avx-card-bf" id="bf-card-${t.symbol}">
                <!-- Top: Icon & Name Left aligned -->
                <div class="avx-bf-top">
                    <div class="avx-bf-icon">${iconHTML}</div>
                    <div class="avx-bf-details">
                        <span class="avx-bf-sym">${t.symbol}</span>
                        <span class="avx-bf-full">${t.full_name || t.name}</span>
                    </div>
                    <div class="avx-bf-price-box">
                        <div class="avx-bf-price" id="bf-price-${t.symbol}">${fmtINR(p.current)}</div>
                    </div>
                </div>

                <!-- Actions: Buy/Sell with Gradients -->
                <div class="avx-bf-actions">
                    <button class="avx-btn-bf buy-btn" onclick="AVX_BF.openManualTrade('buy', '${t.symbol}')">BUY</button>
                    <button class="avx-btn-bf sell-btn" onclick="AVX_BF.openManualTrade('sell', '${t.symbol}')">SELL</button>
                </div>

                <!-- Footer: Graph/Info -->
                <div class="avx-bf-footer">
                    <div class="avx-foot-btn" onclick="AVX_BF.openGraphBF('${t.symbol}')">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                        <span>Chart</span>
                    </div>
                    <div class="avx-foot-btn" onclick="AVX_BF.openInfoBF('${t.symbol}')">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        <span>Info</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    /* --- MANUAL TRADE MODAL --- */
    function buildManualModal() {
        if (document.getElementById('avx-trade-modal-bf')) return;
        const m = document.createElement('div');
        m.id = 'avx-trade-modal-bf';
        m.className = 'avx-modal';
        m.innerHTML = `
            <div class="avx-modal-card">
                <div class="avx-modal-header">
                    <div class="avx-mh-left">
                        <span id="avx-m-type-bf" class="avx-badge">BUY</span> 
                        <span id="avx-m-sym-bf" class="avx-title">BTC</span>
                    </div>
                    <div class="avx-mh-right">
                        <div id="avx-m-live-price-bf" class="avx-price-tag">₹0.00</div>
                    </div>
                </div>
                
                <div class="avx-stat-row">
                    <div class="avx-stat-pill"><small>Balance</small><span id="avx-m-bal-bf">₹0.00</span></div>
                    <div class="avx-stat-pill"><small>Holding</small><span id="avx-m-hold-bf">0.00</span></div>
                </div>

                <div id="avx-price-warning-bf" class="avx-warning-box" style="display:none;">⚠️ Wait for price...</div>

                <div class="avx-input-group">
                    <label>Network</label>
                    <div class="avx-select-wrapper">
                        <select id="avx-m-chain-bf"></select>
                    </div>
                </div>

                <div class="avx-trade-inputs">
                    <div class="avx-inp-cont">
                        <label>Total (INR)</label>
                        <input type="number" id="avx-t-amt-bf" placeholder="0.00">
                    </div>
                    <div class="avx-inp-cont">
                        <label>Quantity</label>
                        <input type="number" id="avx-t-qty-bf" placeholder="0.00">
                    </div>
                </div>

                <button id="avx-confirm-btn-bf" class="avx-btn-main">CONFIRM ORDER</button>
                <button class="avx-btn-text" onclick="AVX_BF.closeModals()">Cancel</button>
            </div>
        `;
        document.body.appendChild(m);

        // Bind Calculations
        const amt = m.querySelector('#avx-t-amt-bf');
        const qty = m.querySelector('#avx-t-qty-bf');
        
        const getP = () => {
            const s = m.dataset.sym;
            return State.prices[s]?.current || 0;
        };

        amt.addEventListener('input', () => {
            const p = getP();
            if(p > 0 && amt.value) qty.value = (parseFloat(amt.value)/p).toFixed(6); else qty.value = '';
        });
        qty.addEventListener('input', () => {
            const p = getP();
            if(p > 0 && qty.value) amt.value = (parseFloat(qty.value)*p).toFixed(2); else amt.value = '';
        });

        m.querySelector('#avx-confirm-btn-bf').onclick = executeManualTransaction;
    }

    function openManualTrade(type, sym) {
        buildManualModal();
        const m = document.getElementById('avx-trade-modal-bf');
        const t = State.tokens.find(tk => tk.symbol === sym);
        if(!t) return;

        m.dataset.mode = type;
        m.dataset.sym = sym;
        
        document.getElementById('avx-t-amt-bf').value = '';
        document.getElementById('avx-t-qty-bf').value = '';
        
        const typeEl = document.getElementById('avx-m-type-bf');
        typeEl.textContent = type.toUpperCase();
        typeEl.className = type === 'buy' ? 'avx-badge buy' : 'avx-badge sell';
        
        document.getElementById('avx-m-sym-bf').textContent = sym;
        const btn = document.getElementById('avx-confirm-btn-bf');
        btn.textContent = `${type.toUpperCase()} ${sym}`;
        btn.className = type === 'buy' ? 'avx-btn-main buy' : 'avx-btn-main sell';

        document.getElementById('avx-m-bal-bf').textContent = fmtINR(State.walletBal);
        document.getElementById('avx-m-hold-bf').textContent = `${fmtQty(State.holdings[sym] || 0)} ${sym}`;
        document.getElementById('avx-m-live-price-bf').textContent = fmtINR(State.prices[sym].current);

        const sel = document.getElementById('avx-m-chain-bf');
        sel.innerHTML = '';
        (t.blockchains || ['Bletfa Chain']).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            sel.appendChild(opt);
        });

        openModal(m);
    }

    async function executeManualTransaction() {
        const m = document.getElementById('avx-trade-modal-bf');
        const mode = m.dataset.mode;
        const sym = m.dataset.sym;
        const amt = parseFloat(document.getElementById('avx-t-amt-bf').value);
        const qty = parseFloat(document.getElementById('avx-t-qty-bf').value);
        const chain = document.getElementById('avx-m-chain-bf').value;
        const price = State.prices[sym].current;

        if(!amt || !qty || amt <= 0) { toast("Invalid Amount", "err"); return; }
        if(price <= 0) { toast("Wait for price...", "err"); return; }

        if(mode === 'buy' && amt > State.walletBal) { toast("Insufficient Balance", "err"); return; }
        if(mode === 'sell' && qty > (State.holdings[sym]||0)) { toast("Insufficient Holdings", "err"); return; }

        const btn = document.getElementById('avx-confirm-btn-bf');
        btn.disabled = true;
        btn.textContent = "Processing...";

        try {
            // DB Actions: Buying / Selling
            const actionText = mode === 'buy' ? 'Buying' : 'Selling';
            const { error: hErr } = await supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id,
                symbol: sym,
                action: actionText,
                qty: qty,
                price_at_transaction: price,
                total_amount: amt,
                blockchain_used: chain,
                status: 'active'
            });
            if(hErr) throw hErr;

            const newBal = mode === 'buy' ? State.walletBal - amt : State.walletBal + amt;
            await supa.from(CONFIG.TABLES.WALLET).update({ balance: newBal }).eq('uid', State.user.id);

            State.walletBal = newBal;
            await fetchHoldings();
            
            toast(`Success: ${mode.toUpperCase()} ${sym}`);
            closeModals();

        } catch (e) {
            console.error(e);
            toast("Transaction Failed", "err");
        }
        btn.disabled = false;
    }

    /* ==========================================================================
       7. PREMIUM INFO & GRAPH MODALS (FIXED)
       ========================================================================== */

    // --- INFO MODAL BUILDER ---
    function buildInfoModal() {
        if(document.getElementById('avx-info-modal-bf')) return;
        const m = document.createElement('div');
        m.id = 'avx-info-modal-bf';
        m.className = 'avx-modal';
        m.innerHTML = `
            <div class="avx-modal-card">
                <div class="avx-info-header">
                    <div id="avx-i-icon-box-bf" class="avx-glow-icon"></div>
                    <h2 id="avx-i-name-bf">BTC</h2>
                    <p id="avx-i-full-bf">Bitcoin</p>
                </div>
                <div class="avx-info-grid">
                    <div class="avx-ig-item"><span>Supply</span><b id="avx-i-supp-bf">--</b></div>
                    <div class="avx-ig-item"><span>Volume</span><b id="avx-i-vol-bf">--</b></div>
                    <div class="avx-ig-item"><span>Holders</span><b id="avx-i-hold-bf">--</b></div>
                </div>
                <div class="avx-desc-box" id="avx-i-desc-bf"></div>
                <div class="avx-links-row" id="avx-i-links-bf"></div>
                <button class="avx-btn-text" onclick="AVX_BF.closeModals()">Close</button>
            </div>`;
        document.body.appendChild(m);
    }

    // --- GRAPH MODAL BUILDER ---
    function buildGraphModal() {
        if(document.getElementById('avx-graph-modal-bf')) return;
        const m = document.createElement('div');
        m.id = 'avx-graph-modal-bf';
        m.className = 'avx-modal full-screen';
        m.innerHTML = `
            <div class="avx-modal-card graph-mode">
                <div class="avx-graph-top">
                    <div>
                        <span id="avx-g-sym-bf">BTC</span>
                        <span id="avx-g-price-bf">₹00.00</span>
                    </div>
                    <button class="avx-btn-close-icon" onclick="AVX_BF.closeModals()">×</button>
                </div>
                <div class="avx-graph-ctrls">
                    <button class="active" onclick="AVX_BF.setGraphType('line')">Line</button>
                    <button onclick="AVX_BF.setGraphType('candle')">Candle</button>
                </div>
                <div class="avx-canvas-container">
                    <canvas id="avx-chart-bf" width="350" height="280"></canvas>
                </div>
                <p class="avx-hint">Swipe to scroll history</p>
            </div>`;
        document.body.appendChild(m);
        initChartInteractions();
    }

    // --- OPEN INFO LOGIC ---
    function openInfoBF(sym) {
        buildInfoModal();
        let m = document.getElementById('avx-info-modal-bf');
        
        const t = State.tokens.find(tok => tok.symbol === sym);
        if(!t) return;

        let iconHTML = '';
        if (t.icon_type === 'image' && t.icon_url) {
            iconHTML = `<img src="${t.icon_url}">`;
        } else {
            iconHTML = `<span>${t.symbol.substring(0,2)}</span>`;
        }
        document.getElementById('avx-i-icon-box-bf').innerHTML = iconHTML;
        document.getElementById('avx-i-name-bf').textContent = t.symbol;
        document.getElementById('avx-i-full-bf').textContent = t.full_name;
        
        document.getElementById('avx-i-supp-bf').textContent = t.total_supply || 'N/A';
        document.getElementById('avx-i-vol-bf').textContent = t.volume || 'N/A';
        document.getElementById('avx-i-hold-bf').textContent = t.holders || 'N/A';
        document.getElementById('avx-i-desc-bf').textContent = t.description || "No description available.";

        const linksDiv = document.getElementById('avx-i-links-bf');
        linksDiv.innerHTML = '';
        if(t.social_links) {
            Object.entries(t.social_links).forEach(([key, url]) => {
                linksDiv.innerHTML += `<a href="${url}" target="_blank" class="avx-link-chip">${key} ↗</a>`;
            });
        }
        openModal(m);
    }

    // --- OPEN GRAPH LOGIC ---
    function openGraphBF(sym) {
        buildGraphModal();
        let m = document.getElementById('avx-graph-modal-bf');
        
        State.chart.symbol = sym;
        State.chart.offset = 0;
        document.getElementById('avx-g-sym-bf').textContent = sym;
        
        const current = State.prices[sym].current;
        document.getElementById('avx-g-price-bf').textContent = fmtINR(current);
        
        State.chart.data = generateHistory(current);
        openModal(m);
        requestAnimationFrame(drawChart);
    }

    function setGraphType(type) {
        State.chart.type = type;
        const btns = document.querySelectorAll('#avx-graph-modal-bf .avx-graph-ctrls button');
        btns.forEach(b => b.classList.remove('active'));
        if(event && event.target) event.target.classList.add('active');
        drawChart();
    }

    // --- CHART DRAWING LOGIC ---
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
        const c = document.getElementById('avx-chart-bf');
        if(!c || !c.offsetParent) return;
        const ctx = c.getContext('2d');
        const w = c.width;
        const h = c.height;
        ctx.clearRect(0,0,w,h);

        const data = State.chart.data;
        const count = 30;
        const step = w / count;
        const start = Math.max(0, State.chart.offset);
        const end = Math.min(data.length, start + count);
        const slice = data.slice(start, end);
        
        if(slice.length === 0) return;

        const maxVal = Math.max(...slice.map(d => d.high));
        const minVal = Math.min(...slice.map(d => d.low));
        const range = maxVal - minVal || 1;
        const pad = 20;
        const getY = (val) => h - pad - ((val - minVal) / range) * (h - 2*pad);

        // Styling for Bletfa (Sky Blue)
        const grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, "rgba(255, 255, 255, 0)");
        grd.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0,0,w,h);

        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, getY(minVal)); ctx.lineTo(w, getY(minVal));
        ctx.moveTo(0, getY(maxVal)); ctx.lineTo(w, getY(maxVal));
        ctx.stroke();

        if(State.chart.type === 'line') {
            ctx.beginPath();
            ctx.strokeStyle = '#0ea5e9'; // Sky Blue
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            slice.forEach((d, i) => {
                const x = w - (i * step) - (step/2);
                const y = getY(d.close);
                if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
            });
            ctx.stroke();
            ctx.lineTo(w - ((slice.length-1)*step), h);
            ctx.lineTo(w, h);
            const gradFill = ctx.createLinearGradient(0, 0, 0, h);
            gradFill.addColorStop(0, "rgba(14, 165, 233, 0.2)");
            gradFill.addColorStop(1, "rgba(14, 165, 233, 0)");
            ctx.fillStyle = gradFill;
            ctx.fill();
        } else {
            const barW = step * 0.5;
            slice.forEach((d, i) => {
                const x = w - (i * step) - (step/2);
                const isGreen = d.close >= d.open;
                ctx.fillStyle = isGreen ? '#10b981' : '#f43f5e';
                ctx.fillRect(x-1, getY(d.high), 2, getY(d.low) - getY(d.high));
                const yOpen = getY(d.open);
                const yClose = getY(d.close);
                ctx.fillRect(x - barW/2, Math.min(yOpen, yClose), barW, Math.abs(yOpen - yClose) || 1);
            });
        }
        
        if(document.getElementById('avx-graph-modal-bf').classList.contains('show')) {
            requestAnimationFrame(drawChart);
        }
    }

    function initChartInteractions() {
        const c = document.getElementById('avx-chart-bf');
        let isDrag = false, startX = 0;
        const start = (x) => { isDrag = true; startX = x; };
        const move = (x) => {
            if(!isDrag) return;
            const dx = x - startX;
            if(Math.abs(dx) > 5) {
                State.chart.offset -= Math.sign(dx);
                if(State.chart.offset < 0) State.chart.offset = 0;
                startX = x;
            }
        };
        c.addEventListener('mousedown', e => start(e.offsetX));
        c.addEventListener('mousemove', e => move(e.offsetX));
        c.addEventListener('mouseup', () => isDrag = false);
        c.addEventListener('touchstart', e => start(e.touches[0].clientX));
        c.addEventListener('touchmove', e => move(e.touches[0].clientX));
    }

    /* ==========================================================================
       8. AI TRADING SYSTEM (F&A TRADES)
       ========================================================================== */
    function renderAIInterface() {
        const container = document.getElementById('bf-ai-interface');
        if (!container) return;

        container.innerHTML = `
            <div class="ai-header-premium">
                <div class="ai-profile-left">
                    <div class="ai-avatar-box">
                        <img src="${State.ai.icon}" alt="AI">
                        <div class="ai-status-dot"></div>
                    </div>
                    <div class="ai-info-text">
                        <span class="ai-name-disp">${State.ai.name}</span>
                        <span class="ai-role-disp">Advanced Trading Bot</span>
                    </div>
                </div>
                <div class="ai-controls-right">
                    <button class="ai-lang-btn" onclick="AVX_BF.toggleLanguage()">
                        <span id="ai-lang-icon">EN</span>
                    </button>
                </div>
            </div>

            <div id="ai-messages-area" class="ai-chat-body">
                <!-- Messages will load here -->
            </div>

            <div class="ai-input-wrapper">
                <input type="text" id="ai-input-field" placeholder="Type a message (e.g., Buy BTC for 100)" autocomplete="off">
                <button id="ai-send-btn" onclick="AVX_BF.sendAIMessage()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
            </div>
        `;

        // Bind Enter Key
        document.getElementById('ai-input-field').addEventListener('keypress', (e) => {
            if(e.key === 'Enter') sendAIMessage();
        });

        // Load History or Greeting
        if(State.ai.chatData.length > 0) {
            renderChatHistory();
        } else {
            const greeting = State.ai.lang === 'en' 
                ? "Hello! I am your Future Trading AI. I can help you trade, check prices, and manage holdings. What is your name?"
                : "नमस्ते! मैं आपका फ्यूचर ट्रेडिंग एआई हूँ। मैं ट्रेडिंग, कीमतों और होल्डिंग्स में आपकी मदद कर सकता हूँ। आपका नाम क्या है?";
            
            // Artificial delay for greeting if new
            setTimeout(() => addMessageToUI('ai', greeting, [], new Date()), 500);
        }
    }

    function renderChatHistory() {
        const area = document.getElementById('ai-messages-area');
        area.innerHTML = '';
        State.ai.chatData.forEach(msg => {
            addMessageToUI(msg.sender, msg.message, [], msg.created_at, false);
        });
        scrollChatToBottom();
    }

    function scrollChatToBottom() {
        const area = document.getElementById('ai-messages-area');
        if(area) area.scrollTop = area.scrollHeight;
    }

    function toggleLanguage() {
        State.ai.lang = State.ai.lang === 'en' ? 'hi' : 'en';
        document.getElementById('ai-lang-icon').textContent = State.ai.lang.toUpperCase();
        
        const msg = State.ai.lang === 'hi' 
            ? "भाषा हिंदी में बदल दी गई है। अब आप हिंदी में बात कर सकते हैं।" 
            : "Language switched to English. How can I assist you?";
        
        addMessageToUI('ai', msg);
    }

    async function sendAIMessage() {
        const input = document.getElementById('ai-input-field');
        const text = input.value.trim();
        if(!text) return;

        // 1. Add User Message
        addMessageToUI('user', text);
        input.value = '';

        // 2. Handle Clear Command
        if(text.toLowerCase().includes('delete chat') || text.toLowerCase().includes('clear chat')) {
            document.getElementById('ai-messages-area').innerHTML = '';
            await supa.from(CONFIG.TABLES.AI_HIST).delete().eq('user_id', State.user.id);
            State.ai.chatData = [];
            addMessageToUI('ai', State.ai.lang === 'en' ? "Chat history cleared." : "चैट इतिहास मिटा दिया गया है।");
            return;
        }

        // 3. Show Typing Indicator
        showTyping();

        // 4. Determine Reply (Logic)
        const responseData = await processAIIntent(text);

        // 5. Artificial Delay (3-5 seconds)
        const delay = Math.floor(Math.random() * (CONFIG.AI_DELAY_MAX - CONFIG.AI_DELAY_MIN + 1)) + CONFIG.AI_DELAY_MIN;

        setTimeout(async () => {
            hideTyping();
            addMessageToUI('ai', responseData.text, responseData.buttons);
            
            // 6. Log to DB
            await supa.from(CONFIG.TABLES.AI_HIST).insert([
                { user_id: State.user.id, sender: 'user', message: text, intent: 'chat' },
                { user_id: State.user.id, sender: 'ai', message: responseData.text, intent: 'reply' }
            ]);
        }, delay);
    }

    function addMessageToUI(sender, text, buttons = [], timestamp = new Date(), animate = true) {
        const area = document.getElementById('ai-messages-area');
        if(!area) return;

        const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const div = document.createElement('div');
        div.className = `ai-msg-row ${sender} ${animate ? 'anim-pop' : ''}`;
        
        let contentHtml = `<div class="ai-bubble ${sender}">${text}<span class="ai-time">${timeStr}</span></div>`;
        
        if (sender === 'ai') {
            // Buttons logic
            let btnsHtml = '';
            if(buttons && buttons.length > 0) {
                btnsHtml = `<div class="ai-msg-actions">
                    ${buttons.map(b => `<button onclick="window.open('${b.url}', '_blank')">${b.label} ↗</button>`).join('')}
                </div>`;
            }

            div.innerHTML = `
                <div class="ai-avatar-tiny"><img src="${State.ai.icon}"></div>
                <div class="ai-msg-col">
                    ${contentHtml}
                    ${btnsHtml}
                </div>
            `;
        } else {
            div.innerHTML = contentHtml;
        }

        area.appendChild(div);
        scrollChatToBottom();
    }

    function showTyping() {
        const area = document.getElementById('ai-messages-area');
        const div = document.createElement('div');
        div.id = 'ai-typing-indicator';
        div.className = 'ai-msg-row ai anim-pop';
        div.innerHTML = `
            <div class="ai-avatar-tiny"><img src="${State.ai.icon}"></div>
            <div class="ai-bubble ai typing">
                <span>●</span><span>●</span><span>●</span>
            </div>
        `;
        area.appendChild(div);
        scrollChatToBottom();
    }

    function hideTyping() {
        const el = document.getElementById('ai-typing-indicator');
        if(el) el.remove();
    }

    /* --- AI BRAIN (INTENT PROCESSING) --- */
    async function processAIIntent(input) {
        const lower = input.toLowerCase();
        const lang = State.ai.lang;
        const greetingPrefix = State.ai.userName ? (lang==='en' ? `${State.ai.userName}, ` : `${State.ai.userName}, `) : '';

        // 1. Name Capture
        if (!State.ai.userName && (lower.includes('name is') || lower.split(' ').length <= 2)) {
            const name = lower.replace('my name is', '').replace('mera naam', '').replace('hai', '').trim();
            if (name.length > 0) {
                State.ai.userName = name.charAt(0).toUpperCase() + name.slice(1);
                return { 
                    text: lang==='en' 
                        ? `Nice to meet you, ${State.ai.userName}! I am ready to help you trade.` 
                        : `Apse milkar khushi hui, ${State.ai.userName}! Main trading mein aapki madad kar sakta hoon.` 
                };
            }
        }

        // 2. Token Matching
        const tokenMatch = State.tokens.find(t => lower.includes(t.symbol.toLowerCase()) || lower.includes(t.name.toLowerCase()));
        
        if (tokenMatch) {
            const sym = tokenMatch.symbol;
            const price = State.prices[sym].current;

            // PRICE INFO
            if (lower.includes('price') || lower.includes('rate') || lower.includes('bhav') || lower.includes('detail')) {
                const change = State.prices[sym].change;
                const buttons = tokenMatch.social_links ? Object.entries(tokenMatch.social_links).map(([k,v]) => ({label: k, url: v})) : [];
                
                const msg = lang==='en'
                    ? `${greetingPrefix}Here is the info for ${tokenMatch.full_name} (${sym}):\n💰 Price: ${fmtINR(price)}\n📉 24h Change: ${change}%\n📦 Supply: ${tokenMatch.total_supply}\n👥 Holders: ${tokenMatch.holders}`
                    : `${greetingPrefix}Ye rahi ${tokenMatch.full_name} (${sym}) ki jankari:\n💰 Keemat: ${fmtINR(price)}\n📉 24h Badlav: ${change}%\n📦 Supply: ${tokenMatch.total_supply}\n👥 Holders: ${tokenMatch.holders}`;
                
                return { text: msg, buttons: buttons };
            }

            // BUY / SELL EXECUTION
            if (lower.includes('buy') || lower.includes('kharido') || lower.includes('sell') || lower.includes('becho')) {
                const type = (lower.includes('buy') || lower.includes('kharido')) ? 'buy' : 'sell';
                
                const qtyMatch = lower.match(/(\d+(\.\d+)?)(\s*)(qty|quantity|token)/);
                const amtMatch = lower.match(/(\d+(\.\d+)?)(\s*)(amount|inr|rs|rupees|rupaye)/);

                let tradeQty = 0;
                let tradeAmt = 0;

                if (qtyMatch) {
                    tradeQty = parseFloat(qtyMatch[1]);
                    tradeAmt = tradeQty * price;
                } else if (amtMatch) {
                    tradeAmt = parseFloat(amtMatch[1]);
                    tradeQty = tradeAmt / price;
                } else {
                    return { text: lang==='en' 
                        ? `Please specify quantity or amount. Example: "Buy 100 rs ${sym}" or "Sell 5 qty ${sym}"` 
                        : `Kripya matra ya rashi batayein. Udaharan: "100 rupaye ka ${sym} kharido"` };
                }

                // VALIDATION
                if (tradeAmt < CONFIG.MIN_TRADE_AMOUNT) {
                    return { text: lang==='en' 
                        ? `⚠️ Minimum trade amount is ₹${CONFIG.MIN_TRADE_AMOUNT}.` 
                        : `⚠️ Kam se kam trade rashi ₹${CONFIG.MIN_TRADE_AMOUNT} honi chahiye.` };
                }

                if (type === 'buy' && tradeAmt > State.walletBal) {
                    return { text: lang==='en' ? "❌ Insufficient Wallet Balance." : "❌ Wallet mein paryapt balance nahi hai." };
                }
                if (type === 'sell') {
                    const held = State.holdings[sym] || 0;
                    if (tradeQty > held) return { text: lang==='en' ? `❌ Insufficient Holdings. You have ${fmtQty(held)} ${sym}.` : `❌ Aapke paas keval ${fmtQty(held)} ${sym} hai.` };
                }

                // EXECUTE VIA DB
                try {
                    const actionStr = type === 'buy' ? 'Buying' : 'Selling';
                    const { error } = await supa.from(CONFIG.TABLES.HISTORY).insert({
                        user_id: State.user.id,
                        symbol: sym,
                        action: actionStr,
                        qty: tradeQty,
                        price_at_transaction: price,
                        total_amount: tradeAmt,
                        blockchain_used: 'AI_Assistant',
                        status: 'active'
                    });
                    
                    if (error) throw error;

                    // Update Wallet
                    const newBal = type === 'buy' ? State.walletBal - tradeAmt : State.walletBal + tradeAmt;
                    await supa.from(CONFIG.TABLES.WALLET).update({ balance: newBal }).eq('uid', State.user.id);
                    
                    // Refresh Local State
                    State.walletBal = newBal;
                    await fetchHoldings();

                    return { text: lang==='en'
                        ? `✅ Success! ${actionStr} ${fmtQty(tradeQty)} ${sym} for ${fmtINR(tradeAmt)}. New Balance: ${fmtINR(newBal)}.`
                        : `✅ Safal! ${fmtQty(tradeQty)} ${sym} ${type==='buy'?'kharida':'becha'} gaya. Naya Balance: ${fmtINR(newBal)}.`
                    };

                } catch (e) {
                    console.error(e);
                    return { text: lang==='en' ? "⚠️ Transaction Failed due to system error." : "⚠️ Error ke karan transaction fail ho gaya." };
                }
            }
        }

        // 3. Wallet / Balance
        if (lower.includes('balance') || lower.includes('wallet') || lower.includes('paisa')) {
            return { text: lang==='en' 
                ? `${greetingPrefix}Your current wallet balance is ${fmtINR(State.walletBal)}.` 
                : `${greetingPrefix}Aapka wallet balance ${fmtINR(State.walletBal)} hai.` };
        }

        // 4. Holdings
        if (lower.includes('holding') || lower.includes('portfolio')) {
            const items = Object.keys(State.holdings);
            if (items.length === 0) return { text: lang==='en' ? "You have no active holdings." : "Aapke paas koi holding nahi hai." };
            
            const list = items.map(k => `${k}: ${fmtQty(State.holdings[k])}`).join('\n');
            return { text: (lang==='en' ? "Your Holdings:\n" : "Aapki Holdings:\n") + list };
        }

        // 5. Fallback
        return { text: lang==='en' 
            ? "I am not sure about that. I can help with Trading, Prices, Wallet, and Holdings." 
            : "Mujhe iski jankari nahi hai. Main Trading, Price, Wallet aur Holdings mein madad kar sakta hoon." };
    }

    /* ==========================================================================
       9. UTILITY FUNCTIONS (Modals, Formats)
       ========================================================================== */
    function fmtINR(v) { return '₹' + Number(v||0).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:4}); }
    function fmtQty(v) { return Number(v||0).toLocaleString('en-US', {maximumFractionDigits:6}); }

    function toast(msg, type='success') {
        let t = document.getElementById('avx-toast');
        if(!t) { t = document.createElement('div'); t.id='avx-toast'; document.body.appendChild(t); }
        t.innerHTML = `<div class="avx-toast-icon">${type==='success'?'✅':'⚠️'}</div><div class="avx-toast-msg">${msg}</div>`;
        t.className = type;
        t.classList.add('show');
        clearTimeout(State.timers.toast);
        State.timers.toast = setTimeout(() => t.classList.remove('show'), 3000);
    }

    // Modal Controls
    function closeModals() {
        document.querySelectorAll('.avx-modal').forEach(m => {
            m.classList.remove('show');
            setTimeout(() => m.style.display = 'none', 300);
        });
    }
    
    function openModal(el) {
        document.querySelectorAll('.avx-modal').forEach(m => m.classList.remove('show'));
        el.style.display = 'flex';
        setTimeout(() => el.classList.add('show'), 10);
    }

    /* ==========================================================================
       10. STYLE INJECTION (PREMIUM & MASSIVE)
       ========================================================================== */
    function injectPremiumStyles() {
        if(document.getElementById('avx-premium-styles')) return;
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
            
            :root {
                --bf-bg: #f8fafc;
                --bf-card: #ffffff;
                --bf-text: #0f172a;
                --bf-acc: #0ea5e9; /* Sky Blue */
                --bf-acc-dark: #0284c7;
                --bf-rose: #f43f5e;
                --bf-shadow: 0 20px 40px -5px rgba(14, 165, 233, 0.1);
            }

            body { font-family: 'Outfit', sans-serif !important; background: var(--bf-bg); color: var(--bf-text); margin: 0; }

            /* --- TAB NAVIGATION --- */
            .bf-nav-container { padding: 15px 0; position: sticky; top: 0; z-index: 100; background: rgba(248, 250, 252, 0.9); backdrop-filter: blur(10px); }
            .bf-nav-tabs { display: flex; background: #fff; padding: 6px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; max-width: 400px; margin: 0 auto; }
            .bf-tab-btn { flex: 1; border: none; background: transparent; padding: 12px; border-radius: 16px; font-weight: 700; color: #64748b; cursor: pointer; transition: all 0.3s; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 8px; }
            .bf-tab-btn.active { background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #fff; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3); }
            .tab-icon { font-size: 16px; }

            /* --- VIEW MANAGEMENT --- */
            .bf-view { display: none; opacity: 0; transform: translateY(10px); transition: 0.4s ease; padding-bottom: 80px; }
            .bf-view.active { display: block; opacity: 1; transform: translateY(0); }

            /* --- MANUAL CARD STYLES --- */
            .bf-grid-layout { display: grid; gap: 15px; padding: 10px 0; }
            .avx-card-bf { background: #fff; border-radius: 24px; padding: 20px; margin-bottom: 15px; box-shadow: var(--bf-shadow); border: 1px solid rgba(255,255,255,0.8); position: relative; overflow: hidden; transition: transform 0.2s; }
            .avx-card-bf:hover { transform: translateY(-3px); }
            
            .avx-bf-top { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
            .avx-bf-icon { width: 52px; height: 52px; border-radius: 18px; background: #e0f2fe; color: var(--bf-acc); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; overflow: hidden; box-shadow: 0 4px 10px rgba(14, 165, 233, 0.1); }
            .bf-card-img { width: 100%; height: 100%; object-fit: cover; }
            
            .avx-bf-details { flex: 1; display: flex; flex-direction: column; }
            .avx-bf-sym { font-weight: 800; font-size: 18px; color: #0f172a; }
            .avx-bf-full { font-size: 12px; color: #64748b; font-weight: 500; }
            .avx-bf-price { font-family: 'Outfit', monospace; font-size: 19px; font-weight: 700; color: #1e293b; transition: color 0.3s; }

            .avx-bf-actions { display: flex; gap: 10px; margin-bottom: 15px; }
            .avx-btn-bf { flex: 1; padding: 12px; border: none; border-radius: 14px; color: #fff; font-weight: 700; font-size: 13px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; transition: transform 0.1s; }
            .buy-btn { background: linear-gradient(135deg, #0ea5e9, #0284c7); box-shadow: 0 4px 10px rgba(14, 165, 233, 0.25); }
            .sell-btn { background: linear-gradient(135deg, #f43f5e, #e11d48); box-shadow: 0 4px 10px rgba(244, 63, 94, 0.25); }
            .avx-btn-bf:active { transform: scale(0.97); }

            .avx-bf-footer { display: flex; justify-content: space-between; border-top: 1px dashed #e2e8f0; padding-top: 12px; }
            .avx-foot-btn { display: flex; align-items: center; gap: 6px; color: #94a3b8; font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 8px; transition: 0.2s; }
            .avx-foot-btn:hover { background: #f0f9ff; color: var(--bf-acc); }

            /* --- MODALS (Shared) --- */
            .avx-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(8px); z-index: 10000; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; }
            .avx-modal.show { opacity: 1; }
            .avx-modal-card { background: #fff; width: 90%; max-width: 420px; border-radius: 32px; padding: 25px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
            .avx-modal.show .avx-modal-card { transform: scale(1); }
            
            .avx-modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
            .avx-title { font-size: 26px; font-weight: 800; color: #0f172a; }
            .avx-badge { font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 8px; text-transform: uppercase; margin-bottom: 4px; display: inline-block; }
            .avx-badge.buy { background: #e0f2fe; color: #0284c7; }
            .avx-badge.sell { background: #fee2e2; color: #e11d48; }
            .avx-price-tag { font-family: 'Outfit', monospace; font-size: 18px; font-weight: 700; background: #f8fafc; padding: 6px 12px; border-radius: 10px; color: #334155; }
            
            .avx-stat-row { display: flex; gap: 10px; margin-bottom: 20px; }
            .avx-stat-pill { flex: 1; background: #f1f5f9; padding: 12px; border-radius: 16px; text-align: center; }
            .avx-stat-pill small { display: block; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
            .avx-stat-pill span { font-size: 14px; font-weight: 700; color: #0f172a; }
            
            .avx-input-group label, .avx-inp-cont label { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 6px; display: block; text-transform: uppercase; }
            .avx-select-wrapper select { width: 100%; padding: 14px; border-radius: 16px; border: 2px solid #f1f5f9; background: #fff; font-weight: 600; outline: none; margin-bottom: 20px; }
            
            .avx-trade-inputs { display: flex; gap: 15px; margin-bottom: 20px; }
            .avx-inp-cont { flex: 1; }
            .avx-inp-cont input { width: 100%; padding: 14px; border-radius: 16px; border: 2px solid #f1f5f9; font-size: 18px; font-weight: 700; text-align: center; outline: none; background: #fff; color: #0f172a; }
            .avx-inp-cont input:focus { border-color: #0ea5e9; }
            
            .avx-btn-main { width: 100%; padding: 16px; border: none; border-radius: 18px; font-weight: 800; font-size: 16px; color: #fff; cursor: pointer; box-shadow: 0 10px 20px -5px rgba(0,0,0,0.1); margin-bottom: 10px; }
            .avx-btn-main.buy { background: #0ea5e9; }
            .avx-btn-main.sell { background: #f43f5e; }
            .avx-btn-text { width: 100%; padding: 10px; background: none; border: none; color: #94a3b8; font-weight: 600; cursor: pointer; }

            /* --- INFO MODAL STYLES --- */
            .avx-info-header { text-align: center; margin-bottom: 25px; }
            .avx-glow-icon { width: 80px; height: 80px; margin: 0 auto 15px; border-radius: 24px; background: #fff; box-shadow: 0 10px 30px rgba(14, 165, 233, 0.15); display: flex; align-items: center; justify-content: center; font-size: 32px; border: 1px solid #f1f5f9; }
            .avx-glow-icon img { width: 100%; height: 100%; border-radius: 24px; object-fit: cover; }
            .avx-info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px; }
            .avx-ig-item { background: #f8fafc; padding: 12px; border-radius: 16px; text-align: center; border: 1px solid #e2e8f0; }
            .avx-ig-item span { display: block; font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
            .avx-ig-item b { font-size: 13px; color: #0f172a; font-weight: 700; }
            .avx-desc-box { font-size: 13px; line-height: 1.6; color: #475569; background: #f8fafc; padding: 16px; border-radius: 18px; margin-bottom: 20px; max-height: 120px; overflow-y: auto; border: 1px solid #e2e8f0; }
            .avx-links-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 10px; }
            .avx-link-chip { background: #e0f2fe; color: #0284c7; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-size: 11px; font-weight: 700; transition: background 0.2s; }
            .avx-link-chip:hover { background: #bae6fd; }

            /* --- GRAPH MODAL STYLES --- */
            .avx-modal.full-screen .avx-modal-card { height: 85vh; display: flex; flex-direction: column; overflow: hidden; padding-bottom: 0; }
            .avx-graph-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .avx-graph-ctrls { display: flex; gap: 5px; background: #f1f5f9; padding: 4px; border-radius: 12px; }
            .avx-graph-ctrls button { padding: 6px 12px; border-radius: 10px; border: none; background: transparent; font-size: 12px; font-weight: 700; color: #64748b; cursor: pointer; }
            .avx-graph-ctrls button.active { background: #fff; color: #0f172a; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
            .avx-canvas-container { flex: 1; width: 100%; position: relative; min-height: 0; }
            .avx-btn-close-icon { font-size: 24px; background: none; border: none; cursor: pointer; color: #94a3b8; }
            .avx-hint { text-align: center; font-size: 11px; color: #cbd5e1; padding: 10px 0; }

            /* --- AI CHAT STYLES --- */
            .bf-ai-container { background: #fff; border-radius: 28px; box-shadow: var(--bf-shadow); overflow: hidden; height: 600px; display: flex; flex-direction: column; border: 1px solid #fff; }
            .ai-header-premium { background: linear-gradient(to right, #f8fafc, #fff); padding: 15px 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
            .ai-profile-left { display: flex; align-items: center; gap: 12px; }
            .ai-avatar-box { position: relative; width: 44px; height: 44px; }
            .ai-avatar-box img { width: 100%; height: 100%; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
            .ai-status-dot { position: absolute; bottom: 2px; right: 2px; width: 10px; height: 10px; background: #10b981; border: 2px solid #fff; border-radius: 50%; }
            .ai-info-text { display: flex; flex-direction: column; }
            .ai-name-disp { font-weight: 800; font-size: 15px; color: #0f172a; }
            .ai-role-disp { font-size: 11px; color: #0ea5e9; font-weight: 600; text-transform: uppercase; }
            .ai-lang-btn { background: #f1f5f9; border: none; padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #475569; cursor: pointer; transition: 0.2s; }
            .ai-lang-btn:hover { background: #e2e8f0; color: #0f172a; }
            .ai-chat-body { flex: 1; background: #fcfdff; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
            .ai-msg-row { display: flex; gap: 10px; width: 100%; align-items: flex-end; }
            .ai-msg-row.user { justify-content: flex-end; }
            .ai-msg-row.ai { justify-content: flex-start; }
            .ai-avatar-tiny { width: 28px; height: 28px; flex-shrink: 0; }
            .ai-avatar-tiny img { width: 100%; height: 100%; border-radius: 50%; }
            .ai-bubble { max-width: 80%; padding: 12px 16px; border-radius: 18px; font-size: 13px; line-height: 1.5; position: relative; box-shadow: 0 2px 5px rgba(0,0,0,0.02); }
            .ai-bubble.ai { background: #fff; border: 1px solid #e2e8f0; border-bottom-left-radius: 4px; color: #334155; }
            .ai-bubble.user { background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #fff; border-bottom-right-radius: 4px; }
            .ai-time { display: block; font-size: 9px; margin-top: 4px; opacity: 0.6; text-align: right; }
            .ai-msg-actions { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
            .ai-msg-actions button { background: #e0f2fe; color: #0284c7; border: none; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s; }
            .ai-msg-actions button:hover { background: #bae6fd; }
            .ai-input-wrapper { background: #fff; padding: 15px; border-top: 1px solid #f1f5f9; display: flex; gap: 10px; align-items: center; }
            #ai-input-field { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 16px; font-size: 14px; outline: none; color: #334155; transition: 0.2s; }
            #ai-input-field:focus { background: #fff; border-color: #0ea5e9; box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1); }
            #ai-send-btn { width: 46px; height: 46px; border-radius: 14px; background: linear-gradient(135deg, #0ea5e9, #0284c7); border: none; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.1s; }
            #ai-send-btn:active { transform: scale(0.95); }
            #ai-send-btn svg { width: 20px; height: 20px; }
            .anim-pop { animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            @keyframes popIn { from { opacity: 0; transform: scale(0.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
            .typing span { display: inline-block; width: 5px; height: 5px; background: #94a3b8; border-radius: 50%; margin: 0 2px; animation: typeDot 1.4s infinite ease-in-out both; }
            .typing span:nth-child(1) { animation-delay: -0.32s; }
            .typing span:nth-child(2) { animation-delay: -0.16s; }
            @keyframes typeDot { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

            /* UTILS */
            .bf-loader-container { text-align: center; padding: 60px; color: #64748b; }
            .bf-spinner-premium { width: 40px; height: 40px; border: 3px solid rgba(14, 165, 233, 0.1); border-top-color: #0ea5e9; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 15px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            #avx-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px); background: #fff; padding: 12px 24px; border-radius: 50px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 10px; z-index: 11000; opacity: 0; transition: 0.4s; pointer-events: none; }
            #avx-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
            .avx-toast-msg { font-size: 13px; font-weight: 600; color: #1e293b; }
        `;
        const style = document.createElement('style');
        style.id = 'avx-premium-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ==========================================================================
       10. EXPOSE & BOOTSTRAP
       ========================================================================== */
    window.AVX_BF = {
        initApp,
        switchTab,
        openManualTrade,
        closeModals: closeModals,
        openGraphBF,
        openInfoBF,
        setGraphType,
        toggleLanguage,
        sendAIMessage
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

})();
