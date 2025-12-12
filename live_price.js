/* ==========================================================
   live_price.js – Live Price Section for Dashboard
   Top 25 Crypto prices from CoinGecko, updated every 1 second.
   (FIXED: Guaranteed immediate display using skeleton data)
   ========================================================== */

(function() {

    // --- CONFIGURATION ---
    const CONTENT_ID = 'live_price_content';
    const CONTAINER = document.getElementById(CONTENT_ID);
    
    // CoinGecko public API endpoint for top 25 tokens (sorted by market cap)
    const API_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&order=market_cap_desc&per_page=25&page=1&sparkline=false&price_change_percentage=24h';
    
    const REFRESH_INTERVAL_MS = 1000; 
    const REDIRECT_URL = 'markets.html'; // Corrected URL: markets.html
    
    let isFetching = false;
    let refreshInterval = null;

    if (!CONTAINER) {
        console.error('Error: Live Price container not found.');
        return;
    }

    // --- SKELETON DATA FOR IMMEDIATE DISPLAY (Ensures no initial error) ---
    // This data provides a structure for the user to see instantly while the real data loads.
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

    // --- HELPER FUNCTIONS ---
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
        // Only inject <style> once to keep the DOM clean
        if (CONTAINER.querySelector('.avx-token-table') === null) {
            CONTAINER.innerHTML = `
                <style>
                    /* Internal Styles for Attractive and Smart Look */
                    .avx-token-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 14px;
                        text-align: right;
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    }
                    .avx-token-table th, .avx-token-table td {
                        padding: 12px 10px;
                        border-bottom: 1px solid #e0e0e0;
                        white-space: nowrap;
                        transition: background-color 0.1s ease;
                    }
                    .avx-token-table th {
                        text-align: left;
                        font-weight: 700;
                        color: #444;
                        position: sticky; 
                        top: 0; 
                        background-color: #f3f4f6; 
                        z-index: 5;
                        border-bottom: 2px solid #ddd;
                    }
                    .avx-token-table tr {
                        cursor: pointer;
                        transition: background-color 0.15s ease;
                    }
                    .avx-token-table tr:hover {
                        background-color: #eef2ff;
                    }
                    .avx-token-table td:first-child {
                        text-align: center;
                        font-weight: 600;
                    }
                    .avx-token-table td:nth-child(2) {
                        text-align: left;
                    }
                    .avx-token-name {
                        display: flex;
                        align-items: center;
                        font-weight: 600;
                    }
                    .avx-token-icon {
                        width: 24px;
                        height: 24px;
                        margin-right: 8px;
                        border-radius: 50%;
                        box-shadow: 0 0 3px rgba(0,0,0,0.1);
                    }
                    .avx-symbol {
                        color: #999;
                        font-size: 11px;
                        margin-left: 5px;
                        font-weight: normal;
                    }
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

        tokens.forEach((token, index) => {
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


    // --- FETCH DATA ---
    async function fetchLivePrices() {
        if (isFetching) return;
        isFetching = true;

        try {
            const response = await fetch(API_URL);
            
            if (!response.ok) {
                // If API fails, log it but let the skeleton data remain visible
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                 // Successfully fetched live data, render it.
                 renderTable(data);
            } else {
                 throw new Error('No token data received from API.');
            }
            
        } catch (error) {
            console.error('Error fetching crypto data (using skeleton data as fallback):', error);
            // If the API call fails, the previously rendered table (skeleton or last successful data) remains. 
            const updateTimeDiv = document.getElementById('avx-live-price-update-time');
            if (updateTimeDiv) {
                 updateTimeDiv.innerHTML = `⚠️ Could not get latest data. Using previous values.`;
            }

        } finally {
            isFetching = false;
        }
    }


    // --- CLICK HANDLER & REDIRECT ---
    function setupClickHandlers() {
        // Attach listener to the main container (event delegation)
        CONTAINER.addEventListener('click', (event) => {
            // Find the closest table row that has the token symbol data
            let targetRow = event.target.closest('tr[data-symbol]');
            
            if (targetRow) {
                const symbol = targetRow.getAttribute('data-symbol');
                console.log(`Redirecting to market for token: ${symbol}`);
                // Redirect user to markets.html, passing the token symbol
                window.location.href = `${REDIRECT_URL}?token=${symbol}`;
            }
        });
    }


    // --- INITIALIZATION AND LIFECYCLE ---
    
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // 1. IMMEDIATE RENDER: Show skeleton data instantly to the user (FIX for no loading/error screen)
    renderTable(INITIAL_TOKENS);
    
    // 2. Initial fetch (runs right after rendering the skeleton)
    fetchLivePrices();

    // 3. Set up the 1-second periodic refresh
    refreshInterval = setInterval(fetchLivePrices, REFRESH_INTERVAL_MS);
    
    // 4. Setup click listeners
    setupClickHandlers();

})();
