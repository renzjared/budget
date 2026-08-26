// ==========================================
// DASHBOARD SPENDING INSIGHTS ENGINE
// ==========================================

window.currentInsightTxs = []; // Store globally for the modal list
window.currentTopCatTxs = [];
window.currentInsightPeriodName = '30D';

window.updateDashboardInsights = (range = '30') => {
    let cutoffStart = new Date(0);
    let prevCutoffStart = new Date(0);
    const now = new Date();
    const hasPrev = range !== 'all' && range !== 'custom';
    window.currentInsightPeriodName = range === 'all' ? 'All Time' : `${range}D`;

    // 1. Determine Timeframes
    if (range === 'custom') {
        window.switchView('statistics');
        document.getElementById('dashboard-insights-range').value = '30';
        return;
    } else if (range !== 'all') {
        const days = parseInt(range);
        cutoffStart = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
        prevCutoffStart = new Date(cutoffStart.getTime() - (days * 24 * 60 * 60 * 1000));
    }

    // 2. Tally Metrics
    let currIncome = 0, currExpense = 0, currTxCount = 0;
    let prevIncome = 0, prevExpense = 0, prevTxCount = 0;
    const categoryTotals = {};
    const currExpenseTxs = [];

    window.appData.forEach(entry => {
        if (entry.type === 'TRANSFER' || entry.type === 'LEDGER_ITEM') return;
        const eDate = new Date(entry.timestamp);

        if (eDate >= cutoffStart) {
            // Current Period
            const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
            if (isIncome) {
                currIncome += entry.amount;
            } else {
                currTxCount++; // Moved here: Only count expenses!
                currExpenseTxs.push(entry);
                const absAmt = Math.abs(entry.amount);
                currExpense += absAmt;
                const cat = entry.category || 'Uncategorized';
                categoryTotals[cat] = (categoryTotals[cat] || 0) + absAmt;
            }
        } else if (hasPrev && eDate >= prevCutoffStart && eDate < cutoffStart) {
            // Previous Period (for % comparison)
            const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
            if (isIncome) {
                prevIncome += entry.amount;
            } else {
                prevTxCount++; // Moved here: Only count expenses!
                prevExpense += Math.abs(entry.amount);
            }
        }
    });

    window.currentInsightTxs = currExpenseTxs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    const currNet = currIncome - currExpense;
    const prevNet = prevIncome - prevExpense;

    // 3. Percentage Formatter Helper
    const formatPct = (curr, prev, isExpense = false) => {
        if (!hasPrev) return '';
        if (prev === 0) return curr === 0 ? '' : `<span style="color:var(--text-secondary); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 700;">+∞%</span>`;
        
        const pct = ((curr - prev) / Math.abs(prev)) * 100;
        if (pct === 0) return `<span style="color:var(--text-secondary); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 700;">0.0%</span>`;

        const sign = pct > 0 ? '+' : '';
        let color = 'var(--text-secondary)';
        
        if (pct > 0) color = isExpense ? 'var(--accent-red)' : 'var(--primary)';
        else color = isExpense ? 'var(--primary)' : 'var(--accent-red)';
        
        return `<span style="color:${color}; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 700;">${sign}${pct.toFixed(1)}%</span>`;
    };

    const safeSet = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    // 4. Update Main Metrics
    const netEl = document.getElementById('dash-insight-net');
    if (netEl) {
        netEl.innerText = `${currNet < 0 ? '-' : '+'}${window.formatMoney(Math.abs(currNet), true)}`;
        netEl.style.color = currNet < 0 ? 'var(--text)' : 'var(--primary)';
    }
    safeSet('dash-insight-net-pct', formatPct(currNet, prevNet));
    
    // Remaining Budget Computation
    const cycle = window.userSettings.budgetCycle || 'monthly';
    let cycleCutoff = new Date(now.getFullYear(), now.getMonth(), 1); 
    let daysInCycle = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    if (cycle === 'daily') {
        cycleCutoff = new Date(now.setHours(0,0,0,0));
        daysInCycle = 1;
    } else if (cycle === 'weekly') { 
        const day = now.getDay() || 7; 
        cycleCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
        cycleCutoff.setHours(0,0,0,0);
        daysInCycle = 7;
    }

    let cycleIncome = 0;
    window.appData.forEach(e => {
        if(new Date(e.timestamp) >= cycleCutoff && (e.type || '').toUpperCase().includes('INCOM') && !e.trip_id) cycleIncome += e.amount;
    });

    let totalExpPct = 0;
    (window.userSettings.categories || []).forEach(c => {
        if(c.name.toUpperCase() !== 'SAVINGS') totalExpPct += parseFloat(c.percent) || 0;
    });

    const totalCycleBudget = cycleIncome * (totalExpPct / 100);
    const dailyBudget = totalCycleBudget / daysInCycle;
    
    const remEl = document.getElementById('dash-insight-rem');
    if (remEl) {
        if (range === 'all') {
            remEl.innerText = 'N/A';
            remEl.style.color = 'var(--text-secondary)';
        } else {
            const periodBudget = dailyBudget * parseInt(range);
            const remainingBudget = periodBudget - currExpense;
            remEl.innerText = `${remainingBudget < 0 ? '-' : ''}${window.formatMoney(Math.abs(remainingBudget), true)}`;
            remEl.style.color = remainingBudget < 0 ? 'var(--accent-red)' : 'var(--text)';
        }
    }
    
    safeSet('dash-insight-tx', currTxCount);
    safeSet('dash-insight-tx-pct', formatPct(currTxCount, prevTxCount));

    safeSet('dash-insight-spent', window.formatMoney(currExpense, true));
    safeSet('dash-insight-spent-pct', formatPct(currExpense, prevExpense, true));

    // Top Category Calculation
    let topCat = '-'; let topCatAmt = 0;
    for (const [cat, amt] of Object.entries(categoryTotals)) {
        if (amt > topCatAmt) { topCatAmt = amt; topCat = cat; }
    }
    window.currentTopCatTxs = currExpenseTxs.filter(t => (t.category || 'Uncategorized') === topCat);

    safeSet('dash-insight-top-cat', topCat);
    safeSet('dash-insight-top-spend', topCatAmt > 0 ? window.formatMoney(topCatAmt, true) : '₱0.00');

    // Top Category Progress Ratio
    const catSettings = (window.userSettings.categories || []).find(c => c.name.toUpperCase() === topCat.toUpperCase());
    const catAllocPct = catSettings ? parseFloat(catSettings.percent) : 0;
    const progEl = document.getElementById('dash-insight-top-cat-prog');
    if (progEl) {
        if (catAllocPct > 0 && cycleIncome > 0) {
            const spentPctOfIncome = (topCatAmt / cycleIncome) * 100;
            const isOver = spentPctOfIncome > catAllocPct;
            progEl.innerHTML = `(<span style="color:${isOver ? 'var(--accent-red)' : 'var(--primary)'}">${spentPctOfIncome.toFixed(1)}%</span> / ${catAllocPct.toFixed(1)}%)`;
        } else {
            progEl.innerHTML = '';
        }
    }
};

// 5. Open Clickable Transaction Modals
window.openInsightTxs = (type) => {
    let txs = [];
    let title = '';
    
    if (type === 'Transactions' || type === 'Total Spent') {
        txs = window.currentInsightTxs;
        title = `All Expenses (${window.currentInsightPeriodName})`;
    } else if (type === 'Top Category') {
        txs = window.currentTopCatTxs;
        const topCat = document.getElementById('dash-insight-top-cat')?.innerText || 'Category';
        title = `${topCat} (${window.currentInsightPeriodName})`;
        if(txs.length === 0) return; 
    }

    if (txs.length === 0) return;

    let overlay = document.getElementById('insight-txs-overlay');
    if (!overlay) {
        const modalHTML = `
        <div id="insight-txs-overlay" class="modal-overlay" style="z-index: 9999;">
            <div class="account-modal-content card" style="max-height: 90vh; display: flex; flex-direction: column;">
                <header style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-shrink: 0;">
                    <div>
                        <h3 id="insight-txs-title" style="margin: 0;">Transactions</h3>
                        <p id="insight-txs-subtitle" class="text-muted" style="font-size: 13px; margin: 4px 0 0 0;">Insight Details</p>
                    </div>
                    <button class="close-modal-btn" onclick="document.getElementById('insight-txs-overlay').classList.remove('active')">✕</button>
                </header>
                <div style="flex: 1; overflow-y: auto; padding-right: 8px;">
                    <ul id="insight-txs-list" class="minimal-list interactive-list"></ul>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        overlay = document.getElementById('insight-txs-overlay');
        
        // Ensure Receipt overlay always opens above this list modal
        const receiptOverlay = document.getElementById('receipt-overlay');
        if (receiptOverlay) receiptOverlay.style.zIndex = '10005';
        
        document.getElementById('insight-txs-list').addEventListener('click', (e) => {
            const li = e.target.closest('.tx-item');
            if (li) {
                const entryId = parseInt(li.getAttribute('data-id'));
                const entry = window.appData.find(x => x._id === entryId);
                if (entry) window.openReceiptModal(entry);
            }
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target.id === 'insight-txs-overlay') overlay.classList.remove('active');
        });
    }

    document.getElementById('insight-txs-title').innerText = title;
    
    const total = txs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    document.getElementById('insight-txs-subtitle').innerText = `${txs.length} transactions • ${window.formatMoney(total, true)} total`;

    document.getElementById('insight-txs-list').innerHTML = txs.map(window.generateTxHTML).join('');
    overlay.classList.add('active');
};