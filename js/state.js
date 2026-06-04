const supabaseUrl = 'https://rybebmxofmtikdgqklbr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5YmVibXhvZm10aWtkZ3FrbGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Njc3NDMsImV4cCI6MjA5NjE0Mzc0M30.DK5OUHEEiVKTW5ZyCb_Yl3dX-yw7BO_kQ_b-bcLAZzo';
window.supabase = supabase.createClient(supabaseUrl, supabaseKey);

window.currentUser = null;
window.userProfile = null;
window.appData = [];
window.accountsData = [];
window.userSettings = { 
    name: 'User', balance: 0, currency: '₱', metric: 'running', theme: 'light',
    budgetCycle: 'monthly', categories: [{ name: 'SAVINGS', percent: 100, isAuto: true }] 
};

window.formatMoney = (amount) => `${window.userSettings.currency}${Math.abs(amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}`;

window.formatReceiptDateTime = (dateStr) => {
    if (!dateStr) return 'Unknown Date';
    try {
        const d = new Date(dateStr);
        return isNaN(d) ? dateStr.toString() : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
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
    const { data: { session } } = await window.supabase.auth.getSession();
    
    if (session) {
        window.currentUser = session.user;
        
        // Check if user has claimed a username
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
    } else {
        document.getElementById('main-sidebar').style.display = 'none';
        window.switchView('landing');
    }
};

window.loginWithDiscord = async () => {
    await window.supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin } });
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
    
    // Create default settings row
    await window.supabase.from('settings').insert({ user_id: window.currentUser.id });
    location.reload();
};

async function loadCloudData() {
    const uid = window.currentUser.id;
    const { data: set } = await window.supabase.from('settings').select('*').eq('user_id', uid).single();
    if (set) {
        window.userSettings = {
            name: set.name || 'User', balance: parseFloat(set.balance) || 0, currency: set.currency,
            metric: set.metric, theme: set.theme, budgetCycle: set.budget_cycle, categories: set.categories || []
        };
    }
    if (!window.userSettings.categories.find(c => c.name.toUpperCase() === 'SAVINGS')) {
        window.userSettings.categories.push({ name: 'SAVINGS', percent: 100, isAuto: true });
    }

    // Load Accounts
    const { data: accs } = await window.supabase.from('accounts').select('*').eq('user_id', uid);
    window.accountsData = accs || [];

    // Load Transactions
    const { data: txs } = await window.supabase.from('transactions').select('*').eq('user_id', uid).order('timestamp', { ascending: false });
    window.appData = txs || [];
    window.appData.forEach((item, idx) => item._id = idx); 
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
        categories: window.userSettings.categories
    };
    await window.supabase.from('settings').upsert(payload);
};

window.saveAccountsToCloud = async () => {
    await window.supabase.from('accounts').delete().eq('user_id', window.currentUser.id);
    if (window.accountsData.length > 0) {
        const payload = window.accountsData.map(a => ({ ...a, user_id: window.currentUser.id }));
        await window.supabase.from('accounts').insert(payload);
    }
};

window.bulkUpsertTransactions = async (parsedData) => {
    const payload = parsedData.map(p => ({
        ...p, user_id: window.currentUser.id, fingerprint: `${p.timestamp}_${p.name}_${p.amount}`
    }));
    
    const { error } = await window.supabase.from('transactions').upsert(payload, { onConflict: 'user_id, fingerprint' });
    if(error) console.error("Sync Error:", error);
    await loadCloudData(); // Refresh appData
};

document.addEventListener('DOMContentLoaded', window.initApp);