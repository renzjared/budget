// js/app.js

// ==========================================
// 1. GLOBAL CORE FUNCTIONS
// ==========================================

window.switchView = (targetId) => {
    if (!targetId) return;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none'; 
    });
    
    const navMatch = document.querySelector(`.nav-btn[data-target="${targetId}"]`);
    if (navMatch) navMatch.classList.add('active');
    
    const viewEl = document.getElementById(targetId);
    if (viewEl) {
        viewEl.classList.add('active');
        viewEl.style.display = 'block'; 
    }
};

window.applySettingsToUI = () => {
    if (window.userSettings.theme === 'dark') {
        document.body.classList.add('dark-theme');
        const st = document.getElementById('setting-theme'); if(st) st.checked = true;
    } else {
        document.body.classList.remove('dark-theme');
        const st = document.getElementById('setting-theme'); if(st) st.checked = false;
    }
    
    // Greeting Update (Uses Username & Avatar)
    const greetEl = document.getElementById('dashboard-greeting');
    const avatarEl = document.getElementById('dashboard-avatar');

    if (greetEl) greetEl.innerText = `Hello, ${window.userProfile?.username || 'User'}`;

    if (avatarEl && window.currentUser?.user_metadata?.avatar_url) {
        avatarEl.src = window.currentUser.user_metadata.avatar_url;
        avatarEl.style.display = 'block';
    } else if (avatarEl) {
        avatarEl.style.display = 'none';
    }
    
    const safePopulate = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
    safePopulate('setting-balance', window.userSettings.balance);
    safePopulate('setting-currency', window.userSettings.currency);
    safePopulate('setting-metric', window.userSettings.metric);
    safePopulate('setting-budget-cycle', window.userSettings.budgetCycle || 'monthly');

    window.recalculateSavings(); 
    window.renderSettingsCategories();
    window.renderSettingsIncomeCategories();
};

window.recalculateSavings = () => {
    let sum = 0;
    if (!window.userSettings.categories) window.userSettings.categories = [];
    
    window.userSettings.categories.forEach(c => { 
        if (c.name.toUpperCase() !== 'SAVINGS') sum += parseFloat(c.percent) || 0; 
    });
    
    const warning = document.getElementById('budget-warning');
    if (warning) warning.style.display = sum > 100 ? 'block' : 'none';
    
    const savingsCat = window.userSettings.categories.find(c => c.name.toUpperCase() === 'SAVINGS');
    if (savingsCat) savingsCat.percent = Math.max(0, parseFloat((100 - sum).toFixed(2)));
};

window.renderSettingsCategories = () => {
    const list = document.getElementById('settings-categories-list');
    if(!list) return;
    
    list.innerHTML = window.userSettings.categories.map((c, i) => {
        const isSavings = c.name.toUpperCase() === 'SAVINGS';
        return `
        <li style="display:flex; justify-content:space-between; padding: 12px 0; border-bottom: 1px solid var(--border);">
            <span style="font-weight: 500; ${isSavings ? 'color: var(--primary);' : ''}">${c.name}</span>
            <div>
                <span style="margin-right: 16px; color: var(--text-secondary);">${c.percent}%</span>
                ${!isSavings ? `<button onclick="window.removeCategory(${i})" class="text-btn" style="color:var(--accent-red)">Remove</button>` : `<span style="font-size: 12px; color: var(--text-secondary); font-style: italic;">Auto</span>`}
            </div>
        </li>`;
    }).join('');
};

window.renderSettingsIncomeCategories = () => {
    const list = document.getElementById('settings-inc-categories-list');
    if(!list) return;
    
    if(!window.userSettings.incomeCategories) window.userSettings.incomeCategories = ['SALARY', 'ALLOWANCE', 'BONUS'];

    list.innerHTML = window.userSettings.incomeCategories.map((c, i) => `
    <li style="display:flex; justify-content:space-between; padding: 12px 0; border-bottom: 1px solid var(--border);">
        <span style="font-weight: 500;">${c}</span>
        <button onclick="window.removeIncomeCategory(${i})" class="text-btn" style="color:var(--accent-red)">Remove</button>
    </li>`).join('');
    
    window.populateIncomeDropdown(); 
};

window.removeIncomeCategory = (i) => {
    window.userSettings.incomeCategories.splice(i, 1);
    window.renderSettingsIncomeCategories();
};

window.populateIncomeDropdown = () => {
    const incSelect = document.getElementById('inc-category');
    if (incSelect && window.userSettings.incomeCategories) {
        incSelect.innerHTML = window.userSettings.incomeCategories.map(c => `<option value="${c}">${c}</option>`).join('');
    }
};

window.removeCategory = (i) => {
    window.userSettings.categories.splice(i, 1);
    window.recalculateSavings(); 
    window.renderSettingsCategories(); 
    if(window.renderBudgetTracking) window.renderBudgetTracking(); 
};

window.generateTxHTML = (entry) => {
    const isPositiveEffect = (entry.amount || 0) >= 0;
    const amountColor = (isPositiveEffect && entry.amount !== 0) ? 'var(--primary)' : 'var(--text)';
    const sign = isPositiveEffect ? '+' : '-';
    return `
        <li class="tx-item" data-id="${entry._id}">
            <div class="tx-left">
                <span class="tx-cat">${entry.category || 'Uncategorized'}</span>
                <span class="tx-name">${entry.name || 'Unnamed Transaction'}</span>
            </div>
            <div class="tx-right">
                <span class="tx-date">${window.formatListDate(entry.timestamp)}</span>
                <span class="tx-amount" style="color: ${amountColor}">${sign}${window.formatMoney(entry.amount)}</span>
            </div>
        </li>`;
};

window.setupReceiptListeners = () => {
    ['recent-logs-list', 'top-expenses-list', 'logs-list-view'].forEach(id => {
        const ul = document.getElementById(id);
        if (ul) {
            ul.addEventListener('click', (e) => {
                const li = e.target.closest('.tx-item');
                if (li) {
                    const entryId = parseInt(li.getAttribute('data-id'));
                    const entry = window.appData.find(x => x._id === entryId);
                    if (entry) window.openReceiptModal(entry);
                }
            });
        }
    });
};

window.dashboardChartInst = null;

window.renderDashboardInsights = () => {
    if (typeof Chart === 'undefined') {
        setTimeout(window.renderDashboardInsights, 500);
        return;
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    // --- 1. Expense Distribution (Doughnut Chart) ---
    const recentExpenses = window.appData.filter(e => new Date(e.timestamp) >= thirtyDaysAgo && e.amount < 0);
    const categoryTotals = {};
    
    recentExpenses.forEach(e => {
        const cat = e.category || 'Uncategorized';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(e.amount);
    });

    const ctx = document.getElementById('dashboardExpenseChart');
    if (ctx) {
        if (window.dashboardChartInst) window.dashboardChartInst.destroy();
        
        const sortedCats = Object.keys(categoryTotals).sort((a,b) => categoryTotals[b] - categoryTotals[a]);
        const sortedData = sortedCats.map(c => categoryTotals[c]);
        const isDark = document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#FFFFFF' : '#111111';
        const palette = ['#FF4A4A', '#FFA800', '#FFCD00', '#3A5DFF', '#6E4BFF', '#26D9B0', '#9FA1A6'];

        window.dashboardChartInst = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sortedCats.length ? sortedCats : ['No Data'],
                datasets: [{
                    data: sortedData.length ? sortedData : [1],
                    backgroundColor: sortedData.length ? palette : [isDark ? '#2C2C2C' : '#ECECEC'],
                    borderWidth: 0,
                    cutout: '70%'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: textColor, font: { family: "'DM Sans', sans-serif", size: 11 }, boxWidth: 12 } },
                    tooltip: { callbacks: { label: function(c) { return sortedData.length ? ` ${window.formatMoney(c.raw)}` : ' No Data'; } } }
                }
            }
        });
    }

    // --- 2. Weekly Budget Briefer ---
    const budgetContainer = document.getElementById('dashboard-weekly-budget-container');
    if (!budgetContainer) return;

    // Calculate start of current week (Monday)
    const day = now.getDay() || 7; 
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
    weekStart.setHours(0,0,0,0);

    let weeklyIncome = 0;
    const weeklySpent = {};
    
    window.appData.filter(e => new Date(e.timestamp) >= weekStart).forEach(e => {
        if (e.amount > 0) weeklyIncome += e.amount;
        else if (e.amount < 0) {
            const cat = (e.category || 'Uncategorized').toUpperCase();
            weeklySpent[cat] = (weeklySpent[cat] || 0) + Math.abs(e.amount);
        }
    });

    if (weeklyIncome === 0) {
        budgetContainer.innerHTML = '<p class="text-muted" style="text-align:center; padding: 24px 0; font-size: 13px;">No income recorded this week to budget against.</p>';
        return;
    }

    budgetContainer.innerHTML = window.userSettings.categories.map(cat => {
        const allocated = weeklyIncome * (cat.percent / 100);
        if (allocated === 0) return ''; 
        
        const spent = weeklySpent[cat.name.toUpperCase()] || 0;
        const pct = (spent / allocated) * 100;
        const over = pct > 100;
        const color = over ? 'var(--accent-red)' : 'var(--primary)';
        
        const remaining = allocated - spent;
        const remainingText = remaining >= 0 
            ? `<span style="font-weight:400; color:var(--text-secondary)">left:</span> ${window.formatMoney(remaining)}` 
            : `<span style="font-weight:400; color:var(--text-secondary)">over:</span> ${window.formatMoney(Math.abs(remaining))}`;
        
        return `
            <div style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                    <span style="font-weight: 600;">${cat.name} <span style="color:var(--text-secondary); font-weight:400">(${cat.percent}%)</span></span>
                    <span style="font-weight: 700; color: ${color};">${remainingText}</span>
                </div>
                <div style="width: 100%; height: 6px; background-color: var(--border); border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: ${Math.min(pct, 100)}%; background-color: ${color}; transition: width 0.3s ease;"></div>
                </div>
            </div>`;
    }).join('');
};

window.updateDashboard = () => {
    const recentLogs = document.getElementById('recent-logs-list');
    if(!recentLogs) return;
    
    const sortedData = [...window.appData].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    let displayTotal = 0; let subtitle = "Running Balance";
    const metric = window.dashboardMetric || window.userSettings.metric || 'running';

    if (metric === 'running') {
        displayTotal = parseFloat(window.userSettings.balance) || 0;
        sortedData.forEach(entry => displayTotal += (entry.amount || 0));
        subtitle = "Running Balance";
    } else if (metric === 'net_worth') {
        subtitle = "Net Worth (All Accounts)";
        window.accountsData.forEach(acc => displayTotal += parseFloat(acc.balance || 0));
    } else if (metric === 'remaining_daily') {
        subtitle = "Remaining Budget (Today)";
        const now = new Date(); const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let cycleIncome = 0;
        sortedData.filter(e => new Date(e.timestamp) >= cutoff).forEach(e => {
            if (e.amount > 0) cycleIncome += e.amount;
        });
        const totalSpent = sortedData.filter(e => new Date(e.timestamp) >= cutoff && e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0);
        displayTotal = cycleIncome - totalSpent;
    } else if (metric === 'remaining_weekly') {
        subtitle = "Remaining Budget (This Week)";
        const now = new Date(); const day = now.getDay() || 7;
        const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
        let cycleIncome = 0;
        sortedData.filter(e => new Date(e.timestamp) >= cutoff).forEach(e => {
            if (e.amount > 0) cycleIncome += e.amount;
        });
        const totalSpent = sortedData.filter(e => new Date(e.timestamp) >= cutoff && e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0);
        displayTotal = cycleIncome - totalSpent;
    } else if (metric === 'remaining_monthly') {
        subtitle = "Remaining Budget (This Month)";
        const now = new Date(); const cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
        let cycleIncome = 0;
        sortedData.filter(e => new Date(e.timestamp) >= cutoff).forEach(e => {
            if (e.amount > 0) cycleIncome += e.amount;
        });
        const totalSpent = sortedData.filter(e => new Date(e.timestamp) >= cutoff && e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0);
        displayTotal = cycleIncome - totalSpent;
    }

    const dashSub = document.getElementById('dashboard-subtitle');
    if(dashSub) dashSub.innerText = subtitle;
    const balEl = document.getElementById('display-balance');
    if(balEl) balEl.innerText = `${displayTotal < 0 ? '-' : ''}${window.formatMoney(displayTotal)}`;
    
    recentLogs.innerHTML = sortedData.slice(0, 5).map(window.generateTxHTML).join('');
    
    // NEW: Trigger Dashboard Widgets
    if (window.renderDashboardInsights) window.renderDashboardInsights();
};

window.activeCategoryFilters = new Set();
window.populateCategoryFilters = () => {
    const container = document.getElementById('filter-categories-container');
    if(!container) return;
    
    const uniqueCats = new Set([...window.appData.map(e => e.category), ...window.userSettings.categories.map(c => c.name)]);
    const cleanCats = Array.from(uniqueCats).filter(c => c && c.trim() !== '');

    container.innerHTML = cleanCats.map(cat => `<button class="chip filter-cat-chip" data-cat="${cat}">${cat}</button>`).join('');
    
    document.querySelectorAll('.filter-cat-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            const cat = e.target.getAttribute('data-cat');
            if (window.activeCategoryFilters.has(cat)) { window.activeCategoryFilters.delete(cat); e.target.classList.remove('active'); } 
            else { window.activeCategoryFilters.add(cat); e.target.classList.add('active'); }
            window.renderActivity(); 
        });
    });
};

window.renderActivity = () => {
    const logsList = document.getElementById('logs-list-view');
    if(!logsList) return;
    
    const sortedData = [...window.appData].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    const query = (document.getElementById('search-input')?.value || '').toLowerCase();
    const minAmt = document.getElementById('filter-amount-min')?.value ? parseFloat(document.getElementById('filter-amount-min').value) : null;
    const maxAmt = document.getElementById('filter-amount-max')?.value ? parseFloat(document.getElementById('filter-amount-max').value) : null;
    const startDate = document.getElementById('filter-date-start')?.value ? new Date(document.getElementById('filter-date-start').value).setHours(0,0,0,0) : null;
    const endDate = document.getElementById('filter-date-end')?.value ? new Date(document.getElementById('filter-date-end').value).setHours(23,59,59,999) : null;

    const filteredData = sortedData.filter(entry => {
        const searchableText = ((entry.name || '') + ' ' + (entry.category || '') + ' ' + (entry.notes || '')).toLowerCase();
        if (query && !searchableText.includes(query)) return false;

        const absAmt = Math.abs(entry.amount || 0);
        if (minAmt !== null && absAmt < minAmt) return false;
        if (maxAmt !== null && absAmt > maxAmt) return false;

        if (startDate || endDate) {
            const entryDate = new Date(entry.timestamp).getTime();
            if (startDate && entryDate < startDate) return false;
            if (endDate && entryDate > endDate) return false;
        }
        if (window.activeCategoryFilters.size > 0 && !window.activeCategoryFilters.has(entry.category)) return false;

        return true;
    });

    if (filteredData.length > 0) {
        const amounts = filteredData.map(e => e.amount || 0);
        const total = amounts.reduce((a, b) => a + b, 0);
        const max = Math.max(...amounts);
        const min = Math.min(...amounts);
        const count = filteredData.length;

        if(document.getElementById('insights-total')) document.getElementById('insights-total').innerText = window.formatMoney(total);
        if(document.getElementById('insights-max')) document.getElementById('insights-max').innerText = window.formatMoney(max);
        if(document.getElementById('insights-min')) document.getElementById('insights-min').innerText = window.formatMoney(min);
        if(document.getElementById('insights-count')) document.getElementById('insights-count').innerText = count;
    } else {
        if(document.getElementById('insights-total')) document.getElementById('insights-total').innerText = '₱0.00';
        if(document.getElementById('insights-max')) document.getElementById('insights-max').innerText = '₱0.00';
        if(document.getElementById('insights-min')) document.getElementById('insights-min').innerText = '₱0.00';
        if(document.getElementById('insights-count')) document.getElementById('insights-count').innerText = '0';
    }

    logsList.innerHTML = filteredData.map(window.generateTxHTML).join('');
};

window.openReceiptModal = (entry) => {
    const overlay = document.getElementById('receipt-overlay');
    if(!overlay) return;
    
    window.currentEditingTransaction = entry;
    
    const isIncome = (entry.amount || 0) >= 0;
    const safeSet = (id, text) => { const el = document.getElementById(id); if(el) el.innerText = text; };

    safeSet('receipt-title', isIncome ? 'Received' : 'Paid');
    safeSet('receipt-amount', window.formatMoney(entry.amount));
    safeSet('receipt-item-name', entry.name || 'Transaction');
    safeSet('receipt-date', window.formatReceiptDateTime(entry.timestamp));
    safeSet('receipt-category', entry.category || 'N/A');
    
    const merchRow = document.getElementById('receipt-merchant-row');
    const merchText = document.getElementById('receipt-merchant');
    
    if (merchRow && merchText) {
        merchRow.style.display = 'flex';
        merchText.innerText = entry.merchant ? entry.merchant : 'N/A'; 
    }

    overlay.classList.add('active');
};

window.closeReceiptModal = () => { const overlay = document.getElementById('receipt-overlay'); if(overlay) overlay.classList.remove('active'); }

window.currentEditingTransaction = null;

window.editTransaction = () => {
    if (!window.currentEditingTransaction) return;
    const entry = window.currentEditingTransaction;
    
    document.getElementById('edit-tx-name').value = entry.name || '';
    document.getElementById('edit-tx-amount').value = Math.abs(entry.amount) || 0;
    document.getElementById('edit-tx-merchant').value = entry.merchant || '';
    document.getElementById('edit-tx-notes').value = entry.notes || '';
    
    const catSelect = document.getElementById('edit-tx-category');
    catSelect.innerHTML = '';
    const allCategories = new Set([...(window.userSettings.categories?.map(c => c.name) || []), entry.category]);
    Array.from(allCategories).forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = cat;
        catSelect.appendChild(opt);
    });
    catSelect.value = entry.category || '';
    
    window.closeReceiptModal();
    const overlay = document.getElementById('edit-transaction-overlay');
    if(overlay) overlay.classList.add('active');
};

window.closeEditTransactionModal = () => {
    const overlay = document.getElementById('edit-transaction-overlay');
    if(overlay) overlay.classList.remove('active');
    window.currentEditingTransaction = null;
};

window.saveTransactionEdit = async () => {
    if (!window.currentEditingTransaction) return;
    
    const entry = window.currentEditingTransaction;
    const newName = document.getElementById('edit-tx-name').value.trim();
    const newAmount = parseFloat(document.getElementById('edit-tx-amount').value);
    const newCategory = document.getElementById('edit-tx-category').value;
    const newMerchant = document.getElementById('edit-tx-merchant').value.trim();
    const newNotes = document.getElementById('edit-tx-notes').value.trim();
    
    if (!newName || !newAmount || isNaN(newAmount)) {
        alert('Please fill in Name and Amount');
        return;
    }
    
    const isIncome = entry.amount >= 0;
    const finalAmount = isIncome ? Math.abs(newAmount) : -Math.abs(newAmount);
    
    const { error } = await window.supabase
        .from('transactions')
        .update({
            name: newName,
            amount: finalAmount,
            category: newCategory,
            merchant: newMerchant,
            notes: newNotes
        })
        .eq('id', entry.id);
    
    if (error) {
        console.error('Error updating transaction:', error);
        alert('Error saving changes');
    } else {
        window.closeEditTransactionModal();
        await window.loadCloudData();
        window.updateDashboard();
        window.renderActivity?.();
        window.renderBudgetTracking?.();
    }
};

window.deleteTransaction = async () => {
    if (!window.currentEditingTransaction) return;
    
    if (!confirm('Are you sure you want to delete this transaction? This cannot be undone.')) return;
    
    const entry = window.currentEditingTransaction;
    const { error } = await window.supabase
        .from('transactions')
        .delete()
        .eq('id', entry.id);
    
    if (error) {
        console.error('Error deleting transaction:', error);
        alert('Error deleting transaction');
    } else {
        window.closeEditTransactionModal();
        await window.loadCloudData();
        window.updateDashboard();
        window.renderActivity?.();
        window.renderBudgetTracking?.();
    }
};

window.renderStatistics = (range = 'all') => {
    window.currentStatRange = range;
    
    const customDateDiv = document.getElementById('chart-custom-dates');
    if (range === 'custom') {
        if(customDateDiv) customDateDiv.style.display = 'flex';
        const startStr = document.getElementById('chart-start-date')?.value;
        const endStr = document.getElementById('chart-end-date')?.value;
        if (!startStr && !endStr) return; 
    } else {
        if(customDateDiv) customDateDiv.style.display = 'none';
    }

    let cutoffStart = new Date(0);
    let cutoffEnd = new Date('2999-12-31');

    if (range === 'custom') {
        const sDate = document.getElementById('chart-start-date')?.value;
        const eDate = document.getElementById('chart-end-date')?.value;
        if(sDate) cutoffStart = new Date(new Date(sDate).setHours(0,0,0,0));
        if(eDate) cutoffEnd = new Date(new Date(eDate).setHours(23,59,59,999));
    } else if (range !== 'all') {
        cutoffStart = new Date(new Date().getTime() - (parseInt(range) * 24 * 60 * 60 * 1000));
    }

    let totalIncome = 0; let totalExpense = 0; let expensesList = [];
    let filteredData = []; let dataBeforeStart = [];

    window.appData.forEach(entry => {
        if (entry.timestamp) {
            const eDate = new Date(entry.timestamp);
            if (eDate < cutoffStart) dataBeforeStart.push(entry);
            if (eDate >= cutoffStart && eDate <= cutoffEnd) {
                filteredData.push(entry);
                if (entry.amount > 0) totalIncome += entry.amount;
                if (entry.amount < 0) { totalExpense += Math.abs(entry.amount); expensesList.push(entry); }
            }
        }
    });

    const safeSet = (id, text) => { const el = document.getElementById(id); if(el) el.innerText = text; };
    safeSet('stat-income', window.formatMoney(totalIncome));
    safeSet('stat-expense', window.formatMoney(totalExpense));
    
    const net = totalIncome - totalExpense;
    const netEl = document.getElementById('stat-net');
    if (netEl) {
        netEl.innerText = `${net < 0 ? '-' : '+'}${window.formatMoney(net)}`;
        netEl.style.color = net < 0 ? 'var(--text)' : 'var(--primary)';
    }

    const topList = document.getElementById('top-expenses-list');
    if (topList) {
        topList.innerHTML = expensesList.sort((a, b) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0)).slice(0, 5).map(window.generateTxHTML).join('');
    }

    if(window.ChartsEngine) window.ChartsEngine.render(filteredData, dataBeforeStart, cutoffStart);
};

window.renderBudgetTracking = () => {
    const container = document.getElementById('budget-progress-container');
    if (!container) return;

    const cycle = window.userSettings.budgetCycle || 'monthly';
    const labelEl = document.getElementById('budget-cycle-label');
    if(labelEl) labelEl.innerText = cycle.charAt(0).toUpperCase() + cycle.slice(1);

    const now = new Date();
    let cutoff = new Date(now.getFullYear(), now.getMonth(), 1); 
    if (cycle === 'daily') cutoff = new Date(now.setHours(0,0,0,0));
    else if (cycle === 'weekly') { const day = now.getDay() || 7; cutoff = new Date(now.setHours(0,0,0,0)); cutoff.setDate(cutoff.getDate() - day + 1); }

    let cycleIncome = 0; const grouped = {};
    window.appData.filter(e => new Date(e.timestamp) >= cutoff).forEach(e => {
        if (e.amount > 0) cycleIncome += e.amount;
        else if (e.amount < 0) { const cat = (e.category || 'Uncategorized').toUpperCase(); grouped[cat] = (grouped[cat] || 0) + Math.abs(e.amount); }
    });

    if (cycleIncome === 0) { container.innerHTML = '<p class="text-muted" style="text-align:center; padding: 24px 0;">No income detected for this cycle. Budgets require an incoming cash flow to allocate.</p>'; return; }

    container.innerHTML = window.userSettings.categories.map(cat => {
        const allocated = cycleIncome * (cat.percent / 100);
        const spent = grouped[cat.name.toUpperCase()] || 0;
        const pct = allocated > 0 ? (spent / allocated) * 100 : (spent > 0 ? 100 : 0);
        const over = pct > 100;
        const color = over ? 'var(--accent-red)' : 'var(--primary)';
        
        return `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px;">
                    <span style="font-weight: 700;">${cat.name} <span style="font-weight:400; color:var(--text-secondary)">(${cat.percent}%)</span></span>
                    <span style="font-weight: 700; color: ${color};">${window.formatMoney(spent)} <span style="font-weight:400; color:var(--text-secondary)">/ ${window.formatMoney(allocated)}</span></span>
                </div>
                <div style="width: 100%; height: 8px; background-color: var(--border); border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: ${Math.min(pct, 100)}%; background-color: ${color}; transition: width 0.3s ease;"></div>
                </div>
                ${over ? `<p style="font-size: 12px; color: var(--accent-red); margin-top: 6px;">Overbudget by ${window.formatMoney(spent - allocated)}</p>` : ''}
            </div>`;
    }).join('');
};

window.renderAccounts = () => {
    const container = document.getElementById('accounts-container');
    if (!container) return;
    
    let grandTotal = 0;
    
    // Group accounts by type
    const groupedByType = {};
    window.accountsData.forEach((acc, index) => {
        let type = acc.type || 'bank';
        let groupKey = type;
        
        // For custom types, use customType as the group key
        if (type === 'custom' && acc.customType) {
            groupKey = `custom:${acc.customType}`;
        }
        
        if (!groupedByType[groupKey]) {
            groupedByType[groupKey] = [];
        }
        groupedByType[groupKey].push({ ...acc, _index: index });
        grandTotal += parseFloat(acc.balance || 0);
    });
    
    // Get type labels
    const typeLabels = {
        'bank': 'Banks & E-Wallets',
        'onhand': 'On-hand Cash',
        'investment': 'Investments',
        'custom': 'Custom'
    };
    
    // Define default type order
    const defaultOrder = ['bank', 'onhand', 'investment'];
    const allTypes = Object.keys(groupedByType);
    const customTypes = allTypes.filter(t => t.startsWith('custom:') || (!defaultOrder.includes(t) && !['bank', 'onhand', 'investment'].includes(t)));
    const orderedTypes = [...defaultOrder.filter(t => allTypes.includes(t)), ...customTypes.sort()];
    
    // Render each type section
    let html = '';
    orderedTypes.forEach(type => {
        const accounts = groupedByType[type];
        if (!accounts || accounts.length === 0) return;
        
        const typeLabel = typeLabels[type] || (type.startsWith('custom:') ? type.substring(7) : type.charAt(0).toUpperCase() + type.slice(1));
        let typeTotal = 0;
        accounts.forEach(acc => {
            typeTotal += parseFloat(acc.balance || 0);
        });
        
        const typeSign = typeTotal < 0 ? '-' : typeTotal > 0 ? '+' : '';
        const typeTotalColor = typeTotal < 0 ? 'var(--accent-red)' : typeTotal > 0 ? 'var(--primary)' : 'var(--text-secondary)';
        
        html += `
            <div class="account-type-section" draggable="true" data-type="${type}" style="margin-bottom: 32px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; cursor: grab; user-select: none;" class="type-header-drag">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-secondary);">
                        <span style="cursor: grab; display: inline-block; margin-right: 8px;">⋮⋮</span> ${typeLabel}
                    </h3>
                    <span style="font-weight: 700; color: ${typeTotalColor};">${typeSign}${window.formatMoney(Math.abs(typeTotal))}</span>
                </div>
                <div class="accounts-grid account-type-grid" data-type="${type}">
                    ${accounts.map((acc, idx) => {
                        const initial = (acc.name || '?').charAt(0).toUpperCase();
                        const isFavorite = acc.favorite || false;
                        const favIcon = isFavorite ? '★' : '☆';
                        const favColor = isFavorite ? '#FFD700' : 'var(--text-secondary)';
                        const balanceColor = acc.balance < 0 ? 'var(--accent-red)' : 'var(--text)';
                        
                        return `
                            <div class="account-card" draggable="true" data-account-index="${acc._index}" style="--acc-color: ${acc.color}; cursor: grab;" data-account-type="${type}">
                                <div class="acc-header">
                                    <div class="acc-icon-box" style="color: ${acc.color};">${initial}</div>
                                    <div style="display: flex; gap: 8px;">
                                        <button onclick="window.toggleAccountFavorite(${acc._index})" style="background:none; border:none; color:${favColor}; cursor:pointer; font-size: 16px; padding: 0;">
                                            ${favIcon}
                                        </button>
                                        <button onclick="window.editAccount(${acc._index})" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size: 16px;">✎</button>
                                        <button onclick="window.deleteAccount(${acc._index})" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size: 16px;">✕</button>
                                    </div>
                                </div>
                                <div style="cursor:pointer;" onclick="window.editAccount(${acc._index})">
                                    <p class="text-muted" style="font-size: 13px;">${acc.name || 'Unnamed'}</p>
                                    <h2 class="acc-balance" style="color: ${balanceColor};">${acc.balance < 0 ? '-' : ''}${window.formatMoney(Math.abs(acc.balance))}</h2>
                                    <p class="text-muted" style="font-size: 12px; margin-top: 8px;">${acc.note || ''}</p>
                                    ${acc.balance < 0 ? '<p class="text-muted" style="font-size: 11px; color: var(--accent-red);">Liability</p>' : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Setup drag and drop
    window.setupAccountDragDrop();
    
    const totalBalEl = document.getElementById('accounts-total-balance');
    if(totalBalEl) {
        const sign = grandTotal < 0 ? '-' : grandTotal > 0 ? '+' : '';
        const color = grandTotal < 0 ? 'var(--accent-red)' : 'var(--text)';
        totalBalEl.innerText = window.formatMoney(grandTotal);
        totalBalEl.style.color = color;
    }
};

window.toggleAccountFavorite = async (index) => {
    if (index >= 0 && index < window.accountsData.length) {
        window.accountsData[index].favorite = !window.accountsData[index].favorite;
        await window.saveAccountsToCloud();
        window.renderAccounts();
    }
};

window.setupAccountDragDrop = () => {
    let draggedElement = null;
    let draggedType = null;
    
    const handleDragStart = (e) => {
        draggedElement = e.target.closest('[draggable="true"]');
        if (!draggedElement) return;
        
        draggedType = draggedElement.getAttribute('data-type');
        const accountIndex = draggedElement.getAttribute('data-account-index');
        
        if (accountIndex !== null) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('accountIndex', accountIndex);
            draggedElement.style.opacity = '0.5';
        } else {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('typeSection', draggedType);
            draggedElement.style.opacity = '0.5';
        }
    };
    
    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const overElement = e.target.closest('[draggable="true"]');
        if (overElement) {
            overElement.style.opacity = '0.8';
        }
    };
    
    const handleDragLeave = (e) => {
        const overElement = e.target.closest('[draggable="true"]');
        if (overElement && overElement !== draggedElement) {
            overElement.style.opacity = '1';
        }
    };
    
    const handleDrop = async (e) => {
        e.preventDefault();
        const dropTarget = e.target.closest('[draggable="true"]');
        if (!dropTarget || dropTarget === draggedElement) return;
        
        const accountIndex = e.dataTransfer.getData('accountIndex');
        const typeSection = e.dataTransfer.getData('typeSection');
        const targetAccountIndex = dropTarget.getAttribute('data-account-index');
        const targetType = dropTarget.getAttribute('data-account-type');
        
        if (accountIndex) {
            const draggedIdx = parseInt(accountIndex);
            const targetIdx = targetAccountIndex ? parseInt(targetAccountIndex) : draggedIdx;
            
            if (draggedIdx !== targetIdx) {
                const draggedAcc = window.accountsData[draggedIdx];
                window.accountsData.splice(draggedIdx, 1);
                const insertIdx = draggedIdx < targetIdx ? targetIdx - 1 : targetIdx;
                window.accountsData.splice(insertIdx, 0, draggedAcc);
                await window.saveAccountsToCloud();
                window.renderAccounts();
            }
        }
    };
    
    const handleDragEnd = (e) => {
        document.querySelectorAll('[draggable="true"]').forEach(el => {
            el.style.opacity = '1';
        });
    };
    
    document.querySelectorAll('[draggable="true"]').forEach(el => {
        el.addEventListener('dragstart', handleDragStart, false);
        el.addEventListener('dragover', handleDragOver, false);
        el.addEventListener('dragleave', handleDragLeave, false);
        el.addEventListener('drop', handleDrop, false);
        el.addEventListener('dragend', handleDragEnd, false);
    });
};

window.deleteAccount = async (index) => {
    const overlay = document.getElementById('delete-account-overlay');
    if (!overlay) {
        if(confirm("Remove this account?")) {
            window.accountsData.splice(index, 1);
            await window.saveAccountsToCloud();
            window.renderAccounts();
        }
        return;
    }
    
    window.accountToDeleteIndex = index;
    overlay.classList.add('active');
};

window.confirmDeleteAccount = async () => {
    const index = window.accountToDeleteIndex;
    if (index !== undefined) {
        window.accountsData.splice(index, 1);
        await window.saveAccountsToCloud();
        window.renderAccounts();
        window.cancelDeleteAccount();
    }
};

window.cancelDeleteAccount = () => {
    const overlay = document.getElementById('delete-account-overlay');
    if (overlay) overlay.classList.remove('active');
    window.accountToDeleteIndex = undefined;
};

window.editAccount = (index) => {
    const acc = window.accountsData[index];
    if (!acc) return;
    
    window.editingAccountIndex = index;
    document.getElementById('acc-name').value = acc.name || '';
    document.getElementById('acc-type').value = acc.type || 'bank';
    document.getElementById('acc-balance').value = acc.balance || 0;
    document.getElementById('acc-color').value = acc.color || '#00D26A';
    document.getElementById('acc-note').value = acc.note || '';
    document.getElementById('acc-favorite').checked = acc.favorite || false;
    
    // Handle custom type
    const customGroup = document.getElementById('custom-type-group');
    if (acc.type === 'custom') {
        document.getElementById('acc-custom-type').value = acc.customType || '';
        if (customGroup) customGroup.style.display = 'block';
    } else {
        if (customGroup) customGroup.style.display = 'none';
    }
    
    const saveBtn = document.getElementById('save-account-btn');
    if (saveBtn) saveBtn.innerText = 'Update Account';
    
    const overlay = document.getElementById('account-overlay');
    if (overlay) overlay.classList.add('active');
};

window.closeAccountModal = () => {
    const overlay = document.getElementById('account-overlay');
    if(overlay) overlay.classList.remove('active');
    window.editingAccountIndex = undefined;
}

window.loadLegal = async (filename, title) => {
    document.getElementById('legal-title').innerText = title;
    window.switchView('legal');
    
    const contentDiv = document.getElementById('legal-content');
    contentDiv.innerHTML = 'Loading document...';

    try {
        const response = await fetch(filename);
        if (!response.ok) throw new Error('Document not found.');
        
        const markdown = await response.text();
        
        if (typeof marked === 'undefined') {
            setTimeout(() => window.loadLegal(filename, title), 200);
            return;
        }
        
        contentDiv.innerHTML = marked.parse(markdown);
    } catch (error) {
        contentDiv.innerHTML = `<p style="color: var(--accent-red)">Error loading ${title}. Please try again later.</p>`;
    }
};

window.openExpenseModal = () => {
    const overlay = document.getElementById('expense-overlay');
    const catSelect = document.getElementById('exp-category');
    if (catSelect) {
        catSelect.innerHTML = '';
        (window.userSettings.categories || []).forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.name;
            opt.innerText = cat.name;
            catSelect.appendChild(opt);
        });
    }
    if (overlay) overlay.classList.add('active');
};

window.closeExpenseModal = () => {
    const overlay = document.getElementById('expense-overlay');
    if (overlay) overlay.classList.remove('active');
};

window.openIncomeModal = () => {
    const overlay = document.getElementById('income-overlay');
    if (overlay) overlay.classList.add('active');
};

window.closeIncomeModal = () => {
    const overlay = document.getElementById('income-overlay');
    if (overlay) overlay.classList.remove('active');
};

window.bootUI = () => {
    window.applySettingsToUI(); 
    window.updateDashboard(); 
    window.populateCategoryFilters();
    window.renderActivity(); 
    window.currentStatRange = '30';
    window.renderStatistics('30'); 
    window.renderBudgetTracking();
    window.renderAccounts();
    window.setupReceiptListeners();
};

// ==========================================
// 2. DOM EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    const discordBtn = document.getElementById('discord-login-btn');
    if(discordBtn) discordBtn.addEventListener('click', window.loginWithDiscord);

    const submitUserBtn = document.getElementById('submit-username-btn');
    if (submitUserBtn) {
        submitUserBtn.addEventListener('click', async () => {
            const input = document.getElementById('new-username-input').value;
            const errEl = document.getElementById('username-error');
            try {
                errEl.innerText = 'Creating account...';
                await window.claimUsername(input);
            } catch (err) {
                errEl.innerText = err.message;
            }
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) logoutBtn.addEventListener('click', window.logout);

    const addCatBtn = document.getElementById('add-cat-btn');
    if (addCatBtn) {
        addCatBtn.addEventListener('click', () => {
            const nameEl = document.getElementById('new-cat-name'); const pctEl = document.getElementById('new-cat-pct');
            if(!nameEl || !pctEl) return;

            const name = nameEl.value.trim().toUpperCase();
            const pct = parseFloat(pctEl.value);
            
            if(name && pct > 0 && name !== 'SAVINGS') {
                const existing = window.userSettings.categories.find(c => c.name.toUpperCase() === name);
                if (existing) existing.percent = pct;
                else window.userSettings.categories.push({ name, percent: pct });
                
                window.recalculateSavings(); nameEl.value = ''; pctEl.value = '';
                window.renderSettingsCategories(); window.renderBudgetTracking();
            }
        });
    }

    const addIncCatBtn = document.getElementById('add-inc-cat-btn');
    if (addIncCatBtn) {
        addIncCatBtn.addEventListener('click', () => {
            const nameEl = document.getElementById('new-inc-cat-name');
            if(!nameEl) return;

            const name = nameEl.value.trim().toUpperCase();
            if(name && !window.userSettings.incomeCategories.includes(name)) {
                window.userSettings.incomeCategories.push(name);
                nameEl.value = '';
                window.renderSettingsIncomeCategories();
            }
        });
    }

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            window.userSettings.balance = parseFloat(document.getElementById('setting-balance')?.value) || 0;
            
            const currVal = document.getElementById('setting-currency')?.value;
            window.userSettings.currency = currVal ? currVal : '₱';
            
            window.userSettings.metric = document.getElementById('setting-metric')?.value || 'running';
            window.userSettings.theme = document.getElementById('setting-theme')?.checked ? 'dark' : 'light';
            window.userSettings.budgetCycle = document.getElementById('setting-budget-cycle')?.value || 'monthly';
            
            window.recalculateSavings(); 
            const status = document.getElementById('settings-status');
            
            try {
                if(status) { status.innerText = "Syncing settings..."; status.style.color = "var(--text);"}
                await window.saveSettingsToCloud();
                if(status) { status.innerText = "Settings saved to Cloud!"; status.style.color = "var(--primary)"; setTimeout(() => status.innerText = "", 3000); }
                window.applySettingsToUI(); window.updateDashboard(); window.renderActivity(); window.renderStatistics(window.currentStatRange); window.renderBudgetTracking();
            } catch (e) {
                if(status) { status.innerText = "Error saving settings."; status.style.color = "var(--accent-red)"; }
            }
        });
    }

    const clearAllDataBtn = document.getElementById('clear-all-data-btn');
    if (clearAllDataBtn) {
        clearAllDataBtn.addEventListener('click', () => {
            const modal = document.getElementById('clear-data-modal');
            const input = document.getElementById('clear-data-confirmation-input');
            const confirmBtn = document.getElementById('clear-data-confirm-btn');
            const cancelBtn = document.getElementById('clear-data-cancel-btn');
            
            if (modal && input && confirmBtn && cancelBtn) {
                modal.classList.add('active');
                input.value = '';
                input.focus();
                confirmBtn.disabled = true;
                
                const onInput = (e) => {
                    confirmBtn.disabled = e.target.value !== 'I understand this is permanent';
                    confirmBtn.style.cursor = confirmBtn.disabled ? 'not-allowed' : 'pointer';
                };
                
                input.addEventListener('input', onInput);
                
                confirmBtn.onclick = async () => {
                    try {
                        const status = document.getElementById('settings-status');
                        if(status) status.innerText = "Deleting all data...";
                        
                        await window.supabase.from('transactions').delete().eq('user_id', window.currentUser.id);
                        await window.supabase.from('accounts').delete().eq('user_id', window.currentUser.id);
                        await window.supabase.from('settings').update({
                            balance: 0, currency: '₱', metric: 'running', theme: 'light', budget_cycle: 'monthly',
                            categories: [{ name: 'SAVINGS', percent: 100, isAuto: true }]
                        }).eq('user_id', window.currentUser.id);
                        
                        window.userSettings = { balance: 0, currency: '₱', metric: 'running', theme: 'light', budgetCycle: 'monthly', categories: [{ name: 'SAVINGS', percent: 100, isAuto: true }] };
                        window.appData = [];
                        window.accountsData = [];
                        
                        if(status) { status.innerText = "✓ All data cleared successfully!"; status.style.color = "var(--primary)"; setTimeout(() => status.innerText = "", 3000); }
                        
                        window.applySettingsToUI(); window.updateDashboard(); window.renderActivity(); window.renderStatistics(window.currentStatRange); window.renderBudgetTracking();
                        
                        modal.classList.remove('active');
                        input.removeEventListener('input', onInput);
                    } catch (e) {
                        const status = document.getElementById('settings-status');
                        if(status) { status.innerText = "Error deleting data: " + e.message; status.style.color = "var(--accent-red)"; }
                    }
                };
                
                cancelBtn.onclick = () => {
                    modal.classList.remove('active');
                    input.removeEventListener('input', onInput);
                };
                
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        modal.classList.remove('active');
                        input.removeEventListener('input', onInput);
                    }
                };
            } else {
                if(confirm("Are you sure? This will delete all your local data and reset the app.")) { localStorage.clear(); location.reload(); }
            }
        });
    }

    document.querySelectorAll('.nav-btn, .nav-proxy').forEach(btn => btn.addEventListener('click', () => window.switchView(btn.getAttribute('data-target'))));

    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
    if (toggleFiltersBtn) {
        toggleFiltersBtn.addEventListener('click', () => {
            const panel = document.getElementById('advanced-filters-panel');
            if(panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
    }

    ['search-input', 'filter-date-start', 'filter-date-end', 'filter-amount-min', 'filter-amount-max'].forEach(id => {
        const el = document.getElementById(id); if (el) el.addEventListener('input', window.renderActivity);
    });

    const shareBtn = document.getElementById('share-receipt-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            if (typeof html2canvas === 'undefined') return alert("Image engine still loading.");
            const captureArea = document.getElementById('receipt-capture-area');
            if(!captureArea) return;
            const originalBg = captureArea.style.backgroundColor;
            captureArea.style.backgroundColor = document.body.classList.contains('dark-theme') ? '#1E1E1E' : '#FFFFFF';
            
            html2canvas(captureArea, { scale: 2, backgroundColor: null }).then(canvas => {
                captureArea.style.backgroundColor = originalBg; 
                const link = document.createElement('a');
                link.download = `Receipt_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png'); link.click();
            }).catch(err => console.error("Could not generate image", err));
        });
    }
    
    const editReceiptBtn = document.getElementById('edit-receipt-btn');
    if (editReceiptBtn) {
        editReceiptBtn.addEventListener('click', window.editTransaction);
    }
    
    const saveEditBtn = document.getElementById('save-tx-edit-btn');
    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', window.saveTransactionEdit);
    }
    
    const deleteBtn = document.getElementById('delete-tx-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', window.deleteTransaction);
    }

    document.querySelectorAll('#stats-filters .chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            document.querySelectorAll('#stats-filters .chip').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active'); 
            window.renderStatistics(e.target.getAttribute('data-range'));
        });
    });

    ['chart-start-date', 'chart-end-date'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => window.renderStatistics('custom'));
    });

    const addAccBtn = document.getElementById('add-account-btn');
    if(addAccBtn) addAccBtn.addEventListener('click', () => {
        window.editingAccountIndex = undefined;
        document.getElementById('acc-name').value = '';
        document.getElementById('acc-type').value = 'bank';
        document.getElementById('acc-balance').value = '';
        document.getElementById('acc-color').value = '#00D26A';
        document.getElementById('acc-note').value = '';
        document.getElementById('acc-favorite').checked = false;
        document.getElementById('acc-custom-type').value = '';
        const customGroup = document.getElementById('custom-type-group');
        if (customGroup) customGroup.style.display = 'none';
        const saveBtn = document.getElementById('save-account-btn');
        if (saveBtn) saveBtn.innerText = 'Save Account';
        const overlay = document.getElementById('account-overlay');
        if(overlay) overlay.classList.add('active');
    });

    const saveAccBtn = document.getElementById('save-account-btn');
    if (saveAccBtn) {
        saveAccBtn.addEventListener('click', async () => {
            const accData = {
                name: document.getElementById('acc-name')?.value || 'Unnamed',
                type: document.getElementById('acc-type')?.value || 'bank',
                balance: parseFloat(document.getElementById('acc-balance')?.value) || 0,
                color: document.getElementById('acc-color')?.value || '#00D26A',
                note: document.getElementById('acc-note')?.value || '',
                favorite: document.getElementById('acc-favorite')?.checked || false
            };
            
            if (window.editingAccountIndex !== undefined) {
                window.accountsData[window.editingAccountIndex] = { ...window.accountsData[window.editingAccountIndex], ...accData };
            } else {
                accData.id = window.generateUUID();
                const type = document.getElementById('acc-type')?.value || 'bank';
                if (type === 'custom') {
                    accData.customType = document.getElementById('acc-custom-type')?.value || 'Custom';
                }
                window.accountsData.push(accData);
            }
            
            await window.saveAccountsToCloud();
            ['acc-name','acc-balance','acc-note','acc-custom-type'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
            document.getElementById('acc-favorite').checked = false;
            window.closeAccountModal();
            window.renderAccounts();
        });
    }

    const accTypeSelect = document.getElementById('acc-type');
    if (accTypeSelect) {
        accTypeSelect.addEventListener('change', (e) => {
            const customGroup = document.getElementById('custom-type-group');
            if (customGroup) customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        });
    }

    document.getElementById('export-data-btn')?.addEventListener('click', () => {
        const data = {
            exportDate: new Date().toISOString(),
            recordCount: window.appData.length,
            transactions: window.appData
        };
        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `budget-export-${new Date().getTime()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('add-expense-btn')?.addEventListener('click', window.openExpenseModal);
    document.getElementById('add-income-btn')?.addEventListener('click', window.openIncomeModal);

    document.getElementById('save-expense-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('exp-name').value.trim();
        const amount = parseFloat(document.getElementById('exp-amount').value);
        const category = document.getElementById('exp-category').value || 'UNCATEGORIZED';
        const merchant = document.getElementById('exp-merchant').value.trim() || '';
        const notes = document.getElementById('exp-notes').value.trim() || '';

        if (!name || !amount || isNaN(amount)) {
            alert('Please fill in Name and Amount');
            return;
        }

        const transaction = {
            user_id: window.currentUser.id,
            fingerprint: `${new Date().toISOString()}_${name}_${amount}`,
            type: 'EXPENDITURE',
            category: category,
            name: name,
            amount: -Math.abs(amount),
            notes: notes,
            merchant: merchant,
            timestamp: new Date().toISOString()
        };

        const { error } = await window.supabase.from('transactions').insert([transaction]);
        if (error) {
            console.error('Error saving expense:', error);
            alert('Error saving expense');
        } else {
            window.closeExpenseModal();
            document.getElementById('exp-name').value = '';
            document.getElementById('exp-amount').value = '';
            document.getElementById('exp-merchant').value = '';
            document.getElementById('exp-notes').value = '';
            await window.loadCloudData();
            window.renderBudgetTracking();
            window.renderActivity?.();
        }
    });

    document.getElementById('save-income-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('inc-name').value.trim();
        const amount = parseFloat(document.getElementById('inc-amount').value);
        const category = document.getElementById('inc-category').value || 'INCOME';
        const notes = document.getElementById('inc-notes').value.trim() || '';

        if (!name || !amount || isNaN(amount)) {
            alert('Please fill in Name and Amount');
            return;
        }

        const transaction = {
            user_id: window.currentUser.id,
            fingerprint: `${new Date().toISOString()}_${name}_${amount}`,
            type: 'INCOMING',
            category: category,
            name: name,
            amount: Math.abs(amount),
            notes: notes,
            timestamp: new Date().toISOString()
        };

        const { error } = await window.supabase.from('transactions').insert([transaction]);
        if (error) {
            console.error('Error saving income:', error);
            alert('Error saving income');
        } else {
            window.closeIncomeModal();
            document.getElementById('inc-name').value = '';
            document.getElementById('inc-amount').value = '';
            document.getElementById('inc-notes').value = '';
            await window.loadCloudData();
            window.renderBudgetTracking();
            window.renderActivity?.();
        }
    });

    document.getElementById('dashboard-metric-selector')?.addEventListener('change', (e) => {
        window.dashboardMetric = e.target.value;
        window.updateDashboard();
    });

    const importBtn = document.getElementById('import-btn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            const fileInput = document.getElementById('csv-file-input');
            const statusMsg = document.getElementById('import-status');
            if(!fileInput || !statusMsg) return;

            const file = fileInput.files[0];
            if (!file) { statusMsg.innerText = "Please select a file first."; return; }

            const reader = new FileReader();
            reader.onload = async (e) => {
                statusMsg.innerText = "Processing Data..."; 
                statusMsg.style.color = "var(--text)";
                
                const text = e.target.result;
                const parseCSV = (str) => {
                    const rows = []; let row = [], current = '', inQuotes = false;
                    for (let i = 0; i < str.length; i++) {
                        const char = str[i];
                        if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { row.push(current); current = ''; }
                        else if ((char === '\n' || char === '\r') && !inQuotes) { if (char === '\r' && str[i+1] === '\n') i++; row.push(current); rows.push(row); row = []; current = ''; } 
                        else current += char;
                    }
                    if (current || row.length > 0) { row.push(current); rows.push(row); }
                    return rows;
                };

                const rows = parseCSV(text);
                const parsedData = [];
                const cleanString = (str) => str ? str.toString().replace(/^"|"$/g, '').trim() : '';

                const COL_TIMESTAMP = 1;
                const COL_NAME = 2;
                const COL_AMOUNT = 3;
                const COL_TYPE = 10;
                const COL_CATEGORY = 11;
                const COL_NOTES = 14;
                
                let dataStartIdx = -1;
                for (let i = 0; i < Math.min(rows.length, 30); i++) {
                    if (rows[i] && rows[i].length > COL_AMOUNT) {
                        const potentialTS = cleanString(rows[i][COL_TIMESTAMP]);
                        if (/^\d{4}-\d{2}-\d{2}/.test(potentialTS)) {
                            dataStartIdx = i;
                            break;
                        }
                    }
                }
                
                if (dataStartIdx === -1) { statusMsg.innerText = "Error: Could not locate data rows starting from Row 10."; statusMsg.style.color = "var(--accent-red)"; return; }

                for (let i = dataStartIdx; i < rows.length; i++) {
                    const cols = rows[i];
                    if (!cols || cols.length <= COL_AMOUNT) continue;

                    const timestampStr = cleanString(cols[COL_TIMESTAMP]);
                    const nameStr = cleanString(cols[COL_NAME]);
                    const rawAmountStr = cleanString(cols[COL_AMOUNT]);

                    if (!timestampStr && !rawAmountStr) continue;

                    const hasMinusSign = rawAmountStr.includes('-');
                    const hasParentheses = rawAmountStr.includes('(') && rawAmountStr.includes(')');
                    let finalAmount = parseFloat(rawAmountStr.replace(/[^0-9.]/g, '')) || 0;
                    
                    if (hasMinusSign || hasParentheses) {
                        finalAmount = -Math.abs(finalAmount);
                    }

                    const typeStr = cols.length > COL_TYPE ? cleanString(cols[COL_TYPE]).toUpperCase() : '';
                    const categoryStr = cols.length > COL_CATEGORY ? cleanString(cols[COL_CATEGORY]) : '';
                    const notesStr = cols.length > COL_NOTES ? cleanString(cols[COL_NOTES]) : '';

                    const isIncome = typeStr.includes('INCOM');
                    const isExpense = typeStr.includes('EXPENDITURE');
                    
                    let txType = 'Expense';
                    let txCategory = 'Uncategorized';
                    let txNotes = notesStr;
                    
                    if (isIncome) {
                        txType = 'Income';
                        txCategory = 'Income';
                        txNotes = nameStr; 
                    } else if (isExpense) {
                        txType = 'Expense';
                        txCategory = categoryStr || 'Uncategorized';
                        txNotes = notesStr || nameStr; 
                    }
                    
                    if (timestampStr && rawAmountStr) {
                        parsedData.push({
                            type: txType, category: txCategory,
                            name: nameStr || 'Unnamed', notes: txNotes, amount: finalAmount, timestamp: timestampStr.replace(' |', '').trim()
                        });
                    }
                }

                if (parsedData.length > 0) {
                    const fingerprintMap = new Map();
                    const resolvedData = [];
                    
                    parsedData.forEach((item) => {
                        const baseFingerprint = `${item.timestamp}_${item.name}_${item.amount}`;
                        
                        if (!fingerprintMap.has(baseFingerprint)) {
                            fingerprintMap.set(baseFingerprint, 1);
                            resolvedData.push(item);
                        } else {
                            const occurrenceNum = fingerprintMap.get(baseFingerprint);
                            fingerprintMap.set(baseFingerprint, occurrenceNum + 1);
                            let ts = new Date(item.timestamp);
                            ts.setSeconds(ts.getSeconds() + occurrenceNum);
                            resolvedData.push({ ...item, timestamp: ts.toISOString() });
                        }
                    });
                    
                    await window.bulkUpsertTransactions(resolvedData); 
                    statusMsg.innerText = `Successfully synced ${resolvedData.length} records to the Cloud!`; 
                    statusMsg.style.color = "var(--primary)";
                    
                    window.updateDashboard(); 
                    window.populateCategoryFilters(); 
                    window.renderActivity(); 
                    window.renderBudgetTracking();
                    window.renderStatistics(window.currentStatRange);
                } else { 
                    statusMsg.innerText = `No valid data found.`; 
                    statusMsg.style.color = "var(--accent-red)"; 
                }
            };
            reader.readAsText(file);
        });
    }
});