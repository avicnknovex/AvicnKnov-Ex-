
(function() {
    const container = document.getElementById('more_content');
    if (!container) return;

    // --- PREMIUM UI STYLING ---
    const styleSheet = `
    <style>
        .more-wrapper {
            padding: 25px 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            background: #ffffff;
            min-height: 100%;
        }

        /* Menu Container */
        .more-menu {
            width: 100%;
            max-width: 400px;
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-bottom: 40px;
        }

        /* Modern Gradient Buttons */
        .more-btn {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 18px 25px;
            border-radius: 16px;
            text-decoration: none;
            color: #ffffff !important;
            font-weight: 700;
            font-size: 16px;
            transition: all 0.3s ease;
            box-shadow: 0 8px 20px rgba(0,0,0,0.1);
            border: none;
            cursor: pointer;
        }

        .more-btn:active {
            transform: scale(0.96);
        }

        .btn-events {
            background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
        }

        .btn-prime {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }

        .btn-icon {
            font-size: 20px;
            background: rgba(255, 255, 255, 0.2);
            width: 35px;
            height: 35px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
        }

        /* Future Vision Section */
        .future-box {
            width: 100%;
            max-width: 400px;
            padding: 25px;
            background: #f8fafc;
            border-radius: 20px;
            border: 1px dashed #cbd5e1;
            text-align: center;
            animation: fadeIn 0.8s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .future-title {
            color: #1e293b;
            font-size: 18px;
            font-weight: 800;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .future-text {
            color: #64748b;
            font-size: 14px;
            line-height: 1.8;
            font-style: italic;
        }

        .future-highlight {
            color: #3b82f6;
            font-weight: 600;
        }

        .brand-footer {
            margin-top: 30px;
            font-size: 12px;
            color: #94a3b8;
            font-weight: 500;
        }
    </style>`;
    document.head.insertAdjacentHTML('beforeend', styleSheet);

    // --- BUILDING THE CONTENT ---
    container.innerHTML = `
        <div class="more-wrapper">
            <div class="more-menu">
                <a href="events.html" class="more-btn btn-events">
                    <span><i class="fas fa-calendar-star" style="margin-right:10px;"></i> EVENTS</span>
                    <div class="btn-icon"><i class="fas fa-chevron-right"></i></div>
                </a>

                <a href="platform.html" class="more-btn btn-prime">
                    <span><i class="fas fa-crown" style="margin-right:10px;"></i> AvicnKnov </span>
                    <div class="btn-icon"><i class="fas fa-chevron-right"></i></div>
                </a>
            </div>

            <div class="future-box">
                <div class="future-title">
                    <i class="fas fa-rocket" style="color:#3b82f6;"></i> Future Experience
                </div>
                <p class="future-text">
                    Hamare exchange par <span class="future-highlight">Future mein bahut hi behtareen aur advanced options</span> aane wale hain. 
                    Inka use karne par aapko ek naya aur <span class="future-highlight">extraordinary experience</span> milega. 
                    Hum lagatar nayi technologies par kaam kar rahe hain taki <span class="future-highlight">AvicnKnov Ex</span> aapke trading journey ko aur bhi aasaan aur munafabaksh (profitable) bana sake.
                </p>
            </div>

            <div class="brand-footer">
                AvicnKnov Ex • Version 2.0.1
            </div>
        </div>
    `;

})();
