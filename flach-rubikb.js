
/* ==========================================================
   flach-rubikb.js – Premium Rubik B Option Engine
   Features: 
   - Call (Up) / Put (Down) Options
   - Live Micro-Graphs per Token
   - Real-time Price Sync & Trading
   - Premium Information System (Restored)
   ========================================================== */
(function() {

    /* ---------- CONFIGURATION ---------- */
    const CONFIG = {
        SUPA_URL: 'https://hwrvqyipozrsxyjdpqag.supabase.co',
        SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM',
        
        CURRENT_FILE: 'flach-rubikb.js', 
        TARGET_CONTAINER: 'rubikb', // Expects <div id="rubikb">
        
        REFRESH_RATE: 1000, // Fast update for smooth graphs
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
        historyData: {}, // Store price history for graphs { 'BTC': [100, 101, ...] }
        intervals: []
    };

    /* ---------- SUPABASE INIT ---------- */
    const supaLib = window.supabase || (window.parent && window.parent.supabase);
    const getRoot = () => document.getElementById(CONFIG.TARGET_CONTAINER);

    if (!supaLib) {
        console.error("❌ Supabase Library Missing");
        const el = getRoot();
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
        setTimeout(() => t.classList.remove('show'), 3000);
    }

    /* ---------- DATA ENGINE ---------- */
    async function initApp() {
        injectStyles();
        const root = getRoot();
        if(!root) return;

        renderLoader("Syncing Rubik B Options...");

        // 1. Auth
        const { data: { user } } = await supa.auth.getUser();
        State.user = user;

        if (!user) {
            renderError("Please Login to Trade Options");
            return;
        }

        // 2. Load Data
        await Promise.all([fetchWallet(), fetchTokens(), fetchHoldings()]);

        // 3. Start Engines
        startPriceEngine();

        // 4. Render
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
            
            // Initialize prices & history
            State.tokens.forEach(t => {
                const p = Number(t.manual_price || 0);
                State.prices[t.symbol] = { current: p, last: p };
                State.historyData[t.symbol] = new Array(40).fill(p); // Init graph data
            });
        }
    }

    async function fetchHoldings() {
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

    /* ---------- PRICE & GRAPH ENGINE ---------- */
    function startPriceEngine() {
        State.intervals.forEach(clearInterval);
        State.intervals = [];

        const run = () => {
            // Live API
            State.tokens.filter(t => t.is_live_api && t.api_url).forEach(async (t) => {
                try {
                    const res = await fetch(t.api_url);
                    const json = await res.json();
                    const key = Object.keys(json)[0];
                    if (key && json[key]?.inr) updatePrice(t.symbol, Number(json[key].inr));
                } catch(e){}
            });

            // Manual Sim
            State.tokens.filter(t => !t.is_live_api).forEach(t => {
                const cur = State.prices[t.symbol].current;
                const vol = cur * 0.003; // Higher volatility for Rubik
                let next = cur + (Math.random() - 0.5) * vol;
                if (t.manual_min_price && next < t.manual_min_price) next = t.manual_min_price;
                if (t.manual_max_price && next > t.manual_max_price) next = t.manual_max_price;
                updatePrice(t.symbol, next);
            });
        };

        run();
        State.intervals.push(setInterval(run, CONFIG.REFRESH_RATE));
    }

    function updatePrice(sym, newPrice) {
        const oldPrice = State.prices[sym].current;
        State.prices[sym] = { current: newPrice, last: oldPrice };

        // 1. Update Graph Data
        if(State.historyData[sym]) {
            State.historyData[sym].push(newPrice);
            if(State.historyData[sym].length > 40) State.historyData[sym].shift();
            drawMiniGraph(sym);
        }

        // 2. UI Price Update
        const el = document.getElementById(`rb-price-${sym}`);
        if (el) {
            el.textContent = fmtINR(newPrice);
            el.style.color = newPrice >= oldPrice ? '#10b981' : '#f43f5e';
        }
    }

    /* ---------- GRAPH RENDERING ---------- */
    function drawMiniGraph(sym) {
        const canvas = document.getElementById(`rb-graph-${sym}`);
        if(!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const data = State.historyData[sym];
        const w = canvas.width;
        const h = canvas.height;
        
        // Find range
        let min = Math.min(...data);
        let max = Math.max(...data);
        let range = max - min || 1;

        ctx.clearRect(0, 0, w, h);
        
        // Draw Path
        ctx.beginPath();
        const step = w / (data.length - 1);
        
        data.forEach((val, i) => {
            const x = i * step;
            // Invert Y (0 is top)
            const y = h - ((val - min) / range) * (h - 10) - 5; 
            if(i===0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        const isUp = data[data.length-1] >= data[0];
        ctx.strokeStyle = isUp ? '#10b981' : '#f43f5e';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Gradient Fill
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, isUp ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.2)");
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grad;
        ctx.fill();
    }

    /* ---------- UI RENDERER ---------- */
    function renderLoader(msg) {
        const app = getRoot();
        if (app) app.innerHTML = `<div class="avx-loader"><div class="avx-spinner-premium"></div><p>${msg}</p></div>`;
    }
    
    function renderError(msg) {
        const app = getRoot();
        if (app) app.innerHTML = `<div class="avx-error">⚠️ ${msg}</div>`;
    }

    function renderTokenList() {
        const app = getRoot();
        if (!app) return;

        if (State.tokens.length === 0) {
            app.innerHTML = `<div class="avx-empty"><h2>No Rubik Options</h2></div>`;
            return;
        }

        app.innerHTML = State.tokens.map(t => {
            const p = State.prices[t.symbol] || { current: 0 };
            
            let iconHTML = '';
            if (t.icon_type === 'image' && t.icon_url) {
                iconHTML = `<img src="${t.icon_url}" class="avx-icon-img">`;
            } else {
                iconHTML = `<span class="avx-icon-text">${t.symbol.substring(0,2)}</span>`;
            }

            return `
            <div class="avx-card-rubik" id="rb-card-${t.symbol}">
                
                <div class="rb-top">
                    <div class="rb-icon">${iconHTML}</div>
                    <div class="rb-info">
                        <span class="rb-sym">${t.symbol}</span>
                        <span class="rb-name">Rubik Option</span>
                    </div>
                    <div class="rb-price" id="rb-price-${t.symbol}">${fmtINR(p.current)}</div>
                </div>

                <!-- LIVE GRAPH CONTAINER (Visual Only) -->
                <div class="rb-graph-box">
                    <canvas id="rb-graph-${t.symbol}" class="rb-graph-canvas" width="300" height="60"></canvas>
                </div>

                <div class="rb-actions">
                    <button class="rb-btn call" onclick="AVX_RB.openTrade('call', '${t.symbol}')">
                        <span>CALL</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <path d="M7 17L17 7M17 7H7M17 7V17"/>
                        </svg>
                    </button>
                    <button class="rb-btn put" onclick="AVX_RB.openTrade('put', '${t.symbol}')">
                        <span>PUT</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <path d="M17 7L7 17M7 17H17M7 17V7"/>
                        </svg>
                    </button>
                </div>

                <!-- RESTORED: INFORMATION SYSTEM -->
                <div class="rb-footer">
                    <div class="rb-foot-btn" onclick="AVX_RB.openInfo('${t.symbol}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 16v-4"/>
                            <path d="M12 8h.01"/>
                        </svg>
                        <span>Asset Info</span>
                    </div>
                </div>

            </div>`;
        }).join('');
        
        // Init graphs immediately after render
        State.tokens.forEach(t => drawMiniGraph(t.symbol));
    }

    /* ---------- INFORMATION SYSTEM (RESTORED) ---------- */
    
    function buildInfoModal() {
        if(document.getElementById('rb-info-modal')) return;
        const m = document.createElement('div');
        m.id = 'rb-info-modal';
        m.className = 'avx-modal';
        m.innerHTML = `
            <div class="avx-modal-card">
                <div class="avx-info-header">
                    <div id="rb-i-icon-box" class="avx-glow-icon"></div>
                    <h2 id="rb-i-name">BTC</h2>
                    <p id="rb-i-full">Bitcoin</p>
                </div>
                <div class="avx-info-grid">
                    <div class="avx-ig-item"><span>Supply</span><b id="rb-i-supp">--</b></div>
                    <div class="avx-ig-item"><span>Volume</span><b id="rb-i-vol">--</b></div>
                    <div class="avx-ig-item"><span>Holders</span><b id="rb-i-hold">--</b></div>
                </div>
                <div class="avx-desc-box" id="rb-i-desc"></div>
                <div class="avx-links-row" id="rb-i-links"></div>
                <button class="avx-btn-text" onclick="AVX_RB.closeModals()">Close</button>
            </div>`;
        document.body.appendChild(m);
    }

    function openInfo(sym) {
        buildInfoModal();
        let m = document.getElementById('rb-info-modal');
        
        const t = State.tokens.find(tok => tok.symbol === sym);
        if(!t) return;

        let iconHTML = '';
        if (t.icon_type === 'image' && t.icon_url) {
            iconHTML = `<img src="${t.icon_url}">`;
        } else {
            iconHTML = `<span>${t.symbol.substring(0,2)}</span>`;
        }
        document.getElementById('rb-i-icon-box').innerHTML = iconHTML;
        document.getElementById('rb-i-name').textContent = t.symbol;
        document.getElementById('rb-i-full').textContent = t.full_name;
        
        document.getElementById('rb-i-supp').textContent = t.total_supply || 'N/A';
        document.getElementById('rb-i-vol').textContent = t.volume || 'N/A';
        document.getElementById('rb-i-hold').textContent = t.holders || 'N/A';
        document.getElementById('rb-i-desc').textContent = t.description || "No description available for this asset.";

        const linksDiv = document.getElementById('rb-i-links');
        linksDiv.innerHTML = '';
        if(t.social_links) {
            Object.entries(t.social_links).forEach(([key, url]) => {
                linksDiv.innerHTML += `<a href="${url}" target="_blank" class="avx-link-chip">${key} ↗</a>`;
            });
        }
        openModal(m);
    }

    /* ---------- MODAL & TRADING ---------- */
    function buildTradeModal() {
        if(document.getElementById('rb-trade-modal')) return;
        const m = document.createElement('div');
        m.id = 'rb-trade-modal';
        m.className = 'avx-modal';
        m.innerHTML = `
            <div class="avx-modal-card rb-theme">
                <div class="avx-modal-header">
                    <div class="rb-mh-left">
                        <span id="rb-m-type" class="rb-badge">CALL</span> 
                        <span id="rb-m-sym" class="avx-title">BTC</span>
                    </div>
                    <div class="rb-mh-right">
                        <div id="rb-m-live-price" class="avx-price-tag">₹0.00</div>
                    </div>
                </div>
                <div class="avx-stat-row">
                    <div class="avx-stat-pill"><small>Balance</small><span id="rb-m-bal">₹0.00</span></div>
                    <div class="avx-stat-pill"><small>Holding</small><span id="rb-m-hold">0.00</span></div>
                </div>
                
                <div class="rb-arrow-visual">
                    <div id="rb-vis-icon"></div>
                    <p id="rb-vis-text">Profit if price goes UP</p>
                </div>

                <div class="avx-trade-inputs">
                    <div class="avx-inp-cont"><label>Total (INR)</label><input type="number" id="rb-t-amt" placeholder="0.00"></div>
                    <div class="avx-inp-cont"><label>Quantity</label><input type="number" id="rb-t-qty" placeholder="0.00"></div>
                </div>
                <button id="rb-confirm-btn" class="avx-btn-main">CONFIRM OPTION</button>
                <button class="avx-btn-text" onclick="AVX_RB.closeModals()">Cancel</button>
            </div>`;
        document.body.appendChild(m);
        setupInputs(m);
    }

    function setupInputs(m) {
        const amt = m.querySelector('#rb-t-amt');
        const qty = m.querySelector('#rb-t-qty');
        const getP = () => State.prices[m.dataset.sym]?.current || 0;

        amt.oninput = () => {
            const p = getP();
            if(p>0 && amt.value) qty.value = (parseFloat(amt.value)/p).toFixed(6); else qty.value='';
        };
        qty.oninput = () => {
            const p = getP();
            if(p>0 && qty.value) amt.value = (parseFloat(qty.value)*p).toFixed(2); else amt.value='';
        };
        m.querySelector('#rb-confirm-btn').onclick = executeTrade;
    }

    async function openTrade(type, sym) {
        buildTradeModal();
        let m = document.getElementById('rb-trade-modal');
        const t = State.tokens.find(tk => tk.symbol === sym);
        if(!t) return;

        m.dataset.mode = type;
        m.dataset.sym = sym;
        
        // Reset
        document.getElementById('rb-t-amt').value = '';
        document.getElementById('rb-t-qty').value = '';

        // UI
        const typeEl = document.getElementById('rb-m-type');
        typeEl.textContent = type.toUpperCase();
        typeEl.className = `rb-badge ${type}`;
        
        document.getElementById('rb-m-sym').textContent = sym;
        document.getElementById('rb-m-bal').textContent = fmtINR(State.walletBal);
        document.getElementById('rb-m-hold').textContent = `${State.holdings[sym]||0}`;
        document.getElementById('rb-m-live-price').textContent = fmtINR(State.prices[sym].current);

        // Arrow Visual
        const visIcon = document.getElementById('rb-vis-icon');
        const visText = document.getElementById('rb-vis-text');
        if(type === 'call') {
            visIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>`;
            visText.textContent = "Profit if price goes UP";
            visText.style.color = "#10b981";
        } else {
            visIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="3"><path d="M17 7L7 17M7 17H17M7 17V7"/></svg>`;
            visText.textContent = "Profit if price goes DOWN";
            visText.style.color = "#f43f5e";
        }

        const btn = document.getElementById('rb-confirm-btn');
        btn.textContent = `${type.toUpperCase()} NOW`;
        btn.className = `avx-btn-main ${type}`;

        openModal(m);
    }

    async function executeTrade() {
        const m = document.getElementById('rb-trade-modal');
        const mode = m.dataset.mode;
        const sym = m.dataset.sym;
        const amt = parseFloat(document.getElementById('rb-t-amt').value);
        const qty = parseFloat(document.getElementById('rb-t-qty').value);
        const price = State.prices[sym].current;

        if(!amt || !qty) { toast("Invalid Amount", "err"); return; }
        
        if(mode === 'call' && amt > State.walletBal) { toast("Insufficient Balance", "err"); return; }
        if(mode === 'put' && qty > (State.holdings[sym]||0)) { toast("Insufficient Holdings", "err"); return; }

        const btn = document.getElementById('rb-confirm-btn');
        btn.disabled = true; btn.textContent = "Processing...";

        try {
            // DB Logic (Call=Buy, Put=Sell)
            const actionStr = mode === 'call' ? 'Buying' : 'Selling';
            const { error: hErr } = await supa.from(CONFIG.TABLES.HISTORY).insert({
                user_id: State.user.id, symbol: sym, action: actionStr,
                qty: qty, price_at_transaction: price, total_amount: amt,
                blockchain_used: 'Rubik', status: 'active'
            });
            if(hErr) throw hErr;

            const newBal = mode === 'call' ? State.walletBal - amt : State.walletBal + amt;
            await supa.from(CONFIG.TABLES.WALLET).update({ balance: newBal }).eq('uid', State.user.id);

            State.walletBal = newBal;
            await fetchHoldings();
            
            toast(`${mode.toUpperCase()} Success!`);
            closeModals();

        } catch (e) {
            console.error(e);
            toast("Trade Failed", "err");
        }
        btn.disabled = false;
    }

    /* ---------- HELPERS ---------- */
    function openModal(el) {
        document.querySelectorAll('.avx-modal').forEach(m => m.classList.remove('show'));
        el.style.display = 'flex';
        setTimeout(()=>el.classList.add('show'), 10);
    }
    function closeModals() {
        document.querySelectorAll('.avx-modal').forEach(m => {
            m.classList.remove('show');
            setTimeout(()=>m.style.display='none', 300);
        });
    }

    function injectStyles() {
        if(document.getElementById('avx-rubik-css')) return;
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
            :root { --rb-bg: #f1f5f9; --rb-card: #ffffff; --rb-text: #1e293b; --rb-call: #10b981; --rb-put: #f43f5e; }
            body { font-family: 'Outfit', sans-serif !important; background: var(--rb-bg); color: var(--rb-text); }

            /* CARD */
            .avx-card-rubik { background: #fff; border-radius: 24px; padding: 20px; margin-bottom: 20px; box-shadow: 0 10px 20px -5px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; transition: transform 0.2s; }
            .avx-card-rubik:hover { transform: translateY(-3px); }
            
            /* TOP */
            .rb-top { display: flex; align-items: center; gap: 14px; margin-bottom: 15px; }
            .rb-icon { width: 48px; height: 48px; border-radius: 14px; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: #64748b; border: 1px solid #f1f5f9; overflow: hidden; }
            .avx-icon-img { width: 100%; height: 100%; object-fit: cover; }
            .rb-info { flex: 1; display:flex; flex-direction:column; }
            .rb-sym { font-weight: 800; font-size: 18px; color: #0f172a; line-height: 1.1; }
            .rb-name { font-size: 12px; color: #64748b; font-weight: 500; }
            .rb-price { font-family: 'Outfit', monospace; font-size: 18px; font-weight: 700; color: #1e293b; transition: color 0.2s; }

            /* GRAPH BOX - VISUAL ONLY */
            .rb-graph-box { height: 70px; background: #f8fafc; border-radius: 12px; position: relative; margin-bottom: 20px; overflow: hidden; border: 2px solid transparent; }
            .rb-graph-canvas { width: 100%; height: 100%; display: block; }

            /* ACTIONS */
            .rb-actions { display: flex; gap: 12px; margin-bottom: 15px; }
            .rb-btn { flex: 1; padding: 14px; border: none; border-radius: 16px; color: white; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform 0.1s; position: relative; overflow: hidden; }
            .rb-btn:active { transform: scale(0.97); }
            
            .rb-btn.call { background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3); }
            .rb-btn.put { background: linear-gradient(135deg, #f43f5e, #e11d48); box-shadow: 0 4px 10px rgba(244, 63, 94, 0.3); }
            .rb-btn svg { width: 20px; height: 20px; }

            /* FOOTER (Restored) */
            .rb-footer { display: flex; justify-content: flex-end; padding-top: 12px; border-top: 1px dashed #e2e8f0; }
            .rb-foot-btn { display: flex; align-items: center; gap: 6px; color: #64748b; cursor: pointer; font-size: 12px; font-weight: 600; padding: 6px 10px; border-radius: 8px; transition: 0.2s; background: #f8fafc; }
            .rb-foot-btn:hover { background: #f1f5f9; color: #334155; }
            .rb-foot-btn svg { width: 16px; height: 16px; stroke-width: 2.5; }

            /* MODAL SPECIFIC */
            .rb-theme .rb-mh-left { display: flex; flex-direction: column; }
            .rb-badge { font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px; display: inline-block; width: fit-content; text-transform: uppercase; margin-bottom: 4px; }
            .rb-badge.call { background: #d1fae5; color: #047857; }
            .rb-badge.put { background: #ffe4e6; color: #be123c; }
            
            .rb-arrow-visual { text-align: center; margin: 20px 0; background: #f8fafc; padding: 15px; border-radius: 16px; }
            #rb-vis-icon svg { width: 40px; height: 40px; }
            #rb-vis-text { font-size: 13px; font-weight: 700; margin-top: 5px; margin-bottom: 0; }

            /* INFO MODAL */
            .avx-info-header { text-align: center; margin-bottom: 30px; }
            .avx-glow-icon { width: 80px; height: 80px; margin: 0 auto 16px; border-radius: 28px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: center; font-size: 36px; border: 1px solid #f1f5f9; }
            .avx-glow-icon img { width: 100%; height: 100%; border-radius: 28px; object-fit: cover; }
            .avx-info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; }
            .avx-ig-item { background: #f8fafc; padding: 16px 8px; border-radius: 18px; text-align: center; border: 1px solid #e2e8f0; }
            .avx-ig-item span { display: block; font-size: 10px; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; font-weight: 700; }
            .avx-ig-item b { font-size: 14px; color: #0f172a; font-weight: 700; }
            .avx-desc-box { font-size: 14px; line-height: 1.6; color: #475569; background: #f8fafc; padding: 18px; border-radius: 20px; margin-bottom: 24px; max-height: 140px; overflow-y: auto; border: 1px solid #e2e8f0; }
            .avx-links-row { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 15px; }
            .avx-link-chip { background: #e0e7ff; color: #3730a3; padding: 8px 16px; border-radius: 30px; text-decoration: none; font-size: 12px; font-weight: 700; transition: background 0.2s; }
            .avx-link-chip:hover { background: #c7d2fe; }

            /* UTILS */
            .avx-loader { text-align:center; padding:50px; color:#94a3b8; }
            .avx-spinner-premium { width: 36px; height: 36px; border: 3px solid rgba(0,0,0,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 10px auto; }
            @keyframes spin { to { transform: rotate(360deg); } }
            .avx-empty { text-align:center; padding:40px; color:#94a3b8; }
            .avx-error { text-align:center; padding:20px; color:#ef4444; background:#fef2f2; border-radius:12px; margin:20px; border:1px solid #fecaca; }

            /* MODAL SHARED */
            .avx-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); z-index: 10000; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; }
            .avx-modal.show { opacity: 1; }
            .avx-modal-card { background: #fff; width: 90%; max-width: 440px; border-radius: 32px; padding: 30px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
            .avx-modal.show .avx-modal-card { transform: scale(1); }
            
            .avx-modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
            .avx-title { font-size: 28px; font-weight: 800; color: #0f172a; }
            .avx-price-tag { font-family: 'Outfit', monospace; font-size: 18px; font-weight: 700; color: #334155; background: #f1f5f9; padding: 6px 12px; border-radius: 12px; }
            .avx-stat-row { display: flex; gap: 12px; margin-bottom: 20px; }
            .avx-stat-pill { flex: 1; background: #f8fafc; padding: 12px; border-radius: 16px; text-align: center; border: 1px solid #e2e8f0; }
            .avx-stat-pill small { display: block; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
            .avx-stat-pill span { font-weight: 700; font-size: 14px; color: #0f172a; }
            
            .avx-trade-inputs { display: flex; gap: 16px; margin-bottom: 24px; }
            .avx-inp-cont { flex: 1; }
            .avx-inp-cont label { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 8px; display: block; text-transform: uppercase; }
            .avx-inp-cont input { width: 100%; padding: 16px; border-radius: 18px; border: 2px solid #f1f5f9; font-size: 20px; font-weight: 700; text-align: center; outline: none; color: #0f172a; background: #fff; transition: 0.2s; }
            .avx-inp-cont input:focus { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
            
            .avx-btn-main { width: 100%; padding: 18px; border: none; border-radius: 20px; font-weight: 800; font-size: 16px; color: white; cursor: pointer; margin-bottom: 12px; transition: transform 0.1s; }
            .avx-btn-main.call { background: #10b981; }
            .avx-btn-main.put { background: #f43f5e; }
            .avx-btn-main:active { transform: scale(0.98); }
            .avx-btn-text { width: 100%; padding: 12px; background: none; border: none; color: #94a3b8; font-weight: 600; cursor: pointer; transition: 0.2s; }
            .avx-btn-text:hover { color: #64748b; }

            #avx-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px); background: #fff; padding: 12px 24px; border-radius: 50px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 12px; z-index: 20000; opacity: 0; transition: 0.4s; pointer-events: none; }
            #avx-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
            .avx-toast-icon { font-size: 18px; }
            .avx-toast-msg { font-size: 14px; font-weight: 600; color: #1e293b; }
        `;
        const style = document.createElement('style');
        style.id = 'avx-rubik-css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---------- EXPOSE API ---------- */
    window.AVX_RB = {
        openTrade,
        closeModals,
        openInfo
    };

    /* ---------- BOOTSTRAP ---------- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

})();
