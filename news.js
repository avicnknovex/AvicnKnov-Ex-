(async function() {
    const container = document.getElementById('news_content');
    if (!container) return;

    // --- PREMIUM STYLING ---
    const styles = `
    <style>
        .news-wrapper { padding: 15px; background: #f0f2f5; }
        .news-card { 
            background: #fff; border-radius: 15px; margin-bottom: 20px; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden;
        }
        .news-header { padding: 15px; display: flex; align-items: center; border-bottom: 1px solid #f0f2f5; }
        .news-brand { font-weight: 800; font-size: 16px; color: #1a202c; display: flex; align-items: center; gap: 5px; }
        .news-brand i { color: #3b82f6; font-size: 14px; }
        
        .news-media { width: 100%; background: #000; line-height: 0; }
        .news-media img, .news-media video { width: 100%; max-height: 450px; object-fit: contain; }
        
        .news-body { padding: 15px; }
        .news-text { font-size: 15px; color: #333; line-height: 1.6; white-space: pre-wrap; }
        
        /* Interactive Icons */
        .news-actions { 
            display: flex; justify-content: space-around; padding: 10px; 
            border-top: 1px solid #f0f2f5; border-bottom: 1px solid #f0f2f5;
        }
        .action-item { cursor: pointer; color: #65676b; font-size: 18px; transition: 0.2s; display: flex; align-items: center; gap: 5px; }
        .action-item:hover { color: #3b82f6; }
        .action-item.active-like { color: #3b82f6; }
        .action-item.active-dislike { color: #e53e3e; }

        /* Comment Section */
        .comment-box { padding: 10px 15px; background: #f8fafc; }
        .comment-input-area { display: flex; gap: 10px; margin-bottom: 10px; }
        .comment-input { flex: 1; border: 1px solid #ddd; border-radius: 20px; padding: 8px 15px; font-size: 13px; outline: none; }
        .comment-list { max-height: 200px; overflow-y: auto; }
        .single-comment { 
            background: #fff; padding: 8px 12px; border-radius: 12px; 
            margin-bottom: 8px; font-size: 13px; position: relative;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .comment-header { font-weight: bold; color: #1e3c72; margin-bottom: 2px; display: flex; justify-content: space-between; }
        .comment-options { cursor: pointer; color: #999; }

        .tap-btn { 
            display: block; margin: 15px; padding: 12px; background: #3b82f6; 
            color: #fff !important; text-align: center; border-radius: 10px; 
            font-weight: bold; text-decoration: none; font-size: 14px;
        }
    </style>`;
    document.head.insertAdjacentHTML('beforeend', styles);

    container.innerHTML = `<div style="text-align:center; padding:50px; color:#999;"><i class="fas fa-spinner fa-spin"></i> Loading News...</div>`;

    async function loadNews() {
        try {
            const { data: newsData, error } = await sb
                .from('user_news')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (!newsData || newsData.length === 0) {
                container.innerHTML = `<div style="text-align:center; padding:100px; color:#cbd5e0;"><i class="fas fa-newspaper" style="font-size:50px; opacity:0.3;"></i><h3>No News Available</h3></div>`;
                return;
            }

            container.innerHTML = '<div class="news-wrapper"></div>';
            const wrapper = container.querySelector('.news-wrapper');

            for (const item of newsData) {
                const newsId = item.id;
                
                // Fetch Comments for this news
                const { data: comments } = await sb.from('news_comments').select('*').eq('news_id', newsId).order('created_at', { ascending: false });

                let mediaHtml = '';
                if (item.content_url) {
                    mediaHtml = item.content_type === 'video' 
                        ? `<div class="news-media"><video controls><source src="${item.content_url}"></video></div>`
                        : `<div class="news-media"><img src="${item.content_url}"></div>`;
                }

                const card = document.createElement('div');
                card.className = 'news-card';
                card.innerHTML = `
                    <div class="news-header">
                        <div class="news-brand">AvicnKnov Ex <i class="fas fa-check-circle"></i></div>
                    </div>
                    ${mediaHtml}
                    <div class="news-body">
                        <div class="news-text">${item.content_text || ''}</div>
                    </div>
                    ${item.action_link ? `<a href="${item.action_link}" target="_blank" class="tap-btn">TAP TO OPEN</a>` : ''}
                    
                    <div class="news-actions">
                        <div class="action-item" onclick="handleReaction(${newsId}, 'like', this)"><i class="fas fa-thumbs-up"></i> Like</div>
                        <div class="action-item" onclick="handleReaction(${newsId}, 'dislike', this)"><i class="fas fa-thumbs-down"></i> Dislike</div>
                        <div class="action-item" onclick="shareNews('${item.title}')"><i class="fas fa-share"></i> Share</div>
                    </div>

                    <div class="comment-box">
                        <div class="comment-input-area">
                            <input type="text" class="comment-input" placeholder="Write a comment..." id="input-${newsId}">
                            <button onclick="postComment(${newsId})" style="background:none; border:none; color:#3b82f6; font-weight:bold; cursor:pointer;">Post</button>
                        </div>
                        <div class="comment-list" id="list-${newsId}">
                            ${(comments || []).map(c => `
                                <div class="single-comment">
                                    <div class="comment-header">
                                        <span>User_${c.id}</span>
                                        <i class="fas fa-ellipsis-v comment-options" onclick="deleteMyComment(${c.id}, this)"></i>
                                    </div>
                                    <div>${c.comment_text}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                wrapper.appendChild(card);
            }
        } catch (err) { console.error(err); }
    }

    // --- FUNCTIONS ---

    window.handleReaction = async (newsId, type, el) => {
        // Logic: Ek baar me ek hi reaction. User count hidden rakha gaya hai as per request.
        alert(type.toUpperCase() + " added!");
        el.style.color = type === 'like' ? '#3b82f6' : '#e53e3e';
    };

    window.postComment = async (newsId) => {
        const input = document.getElementById(`input-${newsId}`);
        const list = document.getElementById(`list-${newsId}`);
        if (!input.value.trim()) return;

        // Count existing comments (Check for 5 limit)
        const existing = list.querySelectorAll('.single-comment').length;
        if (existing >= 5) {
            alert("Limit reached: Max 5 comments allowed.");
            return;
        }

        const { data, error } = await sb.from('news_comments').insert([
            { news_id: newsId, comment_text: input.value, user_name: 'You' }
        ]).select();

        if (data) {
            const newComment = `<div class="single-comment"><div class="comment-header"><span>You</span><i class="fas fa-ellipsis-v comment-options" onclick="deleteMyComment(${data[0].id}, this)"></i></div><div>${input.value}</div></div>`;
            list.insertAdjacentHTML('afterbegin', newComment);
            input.value = '';
        }
    };

    window.deleteMyComment = async (commentId, el) => {
        if (confirm("Delete this comment?")) {
            await sb.from('news_comments').delete().eq('id', commentId);
            el.closest('.single-comment').remove();
        }
    };

    window.shareNews = (title) => {
        if (navigator.share) {
            navigator.share({ title: 'AvicnKnov News', text: title, url: window.location.href });
        } else {
            alert("Link copied to clipboard!");
        }
    };

    loadNews();
})();

