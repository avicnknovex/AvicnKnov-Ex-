(async function() {
    const container = document.getElementById('announcement_content');
    if (!container) return;

    // --- FINAL CLEAN STYLING (No Icon, No Hashtag) ---
    const styleSheet = `
    <style>
        .ann-container { padding: 15px; background: #fafafa; min-height: 100%; }
        
        .premium-card { 
            background: #ffffff; border-radius: 20px; margin-bottom: 25px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.08); overflow: hidden; 
            border: 1px solid rgba(0,0,0,0.03); animation: slideUp 0.6s ease-out;
            position: relative;
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Header Branding - Clean Text Only */
        .ann-header { 
            padding: 20px 25px; display: flex; align-items: center; 
            background: #ffffff;
            border-bottom: 1px solid #f8f9fa;
        }
        .brand-meta { display: flex; flex-direction: column; }
        .brand-name { 
            font-weight: 800; color: #1a202c; font-size: 18px; 
            display: flex; align-items: center; gap: 8px; 
        }
        .brand-status { 
            font-size: 11px; color: #3b82f6; font-weight: 700; 
            text-transform: uppercase; letter-spacing: 0.8px; margin-top: 3px; 
        }
        
        /* Verified Tick */
        .fa-check-circle { color: #3b82f6; font-size: 16px; }

        /* Media Section */
        .ann-media { width: 100%; background: #000; overflow: hidden; line-height: 0; }
        .ann-media img, .ann-media video { 
            width: 100%; display: block; max-height: 550px; object-fit: contain; 
        }

        /* Content Section */
        .ann-details { padding: 25px; }
        .ann-title { 
            font-size: 22px; font-weight: 800; color: #1e3c72; 
            margin-bottom: 12px; line-height: 1.3;
        }
        .ann-desc { 
            font-size: 15.5px; color: #4a5568; line-height: 1.8; 
            white-space: pre-wrap; margin-bottom: 5px;
        }

        /* Action Button */
        .action-btn { 
            display: flex; align-items: center; justify-content: center; gap: 10px;
            margin: 5px 25px 30px 25px; padding: 15px; 
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            color: #fff !important; text-decoration: none !important; 
            border-radius: 14px; font-weight: 700; font-size: 16px;
            box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
            transition: all 0.3s ease;
        }
        .action-btn:hover { transform: translateY(-3px); box-shadow: 0 12px 25px rgba(59, 130, 246, 0.4); }

        /* Footer - Time Only */
        .ann-footer { 
            padding: 15px 25px; background: #fcfcfc; border-top: 1px solid #f1f1f1;
            display: flex; justify-content: flex-start; align-items: center;
        }
        .ann-time { font-size: 12.5px; color: #a0aec0; display: flex; align-items: center; gap: 7px; }

        /* Empty State */
        .empty-state { 
            text-align: center; padding: 120px 20px; color: #cbd5e0; 
        }
        .empty-state i { font-size: 60px; margin-bottom: 20px; opacity: 0.5; }
        .empty-state h3 { color: #4a5568; margin-bottom: 10px; font-size: 22px; }
    </style>`;
    document.head.insertAdjacentHTML('beforeend', styleSheet);

    container.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin" style="color:#3b82f6"></i><p>Loading Official Announcements...</p></div>`;

    async function fetchAnnouncements() {
        try {
            const { data, error } = await sb
                .from('user_announcement')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-bullhorn"></i>
                        <h3>No Announcements</h3>
                        <p>Important updates will be shown here.</p>
                    </div>`;
                return;
            }

            container.innerHTML = '<div class="ann-container"></div>';
            const mainDiv = container.querySelector('.ann-container');

            data.forEach(item => {
                let mediaTag = '';
                if (item.content_url) {
                    if (item.content_type === 'video') {
                        mediaTag = `<div class="ann-media"><video controls preload="metadata"><source src="${item.content_url}" type="video/mp4"></video></div>`;
                    } else if (item.content_type === 'image') {
                        mediaTag = `<div class="ann-media"><img src="${item.content_url}" alt="Announcement"></div>`;
                    }
                }

                const buttonTag = item.action_link ? 
                    `<a href="${item.action_link}" target="_blank" class="action-btn">
                        <i class="fas fa-external-link-alt"></i> VIEW DETAILS
                    </a>` : '';

                const postDate = new Date(item.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                });

                const card = `
                    <div class="premium-card">
                        <div class="ann-header">
                            <div class="brand-meta">
                                <div class="brand-name">AvicnKnov Ex <i class="fas fa-check-circle"></i></div>
                                <div class="brand-status">OFFICIAL ANNOUNCEMENT </div>
                            </div>
                        </div>
                        
                        ${mediaTag}
                        
                        <div class="ann-details">
                            ${item.title ? `<div class="ann-title">${item.title}</div>` : ''}
                            <div class="ann-desc">${item.content_text || ''}</div>
                        </div>
                        
                        ${buttonTag}
                        
                        <div class="ann-footer">
                            <div class="ann-time"><i class="far fa-clock"></i> ${postDate}</div>
                        </div>
                    </div>
                `;
                mainDiv.insertAdjacentHTML('beforeend', card);
            });

        } catch (err) {
            container.innerHTML = `<div class="empty-state" style="color:#e53e3e"><i class="fas fa-exclamation-triangle"></i><p>Connection Error.</p></div>`;
            console.error(err);
        }
    }

    fetchAnnouncements();
})();
