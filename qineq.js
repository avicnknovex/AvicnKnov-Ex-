

// Qineq.js - AvicnKnov Social Module (Final Real Working Version)
// Connects to: qineq_users, qineq_posts, qineq_data, qineq_notc
// Buckets: profile-image, qineq-image

(async function() {
    // --- 1. CONFIGURATION ---
    const SUPABASE_URL = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';
    const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/149/149071.png'; 

    // Ensure supabase is available
    if (typeof window.supabase === 'undefined') {
        document.getElementById('qineq_content').innerHTML = '<div style="padding:20px;color:red;text-align:center;">Error: Supabase library not loaded.</div>';
        return;
    }
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // --- 2. CSS STYLES (Premium & Glassmorphism) ---
    const styles = `
    <style>
        /* MAIN CONTAINER */
        #qineq-app {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f0f2f5;
            color: #1c1e21;
            height: 100vh;
            width: 100%;
            overflow-y: hidden; /* Main scroll handled by feed */
            position: relative;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
        }

        /* HEADER */
        .q-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 15px;
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.05);
            border-bottom: 1px solid rgba(255, 255, 255, 0.3);
        }

        .q-notif-btn {
            background: none; border: none; font-size: 22px; color: #555;
            cursor: pointer; padding: 5px; margin-right: 10px;
        }

        /* SEARCH BAR */
        .q-search-wrapper {
            flex: 1; margin: 0 10px; position: relative;
        }
        .q-search-box {
            display: flex; align-items: center;
            background: #eef2f5; border-radius: 20px;
            padding: 8px 15px; border: 1px solid transparent;
            transition: 0.3s;
        }
        .q-search-box:focus-within { background: #fff; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
        .q-search-input {
            width: 100%; border: none; background: transparent; outline: none; font-size: 14px;
        }
        .q-search-btn { border: none; background: none; color: #777; cursor: pointer; }

        /* SEARCH RESULTS DROPDOWN */
        .q-search-dropdown {
            position: absolute; top: 50px; left: 0; width: 100%;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            z-index: 200; display: none; overflow: hidden;
            border: 1px solid rgba(0,0,0,0.05);
        }
        .q-search-row {
            display: flex; align-items: center; padding: 10px 15px;
            border-bottom: 1px solid #f0f0f0; cursor: pointer;
            transition: background 0.2s;
        }
        .q-search-row:hover { background: #f7f9fc; }
        .q-search-img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-right: 10px; }
        .q-search-info { flex: 1; }
        .q-search-name { font-weight: 600; font-size: 14px; color: #333; }
        .q-view-btn {
            padding: 5px 12px; font-size: 12px; background: #3b82f6; color: #fff;
            border: none; border-radius: 15px; cursor: pointer;
        }

        /* PROFILE HEADER ICON */
        .q-header-profile {
            width: 40px; height: 40px; border-radius: 50%;
            object-fit: cover; cursor: pointer; margin-left: 10px;
            border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        /* FEED AREA */
        .q-feed-container {
            flex: 1; overflow-y: auto; padding: 15px;
            max-width: 600px; margin: 0 auto; width: 100%; box-sizing: border-box;
            padding-bottom: 90px; /* Space for FAB */
        }

        /* POST CARD (Glassmorphism) */
        .q-post-card {
            background: #fff;
            border-radius: 16px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
            margin-bottom: 25px; overflow: hidden;
            transition: transform 0.2s;
        }
        
        .q-post-header {
            display: flex; align-items: center; padding: 12px 15px;
            justify-content: space-between; /* Pushes content to edges */
        }
        .q-post-user-info {
            display: flex; align-items: center; flex: 1;
        }
        .q-post-avatar { width: 42px; height: 42px; border-radius: 50%; margin-right: 10px; object-fit: cover; cursor: pointer; border: 1px solid #eee; }
        .q-post-meta { cursor: pointer; display: flex; flex-direction: column; }
        .q-post-user { font-weight: 700; font-size: 15px; color: #222; display: flex; align-items: center; }
        
        /* Date time specific style */
        .q-post-datetime-display {
            font-size: 10px; color: #999; margin-top: 2px;
        }
        
        /* FOLLOW BUTTON IN POST (Top Right) */
        .q-post-follow-btn {
            padding: 6px 14px; 
            border: 1px solid #3b82f6; 
            color: #3b82f6;
            background: transparent; 
            border-radius: 20px; 
            font-weight: 600;
            font-size: 12px; 
            cursor: pointer; 
            transition: 0.2s;
            margin-left: 10px;
            white-space: nowrap;
        }
        .q-post-follow-btn.followed {
            background: #3b82f6; color: #fff; border-color: #3b82f6;
        }
        
        /* POST CONTENT UI */
        .q-post-content { padding: 0; }
        
        /* REDUCED MEDIA HEIGHT */
        .q-post-media { 
            width: 100%; 
            max-height: 320px; /* Reduced height */
            background: #000; 
            object-fit: contain; /* Ensures full image seen */
            display: block; 
        }

        /* TEXT AREA */
        .q-post-text-area {
            padding: 12px 15px;
        }

        /* TITLE */
        .q-post-title { 
            font-weight: 800; font-size: 17px; color: #000; display: block; 
        }

        /* SEPARATOR */
        .q-line-sep {
            height: 1px; background: #eee; border: none; margin: 8px 0;
        }

        /* DESCRIPTION BOX */
        .q-desc-box {
            position: relative;
        }
        .q-desc-label {
            font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;
            font-weight: 700; margin-bottom: 2px; display: block;
        }
        .q-desc-text {
            font-size: 14px; color: #333; line-height: 1.4; white-space: pre-wrap;
            max-height: 40px; /* Approx 2 lines ("aadha deep") */
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
        .q-desc-text.expanded {
            max-height: none;
        }
        .q-tap-open {
            font-size: 12px; color: #3b82f6; font-weight: 600; cursor: pointer;
            margin-top: 5px; display: block;
        }
        
        /* POST ACTIONS */
        .q-post-actions {
            display: flex; justify-content: space-between; padding: 10px 15px;
            border-top: 1px solid rgba(0,0,0,0.05);
        }
        .q-act-btn {
            background: none; border: none; font-size: 14px; color: #666;
            cursor: pointer; display: flex; align-items: center; gap: 6px;
        }
        .q-act-btn i { font-size: 18px; transition: 0.2s; }
        .q-act-btn:hover i { color: #3b82f6; transform: scale(1.1); }
        .q-act-btn.liked i { color: #e74c3c; } /* Heart Red */
        .q-act-btn.liked span { color: #e74c3c; }

        /* INLINE COMMENTS (New) */
        .q-inline-comments-section {
            display: none;
            background: #f9fbfd;
            border-top: 1px solid #eee;
            padding: 0;
        }
        .q-inline-comments-section.show { display: block; }
        
        .q-inline-list {
            padding: 10px 15px;
            max-height: 250px;
            overflow-y: auto;
        }
        .q-inline-comment-row {
            display: flex; gap: 8px; margin-bottom: 12px;
        }
        .q-inline-comment-row img { width: 30px; height: 30px; border-radius: 50%; object-fit: cover;}
        .q-inline-bubble { background: #fff; border: 1px solid #eee; padding: 8px 12px; border-radius: 0 12px 12px 12px; flex: 1;}
        
        .q-inline-input-area {
            display: flex; padding: 10px 15px; border-top: 1px solid #eee; background: #fff;
            gap: 10px;
        }
        .q-inline-input {
            flex: 1; border: 1px solid #ddd; border-radius: 20px; padding: 8px 12px; outline: none; font-size: 13px;
        }
        .q-inline-send {
            background: #3b82f6; color: #fff; border: none; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;
        }

        /* VERIFIED TICKS */
        .q-tick { 
            margin-left: 5px; 
            font-size: 14px; 
            -webkit-text-fill-color: initial !important; /* CRITICAL FIX: Resets gradient inheritance */
            text-fill-color: initial !important; 
        }
        .tick-blue { color: #3b82f6; }
        .tick-red { color: #ef4444; }
        .tick-green { color: #10b981; }
        .tick-golden { color: #f59e0b; }
        .tick-yellow { color: #ffd700; text-shadow: 0 0 1px rgba(0,0,0,0.15); } 
        .tick-black { color: #000; }
        .tick-pink { color: #ec4899; }
        .tick-white { color: #fff; filter: drop-shadow(0 0 2px rgba(0,0,0,0.5)); }

        /* NOTIFICATIONS - PREMIUM STYLE REDESIGN */
        .q-notc-card {
            background: #fff;
            border-left: 4px solid #3b82f6;
            box-shadow: 0 4px 15px rgba(0,0,0,0.05);
            margin-bottom: 15px; padding: 15px;
            border-radius: 12px;
            position: relative;
        }
        .q-notc-header {
            display: flex; justify-content: space-between; align-items: flex-start;
            margin-bottom: 8px;
            width: 100%;
        }
        .q-notc-sender {
            font-family: 'Segoe UI', sans-serif;
            font-size: 16px; font-weight: 900; 
            background: -webkit-linear-gradient(45deg, #2563eb, #9333ea);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-transform: uppercase;
            display: flex; align-items: center;
        }
        .q-notc-time {
            font-size: 11px; color: #999; font-weight: 600;
            white-space: nowrap; margin-left: auto; /* PINS TIME TO RIGHT */
        }
        .q-notc-title {
            font-size: 18px; font-weight: 800; color: #111; margin-bottom: 8px;
            line-height: 1.2;
        }
        .q-notc-sep {
            height: 1px; background: linear-gradient(90deg, #eee, #f0f0f0); margin-bottom: 8px;
        }
        .q-notc-desc {
            font-size: 14px; color: #444; line-height: 1.5;
        }

        /* OVERLAYS (Profile, Notif, Create) */
        .q-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: #f0f2f5; z-index: 300;
            display: flex; flex-direction: column;
            transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow-y: auto;
        }
        .q-overlay.open { transform: translateY(0); }
        
        /* OVERLAY HEADER */
        .q-overlay-head {
            position: sticky; top: 0; z-index: 10;
            background: rgba(255,255,255,0.95); backdrop-filter: blur(10px);
            padding: 15px; display: flex; align-items: center; justify-content: space-between;
            border-bottom: 1px solid #ddd;
        }
        .q-overlay-title { font-weight: 700; font-size: 18px; }
        .q-close-btn { background: none; border: none; font-size: 24px; color: #333; cursor: pointer; }

        /* PROFILE UI (Redesigned) */
        .q-profile-body { padding: 40px 20px 20px; text-align: center; background: #fff; min-height: 250px; position: relative; }
        
        /* Profile Share Button */
        .q-prof-share-btn {
            position: absolute; top: 20px; left: 20px;
            background: none; border: none; font-size: 20px; color: #555;
            cursor: pointer; z-index: 10;
        }
        
        .q-profile-pic-lg {
            width: 100px; height: 100px; border-radius: 50%;
            border: 1px solid #ddd; background: #fff; object-fit: cover;
            margin-bottom: 15px;
        }
        
        /* New Profile Layout CSS */
        .q-prof-split {
            display: flex; justify-content: space-between; align-items: flex-start;
            width: 100%; margin-top: 15px; padding: 0 10px; box-sizing: border-box;
        }
        .q-prof-col-l { text-align: left; }
        .q-prof-col-r { text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
        
        .q-prof-name { font-size: 20px; font-weight: 800; color: #111; line-height: 1.2; }
        .q-prof-user { font-size: 15px; color: #555; font-weight: 600; display: flex; align-items: center; gap: 4px; }
        .q-prof-meta { font-size: 13px; color: #888; margin-top: 3px; }

        /* Profile Follow Button */
        .q-prof-follow-btn {
            margin-top: 15px;
            padding: 8px 30px; background: #3b82f6; color: white;
            border-radius: 20px; border: none; font-weight: 600; cursor: pointer;
            box-shadow: 0 4px 10px rgba(59,130,246,0.3);
            transition: 0.2s;
        }
        .q-prof-follow-btn.followed {
            background: #fff; color: #3b82f6; border: 1px solid #3b82f6; box-shadow: none;
        }

        /* STATS (Attractive Inline) */
        .q-stats-row {
            display: flex; justify-content: space-around;
            padding: 20px 0; border-top: 1px solid #f0f0f0; border-bottom: 1px solid #f0f0f0;
            margin-top: 25px; background: #fff;
        }
        .q-stat-item {
            display: flex; flex-direction: row; align-items: center; gap: 8px;
            font-size: 14px; color: #444; font-weight: 600;
        }
        .q-stat-val {
            font-weight: 800; color: #000; font-size: 16px;
        }

        /* DELETE BUTTON (Specific Style) */
        .q-btn-delete {
            background: #ffecec; color: #e74c3c;
            border: none; padding: 6px 12px; border-radius: 6px;
            font-size: 12px; font-weight: 600; cursor: pointer;
            margin-left: auto;
        }

        /* CREATE POST */
        .q-create-body { padding: 20px; height: 100%; background: #fff; }
        .q-upload-area {
            border: 2px dashed #3b82f6; border-radius: 12px;
            padding: 30px; text-align: center; background: #f8faff;
            cursor: pointer; margin-bottom: 20px; transition: 0.2s;
        }
        .q-upload-area:hover { background: #eef4ff; }
        .q-input-field {
            width: 100%; padding: 12px; border: 1px solid #ddd;
            border-radius: 8px; font-size: 15px; margin-bottom: 15px;
            box-sizing: border-box; font-family: inherit;
        }
        .q-publish-btn {
            width: 100%; padding: 15px; background: linear-gradient(90deg, #10b981, #059669);
            color: white; border: none; border-radius: 30px;
            font-size: 16px; font-weight: bold; cursor: pointer;
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
        }

        /* FAB */
        .q-fab {
            position: absolute; bottom: 25px; right: 20px;
            width: 60px; height: 60px; border-radius: 50%;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white; font-size: 28px; border: none;
            box-shadow: 0 5px 20px rgba(59, 130, 246, 0.5);
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            z-index: 150; transition: transform 0.2s;
        }
        .q-fab:hover { transform: scale(1.1); }
        
        .loader { text-align: center; padding: 30px; color: #888; font-style: italic; }
        .no-data { text-align: center; padding: 40px; color: #999; }
    </style>
    `;

    // --- 3. HTML STRUCTURE ---
    const appContainer = document.getElementById('qineq_content');
    if(!appContainer) return;
    
    appContainer.innerHTML = styles + `
        <div id="qineq-app">
            <!-- Header -->
            <div class="q-header">
                <button class="q-notif-btn" id="btn-notif"><i class="fas fa-bell"></i></button>
                <div class="q-search-wrapper">
                    <div class="q-search-box">
                        <input type="text" class="q-search-input" id="inp-search" placeholder="Search users...">
                        <button class="q-search-btn" id="btn-search"><i class="fas fa-search"></i></button>
                    </div>
                    <div class="q-search-dropdown" id="res-search"></div>
                </div>
                <img src="${DEFAULT_AVATAR}" class="q-header-profile" id="btn-my-profile" alt="Profile">
            </div>

            <!-- Feed -->
            <div class="q-feed-container" id="feed-list">
                <div class="loader"><i class="fas fa-spinner fa-spin"></i> Loading Feed...</div>
            </div>

            <!-- Create Post FAB -->
            <button class="q-fab" id="btn-open-create"><i class="fas fa-plus"></i></button>

            <!-- --- OVERLAYS --- -->

            <!-- 1. NOTIFICATIONS -->
            <div class="q-overlay" id="view-notif">
                <div class="q-overlay-head">
                    <span class="q-overlay-title">Notifications</span>
                    <button class="q-close-btn" onclick="closeOverlay('view-notif')">&times;</button>
                </div>
                <div id="list-notif" style="padding:15px;"></div>
            </div>

            <!-- 2. PROFILE -->
            <div class="q-overlay" id="view-profile">
                <div class="q-overlay-head">
                    <span class="q-overlay-title">Profile</span>
                    <button class="q-close-btn" onclick="closeOverlay('view-profile')">&times;</button>
                </div>
                <div id="content-profile"></div>
            </div>

            <!-- 3. CREATE POST -->
            <div class="q-overlay" id="view-create">
                <div class="q-overlay-head">
                    <span class="q-overlay-title">New Post</span>
                    <button class="q-close-btn" onclick="closeOverlay('view-create')">&times;</button>
                </div>
                <div class="q-create-body">
                    <div class="q-upload-area" id="area-upload">
                        <i class="fas fa-cloud-upload-alt" style="font-size:30px; color:#3b82f6;"></i>
                        <p style="margin:10px 0 0; color:#555;">Select Image or Video<br><small>(10s - 60s)</small></p>
                        <input type="file" id="inp-file" accept="image/*,video/*" style="display:none;">
                    </div>
                    
                    <img id="prev-img" style="width:100%; border-radius:10px; margin-bottom:15px; display:none;">
                    <video id="prev-vid" style="width:100%; border-radius:10px; margin-bottom:15px; display:none;" controls></video>

                    <input type="text" id="inp-title" class="q-input-field" placeholder="Title (Max 300 characters)" maxlength="300">
                    <textarea id="inp-desc" class="q-input-field" style="height:120px; resize:none;" placeholder="Description (Max 2000 characters)" maxlength="2000"></textarea>
                    
                    <button class="q-publish-btn" id="btn-publish">POST NOW</button>
                </div>
            </div>

            <!-- MODALS -->
            <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:400; display:none; align-items:center; justify-content:center; backdrop-filter:blur(5px);" id="modal-report">
                <div style="background:#fff; width:85%; max-width:320px; padding:20px; border-radius:15px;">
                    <h3 style="margin-top:0;">Report Post</h3>
                    <textarea id="txt-report" class="q-input-field" style="height:80px;" placeholder="Reason"></textarea>
                    <button class="q-publish-btn" style="background:#e74c3c; padding:10px;" id="btn-submit-report">Submit</button>
                    <button onclick="document.getElementById('modal-report').style.display='none'" style="width:100%; padding:10px; margin-top:10px; background:#eee; border:none; border-radius:20px; cursor:pointer;">Cancel</button>
                </div>
            </div>

        </div>
    `;

    // --- 4. HELPER FUNCTIONS ---
    window.closeOverlay = (id) => document.getElementById(id).classList.remove('open');
    let currentUser = null;
    let searchTimer = null;

    // --- NEW NUMBER FORMATTING LOGIC ---
    function formatCount(num) {
        if (num === null || num === undefined) num = 0;
        num = parseInt(num);
        if (isNaN(num)) return '0';

        if (num >= 1000000) {
            // Million
            return (num / 1000000).toFixed(1).replace(/\.0$/, '') + ' Million';
        }
        if (num >= 100000) {
            // Lakh
            return (num / 100000).toFixed(1).replace(/\.0$/, '') + ' Lakh';
        }
        if (num >= 1000) {
            // k
            return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        }
        return num.toString();
    }

    function getTick(color) {
        if(!color) return '';
        const c = color.toLowerCase().trim();
        let icon = 'fa-check-circle';
        // "golden" uses certificate, others use check-circle.
        if(c === 'golden') icon = 'fa-certificate';
        return `<i class="fas ${icon} q-tick tick-${c}"></i>`;
    }

    function timeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    function formatFullDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
    }

    // --- 5. INITIALIZATION ---
    async function init() {
        // Auth
        const { data: { user } } = await sb.auth.getUser();
        if(!user) {
            document.getElementById('feed-list').innerHTML = '<div class="no-data">Please Login first</div>';
            return;
        }
        currentUser = user;

        await ensureUserRecord(user);

        // Load Header Avatar
        const { data: img } = sb.storage.from('profile-image').getPublicUrl(`${user.id}/avatar.jpg`);
        const profBtn = document.getElementById('btn-my-profile');
        profBtn.src = img.publicUrl;
        profBtn.onerror = () => profBtn.src = DEFAULT_AVATAR;
        profBtn.onclick = () => openProfile(user.id);

        // Bind Events
        document.getElementById('btn-notif').onclick = loadNotifications;
        document.getElementById('btn-open-create').onclick = () => document.getElementById('view-create').classList.add('open');

        // Close descriptions on scroll
        document.getElementById('feed-list').addEventListener('scroll', () => {
             document.querySelectorAll('.q-desc-text.expanded').forEach(el => {
                el.classList.remove('expanded');
                const btn = document.getElementById(el.id.replace('desc-', 'tap-'));
                if(btn) btn.style.display = 'block';
             });
        });

        // Search
        const searchInp = document.getElementById('inp-search');
        document.getElementById('btn-search').onclick = () => doSearch(searchInp.value);
        searchInp.addEventListener('keyup', (e) => {
            if(e.key === 'Enter') doSearch(searchInp.value);
        });

        setupCreatePost();
        loadFeed();

        // --- DEEP LINK CHECK ---
        const params = new URLSearchParams(window.location.search);
        const sharePid = params.get('profile_id');
        if(sharePid) {
            openProfile(sharePid);
        }
    }

    async function ensureUserRecord(user) {
        const { data } = await sb.from('qineq_users').select('user_id').eq('user_id', user.id).maybeSingle();
        if (!data) {
            const username = user.email ? user.email.split('@')[0] : 'user_' + Math.floor(Math.random()*9999);
            await sb.from('qineq_users').insert([{
                user_id: user.id,
                username: username,
                full_name: 'New User',
                followers_count: 0,
                following_count: 0,
                post_count: 0,
                country: 'Global',
                gender: 'Unspecified'
            }]);
        }
    }

    // --- 6. SEARCH ---
    async function doSearch(query) {
        if(!query.trim()) return;
        const box = document.getElementById('res-search');
        box.style.display = 'block';
        box.innerHTML = '<div style="padding:15px; text-align:center;">Searching...</div>';

        const { data } = await sb.from('qineq_users').select('*').ilike('username', `%${query}%`);
        
        box.innerHTML = '';
        if(!data || data.length === 0) {
            box.innerHTML = '<div style="padding:15px; text-align:center; color:#e74c3c;">User not found</div>';
        } else {
            data.forEach(u => {
                const { data: img } = sb.storage.from('profile-image').getPublicUrl(`${u.user_id}/avatar.jpg`);
                const div = document.createElement('div');
                div.className = 'q-search-row';
                div.innerHTML = `
                    <img src="${img.publicUrl}" class="q-search-img" onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="q-search-info">
                        <div class="q-search-name">${u.username} ${getTick(u.verify_tick)}</div>
                    </div>
                    <button class="q-view-btn">View</button>
                `;
                div.onclick = () => {
                    openProfile(u.user_id);
                    box.style.display = 'none';
                    document.getElementById('inp-search').value = '';
                };
                box.appendChild(div);
            });
        }
        if(searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { box.style.display = 'none'; }, 5000);
    }

    // --- 7. NOTIFICATIONS (UPDATED: 72H EXPIRY, DESIGN & NAME BOX) ---
    async function loadNotifications() {
        const view = document.getElementById('view-notif');
        const list = document.getElementById('list-notif');
        view.classList.add('open');
        list.innerHTML = '<div class="loader">Loading...</div>';

        const { data } = await sb.from('qineq_notc').select('*').order('created_at', {ascending:false});
        
        // Filter logic: Empty target_uid = ALL, Matches ID = Specific
        // AND Created within last 72 hours
        const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago
        
        const myNotifs = data ? data.filter(n => {
            const isTarget = !n.target_uid || n.target_uid === '' || n.target_uid === currentUser.id;
            const isFresh = new Date(n.created_at) > cutoff;
            return isTarget && isFresh;
        }) : [];

        list.innerHTML = '';
        if(myNotifs.length === 0) {
            list.innerHTML = '<div class="no-data">No notifications</div>';
            return;
        }

        myNotifs.forEach(n => {
            // Check for name_box. If exists, show it, otherwise show nothing for header name
            // Uses getTick on verify_tick column.
            const senderHTML = n.name_box ? `<div class="q-notc-sender">${n.name_box} ${getTick(n.verify_tick)}</div>` : '';

            const div = document.createElement('div');
            div.className = 'q-notc-card';
            // CSS handles q-notc-time margin-left:auto to keep it right
            div.innerHTML = `
                <div class="q-notc-header">
                    ${senderHTML}
                    <div class="q-notc-time">${formatFullDate(n.created_at)}</div>
                </div>
                <div class="q-notc-title">${n.title}</div>
                <div class="q-notc-sep"></div>
                <div class="q-notc-desc">${n.description}</div>
            `;
            list.appendChild(div);
        });
    }

    // --- 8. PROFILE SYSTEM (UPDATED: SHARE BUTTON) ---
    async function openProfile(targetId) {
        const view = document.getElementById('view-profile');
        const content = document.getElementById('content-profile');
        view.classList.add('open');
        content.innerHTML = '<div class="loader">Loading Profile...</div>';

        // Fetch User with ALL details
        const { data: user, error } = await sb.from('qineq_users').select('*').eq('user_id', targetId).single();
        if(error || !user) {
            content.innerHTML = '<div class="no-data">User Not Found</div>';
            return;
        }

        const isMe = (targetId === currentUser.id);
        const { data: img } = sb.storage.from('profile-image').getPublicUrl(`${targetId}/avatar.jpg`);

        // Render Profile Header
        content.innerHTML = `
            <div class="q-profile-body">
                <button class="q-prof-share-btn" id="prof-share-btn"><i class="fas fa-share-alt"></i></button>

                <img src="${img.publicUrl}" class="q-profile-pic-lg" onerror="this.src='${DEFAULT_AVATAR}'">
                
                <div class="q-prof-split">
                    <div class="q-prof-col-l">
                        <div class="q-prof-name">${user.full_name || 'No Name'}</div>
                        <div class="q-prof-meta"><i class="fas fa-globe"></i> ${user.country || 'Global'}</div>
                    </div>
                    <div class="q-prof-col-r">
                        <div class="q-prof-user">@${user.username} ${getTick(user.verify_tick)}</div>
                        <div class="q-prof-meta"><i class="fas fa-venus-mars"></i> ${user.gender || 'Hidden'}</div>
                    </div>
                </div>

                ${!isMe ? `<button class="q-prof-follow-btn" id="prof-btn-fol">Follow</button>` : ''}

                <div class="q-stats-row">
                    <div class="q-stat-item"><span>Followers</span> <span class="q-stat-val" id="p-followers">${formatCount(user.followers_count||0)}</span></div>
                    <div class="q-stat-item"><span>Following</span> <span class="q-stat-val" id="p-following">${formatCount(user.following_count||0)}</span></div>
                    <div class="q-stat-item"><span>Posts</span> <span class="q-stat-val" id="p-posts">${formatCount(user.post_count||0)}</span></div>
                </div>
            </div>
            <div id="profile-feed" style="padding:10px; background:#f0f2f5; min-height:300px;">
                <div class="loader">Loading Posts...</div>
            </div>
        `;

        // --- PROFILE SHARE LOGIC ---
        document.getElementById('prof-share-btn').onclick = () => {
             // Construct Share URL
             const url = `${window.location.origin}${window.location.pathname}?profile_id=${targetId}`;
             if(navigator.share) {
                 navigator.share({title: `Check out ${user.username}'s profile on Qineq`, url: url}).catch(console.error);
             } else {
                 navigator.clipboard.writeText(url);
                 alert('Profile link copied to clipboard!');
             }
        };
        
        // --- PROFILE FOLLOW BUTTON LOGIC ---
        if (!isMe) {
            const pfBtn = document.getElementById('prof-btn-fol');
            // Check state
            sb.from('qineq_data').select('id').match({type:'follow', user_id:currentUser.id, target_id:targetId})
            .then(({data}) => {
                if(data && data.length > 0) {
                    pfBtn.innerText = 'Unfollow';
                    pfBtn.classList.add('followed');
                }
            });

            pfBtn.onclick = async () => {
                const isFollowing = pfBtn.classList.contains('followed');
                pfBtn.disabled = true;

                if (isFollowing) {
                    await sb.from('qineq_data').delete().match({type:'follow', user_id:currentUser.id, target_id:targetId});
                    await sb.from('qineq_users').update({followers_count: Math.max(0, (user.followers_count||1)-1)}).eq('user_id', targetId);
                    await sb.from('qineq_users').update({following_count: Math.max(0, (currentUser.following_count||1)-1)}).eq('user_id', currentUser.id);
                    pfBtn.innerText = 'Follow';
                    pfBtn.classList.remove('followed');
                    user.followers_count--;
                } else {
                    await sb.from('qineq_data').insert({type:'follow', user_id:currentUser.id, target_id:targetId});
                    await sb.from('qineq_users').update({followers_count: (user.followers_count||0)+1}).eq('user_id', targetId);
                    await sb.from('qineq_users').update({following_count: (currentUser.following_count||0)+1}).eq('user_id', currentUser.id);
                    pfBtn.innerText = 'Unfollow';
                    pfBtn.classList.add('followed');
                    user.followers_count++;
                }
                // Update stats UI
                document.getElementById('p-followers').innerText = formatCount(user.followers_count||0);
                pfBtn.disabled = false;
            }
        }

        loadUserPosts(targetId, isMe);
    }

    async function loadUserPosts(uid, isMe) {
        const div = document.getElementById('profile-feed');
        const { data: posts } = await sb.from('qineq_posts').select('*, qineq_users(*)').eq('user_id', uid).order('created_at', {ascending:false});
        
        div.innerHTML = '';
        if(!posts || posts.length === 0) {
            div.innerHTML = '<div class="no-data">No posts yet.</div>';
            return;
        }
        posts.forEach(p => div.appendChild(renderPost(p, isMe, true)));
    }

    // --- 9. COMMENT & POST RENDERING SYSTEM ---
    
    // Core Post Rendering
    function renderPost(post, isMe, isProfileView = false) {
        const el = document.createElement('div');
        el.className = 'q-post-card';
        const u = post.qineq_users;
        
        // Avatar
        const { data: img } = sb.storage.from('profile-image').getPublicUrl(`${u.user_id}/avatar.jpg`);
        const avatarUrl = img.publicUrl;

        // Auto View Count
        sb.from('qineq_posts').update({views: (post.views||0)+1}).eq('id', post.id).then(()=>{});

        // Media (Height Controlled via CSS)
        let mediaHtml = '';
        if(post.media_type === 'image') mediaHtml = `<img src="${post.media_url}" class="q-post-media" loading="lazy">`;
        if(post.media_type === 'video') mediaHtml = `<video src="${post.media_url}" class="q-post-media" controls></video>`;

        // HEADER LOGIC (Follow or Delete)
        let headerActionHtml = '';
        if (isMe && isProfileView) {
            headerActionHtml = `<button class="q-btn-delete" id="btn-del-${post.id}"><i class="fas fa-trash"></i> Delete</button>`;
        } else if (!isMe) {
            headerActionHtml = `<button class="q-post-follow-btn" id="post-fol-${post.id}">Follow</button>`;
        }

        // Date Display
        const dateStr = formatFullDate(post.created_at);

        el.innerHTML = `
            <div class="q-post-header">
                <div class="q-post-user-info">
                    <img src="${avatarUrl}" class="q-post-avatar" onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="q-post-meta">
                        <div class="q-post-user">${u.username} ${getTick(u.verify_tick)}</div>
                        <div class="q-post-datetime-display">${dateStr}</div>
                    </div>
                </div>
                ${headerActionHtml}
            </div>
            
            <div class="q-post-content">
                ${mediaHtml}
                <div class="q-post-text-area">
                    ${post.title ? `<div class="q-post-title">${post.title}</div><hr class="q-line-sep">` : ''}
                    
                    <div class="q-desc-box">
                        <span class="q-desc-label">Description Box</span>
                        <div class="q-desc-text" id="desc-${post.id}">
                            ${post.description}
                        </div>
                        <div class="q-tap-open" id="tap-${post.id}">Tap to open</div>
                    </div>
                </div>
            </div>
            
            <div class="q-post-actions">
                <div class="q-act-btn"><i class="fas fa-eye"></i> ${formatCount((post.views||0)+1)}</div>
                
                <button class="q-act-btn" id="like-${post.id}">
                    <i class="far fa-heart"></i> <span>${formatCount(post.likes||0)}</span>
                </button>
                
                <button class="q-act-btn" id="btn-comment-${post.id}">
                    <i class="far fa-comment"></i> <span id="cmt-cnt-${post.id}">${formatCount(post.comments_count||0)}</span>
                </button>
                
                <button class="q-act-btn" id="share-${post.id}">
                    <i class="fas fa-share"></i> <span id="s-cnt-${post.id}">${formatCount(post.shares||0)}</span>
                </button>
                
                <button class="q-act-btn" id="rep-${post.id}"><i class="fas fa-flag"></i></button>
            </div>

            <!-- INLINE COMMENTS SECTION -->
            <div class="q-inline-comments-section" id="inline-cmt-sec-${post.id}">
                <div class="q-inline-list" id="inline-list-${post.id}"></div>
                <div class="q-inline-input-area">
                    <input type="text" class="q-inline-input" id="inline-inp-${post.id}" placeholder="Write a comment...">
                    <button class="q-inline-send" id="inline-send-${post.id}"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        `;

        // 1. Description Toggle Logic
        const descText = el.querySelector(`#desc-${post.id}`);
        const tapBtn = el.querySelector(`#tap-${post.id}`);
        
        tapBtn.onclick = (e) => {
            e.stopPropagation();
            // Close others
            document.querySelectorAll('.q-desc-text.expanded').forEach(item => {
                if(item !== descText) {
                    item.classList.remove('expanded');
                    const otherBtn = document.getElementById(item.id.replace('desc-', 'tap-'));
                    if(otherBtn) otherBtn.style.display = 'block';
                }
            });

            // Expand current
            descText.classList.add('expanded');
            tapBtn.style.display = 'none';
        };

        // 2. Navigate to Profile
        const goToProfile = () => openProfile(u.user_id);
        el.querySelector('.q-post-avatar').onclick = goToProfile;
        el.querySelector('.q-post-meta').onclick = goToProfile;

        // 3. DELETE Logic
        if (isMe && isProfileView) {
            el.querySelector(`#btn-del-${post.id}`).onclick = async () => {
                if(confirm('Delete this post?')) {
                    await sb.from('qineq_posts').delete().eq('id', post.id);
                    const {data:me} = await sb.from('qineq_users').select('post_count').eq('user_id', currentUser.id).single();
                    await sb.from('qineq_users').update({post_count: Math.max(0, (me.post_count||1)-1)}).eq('user_id', currentUser.id);
                    el.remove();
                    const pSpan = document.getElementById('p-posts');
                    // Format update
                    const newCount = Math.max(0, (me.post_count||1)-1);
                    if(pSpan) pSpan.innerText = formatCount(newCount);
                }
            };
        }

        // 4. FOLLOW Logic
        if (!isMe) {
            const fBtn = el.querySelector(`#post-fol-${post.id}`);
            if(fBtn) {
                sb.from('qineq_data').select('id').match({type:'follow', user_id:currentUser.id, target_id:u.user_id})
                .then(({data}) => {
                    if(data && data.length > 0) { fBtn.innerText = 'Followed'; fBtn.classList.add('followed'); }
                });

                fBtn.onclick = async () => {
                    const isFollowing = fBtn.classList.contains('followed');
                    fBtn.disabled = true;
                    if (isFollowing) {
                        await sb.from('qineq_data').delete().match({type:'follow', user_id:currentUser.id, target_id:u.user_id});
                        await sb.from('qineq_users').update({followers_count: Math.max(0, (u.followers_count||1)-1)}).eq('user_id', u.user_id);
                        await sb.from('qineq_users').update({following_count: Math.max(0, (currentUser.following_count||1)-1)}).eq('user_id', currentUser.id);
                        fBtn.innerText = 'Follow'; fBtn.classList.remove('followed');
                    } else {
                        await sb.from('qineq_data').insert({type:'follow', user_id:currentUser.id, target_id:u.user_id});
                        await sb.from('qineq_users').update({followers_count: (u.followers_count||0)+1}).eq('user_id', u.user_id);
                        await sb.from('qineq_users').update({following_count: (currentUser.following_count||0)+1}).eq('user_id', currentUser.id);
                        fBtn.innerText = 'Followed'; fBtn.classList.add('followed');
                    }
                    fBtn.disabled = false;
                };
            }
        }

        // 5. INLINE COMMENT Logic
        const cmtBtn = el.querySelector(`#btn-comment-${post.id}`);
        const cmtSec = el.querySelector(`#inline-cmt-sec-${post.id}`);
        const cmtList = el.querySelector(`#inline-list-${post.id}`);
        const cmtInp = el.querySelector(`#inline-inp-${post.id}`);
        const cmtSend = el.querySelector(`#inline-send-${post.id}`);

        cmtBtn.onclick = async () => {
            // Toggle Visibility
            if (cmtSec.classList.contains('show')) {
                cmtSec.classList.remove('show');
            } else {
                cmtSec.classList.add('show');
                cmtList.innerHTML = '<div style="font-size:12px; color:#999; text-align:center; padding:10px;">Loading...</div>';
                
                // Fetch Comments
                const { data: comments } = await sb.from('qineq_data')
                    .select('content, created_at, user_id')
                    .match({ type: 'comment', target_id: post.id })
                    .order('created_at', { ascending: true });
                
                cmtList.innerHTML = '';
                if(!comments || comments.length === 0) {
                    cmtList.innerHTML = '<div style="font-size:12px; color:#999; text-align:center; padding:10px;">No comments.</div>';
                } else {
                    for (const c of comments) {
                        const { data: uC } = await sb.from('qineq_users').select('username, verify_tick').eq('user_id', c.user_id).single();
                        const { data: imgC } = sb.storage.from('profile-image').getPublicUrl(`${c.user_id}/avatar.jpg`);
                        const div = document.createElement('div');
                        div.className = 'q-inline-comment-row';
                        div.innerHTML = `
                            <img src="${imgC.publicUrl}" onerror="this.src='${DEFAULT_AVATAR}'">
                            <div class="q-inline-bubble">
                                <div style="font-weight:700; font-size:12px;">${uC ? uC.username : 'User'}</div>
                                <div style="font-size:13px;">${c.content}</div>
                            </div>
                        `;
                        cmtList.appendChild(div);
                    }
                }
            }
        };

        cmtSend.onclick = async () => {
            const txt = cmtInp.value.trim();
            if(!txt) return;
            cmtSend.disabled = true;
            await sb.from('qineq_data').insert({type:'comment', user_id:currentUser.id, target_id:post.id, content:txt});
            
            // Update counts
            const { data: pData } = await sb.from('qineq_posts').select('comments_count').eq('id', post.id).single();
            const newCount = (pData.comments_count || 0) + 1;
            await sb.from('qineq_posts').update({ comments_count: newCount }).eq('id', post.id);
            
            document.getElementById(`cmt-cnt-${post.id}`).innerText = formatCount(newCount);
            cmtInp.value = '';
            
            // Append locally
            const { data: imgMe } = sb.storage.from('profile-image').getPublicUrl(`${currentUser.id}/avatar.jpg`);
            const div = document.createElement('div');
            div.className = 'q-inline-comment-row';
            div.innerHTML = `
                <img src="${imgMe.publicUrl}" onerror="this.src='${DEFAULT_AVATAR}'">
                <div class="q-inline-bubble">
                    <div style="font-weight:700; font-size:12px;">${currentUser.email ? currentUser.email.split('@')[0] : 'Me'}</div>
                    <div style="font-size:13px;">${txt}</div>
                </div>
            `;
            cmtList.appendChild(div);
            // Remove "No comments" if present
            if(cmtList.innerHTML.includes('No comments')) { 
                 const noDataEl = cmtList.querySelector('div');
                 if(noDataEl && noDataEl.innerText === 'No comments.') noDataEl.remove();
            }
            cmtSend.disabled = false;
        };


        // 6. LIKE Logic
        const likeBtn = el.querySelector(`#like-${post.id}`);
        sb.from('qineq_data').select('id').match({type:'like', user_id:currentUser.id, target_id:post.id})
        .then(({data}) => {
            if(data && data.length > 0) { likeBtn.classList.add('liked'); likeBtn.querySelector('i').className = 'fas fa-heart'; }
        });
        likeBtn.onclick = async () => {
            if(likeBtn.classList.contains('liked')) return;
            likeBtn.classList.add('liked'); likeBtn.querySelector('i').className = 'fas fa-heart';
            const newCnt = (post.likes||0) + 1; 
            likeBtn.querySelector('span').innerText = formatCount(newCnt);
            await sb.from('qineq_data').insert({type:'like', user_id:currentUser.id, target_id:post.id});
            await sb.from('qineq_posts').update({likes: newCnt}).eq('id', post.id);
        };

        // 7. REAL SHARE Logic (Web Share API)
        el.querySelector(`#share-${post.id}`).onclick = async () => {
            const newCnt = (post.shares||0) + 1;
            document.getElementById(`s-cnt-${post.id}`).innerText = formatCount(newCnt);
            await sb.from('qineq_data').insert({type:'share', user_id:currentUser.id, target_id:post.id});
            await sb.from('qineq_posts').update({shares: newCnt}).eq('id', post.id);

            // Web Share API
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: post.title || 'Check out this post on Qineq',
                        text: post.description || 'Interesting post!',
                        url: window.location.href // Or specific link if you have routing
                    });
                } catch (err) {
                    console.log('Share canceled');
                }
            } else {
                alert('Link copied to clipboard!'); // Fallback
            }
        };

        // 8. REPORT Logic
        el.querySelector(`#rep-${post.id}`).onclick = () => {
            const modal = document.getElementById('modal-report');
            modal.style.display = 'flex';
            document.getElementById('btn-submit-report').onclick = async () => {
                const txt = document.getElementById('txt-report').value;
                if(!txt) return;
                await sb.from('qineq_data').insert({type:'report', user_id:currentUser.id, target_id:post.id, content:txt});
                alert('Report sent');
                modal.style.display = 'none'; document.getElementById('txt-report').value = '';
            };
        };

        return el;
    }

    // --- 10. FEED LOADING ---
    async function loadFeed() {
        const feed = document.getElementById('feed-list');
        const { data: posts } = await sb.from('qineq_posts').select('*, qineq_users(*)').order('created_at', {ascending:false});
        feed.innerHTML = '';
        if(!posts || posts.length === 0) { feed.innerHTML = '<div class="no-data">No Posts. Be the first!</div>'; return; }
        posts.forEach(p => {
            const isMe = (p.user_id === currentUser.id);
            feed.appendChild(renderPost(p, isMe, false)); 
        });
    }

    // --- 11. CREATE POST ---
    function setupCreatePost() {
        const area = document.getElementById('area-upload');
        const fileInp = document.getElementById('inp-file');
        const pImg = document.getElementById('prev-img');
        const pVid = document.getElementById('prev-vid');
        let selectedFile = null;

        area.onclick = () => fileInp.click();

        fileInp.onchange = (e) => {
            const f = e.target.files[0];
            if(!f) return;
            if(f.type.startsWith('video')) {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.onloadedmetadata = function() {
                    window.URL.revokeObjectURL(video.src);
                    if (video.duration < 10 || video.duration > 60) {
                        alert('Video must be between 10s and 60s');
                        fileInp.value = ''; selectedFile = null;
                        return;
                    }
                    selectedFile = f;
                    pVid.src = URL.createObjectURL(f); pVid.style.display = 'block'; pImg.style.display = 'none'; area.style.display = 'none';
                }
                video.src = URL.createObjectURL(f);
            } else {
                selectedFile = f;
                pImg.src = URL.createObjectURL(f); pImg.style.display = 'block'; pVid.style.display = 'none'; area.style.display = 'none';
            }
        };

        document.getElementById('btn-publish').onclick = async () => {
            const title = document.getElementById('inp-title').value;
            const desc = document.getElementById('inp-desc').value;
            const btn = document.getElementById('btn-publish');
            if((!title && !desc) && !selectedFile) { alert('Add content'); return; }
            
            // --- NEW: POST LIMIT CHECK (24H) ---
            try {
                // 1. Get User verification
                const { data: userData } = await sb.from('qineq_users').select('verify_tick').eq('user_id', currentUser.id).single();
                const isBlueTick = (userData && userData.verify_tick && userData.verify_tick.toLowerCase() === 'blue');
                const limit = isBlueTick ? 10 : 4;
                
                // 2. Count posts in last 24h
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                const { count, error } = await sb
                    .from('qineq_posts')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', currentUser.id)
                    .gt('created_at', oneDayAgo);
                
                if (error) throw error;
                
                if (count >= limit) {
                    alert(`Limit reached. You can post ${limit} times per 24 hours. Try again later.`);
                    return; // STOP EXECUTION
                }
                
            } catch(e) {
                console.error("Limit check error", e);
                // Optionally let them pass if check fails, or block. Here we block on error for safety? 
                // Let's assume network error -> show alert.
                alert('Error checking post limit. Please try again.');
                return;
            }

            btn.disabled = true; btn.innerText = 'Publishing...';
            try {
                let mUrl = null; let mType = 'text';
                if(selectedFile) {
                    const ext = selectedFile.name.split('.').pop();
                    const fname = `${Date.now()}.${ext}`;
                    const { error } = await sb.storage.from('qineq-image').upload(`${currentUser.id}/${fname}`, selectedFile);
                    if(error) throw error;
                    const { data } = sb.storage.from('qineq-image').getPublicUrl(`${currentUser.id}/${fname}`);
                    mUrl = data.publicUrl; mType = selectedFile.type.startsWith('video') ? 'video' : 'image';
                }
                await sb.from('qineq_posts').insert({
                    user_id: currentUser.id, title: title, description: desc, media_url: mUrl, media_type: mType, views: 0, likes: 0, comments_count: 0, shares: 0
                });
                const {data:u} = await sb.from('qineq_users').select('post_count').eq('user_id', currentUser.id).single();
                await sb.from('qineq_users').update({post_count: (u.post_count||0)+1}).eq('user_id', currentUser.id);
                alert('Posted!');
                document.getElementById('view-create').classList.remove('open');
                document.getElementById('inp-title').value = ''; document.getElementById('inp-desc').value = ''; selectedFile = null;
                pImg.style.display='none'; pVid.style.display='none'; area.style.display='block';
                loadFeed();
            } catch(e) { console.error(e); alert('Error'); }
            btn.disabled = false; btn.innerText = 'POST NOW';
        };
    }
    init();
})();
