// ✅ Load Supabase
const supabase = window.supabase.createClient(
  'https://hwrvqyipozrsxyjdpqag.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM'
);

// ✅ Conversion rates
const rates = {
  INR: 1,
  USD: 0.012,
  BTC: 0.00000027,
  ETH: 0.0000042,
  BNB: 0.00013,
  USDT: 0.012,
  XRP: 0.78,
  EUR: 0.011,
  JPY: 1.72,
  GBP: 0.0094,
};

// ✅ Main function to fetch & update balance
async function updateWalletBalance() {
  try {
    // ✅ Get logged-in user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("❌ User not logged in or error fetching user:", userError);
      return;
    }

    const userId = user.id;

    // ✅ Fetch wallet entry from updated table name
    const { data: wallet, error } = await supabase
      .from("user_wallets")  // 🔁 Changed here
      .select("*")
      .eq("uid", userId)
      .single();

    if (error || !wallet) {
      console.error("❌ Wallet not found for user:", error);
      return;
    }

    const inrBalance = parseFloat(wallet.balance) || 0;

    // ✅ Find currency element
    const currencyEl = document.getElementById("currency") || document.getElementById("currency-select");
    const balanceEl = document.querySelector(".balance-amount") || document.getElementById("balanceValue");

    if (!currencyEl || !balanceEl) {
      console.error("❌ Currency or balance element not found in DOM");
      return;
    }

    const selectedCurrency = currencyEl.value || "INR";
    const converted = (inrBalance * (rates[selectedCurrency] || 1)).toFixed(2);

    balanceEl.textContent = converted;
  } catch (err) {
    console.error("❌ Error updating balance:", err.message);
  }
}

// ✅ Run when page loads
document.addEventListener("DOMContentLoaded", updateWalletBalance);

// ✅ Update on currency change
document.addEventListener("change", (e) => {
  if (e.target.id === "currency" || e.target.id === "currency-select") {
    updateWalletBalance();
  }
});