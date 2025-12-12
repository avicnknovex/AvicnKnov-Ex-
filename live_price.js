/* ==========================================================
   live_price.js – Live Price Section for Dashboard
   Top 25 Crypto prices from CoinGecko, updated every 2 seconds.
   ========================================================== */

(function() {

    // --- CONFIGURATION ---
    const CONTENT_ID = 'live_price_content';
    const CONTAINER = document.getElementById(CONTENT_ID);
    
    // CoinGecko public API endpoint for top 25 tokens (sorted by market cap)
    // vs_currency is set to INR (assuming INR is the local currency based on HTML structure)
    const API_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&order=market_cap_desc&per_page=25&page=1&sparkline=false&price_change_percentage=24h';
    
    const REFRESH_INTERVAL_MS = 2000; // 2 seconds update interval (as requested)
    const REDIRECT_URL = 'market.html';
    
    let isFetching = false;
    let refreshInterval = null;

    if (!CONTAINER) {
        console.error('Error: Live Price container not found.');
        return;
    }

    // --- HELPER FUNCTIONS ---

    // Function to format price into INR currency (lakhs/crores style)
    function formatCurrency(value) {
        if (value === null || value === undefined) return 'N/A';
        // Use Intl.NumberFormat for clean, localized currency formatting
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: value >= 100 ? 2 : 4,
            maximumFractionDigits: value >= 100 ? 2 : 6,
        }).format(value);
    }

    // Function to format percentage (with sign and color)
    function formatChange(value) {
        const sign = value >= 0 ? '+' : '';
        const color = value >= 0 ? '#10b981' : '#ef4444'; // Green for positive, Red for negative
        
        return `<span style="color: ${color}; font-weight: bold;">${sign}${value.toFixed(2)}%</span>`;
    }

    // --- RENDER TABLE ---
    function renderTable(tokens) {
        let tableHTML = `
            <style>
                /* Internal Styles for Attractive Look */
                .avx-token-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 14px;
                    text-align: right;
                }
                .avx-token-table th, .avx-token-table td {
                    padding: 12px 10px;
                    border-bottom: 1px solid #f0f0f0;
                    white-space: nowrap;
                }
                .avx-token-table th {
                    text-align: left;
                    font-weight: 600;
                    color: #555;
                    position: sticky; /* Sticky header for internal scroll */
                    top: 0; 
                    background-color: #f7f7f7;
                    z-index: 5;
                }
                .avx-token-table tr:hover {
                    background-color: #eef2ff;
                    cursor: pointer;
                }
                .avx-token-table td:first-child {
                    text-align: center;
                }
                .avx-token-table td:nth-child(2) {
                    text-align: left;
                }
                .avx-token-name {
                    display: flex;
                    align-items: center;
                }
                .avx-token-icon {
                    width: 24px;
                    height: 24px;
                    margin-right: 8px;
                    border-radius: 50%;
                }
                .avx-symbol {
                    color: #777;
                    font-size: 12px;
                    margin-left: 5px;
                }
            </style>
            <table class="avx-token-table">
                <thead>
                    <tr>
                        <th style="width: 5%; text-align: center;">#</th>
                        <th style="width: 30%; text-align: left;">Name</th>
                        <th style="width: 25%;">Price (INR)</th>
                        <th style="width: 20%;">24h %</th>
                        <th style="width: 20%;">Market Cap</th>
                    </tr>
                </thead>
                <tbody>
        `;

        tokens.forEach((token, index) => {
            const priceChange = token.price_change_percentage_24h || 0;
            const marketCap = token.market_cap || 0;
            
            tableHTML += `
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
                    <td>${formatCurrency(marketCap)}</td>
                </tr>
            `;
        });

        tableHTML += `
                </tbody>
            </table>
            <div style="font-size: 10px; text-align: center; color: #aaa; padding: 10px;">
                Data powered by CoinGecko. Last updated: ${new Date().toLocaleTimeString()}
            </div>
        `;

        CONTAINER.innerHTML = tableHTML;
    }


    // --- FETCH DATA ---
    async function fetchLivePrices() {
        // Prevent simultaneous fetching
        if (isFetching) return;
        isFetching = true;

        // Display a temporary loading state for the first load or if fetching takes time
        if (CONTAINER.innerHTML.indexOf('avx-token-table') === -1) {
            CONTAINER.innerHTML = `
                <div style="text-align: center; padding: 50px; color: #555;">
                    <i class="fas fa-sync-alt fa-spin" style="margin-right: 10px;"></i>
                    Fetching live market data (25 Tokens)...
                </div>`;
        }

        try {
            const response = await fetch(API_URL);
            
            if (!response.ok) {
                // If the API limit is hit or another error occurs, log it but don't crash
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                 renderTable(data);
            } else {
                 throw new Error('No token data received from API.');
            }
            
        } catch (error) {
            console.error('Error fetching crypto data:', error);
            // Display error clearly in the box
            CONTAINER.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #ef4444; font-weight: bold;">
                    ❌ Error: Live market data could not be loaded. (API/Network Issue)
                </div>`;
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
                // Redirect user to market.html, passing the token symbol in the query parameter
                // This symbol can be read by market.html to load the correct chart/trading interface
                window.location.href = `${REDIRECT_URL}?token=${symbol}`;
            }
        });
    }


    // --- INITIALIZATION AND LIFECYCLE ---
    
    // Clear the existing interval if the script reloads (good practice)
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // 1. Initial fetch
    fetchLivePrices();

    // 2. Set up the 2-second periodic refresh
    refreshInterval = setInterval(fetchLivePrices, REFRESH_INTERVAL_MS);
    
    // 3. Setup click listeners after the DOM is ready and content is available
    setupClickHandlers();

    // Optional: Clean up interval when the user switches away from the Live Price tab
    // This requires checking the 'active' class on the buttons, but for simplicity here, 
    // we rely on the main dashboard script managing visibility.
    // If the main dashboard unloads the script, the interval will stop.

})();
