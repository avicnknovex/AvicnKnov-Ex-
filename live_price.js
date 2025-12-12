/* ==========================================================
   live_price.js – Live Price Section for Dashboard
   Top 30 Crypto prices, updated every 1 second, no source mention or logos.
   ========================================================== */

(function() {

    // --- CONFIGURATION ---
    const CONTENT_ID = 'live_price_content';
    const CONTAINER = document.getElementById(CONTENT_ID);
    
    // API URL updated to fetch 30 tokens
    const API_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&order=market_cap_desc&per_page=30&page=1&sparkline=false&price_change_percentage=24h';
    
    const REFRESH_INTERVAL_MS = 1000; 
    const REDIRECT_URL = 'markets.html'; 

    // --- RETRY LOGIC CONFIG ---
    const MAX_RETRIES = 3; 
    const RETRY_DELAY_MS = 1500; 

    let isFetching = false;
    let refreshInterval = null;

    if (!CONTAINER) {
        console.error('Error: Live Price container not found.');
        return;
    }

    // --- SKELETON DATA FOR IMMEDIATE DISPLAY (30 Placeholders) ---
    const INITIAL_TOKENS = [
        { name: "Bitcoin", symbol: "btc", current_price: 5200000, price_change_percentage_24h: 0.85, market_cap: 102000000000000 },
        { name: "Ethereum", symbol: "eth", current_price: 350000, price_change_percentage_24h: 1.20, market_cap: 4500000000000 },
        { name: "BNB", symbol: "bnb", current_price: 55000, price_change_percentage_24h: -0.50, market_cap: 1000000000000 },
        { name: "Solana", symbol: "sol", current_price: 15000, price_change_percentage_24h: 2.15, market_cap: 650000000000 },
        { name: "XRP", symbol: "xrp", current_price: 45.00, price_change_percentage_24h: 0.10, market_cap: 350000000000 },
        
        { name: "Dogecoin", symbol: "doge", current_price: 15.00, price_change_percentage_24h: 0.45, market_cap: 220000000000 },
        { name: "Cardano", symbol: "ada", current_price: 35.00, price_change_percentage_24h: -1.10, market_cap: 120000000000 },
        { name: "Avalanche", symbol: "avax", current_price: 3000.00, price_change_percentage_24h: 3.50, market_cap: 100000000000 },
        { name: "Polkadot", symbol: "dot", current_price: 600.00, price_change_percentage_24h: -0.90, market_cap: 90000000000 },
        { name: "Polygon", symbol: "matic", current_price: 70.00, price_change_percentage_24h: 0.75, market_cap: 80000000000 },

        { name: "Litecoin", symbol: "ltc", current_price: 7000.00, price_change_percentage_24h: 0.30, market_cap: 75000000000 },
        { name: "Chainlink", symbol: "link", current_price: 1500.00, price_change_percentage_24h: 1.50, market_cap: 60000000000 },
        { name: "Uniswap", symbol: "uni", current_price: 800.00, price_change_percentage_24h: -2.00, market_cap: 55000000000 },
        { name: "Cosmos", symbol: "atom", current_price: 850.00, price_change_percentage_24h: 1.05, market_cap: 50000000000 },
        { name: "Ethereum Classic", symbol: "etc", current_price: 2500.00, price_change_percentage_24h: 0.05, market_cap: 48000000000 },

        { name: "Filecoin", symbol: "fil", current_price: 500.00, price_change_percentage_24h: -1.80, market_cap: 40000000000 },
        { name: "Near Protocol", symbol: "near", current_price: 500.00, price_change_percentage_24h: 4.00, market_cap: 35000000000 },
        { name: "Aptos", symbol: "apt", current_price: 600.00, price_change_percentage_24h: 0.50, market_cap: 32000000000 },
        { name: "Hedera", symbol: "hbar", current_price: 7.00, price_change_percentage_24h: -0.20, market_cap: 30000000000 },
        { name: "Monero", symbol: "xmr", current_price: 12000.00, price_change_percentage_24h: 0.60, market_cap: 28000000000 },

        { name: "TRON", symbol: "trx", current_price: 10.00, price_change_percentage_24h: 1.15, market_cap: 25000000000 },
        { name: "VeChain", symbol: "vet", current_price: 2.50, price_change_percentage_24h: 0.35, market_cap: 22000000000 },
        { name: "Injective", symbol: "inj", current_price: 2000.00, price_change_percentage_24h: 5.20, market_cap: 20000000000 },
        { name: "Fantom", symbol: "ftm", current_price: 30.00, price_change_percentage_24h: -0.70, market_cap: 18000000000 },
        { name: "The Graph", symbol: "grt", current_price: 20.00, price_change_percentage_24h: 1.00, market_cap: 16000000000 },

        { name: "Stacks", symbol: "stx", current_price: 180.00, price_change_percentage_24h: 2.50, market_cap: 15000000000 },
        { name: "Flow", symbol: "flow", current_price: 60.00, price_change_percentage_24h: -0.15, market_cap: 14000000000 },
        { name: "EOS", symbol: "eos", current_price: 75.00, price_change_percentage_24h: 0.88, market_cap: 13000000000 },
        { name: "Theta Network", symbol: "theta", current_price: 100.00, price_change_percentage_24h: 1.40, market_cap: 12000000000 },
        { name: "Maker", symbol: "mkr", current_price: 250000.00, price_change_percentage_24h: 0.22, market_cap: 11000000000 }
    ];

    // --- UTILITY FUNCTIONS ---
    function formatCurrency(value) {
        if (value === null || value === undefined) return 'N/A';
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: value >= 100 ? 2 : 4,
            maximumFractionDigits: value >= 100 ? 2 : 6,
        }).format(value);
    }

    function formatMarketCap(value) {
        if (value === null || value === undefined) return 'N/A';
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    }

    function formatChange(value) {
        const sign = value >= 0 ? '+' : '';
        const color = value >= 0 ? '#10b981' : '#ef4444'; 
        
        return `<span style="color: ${color}; font-weight: bold;">${sign}${value.toFixed(2)}%</span>`;
    }

    // --- RENDER TABLE ---
    function renderTable(tokens) {
        const tableExists = CONTAINER.querySelector('.avx-token-table') !== null;
        
        if (!tableExists) {
            // First time render: Inject styles and table structure
            CONTAINER.innerHTML = `
                <style>
                    /* Internal Styles for Attractive and Smart Look */
                    .avx-token-table {
                        width: 100%; border-collapse: collapse; font-size: 14px; text-align: right;
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    }
                    .avx-token-table th, .avx-token-table td {
                        padding: 12px 10px; border-bottom: 1px solid #e0e0e0; white-space: nowrap;
                        transition: background-color 0.1s ease;
                    }
                    .avx-token-table th {
                        text-align: left; font-weight: 700; color: #444; position: sticky; top: 0; 
                        background-color: #f3f4f6; z-index: 5; border-bottom: 2px solid #ddd;
                    }
                    .avx-token-table tr { cursor: pointer; transition: background-color 0.15s ease; }
                    .avx-token-table tr:hover { background-color: #eef2ff; }
                    .avx-token-table td:first-child { text-align: center; font-weight: 600; }
                    .avx-token-table td:nth-child(2) { text-align: left; }
                    /* UPDATED CSS: Removed icon styles and centered text properly */
                    .avx-token-name { 
                        display: flex; 
                        align-items: center; 
                        font-weight: 600; 
                        /* Ensure alignment is clean without an icon */
                    }
                    .avx-symbol { color: #999; font-size: 11px; margin-left: 5px; font-weight: normal; }
                </style>
                <table class="avx-token-table">
                    <thead>
                        <tr>
                            <th style="width: 5%; text-align: center;">#</th>
                            <th style="width: 30%; text-align: left;">Token Name</th>
                            <th style="width: 25%;">Live Price (INR)</th>
                            <th style="width: 20%;">24h % Change</th>
                            <th style="width: 20%;">Market Cap</th>
                        </tr>
                    </thead>
                    <tbody id="avx-live-price-tbody"></tbody>
                </table>
            `;
        }
        
        const tbody = document.getElementById('avx-live-price-tbody');
        let tbodyHTML = '';

        tokens.forEach((token, index) => {
            const priceChange = token.price_change_percentage_24h || 0;
            const marketCap = token.market_cap || 0;
            
            tbodyHTML += `
                <tr data-symbol="${token.symbol.toUpperCase()}">
                    <td>${index + 1}</td>
                    <td>
                        <div class="avx-token-name">
                            <span>${token.name}</span>
                            <span class="avx-symbol">${token.symbol.toUpperCase()}</span>
                        </div>
                    </td>
                    <td>${formatCurrency(token.current_price)}</td>
                    <td>${formatChange(priceChange)}</td>
                    <td>${formatMarketCap(marketCap)}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = tbodyHTML;
    }


    // --- FETCH DATA WITH RETRY LOGIC ---
    async function fetchLivePrices(retryCount = 0) {
        if (isFetching && retryCount === 0) return;
        isFetching = true;

        try {
            const response = await fetch(API_URL);
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                 renderTable(data);
                 isFetching = false; 
                 return; 
            } else {
                 throw new Error('No token data received from API.');
            }
            
        } catch (error) {
            if (retryCount < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                await fetchLivePrices(retryCount + 1);
            } else {
                // If all retries fail, no visible error is displayed to the user.
            }

        } finally {
            if (retryCount === 0 || retryCount === MAX_RETRIES) {
                isFetching = false;
            }
        }
    }


    // --- CLICK HANDLER & REDIRECT ---
    function setupClickHandlers() {
        CONTAINER.addEventListener('click', (event) => {
            let targetRow = event.target.closest('tr[data-symbol]');
            
            if (targetRow) {
                const symbol = targetRow.getAttribute('data-symbol');
                window.location.href = `${REDIRECT_URL}?token=${symbol}`;
            }
        });
    }


    // --- INITIALIZATION AND LIFECYCLE ---
    
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // 1. IMMEDIATE RENDER: Show skeleton data instantly for 30 tokens
    renderTable(INITIAL_TOKENS);
    
    // 2. Initial fetch with retries
    fetchLivePrices();

    // 3. Set up the 1-second periodic refresh
    refreshInterval = setInterval(fetchLivePrices, REFRESH_INTERVAL_MS);
    
    // 4. Setup click listeners
    setupClickHandlers();

})();
