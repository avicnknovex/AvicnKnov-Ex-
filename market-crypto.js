/* ==========================================================
   market-crypto.js – Premium Crypto Market Engine
   Features: Hybrid Price, Live Trading, Interactive Graph,
   Auto-Holdings, Wallet Integration
   Style: Premium General Crypto Theme
   Layout: Premium Footer Structure (Same as Spot)
   ========================================================== */
(function() {

    /* ---------- CONFIGURATION ---------- */
    const CONFIG = {
        SUPA_URL: 'https://hwrvqyipozrsxyjdpqag.supabase.co',
        SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM',
        
        // 👇 CONFIGURATION FOR CRYPTO SECTION 👇
        CURRENT_FILE: 'market-crypto.js', 
        TARGET_CONTAINER: 'crypto', // Matches HTML ID <div id="crypto">
        // 👆 ---------------------------- 👆

        REFRESH_RATE: 2000, 
        AUTO_CLOSE_SEC: 40,
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
        activeIntervals: [],
        timers: {}
    };

    /* ---------- SUPABASE INIT ---------- */
    const supaLib = window.supabase || (window.parent && window.parent.supabase);
    if (!supaLib) {
        console.error("❌ Supabase Library Missing");
        const el = document.getElementById(CONFIG.TARGET_CONTAINER);
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
        renderLoader("Syncing Crypto Market...");

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
        const { data, error } = await supa
            .from(CONFIG.TABLES.WALLET)
            .select('balance')
            .eq('uid', State.user.id)
            .single();

        if (data) State.walletBal = Number(data.balance);
    }

    async function fetchTokens() {
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

        // DOM Update - UNIQUE IDs for Crypto
        const el = document.getElementById(`mc-price-${sym}`);
        const card = document.getElementById(`mc-card-${sym}`);
        
        if (el && card) {
            el.textContent = fmtINR(newPrice);
            // Flash effect
            el.style.color = newPrice >= old ? '#10b981' : '#f43f5e';
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
                 modalPrice.style.color = newPrice >= old ? '#10b981' : '#f43f5e';
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
                <div class="avx-spinner-mc"></div>
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
                    <h2>Market Offline</h2>
                    <p>No Crypto pairs available.</p>
                </div>`;
            return;
        }

        app.innerHTML = State.tokens.map(t => {
            const p = State.prices[t.symbol] || { current: 0, isUp: true, change: 0 };
            
            // Icon Logic
            let iconHTML = '';
            if (t.icon_type === 'image' && t.icon_url) {
                iconHTML = `<img src="${t.icon_url}" class="avx-icon-img" alt="${t.symbol}">`;
            } else if (t.icon_url) {
                iconHTML = `<span class="avx-icon-emoji">${t.icon_url}</span>`;
            } else {
                iconHTML = `<span class="avx-icon-text">${t.symbol.substring(0,2)}</span>`;
            }

            return `
            <div class="avx-card-mc" id="mc-card-${t.symbol}">
                
                <!-- TOP SECTION -->
                <div class="avx-mc-top">
                    <div class="avx-mc-icon">
                        ${iconHTML}
                    </div>
                    <div class="avx-mc-info">
                        <div class="avx-mc-title">
                            <span class="symbol">${t.symbol}</span>
                            <span class="tag">CRYPTO</span>
                        </div>
                        <div class="avx-mc-name">${t.full_name || t.name}</div>
                    </div>
                    <div class="avx-mc-price-box">
                        <div class="avx-mc-price" id="mc-price-${t.symbol}">
                            ${fmtINR(p.current)}
                        </div>
                    </div>
                </div>

                <!-- ACTIONS (BUY / SELL) - Dark Blue & Red -->
                <div class="avx-mc-actions">
                    <button class="avx-btn-mc buy" onclick="AVX.openTrade('buy', '${t.symbol}')">
                        BUY
                    </button>
                    <button class="avx-btn-mc sell" onclick="AVX.openTrade('sell', '${t.symbol}')">
                        SELL
                    </button>
                </div>

                <!-- FOOTER (GRAPH LEFT / INFO RIGHT) -->
                <div class="avx-mc-footer">
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

    /* ---------- MODALS (Reused/Standalone) ---------- */
    
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

                <div id="avx-price-warning" class="avx-warning-box" style="display:none;">
                    ⚠️ Price loading... please wait.
                </div>

                <div class="avx-input-group">
                    <label>Network / Chain</label>
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
        
        const amt = m.querySelector('#avx-t-amt');
        const qty = m.querySelector('#avx-t-qty');
        const warning = m.querySelector('#avx-price-warning');
        
        const checkPrice = () => {
            const sym = m.dataset.sym;
            const price = State.prices[sym] ? State.prices[sym].current : 0;
            if(!price || price <= 0) {
                if(warning) warning.style.display = 'block';
                return 0;
            }
            if(warning) warning.style.display = 'none';
            return price;
        };

        amt.addEventListener('input', () => {
             const price = checkPrice();
             if(price === 0) { qty.value = ''; return; }
             if(amt.value) qty.value = (parseFloat(amt.value) / price).toFixed(6);
             else qty.value = '';
        });

        qty.addEventListener('input', () => {
             const price = checkPrice();
             if(price === 0) { amt.value = ''; return; }
             if(qty.value) amt.value = (parseFloat(qty.value) * price).toFixed(2);
             else amt.value = '';
        });
        
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
        // Badge color logic for modal
        typeEl.className = type === 'buy' ? 'avx-badge buy' : 'avx-badge sell';
        
        document.getElementById('avx-m-sym').textContent = sym;
        const btn = document.getElementById('avx-confirm-btn');
        btn.textContent = `${type.toUpperCase()} ${sym}`;
        btn.className = type === 'buy' ? 'avx-btn-main buy' : 'avx-btn-main sell';
        btn.disabled = false;
        btn.style.opacity = '1';

        document.getElementById('avx-m-bal').textContent = fmtINR(State.walletBal);
        const holding = State.holdings[sym] || 0;
        document.getElementById('avx-m-hold').textContent = `${fmtQty(holding)} ${sym}`;
        
        const price = State.prices[sym] ? State.prices[sym].current : 0;
        document.getElementById('avx-m-live-price').textContent = fmtINR(price);
        
        const sel = document.getElementById('avx-m-chain');
        sel.innerHTML = '';
        if(token.blockchains && Array.isArray(token.blockchains)) {
            token.blockchains.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c; opt.textContent = c; sel.appendChild(opt);
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

        if(!price || price <= 0) { toast("Wait for price to load...", "err"); return; }

        const amt = parseFloat(amtVal);
        const qty = parseFloat(qtyVal);

        if(!amt || !qty || amt <= 0) { toast("Invalid Amount", "err"); return; }
        
        if(mode === 'buy') {
            if(amt > State.walletBal) { toast("Insufficient Balance", "err"); return; }
        } else {
            const currentHold = State.holdings[sym] || 0;
            if(qty > currentHold) { toast(`Insufficient ${sym}`, "err"); return; }
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

            const newBal = mode === 'buy' ? State.walletBal - amt : State.walletBal + amt;
            const { error: wallErr } = await supa.from(CONFIG.TABLES.WALLET)
                .update({ balance: newBal })
                .eq('uid', State.user.id);
            if(wallErr) throw wallErr;

            State.walletBal = newBal;
            await fetchHoldings();
            toast(`Success: ${mode.toUpperCase()} ${sym}`);
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
        document.getElementById('avx-i-desc').textContent = t.description || "No description available.";

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

        // Chart Styling for Crypto
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

        if(chartCtx.type === 'line') {
            ctx.beginPath();
            ctx.strokeStyle = '#2563eb'; // Blue
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
            gradFill.addColorStop(0, "rgba(37, 99, 235, 0.2)");
            gradFill.addColorStop(1, "rgba(37, 99, 235, 0)");
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

    /* ---------- PREMIUM STYLES INJECTION (CRYPTO SPECIFIC) ---------- */
    function injectStyles() {
        if(document.getElementById('avx-mc-css')) return;
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
            
            /* CRYPTO THEME VARIABLES */
            .avx-card-mc {
                --mc-bg: #ffffff;
                --mc-text: #0f172a;
                --mc-buy: #1e3a8a; /* Dark Blue (Same as Spot) */
                --mc-sell: #dc2626; /* Red */
            }

            /* CARD LAYOUT - Same Premium Feel */
            .avx-card-mc {
                background: var(--mc-bg);
                border-radius: 20px;
                padding: 20px;
                margin-bottom: 16px;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.03);
                border: 1px solid #e2e8f0;
                transition: transform 0.2s, box-shadow 0.2s;
                position: relative;
                overflow: hidden;
            }
            .avx-card-mc:hover {
                transform: translateY(-2px);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            }

            /* HEADER */
            .avx-mc-top { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
            
            .avx-mc-icon { 
                width: 48px; height: 48px; border-radius: 14px; 
                background: #f8fafc; border: 1px solid #e2e8f0;
                display: flex; align-items: center; justify-content: center; 
                font-size: 20px; overflow: hidden; color: #1e293b;
            }
            .avx-icon-img { width: 100%; height: 100%; object-fit: cover; }
            
            .avx-mc-info { flex: 1; }
            .avx-mc-title { display: flex; align-items: center; gap: 6px; }
            .avx-mc-title .symbol { font-weight: 800; font-size: 17px; color: #1e293b; }
            .avx-mc-title .tag { font-size: 9px; font-weight: 800; background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 6px; }
            .avx-mc-name { font-size: 12px; color: #64748b; font-weight: 500; }

            .avx-mc-price-box { text-align: right; }
            .avx-mc-price { font-size: 18px; font-weight: 700; color: #1e293b; transition: color 0.3s; font-family: 'Outfit', monospace; }

            /* ACTIONS */
            .avx-mc-actions { display: flex; gap: 8px; margin-bottom: 8px; }
            
            .avx-btn-mc {
                flex: 1; border: none; padding: 10px 16px; border-radius: 12px;
                font-weight: 700; font-size: 12px; color: white; cursor: pointer;
                transition: opacity 0.2s; display: flex; align-items: center; justify-content: center;
                text-transform: uppercase; letter-spacing: 0.5px;
            }
            /* Dark Blue & Red per request */
            .avx-btn-mc.buy { background: linear-gradient(to right, #0f172a, #1e3a8a); box-shadow: 0 4px 10px rgba(30, 58, 138, 0.25); }
            .avx-btn-mc.sell { background: linear-gradient(to right, #b91c1c, #ef4444); box-shadow: 0 4px 10px rgba(239, 68, 68, 0.25); }
            .avx-btn-mc:active { opacity: 0.9; transform: scale(0.98); }

            /* FOOTER (MATCHING PREMIUM LAYOUT) */
            .avx-mc-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 10px; }
            .avx-foot-btn { display: flex; align-items: center; gap: 8px; color: #64748b; cursor: pointer; font-size: 13px; font-weight: 600; padding: 6px 12px; border-radius: 12px; transition: 0.2s; }
            .avx-foot-btn:hover { color: #1e293b; background: #f1f5f9; }
            .avx-foot-btn svg { width: 18px; height: 18px; stroke-width: 2.5; }

            /* LOADER */
            .avx-spinner-mc { width: 30px; height: 30px; border: 3px solid #e2e8f0; border-top-color: #1e293b; border-radius: 50%; animation: spin 0.8s infinite linear; margin-bottom: 10px; }
            .avx-loader { display:flex; flex-direction:column; align-items:center; padding: 40px; color: #64748b; }
            @keyframes spin { to { transform: rotate(360deg); } }

            /* TOAST (Shared) */
            #avx-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px); background: #fff; padding: 12px 24px; border-radius: 50px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px; opacity: 0; transition: 0.4s; z-index: 10001; pointer-events: none; }
            #avx-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
            
            /* MODALS (Shared Styles) */
            .avx-modal { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px); z-index: 9999; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; }
            .avx-modal.show { opacity: 1; }
            .avx-modal-card { background: #fff; width: 90%; max-width: 440px; border-radius: 24px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); transform: scale(0.95); transition: transform 0.3s; }
            .avx-modal.show .avx-modal-card { transform: scale(1); }
            
            .avx-mh-left { display: flex; flex-direction: column; }
            .avx-title { font-size: 24px; font-weight: 800; color: #0f172a; }
            .avx-badge { font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 6px; text-transform: uppercase; width: fit-content; margin-bottom: 4px; }
            .avx-badge.buy { background: #e0e7ff; color: #1e3a8a; }
            .avx-badge.sell { background: #fee2e2; color: #b91c1c; }
            
            .avx-trade-inputs { display: flex; gap: 12px; margin: 20px 0; }
            .avx-inp-cont { flex: 1; }
            .avx-inp-cont label { font-size: 11px; font-weight: 700; color: #64748b; display: block; margin-bottom: 6px; }
            .avx-inp-cont input { width: 100%; padding: 14px; border: 2px solid #f1f5f9; border-radius: 12px; text-align: center; font-weight: 700; font-size: 18px; outline: none; }
            .avx-inp-cont input:focus { border-color: #1e293b; }
            
            .avx-btn-main { width: 100%; padding: 16px; border: none; border-radius: 14px; font-weight: 700; font-size: 16px; color: white; cursor: pointer; }
            .avx-btn-main.buy { background: #1e3a8a; }
            .avx-btn-main.sell { background: #ef4444; }
            .avx-btn-text { width: 100%; padding: 12px; background: none; border: none; color: #94a3b8; font-weight: 600; cursor: pointer; }
            
            /* GRAPH */
            .avx-graph-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
            .avx-graph-ctrls { background: #f1f5f9; padding: 4px; border-radius: 10px; display: flex; gap: 4px; }
            .avx-graph-ctrls button { padding: 6px 12px; border: none; background: transparent; font-size: 12px; font-weight: 700; color: #64748b; border-radius: 8px; cursor: pointer; }
            .avx-graph-ctrls button.active { background: #fff; color: #0f172a; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        `;
        const s = document.createElement('style'); s.id = 'avx-mc-css'; s.textContent = css; document.head.appendChild(s);
    }

    /* ---------- EXPOSE TO WINDOW (AVX NAMESPACE) ---------- */
    window.AVX = window.AVX || {};
    // Merge functions into global AVX object
    Object.assign(window.AVX, {
        openTrade,
        closeModals,
        openInfo,
        openGraph,
        setGraphType
    });

    /* ---------- BOOTSTRAP ---------- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

})();
