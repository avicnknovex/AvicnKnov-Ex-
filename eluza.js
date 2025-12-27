(function() {
    const container = document.getElementById('eluza_content');
    
    // CSS Styling
    const styles = `
        .eluza-wrapper { font-family: 'Segoe UI', Roboto, sans-serif; color: #333; padding-bottom: 50px; background: #fafafa; }
        .eluza-card { background: #fff; border-radius: 16px; margin: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); overflow: hidden; border: 1px solid #f0f0f0; }
        
        /* Premium Header Branding */
        .eluza-header { display: flex; align-items: center; padding: 12px 18px; border-bottom: 1px solid #f8f8f8; }
        .eluza-brand { font-weight: 800; font-size: 15px; color: #000; display: flex; align-items: center; gap: 5px; }
        
        /* Verification Ticks */
        .tick { font-size: 14px; }
        .tick-blue { color: #1d9bf0; }
        .tick-golden { color: #ffbc00; }
        .tick-black { color: #000; }

        .eluza-media { width: 100%; max-height: 400px; object-fit: cover; display: block; background: #000; }
        .eluza-body { padding: 18px; }
        .eluza-title { font-size: 19px; font-weight: 800; margin-bottom: 8px; color: #1a1a1a; line-height: 1.3; }
        .eluza-desc-container { cursor: pointer; }
        .eluza-desc { font-size: 14px; color: #444; line-height: 1.6; overflow: hidden; }
        .eluza-desc.collapsed { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .eluza-tap-hint { font-size: 11px; color: #3b82f6; font-weight: bold; margin-top: 5px; text-transform: uppercase; }
        
        .eluza-btn-link { display: inline-block; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; padding: 10px 22px; border-radius: 30px; text-decoration: none; font-weight: 600; font-size: 13px; margin-top: 15px; box-shadow: 0 4px 10px rgba(59,130,246,0.3); }
        
        .eluza-actions { display: flex; align-items: center; gap: 20px; margin-top: 15px; padding-top: 15px; border-top: 1px solid #f5f5f5; }
        .action-item { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #666; font-size: 14px; transition: 0.2s; }
        .action-item:hover { color: #3b82f6; }

        .feedback-box { display: none; margin-top: 15px; background: #f9f9f9; padding: 12px; border-radius: 12px; }
        .feedback-input { width: 100%; border: 1px solid #ddd; border-radius: 8px; padding: 10px; box-sizing: border-box; font-size: 13px; outline: none; }
        .btn-send { background: #10b981; color: #fff; border: none; padding: 8px 18px; border-radius: 20px; margin-top: 8px; cursor: pointer; font-weight: bold; }

        /* Social Icons Footer */
        .footer-platforms { text-align: center; margin: 40px 15px 20px; padding: 25px; background: #fff; border-radius: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .platform-icons { display: flex; justify-content: center; gap: 15px; margin-top: 20px; }
        .platform-icon { width: 42px; height: 42px; border-radius: 50%; border: 2px solid #000; display: flex; align-items: center; justify-content: center; text-decoration: none; color: #000; background: #fff; transition: 0.3s; font-size: 18px; }
        .platform-icon:hover { transform: translateY(-5px); background: #000; color: #fff; }
        .empty-state { text-align: center; padding: 50px 20px; color: #999; }
    `;

    const styleTag = document.createElement('style');
    styleTag.innerHTML = styles;
    document.head.appendChild(styleTag);

    function getTickHtml(type) {
        if (!type) return '';
        const tickClass = `tick-${type.toLowerCase()}`;
        return `<i class="fas fa-check-circle tick ${tickClass}"></i>`;
    }

    async function initEluza() {
        container.innerHTML = '<div class="empty-state">Loading Premium Content...</div>';
        const { data: items, error } = await sb.from('eluza_control').select('*').order('created_at', { ascending: false });

        if (error || !items || items.length === 0) {
            container.innerHTML = '<div class="empty-state">No any share details</div>';
            renderFooter(); return;
        }

        container.innerHTML = '<div class="eluza-wrapper" id="eluza-list"></div>';
        const list = document.getElementById('eluza-list');

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'eluza-card';
            
            let mediaHtml = item.media_url ? (item.media_url.match(/\.(mp4|webm|ogg|mov)/i) 
                ? `<video src="${item.media_url}" class="eluza-media" controls></video>` 
                : `<img src="${item.media_url}" class="eluza-media">`) : '';

            card.innerHTML = `
                <div class="eluza-header">
                    <div class="eluza-brand">
                        AvicnKnov ${getTickHtml(item.verify_tick)}
                    </div>
                </div>
                ${mediaHtml}
                <div class="eluza-body">
                    <div class="eluza-title">${item.title}</div>
                    <div class="eluza-desc-container" onclick="toggleDesc(this)">
                        <div class="eluza-desc collapsed">${item.description}</div>
                        <div class="eluza-tap-hint">Tap to open description</div>
                    </div>
                    ${item.link_url ? `<a href="${item.link_url}" target="_blank" class="eluza-btn-link">Tap to Open <i class="fas fa-external-link-alt"></i></a>` : ''}
                    <div class="eluza-actions">
                        <div class="action-item" onclick="handleLike(this, '${item.id}')"><i class="far fa-heart"></i> Like</div>
                        <div class="action-item" onclick="toggleFeedback('${item.id}')"><i class="far fa-comment-dots"></i> Opinion</div>
                        <div class="action-item" onclick="handleShare('${item.title}', '${item.link_url}')"><i class="far fa-share-square"></i> Share</div>
                    </div>
                    <div class="feedback-box" id="fb-${item.id}">
                        <textarea class="feedback-input" placeholder="Write your opinion..."></textarea>
                        <button class="btn-send" onclick="sendFeedback('${item.id}')">Send Feedback</button>
                    </div>
                </div>`;
            list.appendChild(card);
        });
        renderFooter();
    }

    window.toggleDesc = function(el) {
        document.querySelectorAll('.eluza-desc').forEach(d => { 
            if(d !== el.querySelector('.eluza-desc')) { 
                d.classList.add('collapsed'); 
                d.nextElementSibling.style.display = 'block'; 
            } 
        });
        const desc = el.querySelector('.eluza-desc'); const hint = el.querySelector('.eluza-tap-hint');
        desc.classList.toggle('collapsed'); 
        hint.style.display = desc.classList.contains('collapsed') ? 'block' : 'none';
    };

    window.toggleFeedback = function(id) { const box = document.getElementById(`fb-${id}`); box.style.display = box.style.display === 'block' ? 'none' : 'block'; };

    window.sendFeedback = async function(id) {
        const box = document.getElementById(`fb-${id}`); const text = box.querySelector('textarea').value;
        if(!text) return;
        const { error } = await sb.from('eluza_user').insert([{ post_id: id, feedback_text: text, type: 'opinion' }]);
        if(!error) { alert("Opinion Sent!"); box.querySelector('textarea').value = ''; box.style.display = 'none'; }
    };

    window.handleLike = async function(el, id) { 
        const icon = el.querySelector('i'); icon.className = 'fas fa-heart'; icon.style.color = '#e74c3c';
        await sb.from('eluza_user').insert([{ post_id: id, type: 'like' }]); 
    };

    window.handleShare = (t, u) => { 
        if(navigator.share) navigator.share({title:t, url:u||window.location.href}); 
        else { navigator.clipboard.writeText(u||window.location.href); alert("Link Copied!"); }
    };

    function renderFooter() {
        const f = document.createElement('div'); f.className = 'footer-platforms';
        f.innerHTML = `<div style="font-weight:900; color:#444;">Join Platforms for More Updates</div><div class="platform-icons">
            <a href="https://t.me/AvicnKnov" class="platform-icon"><i class="fab fa-telegram-plane"></i></a>
            <a href="https://x.com/AvicnKnov?s=09" class="platform-icon"><i class="fab fa-x-twitter"></i></a>
            <a href="https://youtube.com/@avicnknov?si=yWHFybgTstYHd3pm" class="platform-icon"><i class="fab fa-youtube"></i></a>
            <a href="https://www.facebook.com/share/1G8YRZhZ6M/" class="platform-icon"><i class="fab fa-facebook-f"></i></a>
            <a href="https://www.instagram.com/avicnknov?igsh=a2QwdnhwY3NxZjZ2" class="platform-icon"><i class="fab fa-instagram"></i></a>
        </div>`;
        container.appendChild(f);
    }
    initEluza();
})();
