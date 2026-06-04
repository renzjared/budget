window.switchView = (targetId) => {
    if (!targetId) return;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const navMatch = document.querySelector(`.nav-btn[data-target="${targetId}"]`);
    if (navMatch) navMatch.classList.add('active');
    const viewEl = document.getElementById(targetId);
    if (viewEl) viewEl.classList.add('active');
};

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

    window.bootUI = () => {
        applySettingsToUI(); 
        updateDashboard(); 
        populateCategoryFilters();
        renderActivity(); 
        window.currentStatRange = '30';
        window.renderStatistics('30'); 
        renderBudgetTracking();
        renderAccounts();
        setupReceiptListeners();
    };

    const applySettingsToUI = () => {
        if (window.userSettings.theme === 'dark') {
            document.body.classList.add('dark-theme');
            const st = document.getElementById('setting-theme'); if(st) st.checked = true;
        } else {
            document.body.classList.remove('dark-theme');
            const st = document.getElementById('setting-theme'); if(st) st.checked = false;
        }
        
        const greetEl = document.getElementById('dashboard-greeting');
        if(greetEl) greetEl.innerText = `Hello 👋, ${window.userProfile?.username || window.userSettings.name}`;
        
        const safePopulate = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
        safePopulate('setting-name', window.userSettings.name);
        safePopulate('setting-balance', window.userSettings.balance);
        safePopulate('setting-currency', window.userSettings.currency);
        safePopulate('setting-metric', window.userSettings.metric);
        safePopulate('setting-budget-cycle', window.userSettings.budgetCycle || 'monthly');

        recalculateSavings(); 
        renderSettingsCategories();
    };

    const recalculateSavings = () => {
        let sum = 0;
        window.userSettings.categories.forEach(c => { if (c.name.toUpperCase() !== 'SAVINGS') sum += parseFloat(c.percent) || 0; });
        
        const warning = document.getElementById('budget-warning');
        if (warning) warning.style.display = sum > 100 ? 'block' : 'none';
        
        const savingsCat = window.userSettings.categories.find(c => c.name.toUpperCase() === 'SAVINGS');
        if (savingsCat) savingsCat.percent = Math.max(0, parseFloat((100 - sum).toFixed(2)));
    };

    const renderSettingsCategories = () => {
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

    window.removeCategory = (i) => {
        window.userSettings.categories.splice(i, 1);
        recalculateSavings(); renderSettingsCategories(); renderBudgetTracking(); 
    };

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
                
                recalculateSavings(); nameEl.value = ''; pctEl.value = '';
                renderSettingsCategories(); renderBudgetTracking();
            }
        });
    }

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            window.userSettings.name = document.getElementById('setting-name')?.value || 'User';
            window.userSettings.balance = parseFloat(document.getElementById('setting-balance')?.value) || 0;
            window.userSettings.currency = document.getElementById('setting-currency')?.value;
            window.userSettings.metric = document.getElementById('setting-metric')?.value;
            window.userSettings.theme = document.getElementById('setting-theme')?.checked ? 'dark' : 'light';
            window.userSettings.budgetCycle = document.getElementById('setting-budget-cycle')?.value;
            
            recalculateSavings(); 
            const status = document.getElementById('settings-status');
            
            try {
                if(status) status.innerText = "Syncing settings...";
                await window.saveSettingsToCloud();
                if(status) { status.innerText = "Settings saved to Cloud!"; status.style.color = "var(--primary)"; setTimeout(() => status.innerText = "", 3000); }
                applySettingsToUI(); updateDashboard(); renderActivity(); window.renderStatistics(window.currentStatRange); renderBudgetTracking();
            } catch (e) {
                if(status) { status.innerText = "Error saving settings."; status.style.color = "var(--accent-red)"; }
            }
        });
    }

    document.querySelectorAll('.nav-btn, .nav-proxy').forEach(btn => btn.addEventListener('click', () => window.switchView(btn.getAttribute('data-target'))));

    const generateTxHTML = (entry) => {
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

    const setupReceiptListeners = () => {
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

    const updateDashboard = () => {
        const recentLogs = document.getElementById('recent-logs-list');
        if(!recentLogs) return;
        
        const sortedData = [...window.appData].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        let displayTotal = 0; let subtitle = "Running Balance";

        if (window.userSettings.metric === 'running') {
            displayTotal = parseFloat(window.userSettings.balance) || 0;
            sortedData.forEach(entry => displayTotal += (entry.amount || 0));
        } else {
            const now = new Date(); let days = 1;
            if (window.userSettings.metric === 'weekly') { days = 7; subtitle = "Weekly Net Change"; }
            if (window.userSettings.metric === 'monthly') { days = 30; subtitle = "Monthly Net Change"; }
            if (window.userSettings.metric === 'daily') { subtitle = "Daily Net Change"; }
            const cutoff = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
            sortedData.forEach(entry => { if (entry.timestamp && new Date(entry.timestamp) >= cutoff) displayTotal += (entry.amount || 0); });
        }

        const dashSub = document.getElementById('dashboard-subtitle');
        if(dashSub) dashSub.innerText = subtitle;
        const balEl = document.getElementById('display-balance');
        if(balEl) balEl.innerText = `${displayTotal < 0 ? '-' : ''}${window.formatMoney(displayTotal)}`;
        
        recentLogs.innerHTML = sortedData.slice(0, 5).map(generateTxHTML).join('');
    };

    let activeCategoryFilters = new Set();
    const populateCategoryFilters = () => {
        const container = document.getElementById('filter-categories-container');
        if(!container) return;
        
        const uniqueCats = new Set([...window.appData.map(e => e.category), ...window.userSettings.categories.map(c => c.name)]);
        const cleanCats = Array.from(uniqueCats).filter(c => c && c.trim() !== '');

        container.innerHTML = cleanCats.map(cat => `<button class="chip filter-cat-chip" data-cat="${cat}">${cat}</button>`).join('');
        
        document.querySelectorAll('.filter-cat-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const cat = e.target.getAttribute('data-cat');
                if (activeCategoryFilters.has(cat)) { activeCategoryFilters.delete(cat); e.target.classList.remove('active'); } 
                else { activeCategoryFilters.add(cat); e.target.classList.add('active'); }
                renderActivity(); 
            });
        });
    };

    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
    if (toggleFiltersBtn) {
        toggleFiltersBtn.addEventListener('click', () => {
            const panel = document.getElementById('advanced-filters-panel');
            if(panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
    }

    const renderActivity = () => {
        const logsList = document.getElementById('logs-list-view');
        if(!logsList) return;
        
        const sortedData = [...window.appData].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        const query = (document.getElementById('search-input')?.value || '').toLowerCase();
        const minAmt = document.getElementById('filter-amount-min')?.value ? parseFloat(document.getElementById('filter-amount-min').value) : null;
        const maxAmt = document.getElementById('filter-amount-max')?.value ? parseFloat(document.getElementById('filter-amount-max').value) : null;
        const startDate = document.getElementById('filter-date-start')?.value ? new Date(document.getElementById('filter-date-start').value).setHours(0,0,0,0) : null;
        const endDate = document.getElementById('filter-date-end')?.value ? new Date(document.getElementById('filter-date-end').value).setHours(23,59,59,999) : null;

        logsList.innerHTML = sortedData.filter(entry => {
            const searchableText = ((entry.name || '') + ' ' + (entry.category || '') + ' ' + (entry.notes || '') + ' ' + (entry.amount || '') + ' ' + (entry.timestamp || '')).toLowerCase();
            if (query && !searchableText.includes(query)) return false;

            const absAmt = Math.abs(entry.amount || 0);
            if (minAmt !== null && absAmt < minAmt) return false;
            if (maxAmt !== null && absAmt > maxAmt) return false;

            if (startDate || endDate) {
                const entryDate = new Date(entry.timestamp).getTime();
                if (startDate && entryDate < startDate) return false;
                if (endDate && entryDate > endDate) return false;
            }
            if (activeCategoryFilters.size > 0 && !activeCategoryFilters.has(entry.category)) return false;

            return true;
        }).map(generateTxHTML).join('');
    };

    ['search-input', 'filter-date-start', 'filter-date-end', 'filter-amount-min', 'filter-amount-max'].forEach(id => {
        const el = document.getElementById(id); if (el) el.addEventListener('input', renderActivity);
    });

    window.openReceiptModal = (entry) => {
        const overlay = document.getElementById('receipt-overlay');
        if(!overlay) return;
        
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
            merchText.innerText = entry.notes ? entry.notes : 'N/A';
        }

        overlay.classList.add('active');
    };

    window.closeReceiptModal = () => { const overlay = document.getElementById('receipt-overlay'); if(overlay) overlay.classList.remove('active'); }

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
            topList.innerHTML = expensesList.sort((a, b) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0)).slice(0, 5).map(generateTxHTML).join('');
        }

        if(window.ChartsEngine) window.ChartsEngine.render(filteredData, dataBeforeStart, cutoffStart);
    };

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

    const renderBudgetTracking = () => {
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

    const renderAccounts = () => {
        const bankGrid = document.getElementById('bank-accounts-grid');
        const investGrid = document.getElementById('investment-accounts-grid');
        if (!bankGrid || !investGrid) return;

        let total = 0; let bankHTML = ''; let investHTML = '';
        
        window.accountsData.forEach((acc, index) => {
            total += parseFloat(acc.balance || 0);
            const initial = (acc.name || '?').charAt(0).toUpperCase();
            const cardHTML = `
                <div class="account-card" style="--acc-color: ${acc.color};">
                    <div class="acc-header">
                        <div class="acc-icon-box" style="color: ${acc.color};">${initial}</div>
                        <button onclick="window.deleteAccount(${index})" style="background:none; border:none; color:var(--text-secondary); cursor:pointer;">✕</button>
                    </div>
                    <div>
                        <p class="text-muted" style="font-size: 13px;">${acc.name || 'Unnamed'}</p>
                        <h2 class="acc-balance">${window.formatMoney(acc.balance)}</h2>
                        <p class="text-muted" style="font-size: 12px; margin-top: 8px;">${acc.note || ''}</p>
                    </div>
                </div>`;
            if (acc.type === 'investment') investHTML += cardHTML; else bankHTML += cardHTML;
        });

        bankGrid.innerHTML = bankHTML; investGrid.innerHTML = investHTML;
        const totalBalEl = document.getElementById('accounts-total-balance');
        if(totalBalEl) totalBalEl.innerText = window.formatMoney(total);
    };

    window.deleteAccount = async (index) => { 
        if(confirm("Remove this account?")) { 
            window.accountsData.splice(index, 1); 
            await window.saveAccountsToCloud(); 
            renderAccounts(); 
        } 
    };

    const addAccBtn = document.getElementById('add-account-btn');
    if(addAccBtn) addAccBtn.addEventListener('click', () => { const overlay = document.getElementById('account-overlay'); if(overlay) overlay.classList.add('active'); });
    window.closeAccountModal = () => { const overlay = document.getElementById('account-overlay'); if(overlay) overlay.classList.remove('active'); }

    const saveAccBtn = document.getElementById('save-account-btn');
    if (saveAccBtn) {
        saveAccBtn.addEventListener('click', async () => {
            window.accountsData.push({
                name: document.getElementById('acc-name')?.value || 'Unnamed', type: document.getElementById('acc-type')?.value,
                balance: parseFloat(document.getElementById('acc-balance')?.value) || 0, color: document.getElementById('acc-color')?.value || '#00D26A',
                note: document.getElementById('acc-note')?.value
            });
            await window.saveAccountsToCloud();
            ['acc-name','acc-balance','acc-note'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
            window.closeAccountModal(); renderAccounts();
        });
    }

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
                statusMsg.innerText = "Uploading to Cloud..."; statusMsg.style.color = "var(--primary)";
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
                let headerRowIdx = -1; let colMap = { timestamp: -1, name: -1, amount: -1, type: -1, category: -1, notes: -1 };

                for (let i = 0; i < Math.min(rows.length, 30); i++) {
                    const cols = rows[i].map(c => cleanString(c).toUpperCase());
                    const tIdx = cols.indexOf('TIMESTAMP'); const nIdx = cols.indexOf('NAME'); const aIdx = cols.indexOf('AMOUNT');
                    if (tIdx !== -1 && nIdx !== -1 && aIdx !== -1) {
                        headerRowIdx = i; colMap.timestamp = tIdx; colMap.name = nIdx; colMap.amount = aIdx;
                        colMap.type = cols.indexOf('TYPE'); colMap.category = cols.indexOf('CATEGORY');
                        colMap.notes = cols.indexOf('NOTES/NAME');
                        if (colMap.notes === -1) colMap.notes = cols.indexOf('NOTES');
                        if (colMap.notes === -1) colMap.notes = cols.indexOf('MERCHANT');
                        break;
                    }
                }

                if (headerRowIdx === -1) { statusMsg.innerText = "Error: Could not locate header row (TIMESTAMP, NAME, AMOUNT)."; statusMsg.style.color = "var(--accent-red)"; return; }

                for (let i = headerRowIdx + 1; i < rows.length; i++) {
                    const cols = rows[i];
                    const maxReqCol = Math.max(colMap.timestamp, colMap.name, colMap.amount);
                    if (!cols || cols.length <= maxReqCol) continue; 

                    const timestampStr = cleanString(cols[colMap.timestamp]);
                    const nameStr = cleanString(cols[colMap.name]);
                    const rawAmountStr = cleanString(cols[colMap.amount]);

                    if (!timestampStr || !rawAmountStr) continue;

                    const isNegative = rawAmountStr.includes('-') || (rawAmountStr.includes('(') && rawAmountStr.includes(')'));
                    let finalAmount = parseFloat(rawAmountStr.replace(/[^0-9.]/g, '')) || 0;
                    if (isNegative) finalAmount = -finalAmount;

                    let typeStr = colMap.type !== -1 && cols[colMap.type] ? cleanString(cols[colMap.type]).toUpperCase() : '';
                    let categoryStr = colMap.category !== -1 && cols[colMap.category] ? cleanString(cols[colMap.category]) : '';
                    const notesStr = colMap.notes !== -1 && cols[colMap.notes] ? cleanString(cols[colMap.notes]) : '';

                    const isIncome = typeStr.includes('INCOM') || (finalAmount > 0 && !typeStr);
                    
                    parsedData.push({
                        type: isIncome ? 'Income' : 'Expense', category: isIncome ? 'Income' : (categoryStr || 'Uncategorized'),
                        name: nameStr, notes: notesStr, amount: finalAmount, timestamp: timestampStr.replace(' |', '')
                    });
                }

                if (parsedData.length > 0) {
                    await window.bulkUpsertTransactions(parsedData); // Pushes to Cloud
                    statusMsg.innerText = `Successfully synced records to the Cloud!`; statusMsg.style.color = "var(--primary)";
                    
                    updateDashboard(); populateCategoryFilters(); renderActivity(); renderBudgetTracking();
                    window.renderStatistics(window.currentStatRange);
                } else { statusMsg.innerText = "No valid data found."; statusMsg.style.color = "var(--accent-red)"; }
            };
            reader.readAsText(file);
        });
    }
});


window.loadLegal = async (filename, title) => {
    document.getElementById('legal-title').innerText = title;
    window.switchView('legal');
    
    const contentDiv = document.getElementById('legal-content');
    contentDiv.innerHTML = 'Loading document...';

    try {
        const response = await fetch(filename);
        if (!response.ok) throw new Error('Document not found.');
        
        const markdown = await response.text();
        
        // Wait for marked.js to initialize if it's slow
        if (typeof marked === 'undefined') {
            setTimeout(() => window.loadLegal(filename, title), 200);
            return;
        }
        
        contentDiv.innerHTML = marked.parse(markdown);
    } catch (error) {
        contentDiv.innerHTML = `<p style="color: var(--accent-red)">Error loading ${title}. Please try again later.</p>`;
    }
};