// ==========================================
// DASHBOARD SPENDING INSIGHTS ENGINE
// ==========================================

window.currentInsightTxs = []; 
window.currentTopCatTxs = [];
window.currentInsightPeriodName = '30D';
window.currentInsightBreakdown = null;

// Read directly from the DOM so both dropdowns sync flawlessly
window.updateDashboardInsights = () => {
    const rangeEl = document.getElementById('dashboard-insights-range');
    const baseEl = document.getElementById('dashboard-insights-base');
    const range = rangeEl ? rangeEl.value : '30';
    const base = baseEl ? baseEl.value : '30';

    let cutoffStart = new Date(0);
    let prevCutoffStart = new Date(0);
    const now = new Date();
    const hasPrev = range !== 'all' && range !== 'custom';
    window.currentInsightPeriodName = range === 'all' ? 'All Time' : `${range}D`;

    if (range === 'custom') {
        window.switchView('statistics');
        if (rangeEl) rangeEl.value = '30';
        return;
    } else if (range !== 'all') {
        const days = parseInt(range);
        cutoffStart = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
        prevCutoffStart = new Date(cutoffStart.getTime() - (days * 24 * 60 * 60 * 1000));
    }

    let currIncome = 0, currExpense = 0, currTxCount = 0;
    let prevIncome = 0, prevExpense = 0, prevTxCount = 0;
    const categoryTotals = {};
    const currExpenseTxs = [];

    window.appData.forEach(entry => {
        if (entry.type === 'TRANSFER' || entry.type === 'LEDGER_ITEM') return;
        const eDate = new Date(entry.timestamp);

        if (eDate >= cutoffStart) {
            const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
            if (isIncome) {
                currIncome += entry.amount;
            } else {
                currTxCount++; 
                currExpenseTxs.push(entry);
                const absAmt = Math.abs(entry.amount);
                currExpense += absAmt;
                const cat = entry.category || 'Uncategorized';
                categoryTotals[cat] = (categoryTotals[cat] || 0) + absAmt;
            }
        } else if (hasPrev && eDate >= prevCutoffStart && eDate < cutoffStart) {
            const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
            if (isIncome) {
                prevIncome += entry.amount;
            } else {
                prevTxCount++; 
                prevExpense += Math.abs(entry.amount);
            }
        }
    });

    window.currentInsightTxs = currExpenseTxs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    const currNet = currIncome - currExpense;
    const prevNet = prevIncome - prevExpense;

    const formatPct = (curr, prev, isExpense = false) => {
        if (!hasPrev) return '';
        if (prev === 0) return curr === 0 ? '' : `<span style="color:var(--text-secondary); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 700;">+∞%</span>`;
        const pct = ((curr - prev) / Math.abs(prev)) * 100;
        if (pct === 0) return `<span style="color:var(--text-secondary); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 700;">0.0%</span>`;
        const sign = pct > 0 ? '+' : '';
        const color = pct > 0 ? (isExpense ? 'var(--accent-red)' : 'var(--primary)') : (isExpense ? 'var(--primary)' : 'var(--accent-red)');
        return `<span style="color:${color}; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 700;">${sign}${pct.toFixed(1)}%</span>`;
    };

    const safeSet = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    const netEl = document.getElementById('dash-insight-net');
    if (netEl) {
        netEl.innerText = `${currNet < 0 ? '-' : '+'}${window.formatMoney(Math.abs(currNet), true)}`;
        netEl.style.color = currNet < 0 ? 'var(--text)' : 'var(--primary)';
    }
    safeSet('dash-insight-net-pct', formatPct(currNet, prevNet));
    
    // --- SMART BUDGET BASE EXTRAPOLATION ---
    let totalExpPct = 0;
    (window.userSettings.categories || []).forEach(c => {
        if(c.name.toUpperCase() !== 'SAVINGS') totalExpPct += parseFloat(c.percent) || 0;
    });

    let periodBudget = 0;
    let remainingBudget = 0;
    let baseDetails = {};

    if (range !== 'all') {
        const rangeDays = parseInt(range);

        if (base === 'strict') {
            periodBudget = currIncome * (totalExpPct / 100);
            baseDetails = { type: 'strict', name: 'Strict Match', value: currIncome, days: rangeDays };
        } else if (base === 'cycle') {
            const cycle = window.userSettings.budgetCycle || 'monthly';
            let cycleCutoff = new Date(now.getFullYear(), now.getMonth(), 1); 
            let daysInCycle = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
            if (cycle === 'daily') { cycleCutoff = new Date(now.setHours(0,0,0,0)); daysInCycle = 1; } 
            else if (cycle === 'weekly') { const day = now.getDay() || 7; cycleCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1); cycleCutoff.setHours(0,0,0,0); daysInCycle = 7; }
            
            let cycleIncome = 0;
            window.appData.forEach(e => { if(new Date(e.timestamp) >= cycleCutoff && (e.type || '').toUpperCase().includes('INCOM') && !e.trip_id) cycleIncome += e.amount; });
            
            const dailyBudget = (cycleIncome * (totalExpPct / 100)) / daysInCycle;
            periodBudget = dailyBudget * rangeDays;
            baseDetails = { type: 'cycle', name: cycle, value: cycleIncome, days: daysInCycle, dailyBudget };
        } else {
            // Dynamic window logic (e.g. 14 Days, 30 Days)
            const baseDays = parseInt(base);
            const baseCutoff = new Date(now.getTime() - (baseDays * 24 * 60 * 60 * 1000));
            let baseIncome = 0;
            window.appData.forEach(e => {
                if (new Date(e.timestamp) >= baseCutoff && (e.type || '').toUpperCase().includes('INCOM') && !e.trip_id) baseIncome += e.amount;
            });
            
            const dailyBudget = (baseIncome * (totalExpPct / 100)) / baseDays;
            periodBudget = dailyBudget * rangeDays;
            baseDetails = { type: 'days', name: `Last ${baseDays} Days`, value: baseIncome, days: baseDays, dailyBudget };
        }
        
        remainingBudget = periodBudget - currExpense;
    }

    const remEl = document.getElementById('dash-insight-rem');
    if (remEl) {
        if (range === 'all') {
            remEl.innerText = 'N/A';
            remEl.style.color = 'var(--text-secondary)';
        } else {
            remEl.innerText = `${remainingBudget < 0 ? '-' : ''}${window.formatMoney(Math.abs(remainingBudget), true)}`;
            remEl.style.color = remainingBudget < 0 ? 'var(--accent-red)' : 'var(--text)';
        }
    }

    window.currentInsightBreakdown = {
        base, baseDetails, totalExpPct,
        rangeDays: range, periodBudget, currExpense, remainingBudget, currIncome
    };
    
    safeSet('dash-insight-tx', currTxCount);
    safeSet('dash-insight-tx-pct', formatPct(currTxCount, prevTxCount));

    safeSet('dash-insight-spent', window.formatMoney(currExpense, true));
    safeSet('dash-insight-spent-pct', formatPct(currExpense, prevExpense, true));

    let topCat = '-'; let topCatAmt = 0;
    for (const [cat, amt] of Object.entries(categoryTotals)) {
        if (amt > topCatAmt) { topCatAmt = amt; topCat = cat; }
    }
    window.currentTopCatTxs = currExpenseTxs.filter(t => (t.category || 'Uncategorized') === topCat);

    safeSet('dash-insight-top-cat', topCat);
    safeSet('dash-insight-top-spend', topCatAmt > 0 ? window.formatMoney(topCatAmt, true) : '₱0.00');

    // Dynamic Category Budgeting Based on the Base Settings
    const catSettings = (window.userSettings.categories || []).find(c => c.name.toUpperCase() === topCat.toUpperCase());
    const catAllocPct = catSettings ? parseFloat(catSettings.percent) : 0;
    const progEl = document.getElementById('dash-insight-top-cat-prog');
    
    if (progEl) {
        const catPeriodBudget = periodBudget > 0 && totalExpPct > 0 ? periodBudget * (catAllocPct / totalExpPct) : 0;
        if (catAllocPct > 0 && catPeriodBudget > 0) {
            const spentPctOfCatBudget = (topCatAmt / catPeriodBudget) * 100;
            const isOver = topCatAmt > catPeriodBudget;
            
            const spentStr = window.formatMoney(topCatAmt);
            const allocStr = window.formatMoney(catPeriodBudget);
            
            progEl.innerHTML = `
                <span class="pretty-tooltip" title="${spentStr} / ${allocStr}" data-tooltip="${spentStr} / ${allocStr}">
                    (<span style="color:${isOver ? 'var(--accent-red)' : 'var(--primary)'}">${spentPctOfCatBudget.toFixed(1)}%</span> / 100%)
                </span>`;
        } else {
            progEl.innerHTML = '';
        }
    }
};

window.openInsightTxs = (type) => {
    let txs = [];
    let title = '';
    let isBreakdown = false;
    
    if (type === 'Rem. Budget') {
        isBreakdown = true;
        if (window.currentInsightPeriodName === 'All Time') return; 
    } else if (type === 'Transactions' || type === 'Total Spent') {
        txs = window.currentInsightTxs;
        title = `All Expenses (${window.currentInsightPeriodName})`;
    } else if (type === 'Top Category') {
        txs = window.currentTopCatTxs;
        const topCat = document.getElementById('dash-insight-top-cat')?.innerText || 'Category';
        title = `${topCat} (${window.currentInsightPeriodName})`;
    }

    if (!isBreakdown && txs.length === 0) return;

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

    if (isBreakdown) {
        const bd = window.currentInsightBreakdown;
        document.getElementById('insight-txs-title').innerText = `Budget Breakdown (${bd.rangeDays}D)`;
        
        let breakdownHtml = '';

        if (bd.base === 'strict') {
            document.getElementById('insight-txs-subtitle').innerText = `Based strictly on income accumulated in the exact range`;
            breakdownHtml = `
                <div style="padding: 20px; background: var(--surface-hover); border-radius: 12px; margin-bottom: 16px; font-size: 14px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                        <span class="text-muted">Total Income (${bd.rangeDays}D)</span>
                        <strong>${window.formatMoney(bd.currIncome)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                        <span class="text-muted">Allocated to Expenses</span>
                        <strong>${bd.totalExpPct}%</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
                        <span class="text-muted">Computed Budget (${bd.rangeDays}D)</span>
                        <strong style="color: var(--primary);">${window.formatMoney(bd.periodBudget)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                        <span class="text-muted">Spent in Last ${bd.rangeDays} Days</span>
                        <strong style="color: var(--accent-red);">- ${window.formatMoney(bd.currExpense)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 16px; font-size: 18px;">
                        <span>Remaining Budget</span>
                        <strong style="color: ${bd.remainingBudget < 0 ? 'var(--accent-red)' : 'var(--text)'};">${window.formatMoney(bd.remainingBudget)}</strong>
                    </div>
                </div>
            `;
        } else {
            document.getElementById('insight-txs-subtitle').innerText = `Extrapolated from ${bd.baseDetails.name} income`;
            const isCycle = bd.base === 'cycle';
            const sourceLabel = isCycle ? `Total ${bd.baseDetails.name.charAt(0).toUpperCase() + bd.baseDetails.name.slice(1)} Income` : `Total Income (${bd.baseDetails.days}D)`;
            
            breakdownHtml = `
                <div style="padding: 20px; background: var(--surface-hover); border-radius: 12px; margin-bottom: 16px; font-size: 14px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                        <span class="text-muted">${sourceLabel}</span>
                        <strong>${window.formatMoney(bd.baseDetails.value)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                        <span class="text-muted">Allocated to Expenses</span>
                        <strong>${bd.totalExpPct}%</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px;">
                        <span class="text-muted">Base Budget (${bd.baseDetails.days} days)</span>
                        <strong>${window.formatMoney(bd.baseDetails.value * (bd.totalExpPct/100))}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
                        <span class="text-muted">Daily Allowance (÷ ${bd.baseDetails.days})</span>
                        <strong>${window.formatMoney(bd.baseDetails.dailyBudget)} / day</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                        <span class="text-muted">Budget for ${bd.rangeDays} Days (× ${bd.rangeDays})</span>
                        <strong style="color: var(--primary);">${window.formatMoney(bd.periodBudget)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
                        <span class="text-muted">Spent in Last ${bd.rangeDays} Days</span>
                        <strong style="color: var(--accent-red);">- ${window.formatMoney(bd.currExpense)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 16px; font-size: 18px;">
                        <span>Remaining Budget</span>
                        <strong style="color: ${bd.remainingBudget < 0 ? 'var(--accent-red)' : 'var(--text)'};">${window.formatMoney(bd.remainingBudget)}</strong>
                    </div>
                </div>
            `;
        }

        document.getElementById('insight-txs-list').innerHTML = breakdownHtml;
    } else {
        document.getElementById('insight-txs-title').innerText = title;
        const total = txs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        document.getElementById('insight-txs-subtitle').innerText = `${txs.length} transactions • ${window.formatMoney(total, true)} total`;
        document.getElementById('insight-txs-list').innerHTML = txs.map(window.generateTxHTML).join('');
    }

    overlay.classList.add('active');
};