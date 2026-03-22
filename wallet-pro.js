/**
 * AVX Premium Wallet - Pro View Module
 * File: wallet-pro.js
 * Description: Ultra-premium, fast, and smooth wallet dashboard with dynamic JS loading.
 */

// ==========================================
// 1. SUPABASE INITIALIZATION
// ==========================================
const SUPA_URL = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZMp';

let supa;
if (window.mySupabaseInstance) {
    supa = window.mySupabaseInstance;
} else if (window.supabase) {
    supa = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
    });
    window.mySupabaseInstance = supa;
}

// ==========================================
// 2. MAIN WALLET PRO CONTROLLER
// ==========================================
const WalletPro = {
    containerId: 'pro-root',
    currentBalance: 0,
    activeTab: 'all', // 'all' or 'trades'
    syncInterval: null,

    init() {
        console.log("🚀 Initializing Premium Wallet Pro...");
        this.injectStyles();
        this.renderUI();
        this.startLiveSync();
        
        // Load default tab smoothly after UI renders
        setTimeout(() => this.switchTab('all'), 300);
    },

    // ==========================================
    // 3. ULTRA PREMIUM CSS INJECTION
    // ==========================================
    injectStyles() {
        if(document.getElementById('wallet-pro-styles')) return;
        const style = document.createElement('style');
        style.id = 'wallet-pro-styles';
        style.innerHTML = `
            /* Base Animations & Container */
            .wp-container {
                padding: 15px 20px 30px 20px;
                font-family: 'Inter', 'Outfit', sans-serif;
                animation: wpFadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                opacity: 0;
                transform: translateY(20px);
            }
            @keyframes wpFadeInUp {
                to { opacity: 1; transform: translateY(0); }
            }

            /* Premium Balance Card */
            .wp-balance-card {
                background: linear-gradient(145deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.9));
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 28px;
                padding: 35px 25px;
                position: relative;
                overflow: hidden;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
            }
            /* Glowing Orbs inside Card */
            .wp-balance-card::before {
                content: ''; position: absolute; top: -40%; right: -20%; width: 250px; height: 250px;
                background: radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, rgba(0,0,0,0) 70%);
                border-radius: 50%; filter: blur(40px); z-index: 0;
            }
            .wp-balance-card::after {
                content: ''; position: absolute; bottom: -40%; left: -20%; width: 200px; height: 200px;
                background: radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, rgba(0,0,0,0) 70%);
                border-radius: 50%; filter: blur(40px); z-index: 0;
            }

            .wp-bal-header {
                position: relative; z-index: 1; display: flex; align-items: center; gap: 8px;
                color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;
                margin-bottom: 12px;
            }
            .wp-live-dot {
                width: 8px; height: 8px; background: #10b981; border-radius: 50%;
                box-shadow: 0 0 12px #10b981; animation: wpPulse 2s infinite;
            }
            @keyframes wpPulse {
                0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }

            .wp-bal-amount {
                position: relative; z-index: 1; font-size: 46px; font-weight: 800; color: #ffffff;
                letter-spacing: -1px; display: flex; align-items: baseline; gap: 5px;
                text-shadow: 0 4px 20px rgba(255,255,255,0.1);
            }
            .wp-bal-sym { font-size: 28px; color: #cbd5e1; font-weight: 600; }

            /* Action Buttons (Deposit, Withdrawal, Transactions) */
            .wp-actions-grid {
                display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 25px;
            }
            .wp-action-btn {
                background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 20px; padding: 18px 10px; display: flex; flex-direction: column;
                align-items: center; gap: 10px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                backdrop-filter: blur(10px); text-decoration: none;
            }
            .wp-action-btn:hover, .wp-action-btn:active {
                background: rgba(255, 255, 255, 0.08); transform: translateY(-3px);
                border-color: rgba(255, 255, 255, 0.15); box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            }
            .wp-icon-box {
                width: 48px; height: 48px; border-radius: 16px; display: flex; align-items: center; justify-content: center;
                font-size: 20px; transition: transform 0.3s ease;
            }
            .wp-action-btn:hover .wp-icon-box { transform: scale(1.1) rotate(5deg); }
            
            .wp-btn-dep .wp-icon-box { background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.2)); color: #34d399; border: 1px solid rgba(52,211,153,0.2); }
            .wp-btn-wit .wp-icon-box { background: linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.2)); color: #f87171; border: 1px solid rgba(248,113,113,0.2); }
            .wp-btn-tra .wp-icon-box { background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(79,70,229,0.2)); color: #818cf8; border: 1px solid rgba(129,140,248,0.2); }
            
            .wp-action-label { color: #e2e8f0; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; }

            /* Premium Toggle Switch (All / Trades) */
            .wp-toggle-wrapper {
                background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 100px; padding: 6px; display: flex; position: relative;
                margin-top: 30px; box-shadow: inset 0 2px 10px rgba(0,0,0,0.2);
            }
            /* The Sliding Pill */
            .wp-toggle-slider {
                position: absolute; top: 6px; bottom: 6px; left: 6px; width: calc(50% - 6px);
                background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 100px;
                transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); z-index: 1;
                box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
            }
            .wp-toggle-wrapper[data-active="trades"] .wp-toggle-slider {
                transform: translateX(100%);
            }
            
            .wp-toggle-btn {
                flex: 1; text-align: center; padding: 12px 0; z-index: 2; color: #94a3b8;
                font-size: 14px; font-weight: 700; cursor: pointer; transition: color 0.3s ease;
                user-select: none; -webkit-tap-highlight-color: transparent;
            }
            .wp-toggle-btn.active { color: #ffffff; }

            /* Dynamic Content Area */
            .wp-content-area {
                margin-top: 20px; min-height: 250px; transition: opacity 0.3s ease;
                position: relative;
            }
        `;
        document.head.appendChild(style);
    },

    // ==========================================
    // 4. RENDER MAIN UI
    // ==========================================
    renderUI() {
        // Find or create container
        let root = document.getElementById(this.containerId);
        if (!root) {
            root = document.createElement('div');
            root.id = this.containerId;
            document.body.appendChild(root);
        }

        root.innerHTML = `
            <div class="wp-container">
                
                <!-- Premium Balance Card -->
                <div class="wp-balance-card">
                    <div class="wp-bal-header">
                        <div class="wp-live-dot"></div> Available Balance
                    </div>
                    <div class="wp-bal-amount">
                        <span class="wp-bal-sym">₹</span>
                        <span id="wp-balance-val">0.00</span>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="wp-actions-grid">
                    <div class="wp-action-btn wp-btn-dep" onclick="window.location.href='wallet-deposit.html'">
                        <div class="wp-icon-box"><i class="fas fa-arrow-down"></i></div>
                        <div class="wp-action-label">Deposit</div>
                    </div>
                    <div class="wp-action-btn wp-btn-wit" onclick="window.location.href='wallet-withdrawal.html'">
                        <div class="wp-icon-box"><i class="fas fa-arrow-up"></i></div>
                        <div class="wp-action-label">Withdrawal</div>
                    </div>
                    <div class="wp-action-btn wp-btn-tra" onclick="window.location.href='wallet-transaction.html'">
                        <div class="wp-icon-box"><i class="fas fa-history"></i></div>
                        <div class="wp-action-label">Transactions</div>
                    </div>
                </div>

                <!-- Premium Toggle Switch -->
                <div class="wp-toggle-wrapper" id="wp-toggle-container" data-active="all">
                    <div class="wp-toggle-slider"></div>
                    <div class="wp-toggle-btn active" id="wp-tab-all" onclick="WalletPro.switchTab('all')">All</div>
                    <div class="wp-toggle-btn" id="wp-tab-trades" onclick="WalletPro.switchTab('trades')">Trades</div>
                </div>

                <!-- Dynamic Content Container -->
                <div class="wp-content-area" id="wp-dynamic-content"></div>

            </div>
        `;
    },

    // ==========================================
    // 5. TAB SWITCHING & DYNAMIC JS LOADING
    // ==========================================
    switchTab(tabName) {
        if (this.activeTab === tabName && document.getElementById('wp-dynamic-content').innerHTML !== '') return;
        this.activeTab = tabName;

        // Update Toggle UI
        const container = document.getElementById('wp-toggle-container');
        const btnAll = document.getElementById('wp-tab-all');
        const btnTrades = document.getElementById('wp-tab-trades');
        const contentArea = document.getElementById('wp-dynamic-content');

        container.setAttribute('data-active', tabName);
        
        if (tabName === 'all') {
            btnAll.classList.add('active');
            btnTrades.classList.remove('active');
        } else {
            btnTrades.classList.add('active');
            btnAll.classList.remove('active');
        }

        // Smooth Fade Out
        contentArea.style.opacity = '0';

        setTimeout(() => {
            contentArea.innerHTML = ''; // Clear content
            this.loadExternalModule(tabName, contentArea);
        }, 300); // Wait for fade out
    },

    loadExternalModule(tabName, contentArea) {
        // Mapping tabs to files and functions
        const config = {
            'all': { file: 'wallet-all.js', func: 'renderWalletAll' },
            'trades': { file: 'wallet-holding.js', func: 'renderWalletHolding' }
        };

        const module = config[tabName];
        const scriptId = `script-wp-${tabName}`;

        const executeRender = () => {
            if (typeof window[module.func] === 'function') {
                // Execute the function and pass the container ID so it knows where to render
                window[module.func]('wp-dynamic-content');
                contentArea.style.opacity = '1'; // Fade In
            } else {
                // Fail silently as requested: "jab tak main file nahi banaunga tab tak kuch show nahi hoga"
                contentArea.innerHTML = '';
                contentArea.style.opacity = '1';
            }
        };

        // Check if script is already injected
        if (document.getElementById(scriptId)) {
            // If it failed previously, we can try to remove and re-add it to fetch again
            if (typeof window[module.func] !== 'function') {
                document.getElementById(scriptId).remove();
            } else {
                executeRender();
                return;
            }
        }

        // Inject Script Dynamically
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = module.file;
        
        script.onload = () => {
            executeRender();
        };
        
        script.onerror = () => {
            // Fail silently: User hasn't created the file yet.
            // When they create it, clicking the tab again will re-attempt loading.
            contentArea.innerHTML = '';
            contentArea.style.opacity = '1';
            script.remove(); // Remove bad tag so it can be retried later
        };

        document.body.appendChild(script);
    },

    // ==========================================
    // 6. REAL-TIME BALANCE FETCHING & ANIMATION
    // ==========================================
    async fetchBalance() {
        if (!supa) return;
        try {
            const { data: authData } = await supa.auth.getUser();
            if (!authData || !authData.user) return;

            // Fetch from user_wallet_balance table
            const { data, error } = await supa
                .from('user_wallet_balance')
                .select('balance')
                .eq('uid', authData.user.id)
                .maybeSingle();

            if (data && !error) {
                const newBalance = parseFloat(data.balance) || 0;
                if (newBalance !== this.currentBalance) {
                    this.animateOdometer('wp-balance-val', this.currentBalance, newBalance, 1200);
                    this.currentBalance = newBalance;
                }
            }
        } catch (error) {
            console.error("WalletPro: Error fetching balance", error);
        }
    },

    startLiveSync() {
        // Initial Fetch
        this.fetchBalance();
        
        // Background Polling every 5 seconds for real-time feel
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(() => {
            this.fetchBalance();
        }, 5000);
    },

    // Premium Odometer Animation for Balance
    animateOdometer(elementId, start, end, duration) {
        const obj = document.getElementById(elementId);
        if (!obj) return;
        
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            
            // easeOutExpo for slot-machine slowdown effect
            const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            const currentVal = start + easeProgress * (end - start);
            
            obj.innerHTML = currentVal.toLocaleString('en-IN', {
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2
            });
            
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                obj.innerHTML = end.toLocaleString('en-IN', {
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2
                });
            }
        };
        window.requestAnimationFrame(step);
    }
};

// ==========================================
// 7. AUTO-INITIALIZE
// ==========================================
// Wait for DOM to be ready, then initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Ensure FontAwesome is loaded for icons
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const fa = document.createElement('link');
            fa.rel = 'stylesheet';
            fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';
            document.head.appendChild(fa);
        }
        WalletPro.init();
    });
} else {
    WalletPro.init();
}
