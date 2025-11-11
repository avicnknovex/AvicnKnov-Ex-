/* ==========================================================
   trade-buysell.js – Advanced Buy/Sell Dashboard
   Attractive UI with Deposit, Withdrawal, Transactions options
   ========================================================== */
(function(){
'use strict';

/* ---------- CONFIG ---------- */
const SUPA_URL = 'https://hwrvqyipozrsxyjdpqag.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM';

/* ---------- SUPABASE CLIENT ---------- */
const supaLib = window.supabase || (window.parent && window.parent.supabase);
if(!supaLib){console.error('Supabase lib not found.');return;}
const supa = supaLib.createClient(SUPA_URL, SUPA_KEY);

/* ---------- UTILS ---------- */
const fmtINR = v => '₹' + Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});

function toast(msg, ok=true){
  let t = document.getElementById('avx-toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'avx-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = ok?'ok':'err';
  t.style.opacity = '1';
  setTimeout(()=>{t.style.opacity='0';}, 3000);
}

/* ---------- WALLET FUNCTIONS ---------- */
async function getUser(){
  const {data:{user}} = await supa.auth.getUser();
  return user;
}

async function getWalletINR(){
  const u = await getUser();
  if(!u) return 0;
  const {data,error} = await supa.from('user_wallets').select('balance').eq('uid',u.id).single();
  if(error){console.error('wallet fetch error',error);return 0;}
  return Number(data?.balance||0);
}

/* ---------- RENDER MAIN UI ---------- */
function renderBuySellDashboard(){
  const container = document.getElementById('buysell');
  if(!container) return;

  container.innerHTML = `
    <!-- HERO SECTION -->
    <div class="avx-hero-section">
      <div class="avx-hero-content">
        <div class="avx-hero-left">
          <h1>🚀 AvicnKnov Exchange</h1>
          <p>Advanced Trading Platform</p>
          <div class="avx-wallet-info">
            <div class="avx-balance-card">
              <div class="avx-balance-label">Available Balance</div>
              <div class="avx-balance-amount" id="avx-wallet-balance">₹0.00</div>
              <div class="avx-balance-subtitle">Ready for Trading</div>
            </div>
          </div>
        </div>
        <div class="avx-hero-right">
          <div class="avx-trading-stats">
            <div class="avx-stat-item">
              <div class="avx-stat-number">24H</div>
              <div class="avx-stat-label">Trading Volume</div>
            </div>
            <div class="avx-stat-item">
              <div class="avx-stat-number">50+</div>
              <div class="avx-stat-label">Cryptocurrencies</div>
            </div>
            <div class="avx-stat-item">
              <div class="avx-stat-number">99.9%</div>
              <div class="avx-stat-label">Uptime</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MAIN ACTIONS SECTION -->
    <div class="avx-actions-section">
      <div class="avx-section-header">
        <h2>💰 Financial Operations</h2>
        <p>Manage your funds with ease and security</p>
      </div>

      <div class="avx-actions-grid">
        <!-- DEPOSIT CARD -->
        <div class="avx-action-card avx-deposit-card" onclick="AVX_navigateToDeposit()">
          <div class="avx-card-icon">
            <div class="avx-icon-bg avx-deposit-bg">
              <i class="avx-icon">💳</i>
            </div>
          </div>
          <div class="avx-card-content">
            <h3>Deposit Funds</h3>
            <p>Add money to your account via UPI, Bank Transfer, or Crypto</p>
            <div class="avx-card-features">
              <span class="avx-feature-tag">🔸 Instant UPI</span>
              <span class="avx-feature-tag">🔸 Crypto Deposits</span>
              <span class="avx-feature-tag">🔸 Bank Transfer</span>
            </div>
          </div>
          <div class="avx-card-arrow">→</div>
        </div>

        <!-- WITHDRAWAL CARD -->
        <div class="avx-action-card avx-withdrawal-card" onclick="AVX_navigateToWithdrawal()">
          <div class="avx-card-icon">
            <div class="avx-icon-bg avx-withdrawal-bg">
              <i class="avx-icon">💸</i>
            </div>
          </div>
          <div class="avx-card-content">
            <h3>Withdraw Funds</h3>
            <p>Transfer money to your bank account or crypto wallet</p>
            <div class="avx-card-features">
              <span class="avx-feature-tag">🔸 Fast Withdrawal</span>
              <span class="avx-feature-tag">🔸 Multiple Options</span>
              <span class="avx-feature-tag">🔸 Secure Process</span>
            </div>
          </div>
          <div class="avx-card-arrow">→</div>
        </div>

        <!-- TRANSACTIONS CARD -->
        <div class="avx-action-card avx-transactions-card" onclick="AVX_navigateToTransactions()">
          <div class="avx-card-icon">
            <div class="avx-icon-bg avx-transactions-bg">
              <i class="avx-icon">📊</i>
            </div>
          </div>
          <div class="avx-card-content">
            <h3>Transaction History</h3>
            <p>View all your trading history, deposits, and withdrawals</p>
            <div class="avx-card-features">
              <span class="avx-feature-tag">🔸 Complete History</span>
              <span class="avx-feature-tag">🔸 Real-time Updates</span>
              <span class="avx-feature-tag">🔸 Export Data</span>
            </div>
          </div>
          <div class="avx-card-arrow">→</div>
        </div>
      </div>
    </div>

    <!-- FOOTER INFO -->
    <div class="avx-footer-info">
      <div class="avx-footer-content">
        <div class="avx-footer-item">
          <div class="avx-footer-icon">🔒</div>
          <div class="avx-footer-text">
            <strong>Bank-level Security</strong>
            <span>Your funds are protected with advanced encryption</span>
          </div>
        </div>
        <div class="avx-footer-item">
          <div class="avx-footer-icon">⚡</div>
          <div class="avx-footer-text">
            <strong>Lightning Fast</strong>
            <span>Instant deposits and quick withdrawals</span>
          </div>
        </div>
        <div class="avx-footer-item">
          <div class="avx-footer-icon">🌟</div>
          <div class="avx-footer-text">
            <strong>24/7 Support</strong>
            <span>Our team is here to help you anytime</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Load wallet balance
  loadWalletBalance();
}

/* ---------- LOAD WALLET BALANCE ---------- */
async function loadWalletBalance(){
  try{
    const balance = await getWalletINR();
    const balanceEl = document.getElementById('avx-wallet-balance');
    if(balanceEl){
      balanceEl.textContent = fmtINR(balance);
    }
  }catch(e){
    console.error('Error loading wallet balance:', e);
  }
}

/* ---------- NAVIGATION FUNCTIONS ---------- */
function AVX_navigateToDeposit(){
  toast('🔄 Redirecting to Deposit section...', true);
  
  // Animated transition effect
  document.body.classList.add('avx-transitioning');
  
  setTimeout(() => {
    // Navigate to deposit HTML page
    window.location.href = 'deposit-upi.html';
  }, 800);
}

function AVX_navigateToWithdrawal(){
  toast('🔄 Redirecting to Withdrawal section...', true);
  
  // Animated transition effect
  document.body.classList.add('avx-transitioning');
  
  setTimeout(() => {
    // Navigate to withdrawal HTML page
    window.location.href = 'withdrawal-upi.html';
  }, 800);
}

function AVX_navigateToTransactions(){
  toast('🔄 Redirecting to Transaction History...', true);
  
  // Animated transition effect
  document.body.classList.add('avx-transitioning');
  
  setTimeout(() => {
    // Navigate to transactions HTML page
    window.location.href = 'transactions.html';
  }, 800);
}

/* ---------- GLOBAL API FUNCTIONS ---------- */
window.AVX_navigateToDeposit = AVX_navigateToDeposit;
window.AVX_navigateToWithdrawal = AVX_navigateToWithdrawal;
window.AVX_navigateToTransactions = AVX_navigateToTransactions;

/* ---------- CSS STYLES ---------- */
if(!document.getElementById('avx-buysell-styles')){
  const s = document.createElement('style');
  s.id = 'avx-buysell-styles';
  s.textContent = `
    /* HERO SECTION */
    .avx-hero-section {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 20px;
      padding: 40px;
      margin-bottom: 30px;
      color: white;
      overflow: hidden;
      position: relative;
    }
    .avx-hero-section::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
      border-radius: 50%;
      transform: translate(50%, -50%);
    }
    .avx-hero-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      z-index: 2;
    }
    .avx-hero-left h1 {
      font-size: 32px;
      font-weight: 700;
      margin: 0 0 8px 0;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .avx-hero-left p {
      font-size: 18px;
      opacity: 0.9;
      margin: 0 0 25px 0;
    }
    .avx-balance-card {
      background: rgba(255,255,255,0.15);
      border-radius: 15px;
      padding: 20px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.2);
    }
    .avx-balance-label {
      font-size: 14px;
      opacity: 0.8;
      margin-bottom: 5px;
    }
    .avx-balance-amount {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .avx-balance-subtitle {
      font-size: 12px;
      opacity: 0.7;
    }
    .avx-trading-stats {
      display: flex;
      gap: 30px;
    }
    .avx-stat-item {
      text-align: center;
    }
    .avx-stat-number {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .avx-stat-label {
      font-size: 12px;
      opacity: 0.8;
    }

    /* SECTIONS */
    .avx-actions-section {
      margin-bottom: 30px;
    }
    .avx-section-header {
      text-align: center;
      margin-bottom: 25px;
    }
    .avx-section-header h2 {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 8px 0;
      color: #333;
    }
    .avx-section-header p {
      font-size: 14px;
      color: #666;
      margin: 0;
    }

    /* ACTION CARDS */
    .avx-actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }
    .avx-action-card {
      background: white;
      border-radius: 15px;
      padding: 25px;
      box-shadow: 0 8px 25px rgba(0,0,0,0.1);
      border: 1px solid #f0f0f0;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      gap: 20px;
      position: relative;
      overflow: hidden;
    }
    .avx-action-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
      transition: left 0.5s;
    }
    .avx-action-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 15px 35px rgba(0,0,0,0.15);
    }
    .avx-action-card:hover::before {
      left: 100%;
    }
    .avx-icon-bg {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    .avx-deposit-bg {
      background: linear-gradient(135deg, #4CAF50, #45a049);
    }
    .avx-withdrawal-bg {
      background: linear-gradient(135deg, #ff6b6b, #ee5a24);
    }
    .avx-transactions-bg {
      background: linear-gradient(135deg, #3498db, #2980b9);
    }
    .avx-card-content {
      flex: 1;
    }
    .avx-card-content h3 {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 8px 0;
      color: #333;
    }
    .avx-card-content p {
      font-size: 14px;
      color: #666;
      margin: 0 0 15px 0;
      line-height: 1.5;
    }
    .avx-card-features {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .avx-feature-tag {
      background: #f8f9fa;
      color: #495057;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    .avx-card-arrow {
      font-size: 24px;
      color: #ccc;
      transition: all 0.3s ease;
    }
    .avx-action-card:hover .avx-card-arrow {
      color: #667eea;
      transform: translateX(5px);
    }

    /* FOOTER INFO */
    .avx-footer-info {
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      border-radius: 15px;
      padding: 30px;
      margin-top: 30px;
    }
    .avx-footer-content {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
    }
    .avx-footer-item {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .avx-footer-icon {
      font-size: 24px;
      width: 50px;
      height: 50px;
      background: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 3px 10px rgba(0,0,0,0.1);
    }
    .avx-footer-text strong {
      display: block;
      font-size: 14px;
      color: #333;
      margin-bottom: 3px;
    }
    .avx-footer-text span {
      font-size: 12px;
      color: #666;
    }

    /* TOAST */
    #avx-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    }
    #avx-toast.ok {
      background: linear-gradient(135deg, #28a745, #20c997);
    }
    #avx-toast.err {
      background: linear-gradient(135deg, #dc3545, #fd7e14);
    }

    /* TRANSITION EFFECT */
    .avx-transitioning {
      opacity: 0.7;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }

    /* RESPONSIVE */
    @media (max-width: 768px) {
      .avx-hero-content {
        flex-direction: column;
        text-align: center;
        gap: 20px;
      }
      .avx-trading-stats {
        gap: 20px;
      }
      .avx-actions-grid {
        grid-template-columns: 1fr;
      }
      .avx-action-card {
        flex-direction: column;
        text-align: center;
      }
      .avx-hero-left h1 {
        font-size: 24px;
      }
      .avx-hero-section {
        padding: 25px;
      }
    }
  `;
  document.head.appendChild(s);
}

/* ---------- INITIALIZATION ---------- */
function init(){
  renderBuySellDashboard();
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();