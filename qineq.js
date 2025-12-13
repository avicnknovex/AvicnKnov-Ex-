// qineq.js

// IIFE (Immediately Invoked Function Expression) to protect variables from global scope
(function() {
    // 1. Get the content container element
    const contentDiv = document.getElementById('qineq_content');

    if (!contentDiv) {
        console.error("Qineq content div not found!");
        return;
    }

    // 2. Define the attractive and informative content using the original, clean template
    const qineqContentHTML = `
        <style>
            /* Original clean styles maintained */
            .qineq-feature-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                padding: 25px;
                min-height: 100%; 
                box-sizing: border-box;
                background-color: #f7f9fc; /* Light background for contrast */
                border-radius: 8px;
            }

            .qineq-header {
                font-size: 28px;
                font-weight: bold;
                color: #000;
                margin-bottom: 5px;
                /* Attractive gradient text effect */
                background: linear-gradient(90deg, #1e3c72, #2a5298); /* Deep Blue Gradient */
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }

            .qineq-slogan {
                font-size: 18px;
                color: #555;
                margin-bottom: 25px;
                font-style: italic;
            }

            .qineq-section {
                background-color: #ffffff;
                border: 1px solid #e0e6ed;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); /* Subtle shadow */
                max-width: 600px;
                width: 100%;
                text-align: left;
            }

            .qineq-section h4 {
                font-size: 20px;
                color: #1e3c72; /* Blue header */
                margin-top: 0;
                border-bottom: 2px solid #3b82f6;
                padding-bottom: 5px;
                display: inline-block;
            }

            .qineq-section p {
                font-size: 15px;
                line-height: 1.6;
                color: #333;
            }
            
            .highlight {
                font-weight: bold;
                color: #3b82f6; /* Blue highlight */
            }

            .qineq-button {
                padding: 15px 30px;
                font-size: 18px;
                font-weight: bold;
                border: none;
                border-radius: 30px;
                color: white;
                cursor: pointer;
                transition: all 0.3s ease;
                /* Attractive Blue/Black Gradient Button */
                background: linear-gradient(45deg, #1e3c72, #3b82f6);
                box-shadow: 0 4px 15px rgba(30, 60, 114, 0.4);
                margin-top: 15px;
            }

            .qineq-button:hover {
                background: linear-gradient(45deg, #2a5298, #60a5fa);
                transform: translateY(-2px);
            }

            /* New style for the detailed text block below the button */
            .qineq-footer-detail {
                margin-top: 30px;
                max-width: 600px;
                text-align: center;
                border-top: 1px solid #ccc;
                padding-top: 20px;
            }
            
            .qineq-footer-detail p {
                font-size: 15px;
                line-height: 1.6;
                color: #555;
            }

            .verification-badge {
                color: #f59e0b; /* Amber/Gold color */
                font-weight: bold;
                margin-top: 15px;
                display: block;
            }
        </style>

        <div class="qineq-feature-container">
            <h2 class="qineq-header">Qineq - The Social Trading Hub on AvicnKnov Ex</h2>
            <p class="qineq-slogan">Connect. Share. Excel. Your Trading Journey, Amplified.</p>
            
            <div class="qineq-section">
                <h4>🤝 Exclusive Platform, Designed for Traders</h4>
                <p>
                    This platform is built <span class="highlight">exclusively for you</span>, the user. We have designed a special function where you can share your <span class="highlight">trading experience</span> and trading skills. It works just like a social media platform, allowing you to share your profits, skills, and other key trading aspects.
                </p>
            </div>

            <div class="qineq-section">
                <h4>📈 Share Skills & Follow Verified Masters</h4>
                <p>
                    You can follow other users from whom you gain experience or motivation. This feature is crucial for receiving their upcoming posts and updates. You will find <span class="highlight">verified users</span> here, making this a top-tier platform for connecting and learning from each other.
                </p>
                <p>
                    We are uniting all users to ensure they can share their <span class="highlight">trading mastery</span> and enjoy the journey together. You can follow and like posts from any user.
                </p>
            </div>
            
            <span class="verification-badge">
                <i class="fas fa-certificate"></i> Click Below to Launch this Exclusive Feature!
            </span>

            <button id="qineqLaunchButton" class="qineq-button">
                AvicnKnov Qineq
            </button>
            
            <div class="qineq-footer-detail">
                <p>
                    <span class="highlight">Qineq</span> is set to be a powerful <span class="highlight">social media platform</span> tailored for the trading community. Here, you can easily share your <span class="highlight">daily routine</span> and <span class="highlight">trading strategies</span>. 
                </p>
                <p>
                    This platform will significantly increase in the future, allowing you to build your own expertise, grow your audience retention, and motivate others by sharing your experiences and trading skills. This is your space to connect with the best.
                </p>
            </div>
            
        </div>
    `;

    // 3. Insert the HTML content into the designated Div
    contentDiv.innerHTML = qineqContentHTML;

    // 4. Add the click handler for the attractive button
    const launchButton = document.getElementById('qineqLaunchButton');
    if (launchButton) {
        launchButton.addEventListener('click', () => {
            // Action: Redirect the user to the qineq.html page
            window.location.href = 'qineq.html';
        });
    }

    console.log("Qineq feature loaded successfully.");

})(); // End of IIFE
