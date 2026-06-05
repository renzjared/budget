const supabaseUrl = 'https://rybebmxofmtikdgqklbr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5YmVibXhvZm10aWtkZ3FrbGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Njc3NDMsImV4cCI6MjA5NjE0Mzc0M30.DK5OUHEEiVKTW5ZyCb_Yl3dX-yw7BO_kQ_b-bcLAZzo';
window.supabase = supabase.createClient(supabaseUrl, supabaseKey);

window.currentUser = null;
window.userProfile = null;
window.appData = [];
window.accountsData = [];
window.userGoals = [];
window.userSubscriptions = [];
window.userSettings = { 
    name: 'User', balance: 0, currency: '₱', metric: 'running', theme: 'light',
    budgetCycle: 'monthly', categories: [{ name: 'SAVINGS', percent: 100, isAuto: true }],
    incomeCategories: ['SALARY', 'ALLOWANCE', 'BONUS'],
    typeOrder: [],
    goalAllocations: {}
};

window.formatMoney = (amount) => {
    let sym = window.userSettings?.currency;
    if (!sym || sym === 'undefined') sym = '₱'; // Hard fallback
    return `${sym}${Math.abs(amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
};

window.formatMoneyWithSymbol = (amount, symbol) => {
    return `${symbol}${Math.abs(amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
};

window.formatReceiptDateTime = (dateStr) => {
    if (!dateStr) return 'Unknown Date';
    try {
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr.toString();
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    } catch(e) { return 'Invalid Date'; }
};

window.formatListDate = (dateStr) => {
    if (!dateStr) return 'Unknown Date';
    try {
        const d = new Date(dateStr);
        return isNaN(d) ? dateStr.toString().split(' ')[0] : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch(e) { return dateStr; }
};

window.initApp = async () => {
    window.supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            window.currentUser = session.user;
            await handleUserRouting();
        } else if (event === 'SIGNED_OUT') {
            window.currentUser = null;
            document.getElementById('main-sidebar').style.display = 'none';
            window.switchView('landing');
        }
    });

    const { data: { session } } = await window.supabase.auth.getSession();
    
    if (session) {
        window.currentUser = session.user;
        await handleUserRouting();
    } else {
        document.getElementById('main-sidebar').style.display = 'none';
        window.switchView('landing');
    }
};

async function handleUserRouting() {
    const { data: profile } = await window.supabase.from('profiles').select('*').eq('id', window.currentUser.id).single();
        
    if (!profile || !profile.username) {
        window.switchView('username-setup');
    } else {
        window.userProfile = profile;
        document.getElementById('main-sidebar').style.display = 'flex';
        await loadCloudData();
        window.switchView('dashboard');
        if (window.bootUI) window.bootUI();
    }
}

window.loginWithDiscord = async () => {
    const exactRedirectUrl = window.location.origin + window.location.pathname;
    await window.supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: exactRedirectUrl } });
};

window.logout = async () => {
    await window.supabase.auth.signOut();
    location.reload();
};

window.claimUsername = async (username) => {
    const cleanUser = username.trim();
    if (!/^[a-zA-Z0-9]+$/.test(cleanUser)) throw new Error("Letters and numbers only.");
    
    const { error } = await window.supabase.from('profiles').insert({ id: window.currentUser.id, username: cleanUser });
    if (error) {
        if (error.code === '23505') throw new Error("Username is already taken.");
        throw error;
    }
    
    await window.supabase.from('settings').insert({ user_id: window.currentUser.id });
    location.reload();
};

async function loadCloudData() {
    const uid = window.currentUser.id;

    // Load Settings
    const { data: set } = await window.supabase.from('settings').select('*').eq('user_id', uid).single();
    if (set) {
        window.userSettings = {
            name: set.name || 'User', balance: parseFloat(set.balance) || 0, 
            currency: (set.currency && set.currency !== 'undefined') ? set.currency : '₱',
            metric: set.metric || 'running', theme: set.theme || 'light', 
            budgetCycle: set.budget_cycle || 'monthly', categories: set.categories || [],
            incomeCategories: set.income_categories || ['SALARY', 'ALLOWANCE', 'BONUS'],
            typeOrder: set.type_order || [],
            goalAllocations: set.goal_allocations || {}
        };
    }
    if (!window.userSettings.categories.find(c => c.name.toUpperCase() === 'SAVINGS')) {
        window.userSettings.categories.push({ name: 'SAVINGS', percent: 100, isAuto: true });
    }

    // Load Accounts
    const { data: accs } = await window.supabase.from('accounts').select('*').eq('user_id', uid);
    window.accountsData = (accs || []).map(acc => ({
        ...acc,
        customType: acc.custom_type || undefined
    }));

    // Load Transactions (with batching for >1000 records)
    let allTxs = [];
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
        const { data: batch, error } = await window.supabase
            .from('transactions')
            .select('*')
            .eq('user_id', uid)
            .order('timestamp', { ascending: false })
            .range(offset, offset + batchSize - 1);
        
        if (error) {
            console.error('Error loading transaction batch:', error);
            break;
        }
        
        if (!batch || batch.length === 0) {
            hasMore = false;
        } else {
            allTxs = allTxs.concat(batch);
            if (batch.length < batchSize) {
                hasMore = false;
            } else {
                offset += batchSize;
            }
        }
    }
    
    window.appData = allTxs;
    window.appData.forEach((item, idx) => item._id = idx);
    
    // Load Goals and Subscriptions
    await window.loadGoals();
    await window.loadSubscriptions();
}

window.saveSettingsToCloud = async () => {
    const payload = {
        user_id: window.currentUser.id,
        name: window.userSettings.name,
        balance: window.userSettings.balance,
        currency: window.userSettings.currency,
        metric: window.userSettings.metric,
        theme: window.userSettings.theme,
        budget_cycle: window.userSettings.budgetCycle,
        categories: window.userSettings.categories,
        income_categories: window.userSettings.incomeCategories,
        type_order: window.userSettings.typeOrder || [],
        goal_allocations: window.userSettings.goalAllocations || {}
    };
    await window.supabase.from('settings').upsert(payload);
};

window.generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

window.saveAccountsToCloud = async () => {
    if (!window.currentUser?.id) return;
    
    try {
        // Get all existing accounts from Supabase
        const { data: existingAccounts } = await window.supabase
            .from('accounts')
            .select('id')
            .eq('user_id', window.currentUser.id);
        
        const existingIds = new Set(existingAccounts?.map(a => a.id) || []);
        const localIds = new Set(window.accountsData.map(a => a.id).filter(Boolean));
        
        // Delete accounts that exist in Supabase but not in local array
        const idsToDelete = Array.from(existingIds).filter(id => !localIds.has(id));
        if (idsToDelete.length > 0) {
            await window.supabase
                .from('accounts')
                .delete()
                .in('id', idsToDelete);
        }
        
        // If no accounts left, delete all
        if (window.accountsData.length === 0) {
            await window.supabase.from('accounts').delete().eq('user_id', window.currentUser.id);
            return;
        }
        
        // Upsert remaining accounts
        const payload = window.accountsData.map(a => ({
            id: a.id || window.generateUUID(),
            user_id: window.currentUser.id,
            name: a.name,
            type: a.type,
            balance: a.balance,
            color: a.color,
            note: a.note,
            favorite: a.favorite || false,
            currency: a.currency || '',
            custom_type: a.customType || null
        }));
        
        const { error } = await window.supabase
            .from('accounts')
            .upsert(payload, { onConflict: 'id' });
        
        if (error) {
            console.error('Error saving accounts:', error);
            throw error;
        }
        
        window.accountsData = window.accountsData.map((a, idx) => ({ ...a, id: a.id || payload[idx].id }));
    } catch (error) {
        console.error('Error in saveAccountsToCloud:', error);
        throw error;
    }
};

// Alpha Vantage API key
const ALPHA_VANTAGE_KEY = 'CMMZWUELUE7SL5WV';

// Price caching with 24-hour TTL
window.getPriceCache = () => {
    const cached = localStorage.getItem('priceCache');
    if (!cached) return {};
    
    try {
        const data = JSON.parse(cached);
        const now = Date.now();
        // Clean expired entries
        Object.keys(data).forEach(key => {
            if (data[key].expires < now) delete data[key];
        });
        localStorage.setItem('priceCache', JSON.stringify(data));
        return data;
    } catch (e) {
        return {};
    }
};

window.cachePrice = (symbol, rate) => {
    const cache = window.getPriceCache();
    cache[symbol] = { rate, expires: Date.now() + (24 * 60 * 60 * 1000) };
    localStorage.setItem('priceCache', JSON.stringify(cache));
};

// Get exchange rate for currency pairs (e.g., "GBPUSD" for GBP to USD)
window.getExchangeRate = async (fromCurrency, toCurrency) => {
    if (fromCurrency === toCurrency) return 1;
    
    const cacheKey = `${fromCurrency}${toCurrency}`;
    const cache = window.getPriceCache();
    if (cache[cacheKey]) return cache[cacheKey].rate;
    
    try {
        const response = await fetch(
            `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${fromCurrency}&to_currency=${toCurrency}&apikey=${ALPHA_VANTAGE_KEY}`
        );
        const data = await response.json();
        
        if (data['Realtime Currency Exchange Rate']) {
            const rate = parseFloat(data['Realtime Currency Exchange Rate']['5. Exchange Rate']);
            window.cachePrice(cacheKey, rate);
            return rate;
        }
    } catch (e) {
        console.error('Exchange rate error:', e);
    }
    return null;
};

// Get stock price (e.g., "GOOG")
window.getStockPrice = async (symbol) => {
    const cache = window.getPriceCache();
    if (cache[symbol]) return cache[symbol].rate;
    
    try {
        const response = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`
        );
        const data = await response.json();
        
        if (data['Global Quote'] && data['Global Quote']['05. price']) {
            const price = parseFloat(data['Global Quote']['05. price']);
            window.cachePrice(symbol, price);
            return price;
        }
    } catch (e) {
        console.error('Stock price error:', e);
    }
    return null;
};

// Get crypto price via CoinGecko (free, no API key)
window.getCryptoPrice = async (symbol) => {
    const cache = window.getPriceCache();
    if (cache[symbol]) return cache[symbol].rate;
    
    const cryptoMap = {
        'BTC': 'bitcoin', 'ETH': 'ethereum', 'XRP': 'ripple', 'LTC': 'litecoin',
        'ADA': 'cardano', 'SOL': 'solana', 'DOGE': 'dogecoin', 'USDT': 'tether',
        'USDC': 'usdc', 'XLM': 'stellar', 'MATIC': 'matic-network'
    };
    
    const coinId = cryptoMap[symbol.toUpperCase()];
    if (!coinId) return null;
    
    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
        );
        const data = await response.json();
        
        if (data[coinId] && data[coinId].usd) {
            const price = data[coinId].usd;
            window.cachePrice(symbol, price);
            return price;
        }
    } catch (e) {
        console.error('Crypto price error:', e);
    }
    return null;
};

// Get price for any symbol (crypto, stock, or forex)
window.getPrice = async (symbol) => {
    if (!symbol || symbol.length === 0) return null;
    
    const upperSymbol = symbol.toUpperCase();
    
    // Try crypto first
    const cryptoPrice = await window.getCryptoPrice(upperSymbol);
    if (cryptoPrice !== null) return cryptoPrice;
    
    // Try stock
    const stockPrice = await window.getStockPrice(upperSymbol);
    if (stockPrice !== null) return stockPrice;
    
    return null;
};

window.bulkUpsertTransactions = async (parsedData) => {
    if (parsedData.length === 0) return;
    
    const payload = parsedData.map(p => ({
        ...p, user_id: window.currentUser.id, fingerprint: `${p.timestamp}_${p.name}_${p.amount}`
    }));
    
    try {
        // Use upsert with explicit conflict resolution on the unique constraint
        // This will insert new records and update existing ones based on (user_id, fingerprint)
        const { data, error } = await window.supabase
            .from('transactions')
            .upsert(payload, { onConflict: 'user_id,fingerprint' });
        
        if(error) {
            console.error("Upsert Error:", error);
            throw error;
        }
        
        console.log(`Upserted ${payload.length} transactions`);
        await loadCloudData();
    } catch (err) {
        console.error("Transaction sync failed:", err);
    }
};

// ==========================================
// GOALS & SUBSCRIPTIONS PERSISTENCE
// ==========================================

window.loadGoals = async () => {
    if (!window.currentUser?.id) {
        window.userGoals = [];
        return;
    }
    
    try {
        const { data, error } = await window.supabase
            .from('goals')
            .select('*')
            .eq('user_id', window.currentUser.id);
        
        if (error) throw error;
        window.userGoals = data || [];
        console.log('Loaded goals:', window.userGoals);
    } catch (err) {
        console.error('Error loading goals:', err);
        window.userGoals = [];
    }
};

window.loadSubscriptions = async () => {
    if (!window.currentUser?.id) {
        window.userSubscriptions = [];
        return;
    }
    
    try {
        const { data, error } = await window.supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', window.currentUser.id);
        
        if (error) throw error;
        window.userSubscriptions = data || [];
        console.log('Loaded subscriptions:', window.userSubscriptions);
    } catch (err) {
        console.error('Error loading subscriptions:', err);
        window.userSubscriptions = [];
    }
};

window.saveGoalsToCloud = async () => {
    if (!window.currentUser?.id) return;
    
    try {
        const goalsToSave = window.userGoals.map(g => ({
            id: g.id,
            user_id: window.currentUser.id,
            name: g.name,
            target_amount: g.target_amount,
            current_amount: g.current_amount,
            deadline: g.deadline,
            theme_color: g.theme_color,
            status: g.status
        }));
        
        // Use upsert to handle both inserts and updates
        const { error } = await window.supabase
            .from('goals')
            .upsert(goalsToSave);
        
        if (error) throw error;
        console.log('Goals saved successfully');
    } catch (err) {
        console.error('Error saving goals:', err);
    }
};

// ==========================================
// PACING ANALYZER & ALLOCATION ENGINE
// ==========================================

window.calculatePacing = (goal) => {
    if (!goal.deadline) return null;
    
    const today = new Date();
    const deadline = new Date(goal.deadline);
    const remaining = goal.target_amount - goal.current_amount;
    const daysRemaining = Math.max(1, Math.ceil((deadline - today) / (1000 * 60 * 60 * 24)));
    
    const requiredDaily = remaining / daysRemaining;
    const requiredWeekly = requiredDaily * 7;
    
    // Estimate current pace from how much has been saved so far
    // (approximate: assume goal was created/started tracking recently)
    const daysSinceCreated = Math.max(1, Math.ceil((today - new Date(goal.created_at)) / (1000 * 60 * 60 * 24)));
    const currentDailyRate = goal.current_amount / daysSinceCreated;
    
    const status = currentDailyRate >= requiredDaily ? 'on-pace' : 'behind';
    const shortfall = Math.max(0, (requiredDaily - currentDailyRate) * daysRemaining);
    
    return {
        daysRemaining,
        remaining,
        requiredDaily: Math.max(0, requiredDaily),
        requiredWeekly: Math.max(0, requiredWeekly),
        currentDailyRate,
        status,
        shortfall,
        percentComplete: Math.min(100, (goal.current_amount / goal.target_amount) * 100)
    };
};

window.getAllocationPercentForGoal = (goalId) => {
    if (!window.userSettings.goalAllocations) window.userSettings.goalAllocations = {};
    return window.userSettings.goalAllocations[goalId] || 0;
};

window.setGoalAllocation = (goalId, percent) => {
    if (!window.userSettings.goalAllocations) window.userSettings.goalAllocations = {};
    window.userSettings.goalAllocations[goalId] = Math.max(0, Math.min(100, percent));
};

window.getTotalAllocatedToGoals = () => {
    if (!window.userSettings.goalAllocations) return 0;
    return Object.values(window.userSettings.goalAllocations).reduce((sum, p) => sum + p, 0);
};

window.calculateGoalContributions = (monthlyIncome) => {
    // Find the Savings category
    const savingsCat = window.userSettings.categories?.find(c => c.name.toUpperCase() === 'SAVINGS');
    if (!savingsCat) return {};
    
    const savingsAmount = (monthlyIncome * savingsCat.percent) / 100;
    const allocations = window.userSettings.goalAllocations || {};
    
    const contributions = {};
    Object.entries(allocations).forEach(([goalId, percent]) => {
        contributions[goalId] = (savingsAmount * percent) / 100;
    });
    
    return contributions;
};

// Phase 3: Subscriptions Automation (Lazy Cron)
window.processSubscriptionAutomation = async () => {
    if (!window.userSubscriptions || window.userSubscriptions.length === 0) return;
    
    const today = new Date().toISOString().split('T')[0];
    let hasChanges = false;
    
    for (const sub of window.userSubscriptions) {
        if (!sub.auto_log) continue;
        if (!sub.next_billing_date) continue;
        
        if (sub.next_billing_date <= today) {
            // Subscription is due, auto-log transaction
            const txDate = sub.next_billing_date;
            
            const newTx = {
                amount: -Math.abs(sub.amount),
                category: sub.category || 'Subscriptions',
                description: `${sub.name} (Auto-logged)`,
                timestamp: txDate,
                receipt: '',
                merchant: sub.name
            };
            
            window.appData.push(newTx);
            
            // Advance billing date
            const nextDate = new Date(sub.next_billing_date);
            if (sub.billing_cycle === 'Monthly') {
                nextDate.setMonth(nextDate.getMonth() + 1);
            } else if (sub.billing_cycle === 'Quarterly') {
                nextDate.setMonth(nextDate.getMonth() + 3);
            } else if (sub.billing_cycle === 'Yearly') {
                nextDate.setFullYear(nextDate.getFullYear() + 1);
            }
            sub.next_billing_date = nextDate.toISOString().split('T')[0];
            hasChanges = true;
        }
    }
    
    if (hasChanges) {
        await window.saveSubscriptionsToCloud();
        await window.saveAppData();
        window.updateDashboard();
        window.renderTransactions();
    }
};

// Call automation on app boot
if (typeof window.loadCloudData !== 'undefined') {
    const originalLoadCloudData = window.loadCloudData;
    window.loadCloudData = async function() {
        await originalLoadCloudData.call(this);
        if (window.processSubscriptionAutomation) {
            await window.processSubscriptionAutomation();
        }
    };
}

window.saveSubscriptionsToCloud = async () => {
    if (!window.currentUser?.id) return;
    
    try {
        const subsToSave = window.userSubscriptions.map(s => ({
            id: s.id,
            user_id: window.currentUser.id,
            name: s.name,
            amount: s.amount,
            category: s.category,
            billing_cycle: s.billing_cycle,
            next_billing_date: s.next_billing_date,
            notes: s.notes || '',
            auto_log: s.auto_log
        }));
        
        // Use upsert to handle both inserts and updates
        const { error } = await window.supabase
            .from('subscriptions')
            .upsert(subsToSave);
        
        if (error) throw error;
        console.log('Subscriptions saved successfully');
    } catch (err) {
        console.error('Error saving subscriptions:', err);
    }
};

document.addEventListener('DOMContentLoaded', window.initApp);