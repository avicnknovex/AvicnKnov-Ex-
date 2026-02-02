
/* ==========================================================
   wallet-spot.js – Premium Wallet Exchange Engine (Supabase Linked)
   Features: Hybrid Price (API/Manual), Live Trading, 
   Interactive Graph (Candle/Line), Auto-Holdings
   Connected to: wallet_crypto_token_control & user_wallet_balance
   ========================================================== */
(function() {

    /* ---------- CONFIGURATION ---------- */
    const CONFIG = {
        SUPA_URL: 'https://hwrvqyipozrsxyjdpqag.supabase.co',
        SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM',
        CURRENT_FILE: 'wallet-spot.js', 
        TARGET_CONTAINER: 'spot',
        REFRESH_RATE: 2000, 
        AUTO_CLOSE_SEC: 40,
        TABLES: {
            WALLET: 'user_wallet_balance',        // CHANGED: New balance table
            CONTROL: 'wallet_crypto_token_control', // CHANGED: New control table
            HISTORY: 'wallet_crypto_token_histry'   // CHANGED: New history table
        }
    };

    /* ---------- STATE MANAGEMENT ---------- */
    const State = {
        user: null,
        tokens: [], 
        prices: {}, 
        holdings: {}, 
        walletBal: 0,
        activeIntervals: [],
        timers: {}
    };

    /* ---------- SUPABASE INIT ---------- */
    const supaLib = window.supabase || (window.parent && window.parent.supabase);
    // Error handling deferred to initApp for correct container targeting
    const supa = supaLib ? supaLib.createClient(CONFIG.SUPA_URL, CONFIG.SUPA_KEY) : null;

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

    /* ---------- DATA ENGINE ---------- */
    async function initApp() {
        const app = document.getElementById(CONFIG.TARGET_CONTAINER);
        
        // Robust Container Check (React/DOM Race Condition Fix)
        if (!app) {
            setTimeout(initApp, 100);
            return;
        }

        if (!supa) {
            app.innerHTML = '<div style="color:red;padding:20px;">Error: Supabase SDK not found.</div>';
            return;
        }

        injectStyles();
        renderLoader("Initializing Wallet Market...");

        // 1. Get User
        const { data: { user } } = await supa.auth.getUser();
        State.user = user;

        if (!user) {
            renderError("Please Login to Trade");
            return;
        }

        // 2. Load Wallet
        await fetchWallet();

        // 3. Load Tokens & Holdings
        await Promise.all([fetchTokens(), fetchHoldings()]);

        // 4. Start Price Engine
        startPriceEngine();

        // 5. Initial Render
        renderTokenList();
    }

    async function fetchWallet() {
        if (!State.user) return;
        // CHANGED: Using user_wallet_balance
        const { data, error } = await supa
            .from(CONFIG.TABLES.WALLET)
            .select('balance')
            .eq('uid', State.user.id)
            .single();

        if (data) State.walletBal = Number(data.balance);
    }

    async function fetchTokens() {
        // CHANGED: Using wallet_crypto_token_control
        const { data, error } = await supa
            .from(CONFIG.TABLES.CONTROL)
            .select('*')
            .order('id', { ascending: true });

        if (error || !data || data.length === 0) {
            State.tokens = [];
            return;
        }

        State.tokens = data.filter(t => {
            if (!t.nosupported_js) return true;
            return !t.nosupported_js.includes(CONFIG.CURRENT_FILE);
        });

        // Initialize prices
        State.tokens.forEach(t => {
            State.prices[t.symbol] = {
                current: Number(t.manual_price || 0),
                last: Number(t.manual_price || 0),
                change: Number(t.manual_change_percent || 0)
            };
        });
    }

    async function fetchHoldings() {
        if (!State.user) return;
        // CHANGED: Using wallet_crypto_token_histry
        const { data, error } = await supa
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
            Object.keys(temp).forEach(k => {
                if (temp[k] <= 0.000001) delete temp[k];
            });
            State.holdings = temp;
        }
    }

    /* ---------- PRICE ENGINE ---------- */
    function startPriceEngine() {
        const apiTokens = State.tokens.filter(t => t.is_live_api && t.api_url);
        if (apiTokens.length > 0) {
            setInterval(async () => {
                apiTokens.forEach(async (t) => {
                    try {
                        const res = await fetch(t.api_url);
                        const json = await res.json();
                        const key = Object.keys(json)[0]; 
                        if(key && json[key].inr) {
                             updatePrice(t.symbol, json[key].inr);
                        }
                    } catch (e) { }
                });
            }, 10000); 
        }

        const manualTokens = State.tokens.filter(t => !t.is_live_api);
        if (manualTokens.length > 0) {
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
    }

    function updatePrice(sym, newPrice) {
        const old = State.prices[sym].current;
        const currentChange = State.prices[sym].change; 
        
        State.prices[sym] = {
            current: newPrice,
            last: old,
            isUp: newPrice >= old,
            change: currentChange 
        };

        // DOM Update
        const el = document.getElementById(`price-${sym}`);
        const card = document.getElementById(`card-${sym}`);
        
        if (el && card) {
            el.textContent = fmtINR(newPrice);
            // Flash effect
            el.style.color = newPrice >= old ? '#00e396' : '#ff4560';
            setTimeout(() => {
                if(el) el.style.color = '#1e293b'; 
            }, 800);
        }
        
        // Modal Update
        const m = document.getElementById('avx-trade-modal');
        if(m && m.classList.contains('show') && m.dataset.sym === sym){
             const modalPrice = document.getElementById('avx-m-live-price');
             if(modalPrice) {
                 modalPrice.textContent = fmtINR(newPrice);
                 modalPrice.style.color = newPrice >= old ? '#00e396' : '#ff4560';
             }
             
             // Hide warning if price loaded
             const warning = document.getElementById('avx-price-warning');
             if(warning) warning.style.display = 'none';

             // Auto update amt
             const qtyIn = document.getElementById('avx-t-qty');
             const amtIn = document.getElementById('avx-t-amt');
             if(document.activeElement === qtyIn && qtyIn.value){
                 amtIn.value = (Number(qtyIn.value) * newPrice).toFixed(2);
             }
        }
    }

    /* ---------- UI RENDERER ---------- */
    function renderLoader(msg) {
        const app = document.getElementById(CONFIG.TARGET_CONTAINER);
        if (app) app.innerHTML = `
            <div class="avx-loader">
                <div class="avx-spinner-premium"></div>
                <p>${msg}</p>
            </div>`;
    }
    
    function renderError(msg) {
        const app = document.getElementById(CONFIG.TARGET_CONTAINER);
        if (app) app.innerHTML = `<div class="avx-error">⚠️ ${msg}</div>`;
    }

    function renderTokenList() {
        const app = document.getElementById(CONFIG.TARGET_CONTAINER);
        if (!app) return;

        if (State.tokens.length === 0) {
            app.innerHTML = `
                <div class="avx-empty">
                    <h2>🚀 Wallet Market Empty</h2>
                    <p>Assets are being listed.</p>
                </div>`;
            return;
        }

        app.innerHTML = State.tokens.map(t => {
            const p = State.prices[t.symbol] || { current: 0, isUp: true, change: 0 };
            
            // Icon Logic: Image -> Emoji -> Name
            let iconHTML = '';
            if (t.icon_type === 'image' && t.icon_url) {
                iconHTML = `<img src="${t.icon_url}" class="avx-icon-img" alt="${t.symbol}">`;
            } else if (t.icon_url) {
                iconHTML = `<span class="avx-icon-emoji">${t.icon_url}</span>`;
            } else {
                iconHTML = `<span class="avx-icon-text">${t.symbol.substring(0,2)}</span>`;
            }

            return `
            <div class="avx-card-premium" id="card-${t.symbol}">
                
                <!-- TOP SECTION: Icon Left, Name Middle, Price Right -->
                <div class="avx-cp-top">
                    <div class="avx-cp-icon">
                        ${iconHTML}
                    </div>
                    <div class="avx-cp-details">
                        <span class="avx-cp-sym">${t.symbol}</span>
                        <span class="avx-cp-full">${t.full_name || t.name}</span>
                    </div>
                    <div class="avx-cp-price-box">
                        <div class="avx-cp-price" id="price-${t.symbol}">
                            ${fmtINR(p.current)}
                        </div>
                    </div>
                </div>

                <!-- BUTTONS SECTION: Buy Left / Sell Right -->
                <div class="avx-cp-actions">
                    <button class="avx-btn-p buy-btn" onclick="AVX.openTrade('buy', '${t.symbol}')">
                        BUY
                    </button>
                    <button class="avx-btn-p sell-btn" onclick="AVX.openTrade('sell', '${t.symbol}')">
                        SELL
                    </button>
                </div>

                <!-- FOOTER SECTION: Graph Left / Info Right -->
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

    /* ---------- MODALS ---------- */
    
    // --- TRADE MODAL ---
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

                <!-- PRICE LOADING WARNING -->
                <div id="avx-price-warning" class="avx-warning-box" style="display:none;">
                    ⚠️ Price loading... please wait.
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
            </div>
        `;
        document.body.appendChild(m);
        
        // Logic
        const amt = m.querySelector('#avx-t-amt');
        const qty = m.querySelector('#avx-t-qty');
        const warning = m.querySelector('#avx-price-warning');
        
        const checkPrice = () => {
            const sym = m.dataset.sym;
            const price = State.prices[sym] ? State.prices[sym].current : 0;
            if(!price || price <= 0) {
                warning.style.display = 'block';
                return 0;
            }
            warning.style.display = 'none';
            return price;
        };

        amt.addEventListener('input', () => {
             const price = checkPrice();
             if(price === 0) {
                 qty.value = '';
                 return;
             }
             if(amt.value) qty.value = (parseFloat(amt.value) / price).toFixed(6);
             else qty.value = '';
        });

        qty.addEventListener('input', () => {
             const price = checkPrice();
             if(price === 0) {
                 amt.value = '';
                 return;
             }
             if(qty.value) amt.value = (parseFloat(qty.value) * price).toFixed(2);
             else amt.value = '';
        });

        // Trigger check on focus too
        amt.addEventListener('focus', checkPrice);
        qty.addEventListener('focus', checkPrice);

        m.querySelector('#avx-confirm-btn').onclick = executeTrade;
    }

    async function openTrade(type, sym) {
        buildTradeModal(); 
        let m = document.getElementById('avx-trade-modal');
        
        const token = State.tokens.find(t => t.symbol === sym);
        if(!token) return;

        m.dataset.mode = type;
        m.dataset.sym = sym;
        document.getElementById('avx-t-amt').value = '';
        document.getElementById('avx-t-qty').value = '';
        const warning = document.getElementById('avx-price-warning');
        if(warning) warning.style.display = 'none';
        
        const typeEl = document.getElementById('avx-m-type');
        typeEl.textContent = type.toUpperCase();
        typeEl.className = type === 'buy' ? 'avx-badge buy' : 'avx-badge sell';
        
        document.getElementById('avx-m-sym').textContent = sym;
        const btn = document.getElementById('avx-confirm-btn');
        btn.textContent = `${type.toUpperCase()} ${sym}`;
        btn.className = type === 'buy' ? 'avx-btn-main buy' : 'avx-btn-main sell';

        document.getElementById('avx-m-bal').textContent = fmtINR(State.walletBal);
        const holding = State.holdings[sym] || 0;
        document.getElementById('avx-m-hold').textContent = `${fmtQty(holding)} ${sym}`;
        
        // Initial Price Check
        const price = State.prices[sym] ? State.prices[sym].current : 0;
        document.getElementById('avx-m-live-price').textContent = fmtINR(price);
        
        const sel = document.getElementById('avx-m-chain');
        sel.innerHTML = '';
        if(token.blockchains && Array.isArray(token.blockchains)) {
            token.blockchains.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                sel.appendChild(opt);
            });
        }

        openModal(m);
    }

    async function executeTrade() {
        const m = document.getElementById('avx-trade-modal');
        const mode = m.dataset.mode;
        const sym = m.dataset.sym;
        const amtVal = document.getElementById('avx-t-amt').value;
        const qtyVal = document.getElementById('avx-t-qty').value;
        const chain = document.getElementById('avx-m-chain').value;
        const price = State.prices[sym].current;

        // Double check price
        if(!price || price <= 0) {
            toast("Wait for price to load...", "err");
            return;
        }

        const amt = parseFloat(amtVal);
        const qty = parseFloat(qtyVal);

        if(!amt || !qty || amt <= 0) { toast("Invalid Amount", "err"); return; }
        
        if(mode === 'buy') {
            if(amt > State.walletBal) { toast("Insufficient Balance", "err"); return; }
        } else {
            const currentHold = State.holdings[sym] || 0;
            if(qty > currentHold) { toast(`Only hold ${currentHold.toFixed(4)} ${sym}`, "err"); return; }
        }

        const btn = document.getElementById('avx-confirm-btn');
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.textContent = "Processing...";

        try {
            const actionText = mode === 'buy' ? 'Buying' : 'Selling';
            const { error: histErr } = await supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id,
                symbol: sym,
                action: actionText,
                qty: qty,
                price_at_transaction: price,
                total_amount: amt,
                blockchain_used: chain,
                status: 'active'
            });

            if(histErr) throw histErr;

            // CHANGED: Update new wallet balance table
            const newBal = mode === 'buy' ? State.walletBal - amt : State.walletBal + amt;
            const { error: wallErr } = await supa.from(CONFIG.TABLES.WALLET)
                .update({ balance: newBal })
                .eq('uid', State.user.id);

            if(wallErr) throw wallErr;

            State.walletBal = newBal;
            await fetchHoldings();
            toast(`Successful: ${mode.toUpperCase()} ${sym}`);
            AVX.closeModals();

        } catch (e) {
            console.error(e);
            toast("Transaction Failed", "err");
        }
        btn.disabled = false;
        btn.style.opacity = '1';
    }

    // --- INFO MODAL ---
    function buildInfoModal() {
        if(document.getElementById('avx-info-modal')) return;
        const m = document.createElement('div');
        m.id = 'avx-info-modal';
        m.className = 'avx-modal';
        m.innerHTML = `
            <div class="avx-modal-card">
                <div class="avx-info-header">
                    <div id="avx-i-icon-box" class="avx-glow-icon"></div>
                    <h2 id="avx-i-name">BTC</h2>
                    <p id="avx-i-full">Bitcoin</p>
                </div>
                <div class="avx-info-grid">
                    <div class="avx-ig-item"><span>Supply</span><b id="avx-i-supp">--</b></div>
                    <div class="avx-ig-item"><span>Volume</span><b id="avx-i-vol">--</b></div>
                    <div class="avx-ig-item"><span>Holders</span><b id="avx-i-hold">--</b></div>
                </div>
                <div class="avx-desc-box" id="avx-i-desc"></div>
                <div class="avx-links-row" id="avx-i-links"></div>
                <button class="avx-btn-text" onclick="AVX.closeModals()">Close</button>
            </div>`;
        document.body.appendChild(m);
    }

    function openInfo(sym) {
        buildInfoModal(); 
        let m = document.getElementById('avx-info-modal');
        
        const t = State.tokens.find(tok => tok.symbol === sym);
        if(!t) return;

        let iconHTML = '';
        if (t.icon_type === 'image' && t.icon_url) {
            iconHTML = `<img src="${t.icon_url}">`;
        } else if (t.icon_url) {
            iconHTML = `<span>${t.icon_url}</span>`;
        } else {
            iconHTML = `<span>${t.symbol.substring(0,2)}</span>`;
        }
        document.getElementById('avx-i-icon-box').innerHTML = iconHTML;
        document.getElementById('avx-i-name').textContent = t.symbol;
        document.getElementById('avx-i-full').textContent = t.full_name;
        
        document.getElementById('avx-i-supp').textContent = t.total_supply || 'N/A';
        document.getElementById('avx-i-vol').textContent = t.volume || 'N/A';
        document.getElementById('avx-i-hold').textContent = t.holders || 'N/A';
        document.getElementById('avx-i-desc').textContent = t.description || "No description available for this asset.";

        const linksDiv = document.getElementById('avx-i-links');
        linksDiv.innerHTML = '';
        if(t.social_links) {
            Object.entries(t.social_links).forEach(([key, url]) => {
                linksDiv.innerHTML += `<a href="${url}" target="_blank" class="avx-link-chip">${key} ↗</a>`;
            });
        }

        openModal(m);
    }

    // --- GRAPH MODAL ---
    function buildGraphModal() {
        if(document.getElementById('avx-graph-modal')) return;
        const m = document.createElement('div');
        m.id = 'avx-graph-modal';
        m.className = 'avx-modal full-screen';
        m.innerHTML = `
            <div class="avx-modal-card graph-mode">
                <div class="avx-graph-top">
                    <div>
                        <span id="avx-g-sym">BTC</span>
                        <span id="avx-g-price">₹00.00</span>
                    </div>
                    <button class="avx-btn-close-icon" onclick="AVX.closeModals()">×</button>
                </div>
                <div class="avx-graph-ctrls">
                    <button class="active" onclick="AVX.setGraphType('line')">Line</button>
                    <button onclick="AVX.setGraphType('candle')">Candle</button>
                </div>
                <div class="avx-canvas-container">
                    <canvas id="avx-chart" width="350" height="280"></canvas>
                </div>
                <p class="avx-hint">Swipe to scroll history</p>
            </div>`;
        document.body.appendChild(m);
        initChartInteractions();
    }

    let chartCtx = { type: 'line', data: [], offset: 0, sym: null };

    function openGraph(sym) {
        buildGraphModal();
        let m = document.getElementById('avx-graph-modal');
        
        chartCtx.sym = sym;
        chartCtx.offset = 0;
        document.getElementById('avx-g-sym').textContent = sym;
        
        const current = State.prices[sym].current;
        chartCtx.data = generateHistory(current);
        
        openModal(m);
        requestAnimationFrame(drawChart);
    }

    function setGraphType(type) {
        chartCtx.type = type;
        document.querySelectorAll('.avx-graph-ctrls button').forEach(b => b.classList.remove('active'));
        event.target.classList.add('active');
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
        const c = document.getElementById('avx-chart');
        if(!c || !c.offsetParent) return;
        const ctx = c.getContext('2d');
        const w = c.width;
        const h = c.height;
        ctx.clearRect(0,0,w,h);

        const data = chartCtx.data;
        const count = 30;
        const step = w / count;
        
        const start = Math.max(0, chartCtx.offset);
        const end = Math.min(data.length, start + count);
        const slice = data.slice(start, end);
        
        if(slice.length === 0) return;

        const maxVal = Math.max(...slice.map(d => d.high));
        const minVal = Math.min(...slice.map(d => d.low));
        const range = maxVal - minVal || 1;
        const pad = 20;

        const getY = (val) => h - pad - ((val - minVal) / range) * (h - 2*pad);

        // Gradient Background
        const grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, "rgba(255, 255, 255, 0)");
        grd.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0,0,w,h);

        // Grid Lines
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, getY(minVal)); ctx.lineTo(w, getY(minVal));
        ctx.moveTo(0, getY(maxVal)); ctx.lineTo(w, getY(maxVal));
        ctx.stroke();

        if(chartCtx.type === 'line') {
            ctx.beginPath();
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            slice.forEach((d, i) => {
                const x = w - (i * step) - (step/2);
                const y = getY(d.close);
                if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
            });
            ctx.stroke();

            // Area Gradient
            ctx.lineTo(w - ((slice.length-1)*step), h);
            ctx.lineTo(w, h);
            const gradFill = ctx.createLinearGradient(0, 0, 0, h);
            gradFill.addColorStop(0, "rgba(59, 130, 246, 0.2)");
            gradFill.addColorStop(1, "rgba(59, 130, 246, 0)");
            ctx.fillStyle = gradFill;
            ctx.fill();
        } else {
            const barW = step * 0.5;
            slice.forEach((d, i) => {
                const x = w - (i * step) - (step/2);
                const isGreen = d.close >= d.open;
                ctx.fillStyle = isGreen ? '#00e396' : '#ff4560';
                
                ctx.fillRect(x-1, getY(d.high), 2, getY(d.low) - getY(d.high));
                const yOpen = getY(d.open);
                const yClose = getY(d.close);
                ctx.fillRect(x - barW/2, Math.min(yOpen, yClose), barW, Math.abs(yOpen - yClose) || 1);
            });
        }
        
        if(data[0]) document.getElementById('avx-g-price').textContent = fmtINR(data[0].close);
        
        if(document.getElementById('avx-graph-modal').classList.contains('show')) {
            requestAnimationFrame(drawChart);
        }
    }

    function initChartInteractions() {
        const c = document.getElementById('avx-chart');
        let isDrag = false, startX = 0;
        c.addEventListener('mousedown', e => { isDrag = true; startX = e.offsetX; });
        c.addEventListener('mouseup', () => isDrag = false);
        c.addEventListener('mouseleave', () => isDrag = false);
        c.addEventListener('mousemove', e => {
            if(!isDrag) return;
            const dx = e.offsetX - startX;
            if(Math.abs(dx) > 5) {
                chartCtx.offset -= Math.sign(dx);
                if(chartCtx.offset < 0) chartCtx.offset = 0;
                if(chartCtx.offset > 30) chartCtx.offset = 30;
                startX = e.offsetX;
            }
        });
        c.addEventListener('touchstart', e => { isDrag = true; startX = e.touches[0].clientX; });
        c.addEventListener('touchmove', e => {
            if(!isDrag) return;
            // e.preventDefault(); // allow page scroll if vertical
            const dx = e.touches[0].clientX - startX;
            if(Math.abs(dx) > 5) {
                chartCtx.offset -= Math.sign(dx);
                if(chartCtx.offset < 0) chartCtx.offset = 0;
                if(chartCtx.offset > 30) chartCtx.offset = 30;
                startX = e.touches[0].clientX;
            }
        });
    }

    /* ---------- GENERAL MODAL LOGIC ---------- */
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

    /* ---------- PREMIUM STYLES INJECTION ---------- */
    function injectStyles() {
        if(document.getElementById('avx-premium-css')) return;
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
            
            :root { 
                --p-bg: #f1f5f9; 
                --p-card: #ffffff; 
                --p-text: #1e293b; 
                --p-acc: #6366f1;
                --p-green: #10b981; 
                --p-red: #f43f5e;
                --p-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
                --p-glow: 0 0 15px rgba(99, 102, 241, 0.2);
            }
            
            body { font-family: 'Outfit', sans-serif !important; background: var(--p-bg); color: var(--p-text); -webkit-font-smoothing: antialiased; }
            
            /* LOADER */
            .avx-loader { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:50px; }
            .avx-spinner-premium { width: 40px; height: 40px; border: 3px solid rgba(99, 102, 241, 0.1); border-top-color: var(--p-acc); border-radius: 50%; animation: spin 0.8s ease-in-out infinite; margin-bottom: 15px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            
            /* EMPTY STATE */
            .avx-empty { text-align:center; padding:40px; color:#94a3b8; opacity:0.8; }

            /* TOAST */
            #avx-toast { 
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px); 
                background: #fff; padding: 12px 24px; border-radius: 50px; 
                box-shadow: 0 20px 40px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px; 
                opacity: 0; transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 10000; pointer-events: none; 
            }
            #avx-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
            .avx-toast-icon { font-size:18px; }
            .avx-toast-msg { font-size:14px; font-weight:600; color:#1e293b; }
            
            /* PREMIUM CARD LAYOUT */
            .avx-card-premium {
                background: var(--p-card);
                border-radius: 28px;
                padding: 24px;
                margin-bottom: 24px;
                box-shadow: var(--p-shadow);
                border: 1px solid rgba(255,255,255,0.7);
                position: relative;
                overflow: hidden;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .avx-card-premium:hover { transform: translateY(-3px); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08); }
            .avx-card-premium:active { transform: scale(0.99); }
            
            /* TOP: Icon, Name, Price */
            .avx-cp-top { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
            .avx-cp-icon { 
                width: 56px; height: 56px; border-radius: 20px; background: #fff; 
                box-shadow: 0 4px 12px rgba(0,0,0,0.03); display: flex; align-items: center; justify-content: center; 
                font-size: 24px; overflow: hidden; border: 1px solid #f1f5f9;
            }
            .avx-icon-img { width: 100%; height: 100%; object-fit: cover; }
            .avx-icon-text { font-weight:700; color:var(--p-acc); font-size:20px; text-transform:uppercase; }
            
            .avx-cp-details { flex: 1; display:flex; flex-direction:column; justify-content:center; }
            .avx-cp-header { display:flex; align-items:baseline; gap:8px; margin-bottom:2px; }
            .avx-cp-sym { font-weight: 800; font-size: 20px; color: var(--p-text); letter-spacing: -0.5px; line-height: 1.2; }
            .avx-cp-full { font-weight: 500; font-size: 13px; color: #64748b; }
            
            .avx-cp-price-box { text-align: right; }
            .avx-cp-price { font-weight: 700; font-size: 20px; color: #1e293b; transition: color 0.3s; font-family: 'Outfit', monospace; }

            /* ACTIONS: Buy Left, Sell Right (UPDATED TO MATCH ALPHA STYLE) */
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

            /* FOOTER: Graph Left, Info Right */
            .avx-cp-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 5px; }
            .avx-foot-btn { 
                display: flex; align-items: center; gap: 8px; color: #94a3b8; 
                cursor: pointer; font-size: 13px; font-weight: 600; transition: color 0.2s; padding: 4px 8px; border-radius: 8px;
            }
            .avx-foot-btn:hover { color: var(--p-acc); background: #f8fafc; }
            .avx-foot-btn svg { width: 18px; height: 18px; stroke-width: 2.5; }
            
            /* MODALS PREMIUM */
            .avx-modal {
                position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(12px);
                z-index: 9999; display: none; align-items: center; justify-content: center;
                opacity: 0; transition: opacity 0.3s ease;
            }
            .avx-modal.show { opacity: 1; }
            
            .avx-modal-card {
                background: #fff; width: 90%; max-width: 440px; border-radius: 32px;
                padding: 30px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                border: 1px solid #fff;
            }
            .avx-modal.show .avx-modal-card { transform: scale(1); }
            
            .avx-modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
            .avx-mh-left { display: flex; flex-direction: column; gap: 5px; }
            .avx-title { font-size: 28px; font-weight: 800; letter-spacing: -1px; line-height: 1; color: #0f172a; }
            .avx-badge { font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 8px; display: inline-block; width: fit-content; text-transform: uppercase; letter-spacing: 0.5px; }
            .avx-badge.buy { background: #e0e7ff; color: var(--p-acc); }
            .avx-badge.sell { background: #fee2e2; color: var(--p-red); }
            .avx-price-tag { font-family: 'Outfit', monospace; font-size: 18px; font-weight: 700; color: #334155; background: #f1f5f9; padding: 6px 12px; border-radius: 12px; }

            .avx-stat-row { display: flex; gap: 12px; margin-bottom: 24px; }
            .avx-stat-pill { flex: 1; background: #f8fafc; padding: 12px; border-radius: 16px; text-align: center; border: 1px solid #e2e8f0; }
            .avx-stat-pill small { display: block; font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px; text-transform: uppercase; }
            .avx-stat-pill span { font-weight: 700; font-size: 14px; color: #0f172a; }

            .avx-warning-box { background: #fffbeb; color: #b45309; font-size: 13px; padding: 12px; border-radius: 12px; margin-bottom: 20px; text-align: center; border: 1px solid #fcd34d; font-weight: 600; }

            .avx-input-group label, .avx-inp-cont label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; display: block; letter-spacing: 0.5px; }
            .avx-select-wrapper select { width: 100%; padding: 14px; border-radius: 16px; border: 2px solid #f1f5f9; background: #fff; font-weight: 600; outline: none; margin-bottom: 20px; color: #334155; font-size: 14px; }
            
            .avx-trade-inputs { display: flex; gap: 16px; margin-bottom: 30px; }
            .avx-inp-cont { flex: 1; }
            .avx-inp-cont input { 
                width: 100%; padding: 16px; border-radius: 18px; border: 2px solid #f1f5f9; 
                font-size: 20px; font-weight: 700; text-align: center; outline: none; transition: border 0.2s, box-shadow 0.2s; 
                color: #0f172a; background: #fff;
            }
            .avx-inp-cont input:focus { border-color: var(--p-acc); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
            
            .avx-btn-main { width: 100%; padding: 18px; border: none; border-radius: 20px; font-weight: 700; font-size: 16px; color: white; cursor: pointer; margin-bottom: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2); transition: transform 0.1s; }
            .avx-btn-main:active { transform: scale(0.98); }
            .avx-btn-main.buy { background: var(--p-acc); }
            .avx-btn-main.sell { background: var(--p-red); }
            .avx-btn-text { background: none; border: none; width: 100%; padding: 12px; color: #94a3b8; font-weight: 600; cursor: pointer; font-size: 14px; transition: color 0.2s; }
            .avx-btn-text:hover { color: #64748b; }

            /* INFO MODAL */
            .avx-info-header { text-align: center; margin-bottom: 30px; }
            .avx-glow-icon { 
                width: 80px; height: 80px; margin: 0 auto 16px; border-radius: 28px; 
                background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.06); 
                display: flex; align-items: center; justify-content: center; font-size: 36px; border: 1px solid #f1f5f9;
            }
            .avx-glow-icon img { width: 100%; height: 100%; border-radius: 28px; object-fit: cover; }
            .avx-info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; }
            .avx-ig-item { background: #f8fafc; padding: 16px 8px; border-radius: 18px; text-align: center; border: 1px solid #e2e8f0; }
            .avx-ig-item span { display: block; font-size: 10px; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; font-weight: 700; }
            .avx-ig-item b { font-size: 14px; color: #0f172a; font-weight: 700; }
            .avx-desc-box { font-size: 14px; line-height: 1.6; color: #475569; background: #f8fafc; padding: 18px; border-radius: 20px; margin-bottom: 24px; max-height: 140px; overflow-y: auto; border: 1px solid #e2e8f0; }
            .avx-links-row { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 15px; }
            .avx-link-chip { background: #e0e7ff; color: var(--p-acc); padding: 8px 16px; border-radius: 30px; text-decoration: none; font-size: 12px; font-weight: 700; transition: background 0.2s; }
            .avx-link-chip:hover { background: #c7d2fe; }

            /* GRAPH MODAL FIX - WHITE SPACE REMOVAL */
            .avx-modal.full-screen .avx-modal-card { 
                height: 85vh; 
                display: flex; 
                flex-direction: column;
                overflow: hidden; 
            }
            .avx-graph-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .avx-graph-ctrls { display: flex; gap: 6px; margin-bottom: 20px; background: #f1f5f9; padding: 6px; border-radius: 16px; width: fit-content; }
            .avx-graph-ctrls button { padding: 8px 16px; border-radius: 12px; border: none; background: transparent; font-size: 13px; font-weight: 700; color: #64748b; cursor: pointer; transition: all 0.2s; }
            .avx-graph-ctrls button.active { background: #fff; color: #0f172a; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
            .avx-canvas-container { 
                flex: 1; 
                width: 100%; 
                position: relative; 
                min-height: 0;
            }
            .avx-hint { text-align: center; font-size: 12px; color: #cbd5e1; margin-top: 15px; font-weight: 500; }
            .avx-btn-close-icon { font-size: 28px; background: none; border: none; cursor: pointer; color: #94a3b8; transition: color 0.2s; }
            .avx-btn-close-icon:hover { color: #64748b; }
        `;
        const style = document.createElement('style');
        style.id = 'avx-premium-css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---------- EXPOSE TO WINDOW ---------- */
    window.AVX = {
        openTrade,
        closeModals,
        openInfo,
        openGraph,
        setGraphType
    };

    /* ---------- BOOTSTRAP ---------- */
    document.addEventListener('DOMContentLoaded', initApp);

})();
