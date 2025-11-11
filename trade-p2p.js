// P2P Trading Interface - Attractive Design with Animations
document.addEventListener('DOMContentLoaded', function() {
    
    // Create P2P Section Content
    const p2pSection = document.getElementById('p2p');
    
    if (p2pSection) {
        p2pSection.innerHTML = `
            <div class="p2p-container">
                <!-- Main P2P Button -->
                <div class="p2p-main-button" id="p2pMainBtn">
                    <div class="button-icon">
                        <i class="fas fa-handshake"></i>
                    </div>
                    <div class="button-text">
                        <span class="main-text">P2P Trading</span>
                        <span class="sub-text">Peer to Peer Exchange</span>
                    </div>
                    <div class="button-arrow">
                        <i class="fas fa-arrow-right"></i>
                    </div>
                </div>

                <!-- P2P Details Section -->
                <div class="p2p-details">
                    <h3><i class="fas fa-info-circle"></i> P2P Trading Benefits</h3>
                    <div class="benefits-grid">
                        <div class="benefit-item">
                            <i class="fas fa-shield-alt"></i>
                            <h4>Secure Trading</h4>
                            <p>100% secure escrow system protects your funds</p>
                        </div>
                        <div class="benefit-item">
                            <i class="fas fa-clock"></i>
                            <h4>24/7 Trading</h4>
                            <p>Trade anytime with users worldwide</p>
                        </div>
                        <div class="benefit-item">
                            <i class="fas fa-coins"></i>
                            <h4>Best Rates</h4>
                            <p>Get the best market rates from real users</p>
                        </div>
                        <div class="benefit-item">
                            <i class="fas fa-users"></i>
                            <h4>Direct Trading</h4>
                            <p>Trade directly with other users without intermediaries</p>
                        </div>
                    </div>
                    
                    <div class="p2p-features">
                        <div class="feature">
                            <i class="fas fa-check-circle"></i>
                            <span>Zero trading fees for makers</span>
                        </div>
                        <div class="feature">
                            <i class="fas fa-check-circle"></i>
                            <span>Multiple payment methods supported</span>
                        </div>
                        <div class="feature">
                            <i class="fas fa-check-circle"></i>
                            <span>Real-time dispute resolution</span>
                        </div>
                        <div class="feature">
                            <i class="fas fa-check-circle"></i>
                            <span>Advanced filtering options</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add CSS Styles
        const style = document.createElement('style');
        style.textContent = `
            .p2p-container {
                max-width: 600px;
                margin: 0 auto;
                padding: 30px 20px;
            }

            /* Main P2P Button Styles */
            .p2p-main-button {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 20px;
                padding: 25px 30px;
                margin: 20px 0 40px 0;
                cursor: pointer;
                box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                position: relative;
                overflow: hidden;
            }

            .p2p-main-button::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                transition: left 0.6s;
            }

            .p2p-main-button:hover::before {
                left: 100%;
            }

            .p2p-main-button:hover {
                transform: translateY(-5px) scale(1.02);
                box-shadow: 0 15px 40px rgba(102, 126, 234, 0.4);
            }

            .p2p-main-button:active {
                transform: translateY(-2px) scale(0.98);
            }

            .button-icon {
                font-size: 2.5rem;
                color: #fff;
                margin-right: 20px;
                animation: pulse 2s infinite;
            }

            .button-text {
                flex: 1;
                color: #fff;
            }

            .main-text {
                display: block;
                font-size: 1.8rem;
                font-weight: bold;
                margin-bottom: 5px;
            }

            .sub-text {
                display: block;
                font-size: 1rem;
                opacity: 0.9;
                font-weight: 300;
            }

            .button-arrow {
                font-size: 1.5rem;
                color: #fff;
                transition: transform 0.3s ease;
            }

            .p2p-main-button:hover .button-arrow {
                transform: translateX(10px);
            }

            /* P2P Details Section */
            .p2p-details {
                animation: fadeInUp 0.8s ease-out 0.3s both;
            }

            .p2p-details h3 {
                text-align: center;
                color: #333;
                margin-bottom: 30px;
                font-size: 1.5rem;
                font-weight: 600;
            }

            .p2p-details h3 i {
                color: #667eea;
                margin-right: 10px;
            }

            .benefits-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }

            .benefit-item {
                background: #fff;
                border-radius: 15px;
                padding: 25px 20px;
                text-align: center;
                box-shadow: 0 5px 20px rgba(0,0,0,0.08);
                transition: all 0.3s ease;
                border: 1px solid #f0f0f0;
            }

            .benefit-item:hover {
                transform: translateY(-8px);
                box-shadow: 0 15px 40px rgba(0,0,0,0.15);
            }

            .benefit-item i {
                font-size: 2.5rem;
                color: #667eea;
                margin-bottom: 15px;
                display: block;
            }

            .benefit-item h4 {
                color: #333;
                margin-bottom: 10px;
                font-size: 1.2rem;
                font-weight: 600;
            }

            .benefit-item p {
                color: #666;
                font-size: 0.95rem;
                line-height: 1.5;
                margin: 0;
            }

            .p2p-features {
                background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                border-radius: 15px;
                padding: 25px;
                margin-top: 20px;
            }

            .feature {
                display: flex;
                align-items: center;
                margin-bottom: 12px;
                color: #333;
                font-weight: 500;
            }

            .feature:last-child {
                margin-bottom: 0;
            }

            .feature i {
                color: #28a745;
                margin-right: 15px;
                font-size: 1.1rem;
            }

            /* Animations */
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1); }
            }

            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            /* Click Effect */
            .p2p-main-button.clicked {
                animation: clickEffect 0.6s ease-out;
            }

            @keyframes clickEffect {
                0% { transform: scale(1); }
                50% { transform: scale(0.95); }
                100% { transform: scale(1); }
            }

            /* Mobile Responsive */
            @media (max-width: 768px) {
                .p2p-container {
                    padding: 20px 15px;
                }

                .p2p-main-button {
                    padding: 20px 25px;
                    margin: 15px 0 30px 0;
                }

                .button-icon {
                    font-size: 2rem;
                    margin-right: 15px;
                }

                .main-text {
                    font-size: 1.5rem;
                }

                .sub-text {
                    font-size: 0.9rem;
                }

                .benefits-grid {
                    grid-template-columns: 1fr;
                    gap: 15px;
                }

                .benefit-item {
                    padding: 20px 15px;
                }
            }
        `;

        document.head.appendChild(style);

        // Add Click Event Listener
        const p2pButton = document.getElementById('p2pMainBtn');
        if (p2pButton) {
            p2pButton.addEventListener('click', function() {
                // Add click animation
                this.classList.add('clicked');
                
                // Remove animation class after animation completes
                setTimeout(() => {
                    this.classList.remove('clicked');
                }, 600);

                // Redirect to P2P HTML page with smooth transition
                setTimeout(() => {
                    // Add a fade out effect before redirect
                    document.body.style.transition = 'opacity 0.3s ease-out';
                    document.body.style.opacity = '0';
                    
                    setTimeout(() => {
                        window.location.href = 'p2p.html';
                    }, 300);
                }, 200);
            });

            // Add ripple effect on click
            p2pButton.addEventListener('click', function(e) {
                const ripple = document.createElement('div');
                const rect = this.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const x = e.clientX - rect.left - size / 2;
                const y = e.clientY - rect.top - size / 2;
                
                ripple.style.cssText = `
                    position: absolute;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.3);
                    width: ${size}px;
                    height: ${size}px;
                    left: ${x}px;
                    top: ${y}px;
                    animation: rippleEffect 0.6s ease-out;
                    pointer-events: none;
                `;

                // Add ripple animation
                const rippleStyle = document.createElement('style');
                rippleStyle.textContent = `
                    @keyframes rippleEffect {
                        from {
                            transform: scale(0);
                            opacity: 1;
                        }
                        to {
                            transform: scale(2);
                            opacity: 0;
                        }
                    }
                `;
                document.head.appendChild(rippleStyle);

                this.appendChild(ripple);

                // Remove ripple after animation
                setTimeout(() => {
                    ripple.remove();
                }, 600);
            });
        }
    }
});
