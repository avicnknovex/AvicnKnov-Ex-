/* ==========================================================
   live_price.js – Live Price Section for Dashboard
   Top 25 Crypto prices from CoinGecko, updated every 1 second.
   (FIXED: Implemented Retry Logic for immediate data display)
   ========================================================== */

(function() {

    // --- CONFIGURATION ---
    const CONTENT_ID = 'live_price_content';
    const CONTAINER = document.getElementById(CONTENT_ID);
    
    const API_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&order=market_cap_desc&per_page=25&page=1&sparkline=false&price_change_percentage=24h';
    const REFRESH_INTERVAL_MS = 1000; 
    const REDIRECT_URL = 'markets.html'; 

    // --- NEW: RETRY LOGIC CONFIG ---
    const MAX_RETRIES = 3; 
    const RETRY_DELAY_MS = 1500; // 1.5 seconds wait before retrying

    let isFetching = false;
    let refreshInterval = null;

    if (!CONTAINER) {
        console.error('Error: Live Price container not found.');
        return;
    }

    // --- SKELETON DATA FOR IMMEDIATE DISPLAY ---
    // This is the fallback/instant view data.
    const INITIAL_TOKENS = [
        {
            name: "Bitcoin", symbol: "btc", image: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
            current_price: 5200000, price_change_percentage_24h: 0.85, market_cap: 102000000000000
        },
        {
            name: "Ethereum", symbol: "eth", image: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
            current_price: 350000, price_change_percentage_24h: 1.20, market_cap: 4500000000000
        },
        {
            name: "BNB", symbol: "bnb", image: "https://assets.coingecko.com/coins/images/825/small/bnb.png",
            current_price: 55000, price_change_percentage_24h: -0.50, market_cap: 1000000000000
        },
        {
            name: "Solana", symbol: "sol", image: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
            current_price: 15000, price_change_percentage_24h: 2.15, market_cap: 650000000000
        },
        {
            name: "XRP", symbol: "xrp", image: "https://assets.coingecko.com/coins/images/44/small/xrp.png",
            current_price: 45.00, price_change_percentage_24h: 0.10, market_cap: 350000000000
        }
    ];

    // --- UTILITY FUNCTIONS (Unchanged) ---
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

    // --- RENDER TABLE (Unchanged) ---
    function renderTable(tokens) {
        const tableExists = CONTAINER.querySelector('.avx-token-table') !== null;
        
        if (!tableExists) {
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
                    .avx-token-name { display: flex; align-items: center; font-weight: 600; }
                    .avx-token-icon {
                        width: 24px; height: 24px; margin-right: 8px; border-radius: 50%;
                        box-shadow: 0 0 3px rgba(0,0,0,0.1);
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
                <div id="avx-live-price-update-time" style="font-size: 10px; text-align: center; color: #aaa; padding: 10px;">
                    Loading live data...
                </div>
            `;
        }
        
        const tbody = document.getElementById('avx-live-price-tbody');
        const updateTimeDiv = document.getElementById('avx-live-price-update-time');
        
        let tbodyHTML = '';

        // If we only have skeleton data, render only those 5 rows
        const tokensToRender = tableExists ? tokens : tokens.slice(0, 5); 

        tokensToRender.forEach((token, index) => {
            const priceChange = token.price_change_percentage_24h || 0;
            const marketCap = token.market_cap || 0;
            
            tbodyHTML += `
                <tr data-symbol="${token.symbol.toUpperCase()}">
                    <td>${index + 1}</td>
                    <td>
                        <div class="avx-token-name">
                            <img src="${token.image}" alt="${token.symbol}" class="avx-token-icon">
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
        updateTimeDiv.innerHTML = `Data powered by CoinGecko. Last updated: ${new Date().toLocaleTimeString()}`;
    }


    // --- FETCH DATA WITH RETRY LOGIC (The Fix) ---
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
                 isFetching = false; // Success
                 return; 
            } else {
                 throw new Error('No token data received from API.');
            }
            
        } catch (error) {
            console.warn(`Attempt ${retryCount + 1} failed.`, error.message);

            if (retryCount < MAX_RETRIES) {
                // If it fails, wait and try again
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                await fetchLivePrices(retryCount + 1);
            } else {
                // All retries failed. Fallback to a clear message.
                console.error('All retries failed. Using previous/skeleton data.');
                const updateTimeDiv = document.getElementById('avx-live-price-update-time');
                if (updateTimeDiv) {
                    updateTimeDiv.innerHTML = `⚠️ Error: Could not get latest data. Using previous values.`;
                }
            }

        } finally {
            if (retryCount === 0 || retryCount === MAX_RETRIES) {
                isFetching = false;
            }
        }
    }


    // --- CLICK HANDLER & REDIRECT (Unchanged) ---
    function setupClickHandlers() {
        CONTAINER.addEventListener('click', (event) => {
            let targetRow = event.target.closest('tr[data-symbol]');
            
            if (targetRow) {
                const symbol = targetRow.getAttribute('data-symbol');
                console.log(`Redirecting to market for token: ${symbol}`);
                window.location.href = `${REDIRECT_URL}?token=${symbol}`;
            }
        });
    }


    // --- INITIALIZATION AND LIFECYCLE ---
    
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // 1. IMMEDIATE RENDER: Show skeleton data instantly (Fixes the initial blank/error screen)
    renderTable(INITIAL_TOKENS);
    
    // 2. Initial fetch with retries
    fetchLivePrices();

    // 3. Set up the 1-second periodic refresh
    refreshInterval = setInterval(fetchLivePrices, REFRESH_INTERVAL_MS);
    
    // 4. Setup click listeners
    setupClickHandlers();

})();
