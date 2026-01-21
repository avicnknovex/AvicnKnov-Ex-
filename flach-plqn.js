
/* ==========================================================================
   flach-plqn.js
   --------------------------------------------------------------------------
   PREMIUM FLASH PLQN MARKET ENGINE (v2.0 - REAL WORKING)
   
   Target Container: <div id="plqn"></div>
   Dependencies: Supabase Client (window.supabase)
   
   FEATURES:
   1. Hybrid Price Engine (Live API + Manual Simulation)
   2. PLQN Holding System (1 to 60 Days Selection)
   3. Daily Bonus Calculation (0.0002% or via plqn_control)
   4. Specific Order Selling (Select which holding to sell)
   5. Premium History Dashboard with Admin Messages
   6. Real-time Wallet & Portfolio Sync
   7. Auto-Recovery & Error Handling
   
   AUTHOR: AI Developer
   DATE: 2024
   ========================================================================== */

(function() {
    'use strict';

    /* ==========================================================================
       1. SYSTEM CONFIGURATION
       ========================================================================== */
    const CONFIG = {
        // Database Connection
        SUPA_URL: 'https://hwrvqyipozrsxyjdpqag.supabase.co',
        SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM',
        
        // App Settings
        APP_ID: 'plqn',               // HTML ID for the main container
        FILE_ID: 'flach-plqn.js',     // Internal ID for filtering tokens
        REFRESH_RATE: 2000,           // Price update interval (ms)
        BONUS_CHECK_INTERVAL: 15000,  // Check for bonus updates every 15s
        
        // Holding Logic
        MIN_DAYS: 1,
        MAX_DAYS: 65,
        MAX_HOLDINGS_PER_USER: 4,     // As per requirement
        DEFAULT_BONUS_PERCENT: 0.0002,// Default daily bonus if table is empty
        
        // Database Tables
        TABLES: {
            WALLET: 'user_wallets',
            CONTROL: 'crypto_token_control',
            HISTORY: 'crypto_token_histry',
            PLQN_DATA: 'plqn_data',       // New Table for Holdings
            PLQN_CTRL: 'plqn_control'     // New Table for Bonus Rates
        }
    };

    /* ==========================================================================
       2. GLOBAL STATE MANAGEMENT
       ========================================================================== */
    const State = {
        supa: null,           // Supabase Client Instance
        user: null,           // Current Logged-in User
        
        // Data Cache
        tokens: [],           // Available PLQN Tokens
        prices: {},           // Real-time Prices: { symbol: { current: 0, last: 0 } }
        wallet: 0,            // User INR Balance
        myOrders: [],         // Active Holdings from plqn_data
        bonusRates: {},       // Rates from plqn_control
        
        // UI State
        selectedDays: 0,      // Days selected in Buy Modal
        sellOrderId: null,    // Order ID selected in Sell Modal
        chartData: {          // Data for Graph
            symbol: null,
            history: [],
            offset: 0,
            type: 'line'
        },
        
        // Engine Control
        intervals: [],        // Store interval IDs to clear on reload
        isProcessing: false   // Transaction lock
    };

    /* ==========================================================================
       3. UTILITY FUNCTIONS
       ========================================================================== */
    
    // Format Currency (INR)
    const fmtINR = (val) => {
        return '₹' + Number(val || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4
        });
    };

    // Format Crypto Quantity
    const fmtQty = (val) => {
        return Number(val || 0).toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 6
        });
    };

    // Format Date
    const fmtDate = (isoString) => {
        if(!isoString) return '--';
        const d = new Date(isoString);
        return d.toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: '2-digit'
        });
    };

    // UI Toast Notification System
    function toast(message, type = 'success') {
        // Remove existing toast
        const existing = document.getElementById('avx-plqn-toast');
        if (existing) existing.remove();

        const t = document.createElement('div');
        t.id = 'avx-plqn-toast';
        t.className = `plqn-toast ${type}`;
        t.innerHTML = `
            <div class="plqn-toast-icon">${type === 'success' ? '✅' : '⚠️'}</div>
            <div class="plqn-toast-msg">${message}</div>
        `;
        document.body.appendChild(t);

        // Animation
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 300);
        }, 3500);
    }

    /* ==========================================================================
       4. INITIALIZATION ENGINE
       ========================================================================== */
    
    // Main Entry Point
    async function initApp() {
        // 1. Inject Styles immediately
        injectPremiumStyles();

        const root = document.getElementById(CONFIG.APP_ID);
        if (!root) {
            console.error(`Container #${CONFIG.APP_ID} not found in DOM.`);
            return;
        }

        renderLoader(root, "Initializing PLQN Engine...");

        // 2. Connect to Supabase (with Retry Logic)
        try {
            await connectSupabase();
        } catch (e) {
            renderError(root, "Connection Failed. Please refresh.");
            return;
        }

        // 3. Authenticate User
        const { data: { user }, error } = await State.supa.auth.getUser();
        if (error || !user) {
            renderEmpty(root, "Login Required", "Please login to access the Premium PLQN Market.");
            return;
        }
        State.user = user;

        // 4. Initial Data Fetch (Parallel)
        await refreshAllData();

        // 5. Render Core UI
        renderAppStructure();
        renderTokenList();

        // 6. Start Real-time Engines
        startPriceEngine();
        startBonusEngine();
        
        console.log("✅ PLQN Engine Started Successfully");
    }

    // Robust Supabase Connector
    function connectSupabase(attempts = 0) {
        return new Promise((resolve, reject) => {
            if (window.supabase) {
                State.supa = window.supabase.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY);
                resolve();
            } else if (window.parent && window.parent.supabase) {
                State.supa = window.parent.supabase.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY);
                resolve();
            } else {
                if (attempts < 5) {
                    setTimeout(() => connectSupabase(attempts + 1).then(resolve).catch(reject), 500);
                } else {
                    reject("Supabase SDK not loaded");
                }
            }
        });
    }

    // Refresh all critical data
    async function refreshAllData() {
        await Promise.all([
            fetchWalletBalance(),
            fetchMarketTokens(),
            fetchBonusConfig(),
            fetchMyHoldings()
        ]);
    }

    /* ==========================================================================
       5. DATA FETCHERS
       ========================================================================== */

    async function fetchWalletBalance() {
        const { data } = await State.supa
            .from(CONFIG.TABLES.WALLET)
            .select('balance')
            .eq('uid', State.user.id)
            .single();
        
        if (data) State.wallet = Number(data.balance);
    }

    async function fetchMarketTokens() {
        const { data } = await State.supa
            .from(CONFIG.TABLES.CONTROL)
            .select('*')
            .order('id', { ascending: true });

        if (data) {
            // Filter: Only include tokens NOT in 'nosupported_js' list for this file
            State.tokens = data.filter(t => {
                if (!t.nosupported_js) return true;
                return !t.nosupported_js.includes(CONFIG.FILE_ID);
            });

            // Initialize Price State
            State.tokens.forEach(t => {
                if (!State.prices[t.symbol]) {
                    State.prices[t.symbol] = {
                        current: Number(t.manual_price || 0),
                        last: Number(t.manual_price || 0),
                        change: Number(t.manual_change_percent || 0)
                    };
                }
            });
        }
    }

    async function fetchBonusConfig() {
        // Fetch from plqn_control to get custom percentages
        const { data } = await State.supa
            .from(CONFIG.TABLES.PLQN_CTRL)
            .select('symbol, daily_bonus_percent');
            
        if (data) {
            data.forEach(row => {
                State.bonusRates[row.symbol] = Number(row.daily_bonus_percent);
            });
        }
    }

    async function fetchMyHoldings() {
        // Fetch specific active orders from plqn_data
        const { data } = await State.supa
            .from(CONFIG.TABLES.PLQN_DATA)
            .select('*')
            .eq('user_id', State.user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (data) {
            State.myOrders = data;
        }
    }

    /* ==========================================================================
       6. PRICE & BONUS ENGINES
       ========================================================================== */

    function startPriceEngine() {
        // Clear old intervals
        State.intervals.forEach(i => clearInterval(i));
        State.intervals = [];

        // 1. Live API Polling (Every 10s)
        const apiTokens = State.tokens.filter(t => t.is_live_api && t.api_url);
        if (apiTokens.length > 0) {
            const apiInt = setInterval(() => {
                apiTokens.forEach(async (t) => {
                    try {
                        const res = await fetch(t.api_url);
                        const json = await res.json();
                        // Assume standard structure { "bitcoin": { "inr": 50000 } }
                        const key = Object.keys(json)[0];
                        if (key && json[key].inr) {
                            updateTokenPrice(t.symbol, Number(json[key].inr));
                        }
                    } catch (e) { /* Silent fail */ }
                });
            }, 10000);
            State.intervals.push(apiInt);
        }

        // 2. Manual Simulation (Every Refresh Rate)
        const manualTokens = State.tokens.filter(t => !t.is_live_api);
        const simInt = setInterval(() => {
            manualTokens.forEach(t => {
                const current = State.prices[t.symbol].current;
                const volatility = current * 0.0025; // 0.25% volatility
                const change = (Math.random() - 0.5) * volatility;
                let newPrice = current + change;

                // Bounds Check
                if (t.manual_min_price && newPrice < t.manual_min_price) newPrice = t.manual_min_price + (volatility * 0.5);
                if (t.manual_max_price && newPrice > t.manual_max_price) newPrice = t.manual_max_price - (volatility * 0.5);

                updateTokenPrice(t.symbol, newPrice);
            });
        }, CONFIG.REFRESH_RATE);
        State.intervals.push(simInt);
    }

    function updateTokenPrice(symbol, newPrice) {
        const oldPrice = State.prices[symbol].current;
        State.prices[symbol].last = oldPrice;
        State.prices[symbol].current = newPrice;

        // DOM Update
        const el = document.getElementById(`plqn-price-${symbol}`);
        if (el) {
            el.textContent = fmtINR(newPrice);
            // Flash color
            el.style.color = newPrice >= oldPrice ? '#10b981' : '#f43f5e';
            // Reset color after 800ms
            setTimeout(() => { if(el) el.style.color = '#1e293b'; }, 800);
        }

        // Update Modals if open
        const tradeModal = document.getElementById('plqn-trade-modal');
        if (tradeModal && tradeModal.classList.contains('show') && tradeModal.dataset.sym === symbol) {
            const liveEl = document.getElementById('plqn-m-live');
            if (liveEl) {
                liveEl.textContent = fmtINR(newPrice);
                liveEl.style.color = newPrice >= oldPrice ? '#10b981' : '#f43f5e';
            }
            
            // Auto Update Estimation Logic
            if (tradeModal.dataset.mode === 'buy') {
                const qtyInput = document.getElementById('plqn-inp-qty');
                const amtInput = document.getElementById('plqn-inp-amt');
                // If user is typing QTY, update AMT
                if (document.activeElement === qtyInput && qtyInput.value) {
                    amtInput.value = (parseFloat(qtyInput.value) * newPrice).toFixed(2);
                }
            } else if (tradeModal.dataset.mode === 'sell' && State.sellOrderId) {
                // In Sell mode, update estimated value
                const amtInput = document.getElementById('plqn-inp-amt');
                const qtyInput = document.getElementById('plqn-inp-qty');
                if (qtyInput.value) {
                    amtInput.value = (parseFloat(qtyInput.value) * newPrice).toFixed(2);
                }
            }
        }
    }

    // Bonus Calculation Engine
    function startBonusEngine() {
        const bonusInt = setInterval(async () => {
            if (!State.myOrders || State.myOrders.length === 0) return;

            let updated = false;
            for (let order of State.myOrders) {
                const now = new Date();
                const lastBonus = new Date(order.last_bonus_date);
                const diffMs = now - lastBonus;
                const diffHours = diffMs / (1000 * 60 * 60);

                // If 24 hours passed
                if (diffHours >= 24) {
                    const daysToAdd = Math.floor(diffHours / 24);
                    // Get Rate
                    const rate = State.bonusRates[order.symbol] || CONFIG.DEFAULT_BONUS_PERCENT;
                    
                    // Simple Interest Bonus: CurrentQty * (Rate/100) * Days
                    const bonusQty = Number(order.current_qty) * (rate / 100) * daysToAdd;
                    const newQty = Number(order.current_qty) + bonusQty;
                    const newDaysCompleted = (order.days_completed || 0) + daysToAdd;

                    // Update DB
                    const { error } = await State.supa
                        .from(CONFIG.TABLES.PLQN_DATA)
                        .update({
                            current_qty: newQty,
                            days_completed: newDaysCompleted,
                            last_bonus_date: new Date().toISOString()
                        })
                        .eq('id', order.id);

                    if (!error) updated = true;
                }
            }

            if (updated) {
                await fetchMyHoldings(); // Refresh local state
                if (document.getElementById('plqn-hist-list')) {
                    renderHistoryItems(); // Refresh UI if open
                }
            }

        }, CONFIG.BONUS_CHECK_INTERVAL);
        State.intervals.push(bonusInt);
    }

    /* ==========================================================================
       7. UI RENDERING SYSTEM
       ========================================================================== */

    function renderAppStructure() {
        const root = document.getElementById(CONFIG.APP_ID);
        root.innerHTML = `
            <!-- HEADER -->
            <div class="plqn-header">
                <div class="plqn-head-info">
                    <h2>PLQN Flash Market</h2>
                    <p>Hold assets to earn daily compounded bonus</p>
                </div>
                <div class="plqn-head-actions">
                    <button class="plqn-hist-btn" onclick="AVX_PLQN.openHistory()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        History
                    </button>
                </div>
            </div>

            <!-- TOKEN LIST CONTAINER -->
            <div id="plqn-token-list" class="plqn-list"></div>
        `;
    }

    function renderTokenList() {
        const container = document.getElementById('plqn-token-list');
        if (!container) return;

        if (State.tokens.length === 0) {
            renderEmpty(container, "No Assets Found", "Marketplace is currently empty.");
            return;
        }

        container.innerHTML = State.tokens.map(t => {
            const price = State.prices[t.symbol] || { current: 0 };
            
            // Generate Icon
            let iconHTML = '';
            if (t.icon_type === 'image' && t.icon_url) {
                iconHTML = `<img src="${t.icon_url}" class="plqn-icon-img" alt="${t.symbol}">`;
            } else if (t.icon_url) {
                iconHTML = `<span class="plqn-icon-emoji">${t.icon_url}</span>`;
            } else {
                iconHTML = `<span class="plqn-icon-text">${t.symbol.substring(0, 2)}</span>`;
            }

            return `
            <div class="plqn-card" id="plqn-card-${t.symbol}">
                <div class="plqn-card-top">
                    <div class="plqn-card-icon">${iconHTML}</div>
                    <div class="plqn-card-info">
                        <div class="plqn-sym">${t.symbol}</div>
                        <div class="plqn-name">${t.full_name || t.name}</div>
                    </div>
                    <div class="plqn-card-price">
                        <div id="plqn-price-${t.symbol}">${fmtINR(price.current)}</div>
                    </div>
                </div>

                <div class="plqn-card-actions">
                    <button class="plqn-btn buy" onclick="AVX_PLQN.openTrade('buy', '${t.symbol}')">
                        HOLD / BUY
                    </button>
                    <button class="plqn-btn sell" onclick="AVX_PLQN.openTrade('sell', '${t.symbol}')">
                        SELL
                    </button>
                </div>

                <div class="plqn-card-footer">
                    <div class="plqn-footer-item" onclick="AVX_PLQN.openGraph('${t.symbol}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                        Chart
                    </div>
                    <div class="plqn-footer-item" onclick="AVX_PLQN.openInfo('${t.symbol}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        Info
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function renderLoader(el, msg) {
        el.innerHTML = `
            <div class="plqn-loader-box">
                <div class="plqn-spinner"></div>
                <p>${msg}</p>
            </div>`;
    }

    function renderError(el, msg) {
        el.innerHTML = `<div class="plqn-error-box">⚠️ ${msg}</div>`;
    }

    function renderEmpty(el, title, sub) {
        el.innerHTML = `
            <div class="plqn-empty-box">
                <h3>${title}</h3>
                <p>${sub}</p>
            </div>`;
    }

    /* ==========================================================================
       8. MODAL SYSTEM (Trade, History, Graph)
       ========================================================================== */

    // --- TRADE MODAL ---
    function buildTradeModal() {
        if (document.getElementById('plqn-trade-modal')) return;

        const m = document.createElement('div');
        m.id = 'plqn-trade-modal';
        m.className = 'plqn-modal';
        m.innerHTML = `
            <div class="plqn-modal-content">
                <!-- Header -->
                <div class="plqn-m-header">
                    <div class="plqn-m-title-grp">
                        <span id="plqn-m-badge" class="plqn-badge">BUY</span>
                        <h2 id="plqn-m-sym">BTC</h2>
                    </div>
                    <div class="plqn-m-price" id="plqn-m-live">₹0.00</div>
                </div>

                <!-- Stats -->
                <div class="plqn-m-stats">
                    <div class="plqn-stat">
                        <small>Balance</small>
                        <span id="plqn-m-bal">₹0.00</span>
                    </div>
                    <div class="plqn-stat">
                        <small>Active Holdings</small>
                        <span id="plqn-m-count">0</span>
                    </div>
                </div>

                <!-- Warning Box -->
                <div id="plqn-m-warn" class="plqn-warning" style="display:none;"></div>

                <!-- Dynamic Section (Calendar OR Order Select) -->
                <div id="plqn-m-dynamic" class="plqn-dynamic-area"></div>

                <!-- Chain Selector -->
                <div class="plqn-input-grp">
                    <label>Blockchain Network</label>
                    <div class="plqn-select-wrap">
                        <select id="plqn-m-chain"></select>
                    </div>
                </div>

                <!-- Inputs -->
                <div class="plqn-trade-row">
                    <div class="plqn-inp-box">
                        <label>Amount (INR)</label>
                        <input type="number" id="plqn-inp-amt" placeholder="0.00">
                    </div>
                    <div class="plqn-inp-box">
                        <label>Quantity</label>
                        <input type="number" id="plqn-inp-qty" placeholder="0.00">
                    </div>
                </div>

                <!-- Buttons -->
                <button id="plqn-btn-confirm" class="plqn-btn-main">CONFIRM</button>
                <button class="plqn-btn-text" onclick="AVX_PLQN.closeModals()">Cancel</button>
            </div>
        `;
        document.body.appendChild(m);

        // Bind Live Input Logic
        const amtIn = document.getElementById('plqn-inp-amt');
        const qtyIn = document.getElementById('plqn-inp-qty');

        amtIn.addEventListener('input', () => {
            const sym = m.dataset.sym;
            const price = State.prices[sym]?.current || 0;
            if (price > 0 && amtIn.value) {
                qtyIn.value = (parseFloat(amtIn.value) / price).toFixed(6);
            } else {
                qtyIn.value = '';
            }
        });

        qtyIn.addEventListener('input', () => {
            const sym = m.dataset.sym;
            const price = State.prices[sym]?.current || 0;
            if (price > 0 && qtyIn.value) {
                amtIn.value = (parseFloat(qtyIn.value) * price).toFixed(2);
            } else {
                amtIn.value = '';
            }
        });

        document.getElementById('plqn-btn-confirm').onclick = executeTransaction;
    }

    async function openTrade(type, sym, specificOrderId = null) {
        buildTradeModal();
        await fetchMyHoldings(); // Ensure fresh data before opening

        const m = document.getElementById('plqn-trade-modal');
        const token = State.tokens.find(t => t.symbol === sym);
        if (!token) return;

        // Reset State
        m.dataset.mode = type;
        m.dataset.sym = sym;
        State.selectedDays = 0;
        State.sellOrderId = specificOrderId;

        // Reset Inputs
        document.getElementById('plqn-inp-amt').value = '';
        document.getElementById('plqn-inp-qty').value = '';
        document.getElementById('plqn-m-warn').style.display = 'none';

        // Set UI Text
        const badge = document.getElementById('plqn-m-badge');
        badge.textContent = type;
        badge.className = `plqn-badge ${type}`;
        
        document.getElementById('plqn-m-sym').textContent = sym;
        const btn = document.getElementById('plqn-btn-confirm');
        btn.textContent = type === 'buy' ? `STAKE ${sym}` : `SELL ${sym}`;
        btn.className = `plqn-btn-main ${type}`;

        // Set Stats
        document.getElementById('plqn-m-bal').textContent = fmtINR(State.wallet);
        const holdingsCount = State.myOrders.filter(o => o.symbol === sym).length;
        document.getElementById('plqn-m-count').textContent = holdingsCount;

        // Populate Chains
        const chainSel = document.getElementById('plqn-m-chain');
        chainSel.innerHTML = '';
        const chains = token.blockchains || ['Mainnet'];
        chains.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            chainSel.appendChild(opt);
        });

        // Dynamic Content Render
        renderDynamicTradeArea(type, sym);

        // Pre-fill if selling specific order
        if (type === 'sell' && specificOrderId) {
            const order = State.myOrders.find(o => o.id == specificOrderId);
            if (order) {
                const price = State.prices[sym]?.current || 0;
                document.getElementById('plqn-inp-qty').value = order.current_qty;
                document.getElementById('plqn-inp-amt').value = (order.current_qty * price).toFixed(2);
            }
        }

        openModal(m);
    }

    function renderDynamicArea(type, sym) {
        // Alias for function hoisting compatibility
        renderDynamicTradeArea(type, sym);
    }

    function renderDynamicTradeArea(type, sym) {
        const container = document.getElementById('plqn-m-dynamic');
        container.innerHTML = '';

        if (type === 'buy') {
            // --- CALENDAR UI ---
            container.innerHTML = `<label class="plqn-lbl">Select Holding Period (Days)</label>`;
            const grid = document.createElement('div');
            grid.className = 'plqn-calendar-grid';
            
            for (let i = CONFIG.MIN_DAYS; i <= CONFIG.MAX_DAYS; i++) {
                const day = document.createElement('div');
                day.className = 'plqn-cal-day';
                day.textContent = i;
                day.onclick = () => {
                    document.querySelectorAll('.plqn-cal-day').forEach(d => d.classList.remove('active'));
                    day.classList.add('active');
                    State.selectedDays = i;
                };
                grid.appendChild(day);
            }
            container.appendChild(grid);

        } else {
            // --- SELL SELECTOR UI ---
            const orders = State.myOrders.filter(o => o.symbol === sym);
            
            if (orders.length === 0) {
                container.innerHTML = `<div class="plqn-warning" style="display:block">No Active Holdings to Sell</div>`;
                return;
            }

            let optionsHTML = orders.map(o => {
                const isSelected = State.sellOrderId == o.id ? 'selected' : '';
                return `<option value="${o.id}" ${isSelected}>ID: ${o.id} | Qty: ${fmtQty(o.current_qty)} | ${o.hold_days} Days</option>`;
            }).join('');

            container.innerHTML = `
                <label class="plqn-lbl">Select Holding Order</label>
                <div class="plqn-select-wrap">
                    <select id="plqn-sell-select" onchange="AVX_PLQN.onSellOrderChange(this.value)">
                        <option value="">-- Select Order --</option>
                        ${optionsHTML}
                    </select>
                </div>
            `;
            
            // Trigger change if pre-selected
            if(State.sellOrderId) {
                // Ensure UI is synced logic handled in openTrade
            }
        }
    }

    // Exposed Helper for Sell Select
    function onSellOrderChange(id) {
        State.sellOrderId = id;
        const order = State.myOrders.find(o => o.id == id);
        const price = State.prices[order?.symbol]?.current || 0;
        
        if (order) {
            document.getElementById('plqn-inp-qty').value = order.current_qty;
            document.getElementById('plqn-inp-amt').value = (order.current_qty * price).toFixed(2);
        }
    }

    // --- TRANSACTION LOGIC ---
    async function executeTransaction() {
        const m = document.getElementById('plqn-trade-modal');
        const mode = m.dataset.mode;
        const sym = m.dataset.sym;
        const price = State.prices[sym].current;
        const amt = parseFloat(document.getElementById('plqn-inp-amt').value);
        const qty = parseFloat(document.getElementById('plqn-inp-qty').value);
        const chain = document.getElementById('plqn-m-chain').value;
        const btn = document.getElementById('plqn-btn-confirm');

        // Validation
        if (!amt || !qty || amt <= 0 || qty <= 0) { toast("Invalid Amount", 'err'); return; }
        if (price <= 0) { toast("Wait for price...", 'err'); return; }

        btn.disabled = true;
        btn.innerHTML = `<div class="plqn-spinner mini"></div> Processing...`;

        try {
            if (mode === 'buy') {
                if (State.selectedDays < 1) throw new Error("Select holding days");
                if (amt > State.wallet) throw new Error("Insufficient Balance");
                
                // Limit Check
                const currentCount = State.myOrders.filter(o => o.symbol === sym).length;
                if (currentCount >= CONFIG.MAX_HOLDINGS_PER_USER) throw new Error(`Max ${CONFIG.MAX_HOLDINGS_PER_USER} active orders allowed per token`);

                // 1. Deduct Wallet
                const newBal = State.wallet - amt;
                const { error: wErr } = await State.supa.from(CONFIG.TABLES.WALLET)
                    .update({ balance: newBal }).eq('uid', State.user.id);
                if (wErr) throw wErr;

                // 2. Insert PLQN Data (Active Holding)
                const { error: pErr } = await State.supa.from(CONFIG.TABLES.PLQN_DATA).insert({
                    user_id: State.user.id,
                    symbol: sym,
                    initial_qty: qty,
                    current_qty: qty,
                    purchase_price: price,
                    total_amount: amt,
                    blockchain: chain,
                    hold_days: State.selectedDays,
                    status: 'active'
                });
                if (pErr) throw pErr;

                // 3. Log History
                await State.supa.from(CONFIG.TABLES.HISTORY).insert({
                    user_id: State.user.id,
                    symbol: sym,
                    action: 'Buying', // Must match other files logic
                    qty: qty,
                    price_at_transaction: price,
                    total_amount: amt,
                    blockchain_used: chain,
                    status: 'active'
                });

                toast(`Staked ${sym} for ${State.selectedDays} Days`);

            } else {
                // Sell Mode
                if (!State.sellOrderId) throw new Error("Select an order to sell");
                const order = State.myOrders.find(o => o.id == State.sellOrderId);
                if (!order) throw new Error("Order not found");
                if (qty > Number(order.current_qty)) throw new Error("Insufficient qty in selected order");

                // 1. Calculate Return
                const returnAmt = qty * price;
                const newBal = State.wallet + returnAmt;

                // 2. Add Wallet
                await State.supa.from(CONFIG.TABLES.WALLET)
                    .update({ balance: newBal }).eq('uid', State.user.id);

                // 3. Update PLQN Data
                const remaining = Number(order.current_qty) - qty;
                let status = 'active';
                if (remaining <= 0.000001) status = 'sold'; // Close order

                await State.supa.from(CONFIG.TABLES.PLQN_DATA)
                    .update({ current_qty: remaining, status: status })
                    .eq('id', order.id);

                // 4. Log History
                await State.supa.from(CONFIG.TABLES.HISTORY).insert({
                    user_id: State.user.id,
                    symbol: sym,
                    action: 'Selling',
                    qty: qty,
                    price_at_transaction: price,
                    total_amount: returnAmt,
                    blockchain_used: chain,
                    status: 'completed'
                });

                toast(`Sold ${fmtQty(qty)} ${sym}`);
            }

            // Success Cleanup
            await refreshAllData();
            closeModals();

        } catch (err) {
            console.error(err);
            toast(err.message || "Transaction Failed", 'err');
        } finally {
            btn.disabled = false;
            btn.innerHTML = "CONFIRM";
        }
    }

    // --- HISTORY MODAL ---
    function openHistory() {
        let m = document.getElementById('plqn-hist-modal');
        if (!m) {
            m = document.createElement('div');
            m.id = 'plqn-hist-modal';
            m.className = 'plqn-modal full-screen';
            m.innerHTML = `
                <div class="plqn-modal-content fs-content">
                    <div class="plqn-m-header">
                        <h2>My Holdings</h2>
                        <button class="plqn-close-icon" onclick="AVX_PLQN.closeModals()">×</button>
                    </div>
                    <div id="plqn-hist-list" class="plqn-hist-list"></div>
                </div>
            `;
            document.body.appendChild(m);
        }
        renderHistoryItems();
        openModal(m);
    }

    function renderHistoryItems() {
        const container = document.getElementById('plqn-hist-list');
        if (!container) return;

        if (State.myOrders.length === 0) {
            container.innerHTML = `
                <div class="plqn-empty-hist">
                    <div class="icon">📭</div>
                    <p>No Active Holdings</p>
                </div>`;
            return;
        }

        container.innerHTML = State.myOrders.map(o => {
            const token = State.tokens.find(t => t.symbol === o.symbol) || { symbol: o.symbol };
            const currentPrice = State.prices[o.symbol]?.current || 0;
            const currentValue = Number(o.current_qty) * currentPrice;
            const isProfit = currentValue >= o.total_amount;
            const pnl = currentValue - o.total_amount;
            const bonusPct = State.bonusRates[o.symbol] || CONFIG.DEFAULT_BONUS_PERCENT;
            
            // Icon
            let icon = `<div class="plqn-h-txt">${o.symbol.substring(0,2)}</div>`;
            if (token.icon_type === 'image') icon = `<img src="${token.icon_url}" class="plqn-h-img">`;

            // Admin Msg
            const msgHtml = o.msg_box ? `<div class="plqn-msg-box">💬 Admin: ${o.msg_box}</div>` : '';

            return `
            <div class="plqn-hist-card">
                <div class="plqn-hc-header">
                    <div class="plqn-hc-left">
                        ${icon}
                        <div>
                            <div class="sym">${o.symbol}</div>
                            <div class="date">Staked: ${fmtDate(o.start_date)}</div>
                        </div>
                    </div>
                    <div class="plqn-hc-right">
                        <div class="val">${fmtINR(currentValue)}</div>
                        <div class="pnl ${isProfit ? 'up' : 'down'}">
                            ${isProfit ? '+' : ''}${pnl.toFixed(2)}
                        </div>
                    </div>
                </div>

                <div class="plqn-hc-progress-wrap">
                    <div class="plqn-hc-bar">
                        <div class="fill" style="width: ${(o.days_completed / o.hold_days) * 100}%"></div>
                    </div>
                    <div class="plqn-hc-meta">
                        <span>Day ${o.days_completed}/${o.hold_days}</span>
                        <span>+${bonusPct}% Daily</span>
                    </div>
                </div>

                <div class="plqn-hc-details">
                    <div class="d-row"><span>Initial Qty:</span> <b>${fmtQty(o.initial_qty)}</b></div>
                    <div class="d-row"><span>Current Qty:</span> <b class="highlight">${fmtQty(o.current_qty)}</b></div>
                    <div class="d-row"><span>Locked Value:</span> <b>${fmtINR(o.total_amount)}</b></div>
                </div>

                ${msgHtml}

                <div class="plqn-hc-actions">
                    <button class="add" onclick="AVX_PLQN.openTrade('buy', '${o.symbol}')">ADD MORE</button>
                    <button class="sell" onclick="AVX_PLQN.openTrade('sell', '${o.symbol}', '${o.id}')">SELL THIS</button>
                </div>
            </div>`;
        }).join('');
    }

    // --- INFO MODAL ---
    function openInfo(sym) {
        let m = document.getElementById('plqn-info-modal');
        if (!m) {
            m = document.createElement('div');
            m.id = 'plqn-info-modal';
            m.className = 'plqn-modal';
            m.innerHTML = `
                <div class="plqn-modal-content">
                    <div class="plqn-info-head">
                        <div id="plqn-inf-icon"></div>
                        <h2 id="plqn-inf-name"></h2>
                    </div>
                    <div class="plqn-info-grid">
                        <div><span>Supply</span><b id="plqn-inf-sup"></b></div>
                        <div><span>Volume</span><b id="plqn-inf-vol"></b></div>
                        <div><span>Holders</span><b id="plqn-inf-hold"></b></div>
                    </div>
                    <div class="plqn-info-desc" id="plqn-inf-desc"></div>
                    <button class="plqn-btn-text" onclick="AVX_PLQN.closeModals()">Close</button>
                </div>
            `;
            document.body.appendChild(m);
        }

        const t = State.tokens.find(tok => tok.symbol === sym);
        if (!t) return;

        let icon = t.icon_type === 'image' ? `<img src="${t.icon_url}">` : `<span>${t.symbol.substring(0,2)}</span>`;
        document.getElementById('plqn-inf-icon').innerHTML = icon;
        document.getElementById('plqn-inf-name').textContent = t.full_name;
        document.getElementById('plqn-inf-sup').textContent = t.total_supply || '-';
        document.getElementById('plqn-inf-vol').textContent = t.volume || '-';
        document.getElementById('plqn-inf-hold').textContent = t.holders || '-';
        document.getElementById('plqn-inf-desc').textContent = t.description || 'No description.';

        openModal(m);
    }

    // --- GRAPH MODAL ---
    function openGraph(sym) {
        let m = document.getElementById('plqn-graph-modal');
        if (!m) {
            m = document.createElement('div');
            m.id = 'plqn-graph-modal';
            m.className = 'plqn-modal full-screen';
            m.innerHTML = `
                <div class="plqn-modal-content fs-content graph-mode">
                    <div class="plqn-m-header">
                        <div><span id="plqn-g-sym"></span></div>
                        <button class="plqn-close-icon" onclick="AVX_PLQN.closeModals()">×</button>
                    </div>
                    <div class="plqn-chart-wrap">
                        <canvas id="plqn-canvas"></canvas>
                    </div>
                </div>`;
            document.body.appendChild(m);
            // Basic Interactions
            const c = document.getElementById('plqn-canvas');
            let isDrag = false, startX = 0;
            c.addEventListener('mousedown', e => { isDrag = true; startX = e.offsetX; });
            c.addEventListener('mousemove', e => { if(isDrag) State.chartData.offset -= (e.offsetX - startX) * 0.1; startX = e.offsetX; });
            c.addEventListener('mouseup', () => isDrag = false);
        }

        State.chartData.symbol = sym;
        document.getElementById('plqn-g-sym').textContent = sym + " Chart";
        
        // Generate Dummy History based on current price
        const current = State.prices[sym]?.current || 100;
        let p = current;
        State.chartData.history = [];
        for(let i=0; i<100; i++) {
            let o=p, c=p+(Math.random()-0.5)*(p*0.05), h=Math.max(o,c)*1.01, l=Math.min(o,c)*0.99;
            State.chartData.history.unshift({open:o, close:c, high:h, low:l});
            p=c;
        }

        openModal(m);
        requestAnimationFrame(drawGraph);
    }

    function drawGraph() {
        const canvas = document.getElementById('plqn-canvas');
        if(!canvas || !canvas.offsetParent) return; // Stop if hidden
        
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.parentElement.offsetWidth;
        const h = canvas.height = canvas.parentElement.offsetHeight;
        
        // Clear
        ctx.clearRect(0,0,w,h);
        
        const data = State.chartData.history;
        const count = 40;
        const step = w / count;
        
        // Simple Line Chart
        ctx.beginPath();
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2;
        
        const slice = data.slice(0, count); // Slice based on offset in real app
        if(slice.length === 0) return;

        const max = Math.max(...slice.map(d => d.high));
        const min = Math.min(...slice.map(d => d.low));
        
        slice.forEach((d, i) => {
            const x = w - (i * step);
            const y = h - ((d.close - min) / (max - min)) * (h - 40) - 20;
            if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        });
        ctx.stroke();

        if(document.getElementById('plqn-graph-modal').classList.contains('show')) {
            requestAnimationFrame(drawGraph);
        }
    }

    /* ==========================================================================
       9. HELPERS (Modal Control, Styles)
       ========================================================================== */

    function openModal(el) {
        document.querySelectorAll('.plqn-modal').forEach(m => m.classList.remove('show'));
        el.style.display = 'flex';
        requestAnimationFrame(() => el.classList.add('show'));
    }

    function closeModals() {
        document.querySelectorAll('.plqn-modal').forEach(m => {
            m.classList.remove('show');
            setTimeout(() => m.style.display = 'none', 300);
        });
    }

    function injectPremiumStyles() {
        if (document.getElementById('avx-plqn-style')) return;
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
            
            :root {
                --p-bg: #f8fafc;
                --p-card: #ffffff;
                --p-text: #1e293b;
                --p-sub: #64748b;
                --p-acc: #ec4899; /* Pink-500 */
                --p-acc-h: #db2777;
                --p-green: #10b981;
                --p-red: #f43f5e;
            }

            /* Container Reset */
            #plqn { font-family: 'Outfit', sans-serif; color: var(--p-text); padding-bottom: 40px; }

            /* Header */
            .plqn-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; padding: 10px 0; }
            .plqn-head-info h2 { font-size: 24px; font-weight: 800; margin: 0; line-height: 1; color: #334155; }
            .plqn-head-info p { font-size: 12px; color: var(--p-sub); margin: 4px 0 0 0; font-weight: 500; }
            .plqn-hist-btn { display: flex; align-items: center; gap: 6px; background: #fff; padding: 10px 18px; border-radius: 30px; border: 1px solid #fce7f3; color: var(--p-acc); font-weight: 700; font-size: 13px; cursor: pointer; box-shadow: 0 4px 12px rgba(236, 72, 153, 0.1); transition: 0.2s; }
            .plqn-hist-btn:hover { background: #fdf2f8; transform: translateY(-1px); }
            .plqn-hist-btn svg { width: 18px; height: 18px; }

            /* Token Card */
            .plqn-card { background: var(--p-card); border-radius: 24px; padding: 22px; margin-bottom: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid rgba(255,255,255,0.8); position: relative; overflow: hidden; transition: transform 0.2s; }
            .plqn-card:hover { transform: translateY(-3px); box-shadow: 0 20px 30px -10px rgba(236, 72, 153, 0.1); }
            
            .plqn-card-top { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
            .plqn-card-icon { width: 52px; height: 52px; border-radius: 18px; background: #fff; border: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: var(--p-acc); box-shadow: 0 4px 6px -2px rgba(0,0,0,0.03); overflow: hidden; }
            .plqn-icon-img { width: 100%; height: 100%; object-fit: cover; }
            
            .plqn-card-info { flex: 1; }
            .plqn-sym { font-weight: 800; font-size: 18px; color: #0f172a; }
            .plqn-name { font-size: 12px; color: var(--p-sub); font-weight: 500; }
            
            .plqn-card-price { text-align: right; font-family: 'Outfit', monospace; font-size: 18px; font-weight: 700; color: #334155; }

            .plqn-card-actions { display: flex; gap: 12px; margin-bottom: 15px; }
            .plqn-btn { flex: 1; padding: 12px; border: none; border-radius: 14px; font-weight: 700; font-size: 12px; cursor: pointer; color: white; transition: 0.2s; text-transform: uppercase; letter-spacing: 0.5px; }
            .plqn-btn.buy { background: linear-gradient(135deg, #0f172a, #1e3a8a); box-shadow: 0 4px 10px rgba(236, 72, 153, 0.3); }
            .plqn-btn.buy:active { transform: scale(0.98); }
            .plqn-btn.sell { background: linear-gradient(135deg, #b91c1c, #ef4444); box-shadow: 0 4px 10px rgba(244, 63, 94, 0.3); }
            
            .plqn-card-footer { display: flex; justify-content: space-between; padding-top: 15px; border-top: 1px dashed #e2e8f0; }
            .plqn-footer-item { display: flex; align-items: center; gap: 6px; color: #94a3b8; font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 8px; transition: 0.2s; }
            .plqn-footer-item:hover { background: #fdf2f8; color: var(--p-acc); }
            .plqn-footer-item svg { width: 16px; height: 16px; stroke-width: 2.5; }

            /* Modals */
            .plqn-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(8px); z-index: 10000; display: none; justify-content: center; align-items: center; opacity: 0; transition: opacity 0.3s; }
            .plqn-modal.show { opacity: 1; }
            .plqn-modal.full-screen .plqn-modal-content { height: 90vh; max-height: 90vh; display: flex; flex-direction: column; }
            
            .plqn-modal-content { background: #fff; width: 90%; max-width: 420px; border-radius: 30px; padding: 25px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); border: 1px solid #fff; position: relative; }
            .plqn-modal.show .plqn-modal-content { transform: scale(1); }
            
            .plqn-m-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
            .plqn-m-title-grp { display: flex; flex-direction: column; gap: 4px; }
            .plqn-badge { font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 6px; display: inline-block; width: fit-content; text-transform: uppercase; }
            .plqn-badge.buy { background: #0f172a; color: #1e3a8a; }
            .plqn-badge.sell { background: #b91c1c; color: #ef4444; }
            .plqn-m-header h2 { margin: 0; font-size: 26px; font-weight: 800; color: #0f172a; }
            .plqn-m-price { font-family: 'Outfit', monospace; font-size: 18px; font-weight: 700; color: #334155; background: #f1f5f9; padding: 6px 12px; border-radius: 10px; }

            .plqn-m-stats { display: flex; gap: 10px; margin-bottom: 20px; }
            .plqn-stat { flex: 1; background: #f8fafc; padding: 10px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0; }
            .plqn-stat small { display: block; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
            .plqn-stat span { font-weight: 700; font-size: 14px; color: #0f172a; }

            /* Calendar Grid */
            .plqn-dynamic-area { margin-bottom: 20px; }
            .plqn-lbl { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 8px; }
            .plqn-calendar-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; max-height: 140px; overflow-y: auto; padding-right: 2px; }
            .plqn-cal-day { background: #f1f5f9; border-radius: 8px; text-align: center; padding: 8px 0; font-size: 12px; font-weight: 600; cursor: pointer; color: #64748b; border: 1px solid transparent; transition: 0.2s; }
            .plqn-cal-day:hover { background: #e2e8f0; }
            .plqn-cal-day.active { background: var(--p-acc); color: white; box-shadow: 0 4px 10px rgba(236, 72, 153, 0.3); font-weight: 700; border-color: var(--p-acc-h); }

            /* Select for Selling */
            .plqn-select-wrap select { width: 100%; padding: 14px; border-radius: 14px; border: 2px solid #f1f5f9; background: #fff; font-weight: 600; font-size: 13px; color: #334155; outline: none; }

            /* Inputs */
            .plqn-trade-row { display: flex; gap: 12px; margin-bottom: 25px; }
            .plqn-inp-box { flex: 1; }
            .plqn-inp-box label { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 6px; display: block; }
            .plqn-inp-box input { width: 100%; padding: 14px; border-radius: 14px; border: 2px solid #f1f5f9; font-size: 18px; font-weight: 700; text-align: center; outline: none; color: #0f172a; background: #fff; transition: 0.2s; }
            .plqn-inp-box input:focus { border-color: var(--p-acc); box-shadow: 0 0 0 4px rgba(236, 72, 153, 0.1); }

            .plqn-btn-main { width: 100%; padding: 16px; border: none; border-radius: 16px; font-weight: 700; font-size: 16px; color: white; cursor: pointer; box-shadow: 0 10px 20px -5px rgba(0,0,0,0.1); transition: 0.1s; margin-bottom: 10px; }
            .plqn-btn-main.buy { background: var(--p-acc); }
            .plqn-btn-main.sell { background: var(--p-red); }
            .plqn-btn-main:active { transform: scale(0.98); }
            .plqn-btn-text { width: 100%; padding: 10px; background: none; border: none; color: #94a3b8; font-weight: 600; cursor: pointer; }

            /* History List */
            .plqn-hist-list { flex: 1; overflow-y: auto; padding: 5px; }
            .plqn-empty-hist { text-align: center; padding: 40px; color: #94a3b8; }
            .plqn-empty-hist .icon { font-size: 40px; margin-bottom: 10px; filter: grayscale(1); opacity: 0.5; }
            
            .plqn-hist-card { background: #fff; border-radius: 18px; padding: 16px; margin-bottom: 15px; border: 1px solid #f1f5f9; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
            .plqn-hc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed #f1f5f9; }
            .plqn-hc-left { display: flex; gap: 10px; align-items: center; }
            .plqn-h-txt { width: 36px; height: 36px; border-radius: 10px; background: #fce7f3; color: var(--p-acc); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; }
            .plqn-h-img { width: 36px; height: 36px; border-radius: 10px; object-fit: cover; }
            .plqn-hc-left .sym { font-weight: 800; font-size: 15px; color: #1e293b; }
            .plqn-hc-left .date { font-size: 11px; color: #94a3b8; }
            .plqn-hc-right { text-align: right; }
            .plqn-hc-right .val { font-weight: 700; font-size: 15px; color: #1e293b; }
            .plqn-hc-right .pnl { font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-block; }
            .plqn-hc-right .pnl.up { background: #dcfce7; color: #166534; }
            
            .plqn-hc-progress-wrap { margin-bottom: 12px; }
            .plqn-hc-bar { height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; margin-bottom: 4px; }
            .plqn-hc-bar .fill { height: 100%; background: var(--p-acc); border-radius: 3px; }
            .plqn-hc-meta { display: flex; justify-content: space-between; font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; }
            
            .plqn-hc-details { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; background: #f8fafc; padding: 10px; border-radius: 10px; margin-bottom: 12px; }
            .plqn-hc-details .d-row { display: flex; flex-direction: column; }
            .plqn-hc-details span { color: #94a3b8; font-size: 10px; }
            .plqn-hc-details b { color: #334155; }
            .plqn-hc-details b.highlight { color: var(--p-acc); }
            
            .plqn-msg-box { background: #eff6ff; border-left: 3px solid #3b82f6; color: #1e40af; font-size: 12px; padding: 10px; border-radius: 6px; margin-bottom: 12px; line-height: 1.4; }
            
            .plqn-hc-actions { display: flex; gap: 8px; }
            .plqn-hc-actions button { flex: 1; padding: 8px; border-radius: 8px; border: none; font-weight: 700; font-size: 11px; cursor: pointer; transition: 0.2s; }
            .plqn-hc-actions .add { background: #fce7f3; color: var(--p-acc); }
            .plqn-hc-actions .sell { background: #f1f5f9; color: #475569; }
            .plqn-hc-actions button:hover { opacity: 0.8; }

            /* Utils */
            .plqn-loader-box { text-align: center; padding: 50px; color: #94a3b8; }
            .plqn-spinner { width: 36px; height: 36px; border: 3px solid rgba(236, 72, 153, 0.1); border-top-color: var(--p-acc); border-radius: 50%; animation: plqn-spin 0.8s infinite linear; margin: 0 auto 15px auto; }
            .plqn-spinner.mini { width: 16px; height: 16px; border-width: 2px; display: inline-block; vertical-align: middle; margin: 0 5px 0 0; }
            @keyframes plqn-spin { to { transform: rotate(360deg); } }
            
            .plqn-error-box { background: #fef2f2; color: #991b1b; padding: 15px; border-radius: 12px; text-align: center; font-size: 13px; border: 1px solid #fecaca; }
            .plqn-warning { background: #fffbeb; color: #92400e; padding: 10px; border-radius: 10px; font-size: 12px; margin-bottom: 15px; border: 1px solid #fde68a; text-align: center; }
            .plqn-close-icon { background: none; border: none; font-size: 28px; color: #94a3b8; cursor: pointer; }

            /* Toast */
            .plqn-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px); background: #fff; padding: 12px 20px; border-radius: 50px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 10px; z-index: 11000; opacity: 0; transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events: none; }
            .plqn-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
            .plqn-toast-msg { font-size: 13px; font-weight: 600; color: #1e293b; }

            /* Graph */
            .plqn-chart-wrap { flex: 1; position: relative; width: 100%; min-height: 0; }
            .plqn-modal-content.fs-content { height: 85vh; padding-bottom: 0; overflow: hidden; }
            
            /* Info */
            .plqn-info-head { text-align: center; margin-bottom: 20px; }
            #plqn-inf-icon { font-size: 40px; margin-bottom: 10px; display: inline-block; width: 60px; height: 60px; line-height: 60px; background: #f8fafc; border-radius: 20px; }
            #plqn-inf-icon img { width: 100%; height: 100%; border-radius: 20px; object-fit: cover; }
            .plqn-info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center; margin-bottom: 20px; }
            .plqn-info-grid div { background: #f8fafc; padding: 10px; border-radius: 12px; }
            .plqn-info-grid span { display: block; font-size: 10px; color: #94a3b8; text-transform: uppercase; }
            .plqn-info-grid b { font-size: 13px; color: #334155; }
            .plqn-info-desc { background: #f8fafc; padding: 15px; border-radius: 16px; font-size: 13px; color: #475569; line-height: 1.5; margin-bottom: 20px; max-height: 150px; overflow-y: auto; }
        `;
        const style = document.createElement('style');
        style.id = 'avx-plqn-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // Expose API
    window.AVX_PLQN = {
        openTrade,
        closeModals,
        openHistory,
        openGraph,
        openInfo,
        onSellOrderChange
    };

    /* ==========================================================================
       10. BOOTSTRAP
       ========================================================================== */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

})();
