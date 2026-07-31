// --- PRIVACY MODE ENGINE ---
if (!window.originalFormatMoney) {
    window.originalFormatMoney = window.formatMoney;
    window.originalFormatMoneyWithSymbol = window.formatMoneyWithSymbol;

    window.formatMoney = (amount, isTotal = false) => {
        const mode = window.userSettings?.privacyMode || 0;
        if (mode === 1) return '••••••'; 
        if (mode === 2 && isTotal) return '••••••'; 
        return window.originalFormatMoney(amount);
    };

    window.formatMoneyWithSymbol = (amount, symbol, isTotal = false) => {
        const mode = window.userSettings?.privacyMode || 0;
        if (mode === 1) return '••••••';
        if (mode === 2 && isTotal) return '••••••';
        return window.originalFormatMoneyWithSymbol(amount, symbol);
    };
}

window.getPrivacyIcon = () => {
    const mode = window.userSettings?.privacyMode || 0;
    if (mode === 0) return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`; 
    if (mode === 1) return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`; 
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><line x1="8" y1="12" x2="16" y2="12"></line></svg>`; 
};

window.togglePrivacyMode = async () => {
    let mode = window.userSettings.privacyMode || 0;
    mode = (mode + 1) % 3; 
    window.userSettings.privacyMode = mode;
    await window.supabase.from('settings').update({ privacy_mode: mode }).eq('user_id', window.currentUser.id);
    window.bootUI();
};

// --- MULTI-CURRENCY ENGINE ---
window.initCurrencyDropdowns = () => {
    const currencies = ['PHP', 'USD', 'EUR', 'GBP', 'JPY', 'HKD', 'INR', 'RUB', 'KRW', 'THB', 'VND', 'SGD', 'MYR', 'IDR', 'AUD', 'CAD'];
    const opts = currencies.map(c => `<option value="${c}">${c}</option>`).join('');
    ['exp-currency', 'inc-currency', 'edit-tx-currency', 'transfer-currency'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = opts;
    });
};

window.setDefaultCurrencyDropdown = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const lastCur = localStorage.getItem('lastUsedCurrency');
    const baseCur = window.getCurrencyCodeFromSymbol(window.userSettings?.currency || '₱');
    el.value = lastCur || baseCur;
};

// --- CORE FUNCTIONS ---
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

    const sidebar = document.getElementById('main-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
        sidebar.classList.remove('mobile-open');
        if (backdrop) backdrop.classList.remove('active');
    }
};

window.quickAddTemplate = (name, amount, category, merchant, typeStr) => {
    const isIncome = (typeStr || '').toUpperCase().includes('INCOM');
    const displayAmount = isIncome ? amount : -amount;
    
    if (isIncome) {
        document.getElementById('inc-name').value = name || '';
        document.getElementById('inc-amount').value = displayAmount || '';
        document.getElementById('inc-category').value = category || 'INCOME';
        document.getElementById('inc-notes').value = '';
        window.openIncomeModal();
    } else {
        document.getElementById('exp-name').value = name || '';
        document.getElementById('exp-amount').value = displayAmount || '';
        
        const expCat = document.getElementById('exp-category');
        if (Array.from(expCat.options).some(opt => opt.value === category)) {
            expCat.value = category;
        } else {
            expCat.value = expCat.options[0]?.value || '';
        }
        
        document.getElementById('exp-merchant').value = merchant || '';
        document.getElementById('exp-notes').value = '';
        window.openExpenseModal();
    }
};

window.toggleTxFavorite = async (dbId, localId) => {
    const tx = window.appData.find(t => t._id === localId);
    if (!tx) return;
    
    tx.favorite = !tx.favorite; 
    window.updateDashboard();
    if(window.renderActivity) window.renderActivity();
    
    const { error } = await window.supabase.from('transactions').update({ favorite: tx.favorite }).eq('id', dbId);
    if (error) {
        console.error("Error updating favorite status", error);
        tx.favorite = !tx.favorite; 
        window.updateDashboard();
    }
};

window.renderQuickAddWidget = () => {
    const favContainer = document.getElementById('quick-add-favorites');
    const recContainer = document.getElementById('quick-add-recent');
    const freqContainer = document.getElementById('quick-add-frequent');
    if (!favContainer || !recContainer || !freqContainer) return;

    const createChip = (tx) => {
        const isIncome = (tx.type || '').toUpperCase().includes('INCOM');
        const color = isIncome ? 'var(--primary)' : 'var(--text)';
        const safeName = (tx.name || '').replace(/'/g, "\\'");
        const safeCat = (tx.category || '').replace(/'/g, "\\'");
        const safeMerchant = (tx.merchant || '').replace(/'/g, "\\'");
        return `<button class="chip" style="border-color: ${color}; color: ${color}; padding: 6px 12px;" 
            onclick="window.quickAddTemplate('${safeName}', ${tx.amount}, '${safeCat}', '${safeMerchant}', '${tx.type || ''}')">
            ${tx.name} (${window.formatMoney(Math.abs(tx.amount))})
        </button>`;
    };

    const favorites = window.appData.filter(t => t.favorite);
    const uniqueFavs = []; const favSet = new Set();
    favorites.forEach(f => {
        const key = `${f.name}_${f.amount}`;
        if (!favSet.has(key)) { favSet.add(key); uniqueFavs.push(f); }
    });
    favContainer.innerHTML = uniqueFavs.length ? uniqueFavs.slice(0, 8).map(createChip).join('') : '<span class="text-muted" style="font-size: 12px;">No favorites yet. Click the star icon on any transaction in your Activity list.</span>';

    const uniqueRecent = []; const recSet = new Set();
    for (let t of window.appData) {
        const key = `${t.name}_${t.amount}`;
        if (!recSet.has(key) && !t.favorite) {
            recSet.add(key); uniqueRecent.push(t);
            if (uniqueRecent.length >= 6) break;
        }
    }
    recContainer.innerHTML = uniqueRecent.length ? uniqueRecent.map(createChip).join('') : '<span class="text-muted" style="font-size: 12px;">No recent transactions.</span>';

    const freqMap = {};
    const recent200 = window.appData.slice(0, 200); 
    recent200.forEach(t => {
        const key = `${t.name}|${t.amount}|${t.category}`;
        if (!freqMap[key]) freqMap[key] = { count: 0, tx: t };
        freqMap[key].count++;
    });
    
    const frequent = Object.values(freqMap)
        .filter(item => item.count > 2)
        .sort((a, b) => b.count - a.count)
        .map(item => item.tx)
        .filter(t => !favSet.has(`${t.name}_${t.amount}`) && !recSet.has(`${t.name}_${t.amount}`))
        .slice(0, 6);
    
    freqContainer.innerHTML = frequent.length 
        ? frequent.map(createChip).join('') 
        : '<span class="text-muted" style="font-size: 12px;">Keep logging! Your most repeated recent transactions will appear here.</span>';
};

window.setupAutocomplete = (inputId, fieldType) => {
    const input = document.getElementById(inputId);
    if (!input) return;

    const parent = input.parentElement;
    parent.style.position = 'relative';

    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    parent.appendChild(dropdown);

    input.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        dropdown.innerHTML = '';
        
        if (!val) {
            dropdown.style.display = 'none';
            return;
        }

        const recentTxs = (window.appData || []).slice(0, 200);
        
        const uniqueValues = new Set();
        const txMap = new Map();
        
        recentTxs.forEach(tx => {
            const text = tx[fieldType]; 
            if (text && text.toLowerCase().includes(val)) {
                if (!uniqueValues.has(text)) {
                    uniqueValues.add(text);
                    txMap.set(text, tx); 
                }
            }
        });

        const suggestions = Array.from(uniqueValues).slice(0, 5);

        if (suggestions.length > 0) {
            suggestions.forEach(suggestion => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                
                const regex = new RegExp(`(${val})`, "gi");
                div.innerHTML = suggestion.replace(regex, "<strong style='color: var(--primary)'>$1</strong>");
                
                div.addEventListener('click', () => {
                    input.value = suggestion;
                    dropdown.style.display = 'none';
                    
                    if (fieldType === 'name') {
                        const recentTx = txMap.get(suggestion);
                        if (recentTx) {
                            const prefix = inputId.replace('-name', ''); 
                            
                            const amtInput = document.getElementById(`${prefix}-amount`);
                            const catInput = document.getElementById(`${prefix}-category`);
                            const merInput = document.getElementById(`${prefix}-merchant`);
                            const curInput = document.getElementById(`${prefix}-currency`);
                            const accInput = document.getElementById(`${prefix}-account`);
                            
                            if (curInput && recentTx.original_currency) {
                                curInput.value = recentTx.original_currency;
                                curInput.dispatchEvent(new Event('change'));
                            }
                            if (amtInput) {
                                const fillAmt = (recentTx.original_amount !== undefined && recentTx.original_amount !== null) 
                                    ? Math.abs(recentTx.original_amount) 
                                    : Math.abs(recentTx.amount || 0);
                                amtInput.value = fillAmt;
                            }
                            if (catInput && recentTx.category) {
                                if (Array.from(catInput.options).some(opt => opt.value === recentTx.category)) {
                                    catInput.value = recentTx.category;
                                    catInput.dispatchEvent(new Event('change'));
                                }
                            }
                            if (merInput && recentTx.merchant !== undefined) {
                                merInput.value = recentTx.merchant;
                            }
                            if (accInput && recentTx.account_id) {
                                accInput.value = recentTx.account_id;
                                accInput.dispatchEvent(new Event('change'));
                            }
                        }
                    }
                });
                dropdown.appendChild(div);
            });
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target !== input && e.target !== dropdown) {
            dropdown.style.display = 'none';
        }
    });
};

window.applySettingsToUI = () => {
    document.querySelectorAll('.privacy-toggle-btn').forEach(btn => btn.innerHTML = window.getPrivacyIcon());

    if (window.userSettings.theme === 'dark') {
        document.body.classList.add('dark-theme');
        const st = document.getElementById('setting-theme'); if(st) st.checked = true;
    } else {
        document.body.classList.remove('dark-theme');
        const st = document.getElementById('setting-theme'); if(st) st.checked = false;
    }

    if (window.userSettings.activeTripId) {
        document.body.classList.add('travel-theme');
        const tmLabel = document.getElementById('travel-mode-label');
        if(tmLabel) tmLabel.innerText = "Manage Trip";
    } else {
        document.body.classList.remove('travel-theme');
        const tmLabel = document.getElementById('travel-mode-label');
        if(tmLabel) tmLabel.innerText = "Travel Mode";
    }
    
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

    const behaviorSelect = document.getElementById('setting-default-acc-behavior');
    const customSelect = document.getElementById('setting-default-acc-custom');
    
    if (behaviorSelect && customSelect) {
        behaviorSelect.value = window.userSettings.defaultAccountBehavior || 'blank';
        customSelect.innerHTML = window.accountsData.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        if (window.userSettings.defaultAccountId) customSelect.value = window.userSettings.defaultAccountId;
        customSelect.style.display = behaviorSelect.value === 'custom' ? 'block' : 'none';
        
        behaviorSelect.addEventListener('change', (e) => {
            customSelect.style.display = e.target.value === 'custom' ? 'block' : 'none';
        });
    }
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
    const baseCode = window.getCurrencyCodeFromSymbol(window.userSettings?.currency || '₱');
    let origText = '';
    if (entry.original_currency && entry.original_currency !== baseCode && entry.original_amount !== undefined && entry.original_amount !== null) {
        const origSym = window.getCurrencySymbol(entry.original_currency);
        origText = `<span style="font-size: 11px; color: var(--text-secondary); font-weight: 400; display: block; margin-top: 2px;">(${origSym}${Math.abs(entry.original_amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})</span>`;
    }

    if (entry.type === 'TRANSFER') {
        const fromName = window.accountsData.find(a => a.id === entry.account_id)?.name || 'External';
        const toName = window.accountsData.find(a => a.id === entry.to_account_id)?.name || 'External';
        const starColor = entry.favorite ? '#FFD700' : 'var(--border)';

        return `
            <li class="tx-item" data-id="${entry._id}" style="padding-right: 8px;">
                <div class="tx-left" style="flex: 1; min-width: 0; overflow: hidden; display: flex; flex-direction: column; margin-right: 12px;">
                    <span class="tx-cat" style="background: var(--surface-hover); border-color: var(--border); width: fit-content;">⇄ Transfer</span>
                    <span class="tx-name" style="display: block; width: 100%; white-space: nowrap; overflow: hidden; -webkit-mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%); mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);">${entry.name || `${fromName} → ${toName}`}</span>
                </div>
                <div class="tx-right" style="flex-shrink: 0; text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: center;">
                    <span class="tx-date" style="margin-bottom: 2px;">${window.formatListDate(entry.timestamp)}</span>
                    <span class="tx-amount" style="color: var(--text-secondary); white-space: nowrap;">${window.formatMoney(entry.amount)}</span>
                    ${origText}
                </div>
                <button class="star-btn" style="position: static; padding: 4px; color: ${starColor}; fill: ${starColor}; flex-shrink: 0;" onclick="event.stopPropagation(); window.toggleTxFavorite('${entry.id}', ${entry._id})">
                    <svg class="tx-star" viewBox="0 0 24 24" style="width: 20px; height: 20px; color: inherit; fill: inherit;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                </button>
            </li>`;
    }

    const isPositiveEffect = (entry.amount || 0) >= 0;
    const amountColor = (isPositiveEffect && entry.amount !== 0) ? 'var(--primary)' : 'var(--text)';
    const sign = isPositiveEffect ? '+' : '-';
    const starColor = entry.favorite ? '#FFD700' : 'var(--border)';
    
    return `
        <li class="tx-item" data-id="${entry._id}" style="padding-right: 8px;">
            <div class="tx-left" style="flex: 1; min-width: 0; overflow: hidden; display: flex; flex-direction: column; margin-right: 12px;">
                <span class="tx-cat" style="width: fit-content;">${entry.category || 'Uncategorized'}</span>
                <span class="tx-name" style="display: block; width: 100%; white-space: nowrap; overflow: hidden; -webkit-mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%); mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);">${entry.name || 'Unnamed Transaction'}</span>
            </div>
            <div class="tx-right" style="flex-shrink: 0; text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: center;">
                <span class="tx-date" style="margin-bottom: 2px;">${window.formatListDate(entry.timestamp)}</span>
                <span class="tx-amount" style="color: ${amountColor}; white-space: nowrap;">${sign}${window.formatMoney(entry.amount)}</span>
                ${origText}
            </div>
            <button class="star-btn" style="position: static; padding: 4px; color: ${starColor}; fill: ${starColor}; flex-shrink: 0;" onclick="event.stopPropagation(); window.toggleTxFavorite('${entry.id}', ${entry._id})">
                <svg class="tx-star" viewBox="0 0 24 24" style="width: 20px; height: 20px; color: inherit; fill: inherit;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
            </button>
        </li>`;
};

window.populateAccountDropdowns = (targetSelectId) => {
    const selectEl = document.getElementById(targetSelectId);
    if (!selectEl) return;

    const getAccountLastUsed = (accId) => {
        const txs = window.appData.filter(t => t.account_id === accId);
        if (!txs.length) return 0;
        return Math.max(...txs.map(t => new Date(t.timestamp).getTime()));
    };

    const sortedAccounts = [...window.accountsData].sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return getAccountLastUsed(b.id) - getAccountLastUsed(a.id);
    });

    let html = '<option value="">-- None --</option>';
    sortedAccounts.forEach(acc => {
        const favIndicator = acc.favorite ? '★ ' : '';
        const sym = acc.currency ? window.getCurrencySymbol(acc.currency) : window.getCurrencySymbol(window.userSettings?.currency || '₱');
        html += `<option value="${acc.id}">${favIndicator}${acc.name} (${window.formatMoneyWithSymbol(acc.balance, sym)})</option>`;
    });
    selectEl.innerHTML = html;

    let defaultVal = '';
    const behavior = window.userSettings.defaultAccountBehavior || 'blank';
    
    if (behavior === 'custom' && window.userSettings.defaultAccountId) {
        if (window.accountsData.find(a => a.id === window.userSettings.defaultAccountId)) defaultVal = window.userSettings.defaultAccountId;
    } else if (behavior === 'recent') {
        const recentTx = window.appData.find(t => t.account_id);
        if (recentTx && window.accountsData.find(a => a.id === recentTx.account_id)) defaultVal = recentTx.account_id;
    }
    
    selectEl.value = defaultVal;
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
window.dashboardIncChartInst = null;

window.renderGoalsWidget = () => {
    const container = document.getElementById('dashboard-goals-list');
    const widget = document.getElementById('dashboard-goals-widget');
    if (!container) return;
    
    if (!window.userGoals || window.userGoals.length === 0) {
        if (widget) widget.style.display = 'none';
        return;
    }
    
    const activeGoals = window.userGoals.filter(g => g.status === 'Active').slice(0, 3);
    if (activeGoals.length === 0) {
        if (widget) widget.style.display = 'none';
        return;
    }
    
    if (widget) widget.style.display = 'block';
    
    container.innerHTML = activeGoals.map(goal => {
        const progress = Math.min(100, (goal.current_amount / goal.target_amount) * 100);
        const remaining = goal.target_amount - goal.current_amount;
        return `
            <div style="padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;" onclick="window.switchView('goals')" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='transparent'">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 13px; font-weight: 500;">${goal.name}</span>
                    <span style="font-size: 12px; color: var(--text-secondary);">${Math.round(progress)}%</span>
                </div>
                <div style="width: 100%; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; margin-bottom: 6px;">
                    <div style="height: 100%; width: ${progress}%; background: ${goal.theme_color}; transition: width 0.3s;"></div>
                </div>
                <div style="font-size: 11px; color: var(--text-secondary);">${window.formatMoney(goal.current_amount)} / ${window.formatMoney(goal.target_amount)}</div>
            </div>
        `;
    }).join('');
};

window.renderUpcomingSubscriptions = () => {
    const container = document.getElementById('dashboard-upcoming-subs-timeline');
    const widget = document.getElementById('dashboard-upcoming-subs-widget');
    if (!container) return;
    
    if (!window.userSubscriptions || window.userSubscriptions.length === 0) {
        if (widget) widget.style.display = 'none';
        return;
    }
    
    const today = new Date();
    const twoWeeksFromNow = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    const upcoming = window.userSubscriptions
        .filter(sub => {
            const billingDate = new Date(sub.next_billing_date);
            return billingDate >= today && billingDate <= twoWeeksFromNow;
        })
        .sort((a, b) => new Date(a.next_billing_date) - new Date(b.next_billing_date));
    
    if (upcoming.length === 0) {
        if (widget) widget.style.display = 'none';
        return;
    }
    
    if (widget) widget.style.display = 'block';
    
    const grouped = {};
    upcoming.forEach(sub => {
        const date = sub.next_billing_date;
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(sub);
    });
    
    let totalUpcoming = 0;
    
    container.innerHTML = Object.entries(grouped)
        .map(([date, subs]) => {
            const dateObj = new Date(date);
            const daysUntil = Math.floor((dateObj - today) / (1000 * 60 * 60 * 24));
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const dayLabel = daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`;
            
            const dayTotal = subs.reduce((sum, s) => sum + Math.abs(s.amount), 0);
            totalUpcoming += dayTotal;
            
            return `
                <div style="padding: 12px; border-bottom: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 12px; font-weight: 600;">${dateStr} - ${dayLabel}</span>
                        <span style="font-size: 12px; font-weight: 600; color: #f8715d;">${window.formatMoney(dayTotal)}</span>
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary);">
                        ${subs.map(s => `<div style="padding: 2px 0; display: flex; justify-content: space-between;">
                            <span>${s.name}</span>
                            <span style="margin-left: 8px;">${s.auto_log ? '🔄' : '⏸'}</span>
                        </div>`).join('')}
                    </div>
                </div>
            `;
        })
        .join('');
    
    const footer = document.createElement('div');
    footer.style.cssText = 'padding: 12px; background: rgba(248, 113, 93, 0.05); border-radius: 6px; margin-top: 8px; text-align: center;';
    footer.innerHTML = `<div style="font-size: 11px; color: var(--text-secondary);">Total upcoming (14 days): ${window.formatMoney(totalUpcoming)}</div>`;
    container.appendChild(footer);
};

window.renderDashboardInsights = () => {
    if (typeof Chart === 'undefined') {
        setTimeout(window.renderDashboardInsights, 500);
        return;
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    const recentExpenses = window.appData.filter(e => new Date(e.timestamp) >= thirtyDaysAgo && e.amount < 0 && !e.trip_id && e.type !== 'TRANSFER');
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
                    tooltip: { callbacks: { label: function(c) { return sortedData.length ? ` ${window.formatMoney(c.raw, true)}` : ' No Data'; } } }
                }
            }
        });
    }

    const recentIncome = window.appData.filter(e => new Date(e.timestamp) >= thirtyDaysAgo && (e.type || '').toUpperCase().includes('INCOM') && !e.trip_id);
    const incCategoryTotals = {};
    recentIncome.forEach(e => {
        const cat = e.category || 'Uncategorized';
        incCategoryTotals[cat] = (incCategoryTotals[cat] || 0) + e.amount;
    });

    const ctxInc = document.getElementById('dashboardIncomeChart');
    if (ctxInc) {
        if (window.dashboardIncChartInst) window.dashboardIncChartInst.destroy();

        const sortedIncCats = Object.keys(incCategoryTotals).sort((a,b) => incCategoryTotals[b] - incCategoryTotals[a]);
        const sortedIncData = sortedIncCats.map(c => incCategoryTotals[c]);
        const isDark = document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#FFFFFF' : '#111111';
        const incPalette = ['#00D26A', '#26D9B0', '#00B85C', '#3A5DFF', '#81ecec', '#00cec9', '#74b9ff'];

        window.dashboardIncChartInst = new Chart(ctxInc, {
            type: 'doughnut',
            data: {
                labels: sortedIncCats.length ? sortedIncCats : ['No Data'],
                datasets: [{
                    data: sortedIncData.length ? sortedIncData : [1],
                    backgroundColor: sortedIncData.length ? incPalette : [isDark ? '#2C2C2C' : '#ECECEC'],
                    borderWidth: 0,
                    cutout: '70%'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: textColor, font: { family: "'DM Sans', sans-serif", size: 11 }, boxWidth: 12 } },
                    tooltip: { callbacks: { label: function(c) { return sortedIncData.length ? ` ${window.formatMoney(c.raw, true)}` : ' No Data'; } } }
                }
            }
        });
    }

    const budgetContainer = document.getElementById('dashboard-weekly-budget-container');
    if (!budgetContainer) return;

    const day = now.getDay() || 7; 
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
    weekStart.setHours(0,0,0,0);

    let weeklyIncome = 0;
    const weeklySpent = {};
    window.appData.filter(e => new Date(e.timestamp) >= weekStart && !e.trip_id).forEach(e => {
        const isIncome = (e.type || '').toUpperCase().includes('INCOM');
        if (isIncome) {
            weeklyIncome += e.amount;
        } else if (e.type !== 'TRANSFER') {
            const cat = (e.category || 'Uncategorized').toUpperCase();
            weeklySpent[cat] = (weeklySpent[cat] || 0) - e.amount;
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
        sortedData.forEach(entry => {
            if (entry.type !== 'TRANSFER') displayTotal += (entry.amount || 0);
        });
        subtitle = "Running Balance";
    } else if (metric === 'net_worth') {
        subtitle = "Net Worth (Accounts)";
        const baseCode = window.getCurrencyCodeFromSymbol(window.userSettings.currency);
        window.accountsData.forEach(acc => {
            let accCode = acc.currency ? acc.currency.toUpperCase() : baseCode;
            displayTotal += window.convertCurrency(parseFloat(acc.balance || 0), accCode, baseCode);
        });
    } else if (metric === 'remaining_daily') {
        subtitle = "Remaining Budget (Today)";
        const now = new Date(); const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let cycleIncome = 0;
        sortedData.filter(e => new Date(e.timestamp) >= cutoff && !e.trip_id && e.type !== 'TRANSFER').forEach(e => {
            if (e.amount > 0) cycleIncome += e.amount;
        });
        const totalSpent = sortedData.filter(e => new Date(e.timestamp) >= cutoff && e.amount < 0 && !e.trip_id && e.type !== 'TRANSFER').reduce((sum, e) => sum + Math.abs(e.amount), 0);
        displayTotal = cycleIncome - totalSpent;
    } else if (metric === 'remaining_weekly') {
        subtitle = "Remaining Budget (This Week)";
        const now = new Date(); const day = now.getDay() || 7;
        const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
        let cycleIncome = 0;
        sortedData.filter(e => new Date(e.timestamp) >= cutoff && !e.trip_id && e.type !== 'TRANSFER').forEach(e => {
            if (e.amount > 0) cycleIncome += e.amount;
        });
        const totalSpent = sortedData.filter(e => new Date(e.timestamp) >= cutoff && e.amount < 0 && !e.trip_id && e.type !== 'TRANSFER').reduce((sum, e) => sum + Math.abs(e.amount), 0);
        displayTotal = cycleIncome - totalSpent;
    } else if (metric === 'remaining_monthly') {
        subtitle = "Remaining Budget (This Month)";
        const now = new Date(); const cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
        let cycleIncome = 0;
        sortedData.filter(e => new Date(e.timestamp) >= cutoff && !e.trip_id && e.type !== 'TRANSFER').forEach(e => {
            if (e.amount > 0) cycleIncome += e.amount;
        });
        const totalSpent = sortedData.filter(e => new Date(e.timestamp) >= cutoff && e.amount < 0 && !e.trip_id && e.type !== 'TRANSFER').reduce((sum, e) => sum + Math.abs(e.amount), 0);
        displayTotal = cycleIncome - totalSpent;
    }

    const dashSub = document.getElementById('dashboard-subtitle');
    if(dashSub) dashSub.innerText = subtitle;
    const balEl = document.getElementById('display-balance');
    if(balEl) balEl.innerText = `${displayTotal < 0 ? '-' : ''}${window.formatMoney(Math.abs(displayTotal), true)}`;
    
    recentLogs.innerHTML = sortedData.slice(0, 5).map(window.generateTxHTML).join('');
    
    if (window.renderGoalsWidget) window.renderGoalsWidget();
    if (window.renderUpcomingSubscriptions) window.renderUpcomingSubscriptions();
    if (window.renderDashboardInsights) window.renderDashboardInsights();
    if (window.renderQuickAddWidget) window.renderQuickAddWidget();
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
    
    const typeFilter = document.getElementById('filter-type')?.value || 'all';
    const tripFilter = document.getElementById('filter-trip')?.value || 'all';

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

        if (typeFilter !== 'all') {
            const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
            if (typeFilter === 'income' && (!isIncome || entry.type === 'TRANSFER')) return false;
            if (typeFilter === 'expense' && (isIncome || entry.type === 'TRANSFER')) return false;
        }

        if (tripFilter === 'trip' && !entry.trip_id) return false;
        if (tripFilter === 'non-trip' && entry.trip_id) return false;

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
    
    const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
    const safeSet = (id, text) => { const el = document.getElementById(id); if(el) el.innerText = text; };

    safeSet('receipt-title', isIncome ? 'Received' : 'Paid');
    safeSet('receipt-item-name', entry.name || 'Transaction');
    safeSet('receipt-date', window.formatReceiptDateTime(entry.timestamp));
    safeSet('receipt-category', entry.category || 'N/A');
    
    const baseCode = window.getCurrencyCodeFromSymbol(window.userSettings?.currency || '₱');
    const exRow = document.getElementById('receipt-exchange-row');

    if (entry.original_currency && entry.original_currency !== baseCode && entry.exchange_rate) {
        const origSym = window.getCurrencySymbol(entry.original_currency);
        const baseSym = window.getCurrencySymbol(baseCode);
        document.getElementById('receipt-exchange').innerText = `1 ${entry.original_currency} = ${window.formatMoneyWithSymbol(entry.exchange_rate, baseSym)}`;
        safeSet('receipt-amount', `${origSym}${Math.abs(entry.original_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}`);
        if (exRow) exRow.style.display = 'flex';
    } else {
        safeSet('receipt-amount', window.formatMoney(entry.amount));
        if (exRow) exRow.style.display = 'none';
    }
    
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
    
    const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
    const baseCode = window.getCurrencyCodeFromSymbol(window.userSettings?.currency || '₱');
    
    const displayAmount = (entry.original_amount !== undefined && entry.original_amount !== null) ? Math.abs(entry.original_amount) : Math.abs(entry.amount);
    
    document.getElementById('edit-tx-name').value = entry.name || '';
    document.getElementById('edit-tx-amount').value = displayAmount || 0;
    document.getElementById('edit-tx-currency').value = entry.original_currency || baseCode;
    document.getElementById('edit-tx-merchant').value = entry.merchant || '';
    document.getElementById('edit-tx-notes').value = entry.notes || '';
    
    if (window.setupTxTripToggle) {
        window.setupTxTripToggle('edit', entry.trip_id);
    }
    
    const catSelect = document.getElementById('edit-tx-category');
    let found = false;
    Array.from(catSelect.options).forEach(opt => { if(opt.value === entry.category) found = true; });
    
    if (!found && entry.category) {
         const opt = document.createElement('option'); 
         opt.value = entry.category; 
         opt.innerText = entry.category; 
         catSelect.appendChild(opt);
    }
    
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

window.setupAccountDragDrop = () => {
    let draggedElement = null;
    let draggedType = null;
    
    const handleDragStart = (e) => {
        draggedElement = e.target.closest('[draggable="true"]');
        if (!draggedElement) return;
        
        e.stopPropagation(); 
        
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
        if (overElement && overElement !== draggedElement) {
            overElement.style.opacity = '0.6';
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
        e.stopPropagation();
        
        const dropTarget = e.target.closest('[draggable="true"]');
        if (!dropTarget || dropTarget === draggedElement) return;
        
        dropTarget.style.opacity = '1';
        
        const accountIndex = e.dataTransfer.getData('accountIndex');
        const typeSection = e.dataTransfer.getData('typeSection');
        
        const targetAccountIndex = dropTarget.getAttribute('data-account-index');
        const targetType = dropTarget.getAttribute('data-type') || dropTarget.closest('.account-type-section')?.getAttribute('data-type');
        
        if (accountIndex) {
            const draggedIdx = parseInt(accountIndex);
            const targetIdx = parseInt(targetAccountIndex);
            
            if (!isNaN(draggedIdx)) {
                const draggedAcc = window.accountsData[draggedIdx];
                
                if (targetType) {
                    let parsedType = targetType;
                    let parsedCustom = '';
                    if (targetType.startsWith('custom:')) {
                        parsedType = 'custom';
                        parsedCustom = targetType.substring(7);
                    }
                    draggedAcc.type = parsedType;
                    draggedAcc.customType = parsedCustom || null;
                }

                window.accountsData.splice(draggedIdx, 1);
                
                if (!isNaN(targetIdx)) {
                    const insertIdx = draggedIdx < targetIdx ? targetIdx - 1 : targetIdx;
                    window.accountsData.splice(insertIdx, 0, draggedAcc);
                } else {
                    window.accountsData.push(draggedAcc); 
                }
                
                await window.saveAccountsToCloud();
                await window.renderAccounts();
            }
        } else if (typeSection && targetType) {
            const currentDOMOrder = Array.from(document.querySelectorAll('.account-type-section')).map(el => el.getAttribute('data-type'));
            const draggedTypeIdx = currentDOMOrder.indexOf(typeSection);
            const targetTypeIdx = currentDOMOrder.indexOf(targetType);
            
            if (draggedTypeIdx !== -1 && targetTypeIdx !== -1 && draggedTypeIdx !== targetTypeIdx) {
                const draggedNode = document.querySelector(`.account-type-section[data-type="${typeSection}"]`);
                const targetNode = document.querySelector(`.account-type-section[data-type="${targetType}"]`);
                
                if (draggedNode && targetNode) {
                    const parent = targetNode.parentNode;
                    if (draggedTypeIdx < targetTypeIdx) {
                        parent.insertBefore(draggedNode, targetNode.nextSibling);
                    } else {
                        parent.insertBefore(draggedNode, targetNode);
                    }
                }
                
                window.userSettings.typeOrder = Array.from(document.querySelectorAll('.account-type-section')).map(el => el.getAttribute('data-type'));
                
                await window.saveSettingsToCloud();
                await window.renderAccounts();
            }
        }
    };
    
    const handleDragEnd = (e) => {
        document.querySelectorAll('[draggable="true"]').forEach(el => {
            el.style.opacity = '1';
        });
        draggedElement = null;
    };
    
    document.querySelectorAll('[draggable="true"]').forEach(el => {
        el.addEventListener('dragstart', handleDragStart, false);
        el.addEventListener('dragover', handleDragOver, false);
        el.addEventListener('dragleave', handleDragLeave, false);
        el.addEventListener('drop', handleDrop, false);
        el.addEventListener('dragend', handleDragEnd, false);
    });
};

window.saveTransactionEdit = async () => {
    if (!window.currentEditingTransaction) return;
    
    const entry = window.currentEditingTransaction;
    const newName = document.getElementById('edit-tx-name').value.trim();
    const newAmount = parseFloat(document.getElementById('edit-tx-amount').value);
    const newCategory = document.getElementById('edit-tx-category').value;
    const newMerchant = document.getElementById('edit-tx-merchant').value.trim();
    const newNotes = document.getElementById('edit-tx-notes').value.trim();
    
    const isTripCb = document.getElementById('edit-is-trip')?.checked;
    const newTripId = isTripCb ? document.getElementById('edit-trip-id')?.value : null;

    if (!newName || !newAmount || isNaN(newAmount)) {
        alert('Please fill in Name and Amount');
        return;
    }
    
    const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
    const selCur = document.getElementById('edit-tx-currency').value;
    const baseCur = window.getCurrencyCodeFromSymbol(window.userSettings?.currency || '₱');
    
    let finalAmount = newAmount;
    let exchangeRate = 1;
    
    if (selCur !== baseCur) {
        finalAmount = window.convertCurrency(newAmount, selCur, baseCur);
        exchangeRate = finalAmount / newAmount;
    }
    localStorage.setItem('lastUsedCurrency', selCur);
    
    const signedFinalAmount = isIncome ? finalAmount : -finalAmount;
    const signedOrigAmount = isIncome ? newAmount : -newAmount;
    
    const { error } = await window.supabase
        .from('transactions')
        .update({
            name: newName,
            amount: signedFinalAmount,
            original_currency: selCur,
            original_amount: signedOrigAmount,
            exchange_rate: exchangeRate,
            category: newCategory,
            merchant: newMerchant,
            notes: newNotes,
            trip_id: newTripId
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
        if(window.renderTripsView && window.userSettings.activeTripId) window.renderTripsView();
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

    const includeTravel = document.getElementById('stats-include-travel')?.checked || false;

    window.appData.forEach(entry => {
        if (entry.timestamp) {
            const eDate = new Date(entry.timestamp);
            if (eDate < cutoffStart) dataBeforeStart.push(entry);
            if (eDate >= cutoffStart && eDate <= cutoffEnd) {
                if (!includeTravel && entry.trip_id) return; 

                filteredData.push(entry);
                const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
                if (isIncome) { 
                    totalIncome += entry.amount; 
                } else if (entry.type !== 'TRANSFER') { 
                    totalExpense -= entry.amount; 
                    expensesList.push(entry); 
                }
            }
        }
    });

    const safeSet = (id, text) => { const el = document.getElementById(id); if(el) el.innerText = text; };
    safeSet('stat-income', window.formatMoney(totalIncome, true));
    safeSet('stat-expense', window.formatMoney(totalExpense, true));
    
    const net = totalIncome - totalExpense;
    const netEl = document.getElementById('stat-net');
    if (netEl) {
        netEl.innerText = `${net < 0 ? '-' : '+'}${window.formatMoney(Math.abs(net), true)}`;
        netEl.style.color = net < 0 ? 'var(--text)' : 'var(--primary)';
    }

    const topList = document.getElementById('top-expenses-list');
    if (topList) {
        topList.innerHTML = expensesList.sort((a, b) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0)).slice(0, 5).map(window.generateTxHTML).join('');
    }

    if(window.ChartsEngine) window.ChartsEngine.render(filteredData, dataBeforeStart, cutoffStart);

    const renderSankeyFlow = () => {
        const container = document.getElementById('sankey_diagram');
        if (!container) return;

        if (typeof google === 'undefined' || !google.visualization) {
            google.charts.load('current', { packages: ['sankey'] });
            google.charts.setOnLoadCallback(renderSankeyFlow);
            return;
        }

        const data = new google.visualization.DataTable();
        data.addColumn('string', 'From');
        data.addColumn('string', 'To');
        data.addColumn('number', 'Amount');

        const rows = [];
        const incByCat = {};
        const expByCat = {};

        filteredData.forEach(entry => {
            const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
            if (isIncome) {
                incByCat[entry.category || 'Other'] = (incByCat[entry.category || 'Other'] || 0) + entry.amount;
            } else {
                expByCat[entry.category || 'Other'] = (expByCat[entry.category || 'Other'] || 0) + Math.abs(entry.amount);
            }
        });

        if (totalIncome === 0 && totalExpense === 0) {
            container.innerHTML = '<p class="text-muted" style="text-align:center; margin-top: 140px;">No flow data available for this range.</p>';
            return;
        }

        container.innerHTML = ''; 

        for (const [cat, amt] of Object.entries(incByCat)) {
            if (amt > 0) rows.push([`${cat}`, 'Budget', amt]);
        }
        for (const [cat, amt] of Object.entries(expByCat)) {
            if (amt > 0) rows.push(['Budget', cat, amt]);
        }
        if (totalIncome > totalExpense) {
            rows.push(['Budget', 'Savings', totalIncome - totalExpense]);
        } else if (totalExpense > totalIncome) {
            rows.push(['Deficit', 'Budget', totalExpense - totalIncome]);
        }

        data.addRows(rows);

        const isDark = document.body.classList.contains('dark-theme');
        const textColor = isDark ? '#A0A0A0' : '#757575';

        const options = {
            sankey: {
                node: {
                    width: 36,
                    nodePadding: 18,
                    label: { color: textColor, fontSize: 14, fontName: 'DM Sans' },
                    colors: ['#26D9B0']
                },
                link: {
                    colorMode: 'gradient',
                    colors: ['#FFA800', '#FF4A4A', '#3A5DFF', '#00D26A', '#26D9B0']
                }
            },
            backgroundColor: 'transparent'
        };

        const chart = new google.visualization.Sankey(container);
        chart.draw(data, options);
    };
    renderSankeyFlow();
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
    window.appData.filter(e => new Date(e.timestamp) >= cutoff && !e.trip_id).forEach(e => {
        const isIncome = (e.type || '').toUpperCase().includes('INCOM');
        if (isIncome) {
            cycleIncome += e.amount;
        } else if (e.type !== 'TRANSFER') { 
            const cat = (e.category || 'Uncategorized').toUpperCase(); 
            grouped[cat] = (grouped[cat] || 0) - e.amount; 
        }
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

window.renderAccounts = async () => {
    const container = document.getElementById('accounts-container');
    if (!container) return;
    
    let grandTotal = 0;
    const userCurrency = (window.userSettings?.currency || '₱').replace('₱', 'PHP');
    
    const uniqueCurrencies = [...new Set(window.accountsData.map(acc => acc.currency || userCurrency).filter(c => c !== userCurrency))];
    for (const curr of uniqueCurrencies) {
        await window.getPrice(curr);
    }
    
    const groupedByType = {};
    window.accountsData.forEach((acc, index) => {
        let type = acc.type || 'bank';
        let groupKey = type;
        if (type === 'custom' && acc.customType) {
            groupKey = `custom:${acc.customType}`;
        }
        if (!groupedByType[groupKey]) {
            groupedByType[groupKey] = [];
        }
        groupedByType[groupKey].push({ ...acc, _index: index });
    });

    const typeLabels = { 'bank': 'Banks & E-Wallets', 'onhand': 'On-hand Cash', 'investment': 'Investments', 'receivable': 'Receivables (Owed to me)', 'payable': 'Payables (I owe them)', 'custom': 'Custom' };
    const defaultOrder = ['bank', 'onhand', 'investment'];
    const allTypes = Object.keys(groupedByType);
    const customTypes = allTypes.filter(t => t.startsWith('custom:') || (!defaultOrder.includes(t) && !['bank', 'onhand', 'investment'].includes(t)));
    
    if (typeof window.userSettings.typeOrder === 'string') {
        try {
            window.userSettings.typeOrder = JSON.parse(window.userSettings.typeOrder);
        } catch (e) {
            window.userSettings.typeOrder = []; 
        }
    }

    if (!Array.isArray(window.userSettings.typeOrder) || window.userSettings.typeOrder.length === 0) {
        window.userSettings.typeOrder = [...defaultOrder.filter(t => allTypes.includes(t)), ...customTypes.sort()];
    }
    
    const orderedTypes = [
        ...window.userSettings.typeOrder.filter(t => allTypes.includes(t)),
        ...allTypes.filter(t => !window.userSettings.typeOrder.includes(t))
    ];
    
    let html = '';
    for (const type of orderedTypes) {
        const accounts = groupedByType[type];
        if (!accounts || accounts.length === 0) continue;
        
        const typeLabel = typeLabels[type] || (type.startsWith('custom:') ? type.substring(7) : type.charAt(0).toUpperCase() + type.slice(1));
        let typeTotal = 0;
        
        const cache = window.getPriceCache();
        for (const acc of accounts) {
            const balance = parseFloat(acc.balance || 0);
            const accCurrency = acc.currency || userCurrency;
            if (accCurrency === userCurrency) {
                typeTotal += balance;
            } else {
                const rate = cache[accCurrency]?.rate || 1;
                typeTotal += balance * rate;
            }
        }
        
        const typeSign = typeTotal < 0 ? '-' : typeTotal > 0 ? '+' : '';
        const typeTotalColor = typeTotal < 0 ? 'var(--accent-red)' : typeTotal > 0 ? 'var(--primary)' : 'var(--text-secondary)';
        
        html += `
            <div class="account-type-section" draggable="true" data-type="${type}" style="margin-bottom: 32px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; cursor: grab; user-select: none;" class="type-header-drag">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-secondary);">
                        <span style="cursor: grab; display: inline-block; margin-right: 8px;">⋮⋮</span> ${typeLabel}
                    </h3>
                    <span style="font-weight: 700; color: ${typeTotalColor};">${typeSign}${window.formatMoney(Math.abs(typeTotal), true)}</span>
                </div>
                <div class="accounts-grid account-type-grid" data-type="${type}">
                    ${accounts.map((acc, idx) => {
                        const initial = (acc.name || '?').charAt(0).toUpperCase();
                        const isFavorite = acc.favorite || false;
                        const favIcon = isFavorite ? '★' : '☆';
                        const favColor = isFavorite ? '#FFD700' : 'var(--text-secondary)';
                        const balanceColor = acc.balance < 0 ? 'var(--accent-red)' : 'var(--text)';
                        const accCurrency = acc.currency || userCurrency;
                        
                        const cache = window.getPriceCache();
                        let convertedAmount = acc.balance;
                        let originalDisplay = '';
                        const userCurrencySymbol = window.userSettings?.currency || '₱';
                        
                        if (accCurrency !== userCurrency) {
                            const rate = cache[accCurrency]?.rate || 1;
                            convertedAmount = acc.balance * rate;
                            originalDisplay = `${acc.balance < 0 ? '-' : ''}${window.formatMoneyWithSymbol(Math.abs(acc.balance), accCurrency)}`;
                        }
                        
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
                                <div style="cursor:pointer;" onclick="window.openAccountLedger('${acc.id}')">
                                    <p class="text-muted" style="font-size: 13px;">${acc.name || 'Unnamed'}</p>
                                    <h2 class="acc-balance" style="color: ${balanceColor};">${convertedAmount < 0 ? '-' : ''}${window.formatMoneyWithSymbol(Math.abs(convertedAmount), userCurrencySymbol)}</h2>
                                    ${originalDisplay ? `<p class="text-muted" style="font-size: 11px; margin-top: 4px;">${originalDisplay}</p>` : ''}
                                    <p class="text-muted" style="font-size: 12px; margin-top: 8px;">${acc.note || ''}</p>
                                    ${acc.balance < 0 ? '<p class="text-muted" style="font-size: 11px; color: var(--accent-red);">Liability</p>' : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
    window.setupAccountDragDrop();
    const cache = window.getPriceCache();
    for (const acc of window.accountsData) {
        const balance = parseFloat(acc.balance || 0);
        const accCurrency = acc.currency || userCurrency;
        
        if (accCurrency === userCurrency) {
            grandTotal += balance;
        } else {
            const rate = cache[accCurrency]?.rate || 1;
            grandTotal += balance * rate;
        }
    }
    
    const totalBalEl = document.getElementById('accounts-total-balance');
    if(totalBalEl) {
        const sign = grandTotal < 0 ? '-' : grandTotal > 0 ? '+' : '';
        const color = grandTotal < 0 ? 'var(--accent-red)' : 'var(--text)';
        totalBalEl.innerText = window.formatMoney(Math.abs(grandTotal), true);
        totalBalEl.style.color = color;
    }
};

window.renderGoals = async () => {
    const container = document.getElementById('goals-container');
    if (!container) return;
    
    if (!window.userGoals || window.userGoals.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">No goals yet. Create one to start tracking!</div>';
        return;
    }
    
    container.innerHTML = window.userGoals.map(goal => {
        const progress = Math.min(100, (goal.current_amount / goal.target_amount) * 100);
        const remaining = goal.target_amount - goal.current_amount;
        const daysUntil = goal.deadline ? Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
        const isOverdue = daysUntil !== null && daysUntil < 0;
        const pacing = goal.deadline ? window.calculatePacing(goal) : null;
        
        let paceIndicator = '';
        let paceColor = 'var(--text-secondary)';
        
        if (pacing) {
            if (pacing.status === 'on-pace') {
                paceIndicator = `<div style="color: var(--primary); font-weight: 600;">✓ On pace</div>`;
                paceColor = 'var(--primary)';
            } else {
                paceIndicator = `<div style="color: var(--accent-red); font-weight: 600;">⚠ Behind pace</div>`;
                paceColor = 'var(--accent-red)';
            }
            paceIndicator += `<div style="font-size: 12px; color: var(--text-secondary);">Need ${window.formatMoney(pacing.requiredDaily)}/day</div>`;
        }
        
        return `
            <div class="card" style="padding: 20px; cursor: pointer; transition: transform 0.2s; border-top: 3px solid ${goal.theme_color};" onclick="window.openGoalModal('${goal.id}')">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                    <div>
                        <h3 style="margin: 0 0 4px 0;">${goal.name}</h3>
                        <span style="font-size: 12px; color: ${paceColor};">${goal.status}</span>
                    </div>
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: ${goal.theme_color};"></div>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
                        <span>${window.formatMoney(goal.current_amount)}</span>
                        <span style="color: var(--text-secondary);">${window.formatMoney(goal.target_amount)}</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${progress}%; background: ${goal.theme_color}; transition: width 0.3s;"></div>
                    </div>
                </div>
                
                <div style="font-size: 13px; color: var(--text-secondary);">
                    ${remaining > 0 ? `<div>${window.formatMoney(remaining)} to go</div>` : '<div style="color: var(--primary);">✓ Completed</div>'}
                    ${goal.deadline ? `<div style="color: ${isOverdue ? 'var(--accent-red)' : 'var(--text-secondary)'};">${isOverdue ? 'Overdue by ' + Math.abs(daysUntil) + ' days' : daysUntil + ' days left'}</div>` : ''}
                    ${paceIndicator}
                </div>
            </div>
        `;
    }).join('');
};

window.renderSubscriptions = async () => {
    const container = document.getElementById('subscriptions-container');
    if (!container) return;
    
    if (!window.userSubscriptions || window.userSubscriptions.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">No subscriptions tracked yet. Add one to start monitoring!</div>';
        return;
    }
    
    const upcoming14Days = [];
    const upcoming = [];
    const overdue = [];
    const future = [];
    
    window.userSubscriptions.forEach(sub => {
        const nextDate = new Date(sub.next_billing_date);
        const today = new Date();
        const daysUntil = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntil < 0) overdue.push({ ...sub, daysUntil });
        else if (daysUntil <= 14) upcoming14Days.push({ ...sub, daysUntil });
        else future.push({ ...sub, daysUntil });
    });
    
    const allSubs = [...overdue, ...upcoming14Days, ...future];
    
    container.innerHTML = allSubs.map(sub => {
        const nextDate = new Date(sub.next_billing_date);
        const today = new Date();
        const daysUntil = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
        const isOverdue = daysUntil < 0;
        const isUpcoming = daysUntil >= 0 && daysUntil <= 14;
        
        let statusColor = 'var(--text-secondary)';
        let statusText = '';
        if (isOverdue) { statusColor = 'var(--accent-red)'; statusText = 'Overdue'; }
        else if (isUpcoming) { statusColor = 'var(--primary)'; statusText = 'Due soon'; }
        else { statusText = 'Upcoming'; }
        
        return `
            <div class="card" style="padding: 20px; cursor: pointer; border-left: 4px solid ${statusColor};" onclick="window.openSubscriptionModal('${sub.id}')">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                    <div>
                        <h3 style="margin: 0 0 4px 0;">${sub.name}</h3>
                        <span style="font-size: 12px; color: var(--text-secondary);">${sub.category}</span>
                        ${sub.notes ? `<div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">📝 ${sub.notes}</div>` : ''}
                    </div>
                    <span style="font-weight: 600; color: ${statusColor}; font-size: 12px;">${statusText}</span>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <h2 style="margin: 0; font-size: 24px;">${window.formatMoney(sub.amount)}</h2>
                    <span style="font-size: 12px; color: var(--text-secondary);">/ ${sub.billing_cycle}</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary);">
                    <span>Next: ${new Date(sub.next_billing_date).toLocaleDateString()}</span>
                    ${sub.auto_log ? '<span style="color: var(--primary);">Auto-log ✓</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
};

window.deleteGoal = async (goalId) => {
    if (!confirm('Delete this goal?')) return;
    window.userGoals = window.userGoals.filter(g => g.id !== goalId);
    await window.saveGoalsToCloud();
    await window.renderGoals();
    window.closeGoalModal();
};

window.deleteSubscription = async (subId) => {
    if (!confirm('Delete this subscription?')) return;
    window.userSubscriptions = window.userSubscriptions.filter(s => s.id !== subId);
    await window.saveSubscriptionsToCloud();
    await window.renderSubscriptions();
    window.closeSubscriptionModal();
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
    document.getElementById('acc-currency').value = acc.currency || '';
    
    const customGroup = document.getElementById('custom-type-group');
    if (acc.type === 'custom') {
        document.getElementById('acc-custom-type').value = acc.customType || '';
        if (customGroup) customGroup.style.display = 'block';
    } else {
        if (customGroup) customGroup.style.display = 'none';
    }

    const expandSection = document.getElementById('acc-expand-section');
    const expandBtn = document.getElementById('acc-expand-btn');
    if (acc.favorite || acc.currency) {
        if (expandSection) expandSection.style.display = 'block';
        if (expandBtn) expandBtn.innerText = '- Less Options';
    } else {
        if (expandSection) expandSection.style.display = 'none';
        if (expandBtn) expandBtn.innerText = '+ More Options';
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

window.openAccountLedger = (accountId) => {
    const acc = window.accountsData.find(a => a.id === accountId);
    if (!acc) return;

    document.getElementById('ledger-account-name').innerText = acc.name;
    let typeStr = acc.type.charAt(0).toUpperCase() + acc.type.slice(1);
    if (acc.type === 'custom') typeStr = acc.customType || 'Custom';
    document.getElementById('ledger-account-type').innerText = typeStr;

    const balEl = document.getElementById('ledger-account-balance');
    const userCurrencySymbol = window.userSettings?.currency || '₱';
    balEl.style.color = acc.balance < 0 ? 'var(--accent-red)' : 'var(--text)';
    
    const cache = window.getPriceCache ? window.getPriceCache() : {};
    let convertedAmount = acc.balance;
    const accCurrency = acc.currency || (window.userSettings?.currency || '₱').replace('₱', 'PHP');
    const userCurrency = (window.userSettings?.currency || '₱').replace('₱', 'PHP');

    if (accCurrency !== userCurrency) {
        const rate = cache[accCurrency]?.rate || 1;
        convertedAmount = acc.balance * rate;
    }
    balEl.innerText = `${convertedAmount < 0 ? '-' : ''}${window.formatMoneyWithSymbol(Math.abs(convertedAmount), userCurrencySymbol, true)}`;

    const relatedTxs = window.appData.filter(t => {
        if (t.type === 'TRANSFER') {
            return t.account_id === acc.id || t.to_account_id === acc.id;
        }
        return t.account_id === acc.id;
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const listEl = document.getElementById('ledger-transactions-list');
    if (relatedTxs.length === 0) {
        listEl.innerHTML = '<li class="text-muted" style="text-align:center; padding: 32px 0;">No activity recorded for this account.</li>';
    } else {
        listEl.innerHTML = relatedTxs.map(entry => {
            let displayAmt = 0;
            let isPositive = true;
            let desc = entry.name;
            let catHtml = `<span class="tx-cat">${entry.category || 'Uncategorized'}</span>`;

            if (entry.type === 'TRANSFER') {
                if (entry.account_id === acc.id) {
                    displayAmt = entry.amount;
                    isPositive = false;
                    const toAcc = window.accountsData.find(a => a.id === entry.to_account_id)?.name || 'External';
                    desc = entry.name || `Transfer to ${toAcc}`;
                    catHtml = `<span class="tx-cat" style="background: var(--surface-hover); border-color: var(--border);">↗ Sent</span>`;
                } else if (entry.to_account_id === acc.id) {
                    displayAmt = entry.amount;
                    isPositive = true;
                    const fromAcc = window.accountsData.find(a => a.id === entry.account_id)?.name || 'External';
                    desc = entry.name || `Transfer from ${fromAcc}`;
                    catHtml = `<span class="tx-cat" style="background: var(--surface-hover); border-color: var(--border);">↙ Received</span>`;
                }
            } else {
                displayAmt = Math.abs(entry.amount);
                isPositive = entry.amount >= 0;
            }

            const amountColor = (isPositive && displayAmt !== 0) ? 'var(--primary)' : 'var(--text)';
            const sign = isPositive ? '+' : '-';
            const starColor = entry.favorite ? '#FFD700' : 'var(--border)';
            
            const dateObj = new Date(entry.timestamp);
            const timeString = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

            const baseCode = window.getCurrencyCodeFromSymbol(window.userSettings?.currency || '₱');
            let origText = '';
            if (entry.original_currency && entry.original_currency !== baseCode && entry.original_amount !== undefined && entry.original_amount !== null) {
                const origSym = window.getCurrencySymbol(entry.original_currency);
                origText = `<span style="font-size: 11px; color: var(--text-secondary); display: block; margin-top: 2px; font-weight: 400;">(${origSym}${Math.abs(entry.original_amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})</span>`;
            }

            return `
            <li class="tx-item" data-id="${entry._id}" style="padding-right: 8px;" onclick="window.openReceiptModal(${JSON.stringify(entry).replace(/"/g, '&quot;')})">
                <div class="tx-left" style="flex: 1; min-width: 0; overflow: hidden; display: flex; flex-direction: column; margin-right: 12px;">
                    <div style="width: fit-content;">${catHtml}</div>
                    <span class="tx-name" style="display: block; width: 100%; white-space: nowrap; overflow: hidden; -webkit-mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%); mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);">${desc}</span>
                </div>
                <div class="tx-right" style="flex-shrink: 0; text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: center;">
                    <span class="tx-amount" style="color: ${amountColor}; white-space: nowrap;">${sign}${window.formatMoney(displayAmt)}</span>
                    <span class="text-muted" style="font-size: 11px; display: block; margin-top: 2px;">${timeString}</span>
                    ${origText}
                </div>
                <button class="star-btn" style="position: static; padding: 4px; color: ${starColor}; fill: ${starColor}; flex-shrink: 0;" onclick="event.stopPropagation(); window.toggleTxFavorite('${entry.id}', ${entry._id})">
                    <svg class="tx-star" viewBox="0 0 24 24" style="width: 20px; height: 20px; color: inherit; fill: inherit;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                </button>
            </li>`;
        }).join('');
    }

    document.querySelectorAll('.privacy-toggle-btn').forEach(btn => btn.innerHTML = window.getPrivacyIcon());
    document.getElementById('account-ledger-overlay').classList.add('active');
};

window.closeAccountLedger = () => {
    document.getElementById('account-ledger-overlay').classList.remove('active');
};

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
    window.populateAccountDropdowns('exp-account');
    window.setDefaultCurrencyDropdown('exp-currency');
    if(window.setupTxTripToggle) window.setupTxTripToggle('exp');
    if (overlay) overlay.classList.add('active');
};

window.closeExpenseModal = () => {
    const overlay = document.getElementById('expense-overlay');
    if (overlay) overlay.classList.remove('active');
};

window.openIncomeModal = () => {
    const overlay = document.getElementById('income-overlay');
    window.populateAccountDropdowns('inc-account');
    window.setDefaultCurrencyDropdown('inc-currency');
    if(window.setupTxTripToggle) window.setupTxTripToggle('inc');
    if (overlay) overlay.classList.add('active');
};

window.closeIncomeModal = () => {
    const overlay = document.getElementById('income-overlay');
    if (overlay) overlay.classList.remove('active');
};

window.bootUI = () => {
    window.initCurrencyDropdowns();
    window.applySettingsToUI(); 
    window.updateDashboard(); 
    window.populateCategoryFilters();
    window.renderActivity(); 
    window.currentStatRange = '30';
    window.renderStatistics('30'); 
    window.renderBudgetTracking();
    window.renderAccounts();
    window.setupReceiptListeners();
    if(window.renderTripsView) window.renderTripsView();
};

// ==========================================
// TRIPS & EVENTS HUB
// ==========================================

window.getTripDates = (tripId) => {
    const txs = window.appData.filter(t => t.trip_id === tripId);
    if (!txs.length) return 'No logged activity';
    const dates = txs.map(t => new Date(t.timestamp).getTime());
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    if (min.toDateString() === max.toDateString()) return window.formatListDate(min);
    return `${window.formatListDate(min)} — ${window.formatListDate(max)}`;
};

window.tempTripCategories = [];

window.renderTripCategoriesList = () => {
    const list = document.getElementById('trip-categories-list');
    if (!list) return;

    let sum = 0;
    window.tempTripCategories.forEach(c => sum += parseFloat(c.percent) || 0);
    const warning = document.getElementById('trip-budget-warning');
    if(warning) warning.style.display = sum !== 100 ? 'block' : 'none';

    list.innerHTML = window.tempTripCategories.map((c, i) => `
        <li style="display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
            <span style="font-weight: 500;">${c.name}</span>
            <div>
                <span style="margin-right: 16px; color: var(--text-secondary);">${c.percent}%</span>
                <button onclick="window.tempTripCategories.splice(${i}, 1); window.renderTripCategoriesList();" class="text-btn" style="color:var(--accent-red)">Remove</button>
            </div>
        </li>
    `).join('');
};

window.openTravelSetupModal = (tripId = null) => {
    const overlay = document.getElementById('travel-overlay');
    const title = document.getElementById('travel-modal-title');
    const saveBtn = document.getElementById('start-trip-btn');

    const goalSel = document.getElementById('trip-goal-id');
    goalSel.innerHTML = window.userGoals.map(g => `<option value="${g.id}">${g.name} (${window.formatMoney(g.current_amount)})</option>`).join('');

    if (tripId) {
        title.innerText = "Manage Trip";
        saveBtn.innerText = "Save Changes";
        const trip = window.tripsData.find(t => t.id === tripId);
        if (trip) {
            document.getElementById('editing-trip-id').value = tripId;
            document.getElementById('trip-name').value = trip.name || '';
            document.getElementById('trip-budget-type').value = trip.budget_source_type || 'fixed';
            
            document.getElementById('trip-goal-group').style.display = trip.budget_source_type === 'goal' ? 'block' : 'none';
            document.getElementById('trip-fixed-amount-group').style.display = trip.budget_source_type === 'fixed' ? 'block' : 'none';

            if (trip.budget_source_type === 'goal') goalSel.value = trip.budget_source_id;
            if (trip.budget_source_type === 'fixed') document.getElementById('trip-amount').value = trip.fixed_budget_amount;

            window.tempTripCategories = [...(trip.categories || [])];
        }
    } else {
        title.innerText = "Setup Trip Budget";
        saveBtn.innerText = "Save & Start Travel Mode";
        document.getElementById('editing-trip-id').value = '';
        document.getElementById('trip-name').value = '';
        document.getElementById('trip-budget-type').value = 'fixed';
        document.getElementById('trip-fixed-amount-group').style.display = 'block';
        document.getElementById('trip-goal-group').style.display = 'none';
        document.getElementById('trip-amount').value = '';

        window.tempTripCategories = [
            { name: 'ACCOMMODATION', percent: 30 },
            { name: 'FOOD', percent: 30 },
            { name: 'TRANSPORT', percent: 20 },
            { name: 'ACTIVITIES', percent: 20 }
        ];
    }
    
    window.renderTripCategoriesList();
    overlay.classList.add('active');
};

window.renderTripsView = (forceShowPast = false) => {
    const container = document.getElementById('trips-content-container');
    if (!container) return;

    if (!window.tripsData || window.tripsData.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 60px 20px;">
                <h3 style="margin-bottom: 12px; font-size: 24px;">Welcome to Travel Mode ✈️</h3>
                <p class="text-muted" style="margin-bottom: 24px; max-width: 500px; margin-left: auto; margin-right: auto; line-height: 1.6;">
                    Travels and events often break your standard budget. By starting a Trip, you can completely isolate vacation expenses from your daily averages and fund them via specific savings goals.
                </p>
                <button class="primary-btn" onclick="window.openTravelSetupModal()">Start your first Trip</button>
            </div>
        `;
        return;
    }

    const activeTrip = window.tripsData.find(t => t.id === window.userSettings.activeTripId);

    if (activeTrip && !forceShowPast) {
        const txs = window.appData.filter(t => t.trip_id === activeTrip.id);
        
        // Sum expenses natively via `sum - t.amount` (correctly deducting refunds)
        const spent = txs.filter(t => t.type !== 'TRANSFER' && !(t.type || '').toUpperCase().includes('INCOM'))
                         .reduce((sum, t) => sum - (parseFloat(t.amount) || 0), 0);
        
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const spentToday = txs.filter(t => t.type !== 'TRANSFER' && !(t.type || '').toUpperCase().includes('INCOM') && new Date(t.timestamp) >= todayStart)
                            .reduce((sum, t) => sum - (parseFloat(t.amount) || 0), 0);
        let limit = 0;
        let limitSourceText = '';

        if (activeTrip.budget_source_type === 'fixed') {
            limit = parseFloat(activeTrip.fixed_budget_amount) || 0;
            limitSourceText = 'Fixed Allowance';
        } else if (activeTrip.budget_source_type === 'goal') {
            const goal = window.userGoals.find(g => g.id === activeTrip.budget_source_id);
            limit = goal ? parseFloat(goal.target_amount) : 0;
            limitSourceText = goal ? `Goal: ${goal.name}` : 'Goal Wallet';
        } else {
            limit = txs.filter(t => (t.type || '').toUpperCase().includes('INCOM'))
                       .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
            limitSourceText = 'Income Logged to Trip';
        }

        const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : (spent > 0 ? 100 : 0);
        const overTotal = limit > 0 && spent > limit;
        const color = overTotal ? 'var(--accent-red)' : 'var(--primary)';
        
        const remaining = limit - spent;
        const remText = remaining >= 0 ? `${window.formatMoney(remaining, true)} Left` : `${window.formatMoney(Math.abs(remaining), true)} Over`;

        const catProgressHtml = (activeTrip.categories || []).map(cat => {
            const allocated = limit * (parseFloat(cat.percent) / 100);    
            const catSpent = txs.filter(t => t.type !== 'TRANSFER' && !(t.type || '').toUpperCase().includes('INCOM') && (t.category || '').toUpperCase() === cat.name.toUpperCase())
                                .reduce((sum, t) => sum - (parseFloat(t.amount) || 0), 0);
            const catPct = allocated > 0 ? (catSpent / allocated) * 100 : (catSpent > 0 ? 100 : 0);
            const over = catPct > 100;
            const cColor = over ? 'var(--accent-red)' : 'var(--primary)';

            return `
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                        <span style="font-weight: 600;">${cat.name} <span style="font-weight:400; color:var(--text-secondary)">(${cat.percent}%)</span></span>
                        <span style="font-weight: 700; color: ${cColor};">${window.formatMoney(catSpent, true)} <span style="font-weight:400; color:var(--text-secondary)">/ ${window.formatMoney(allocated, true)}</span></span>
                    </div>
                    <div style="width: 100%; height: 6px; background-color: var(--border); border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${Math.min(catPct, 100)}%; background-color: ${cColor}; transition: width 0.3s ease;"></div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h3 style="color: var(--primary);">Currently Traveling</h3>
                <button class="secondary-btn" onclick="window.renderTripsView(true)" style="padding: 6px 12px; font-size: 12px;">View Past Trips</button>
            </div>
            
            <div class="card" style="margin-bottom: 24px; border: 2px solid var(--primary);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
                    <div>
                        <h2 style="margin-bottom: 4px; font-size: 24px;">${activeTrip.name}</h2>
                        <p class="text-muted" style="font-size: 13px;">${window.getTripDates(activeTrip.id)}</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="secondary-btn" onclick="window.openTravelSetupModal('${activeTrip.id}')" style="padding: 6px 12px; font-size: 12px;">Edit Setup</button>
                        <button id="end-trip-btn-dashboard" class="secondary-btn" style="padding: 6px 12px; font-size: 12px; border-color: var(--accent-red); color: var(--accent-red);">End Trip</button>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px;">
                    <div style="background: var(--bg); padding: 16px; border-radius: 12px;">
                        <p class="text-muted" style="font-size: 12px; margin-bottom: 4px;">Total Budget</p>
                        <h3 style="margin-bottom: 4px;">${window.formatMoney(limit, true)}</h3>
                        <p class="text-muted" style="font-size: 11px;">${limitSourceText}</p>
                    </div>
                    <div style="background: var(--bg); padding: 16px; border-radius: 12px;">
                        <p class="text-muted" style="font-size: 12px; margin-bottom: 4px;">Total Spent</p>
                        <h3 style="color: ${color};">${window.formatMoney(spent, true)}</h3>
                    </div>
                    <div style="background: var(--bg); padding: 16px; border-radius: 12px;">
                        <p class="text-muted" style="font-size: 12px; margin-bottom: 4px;">Remaining</p>
                        <h3 style="color: ${color};">${remText}</h3>
                    </div>
                    <div style="background: var(--bg); padding: 16px; border-radius: 12px;">
                        <p class="text-muted" style="font-size: 12px; margin-bottom: 4px;">Spent Today</p>
                        <h3 style="color: ${spentToday > 0 ? 'var(--accent-red)' : 'var(--text)'};">${window.formatMoney(spentToday, true)}</h3>
                    </div>
                </div>
                
                <h4 style="margin-bottom: 16px; font-size: 14px;">Category Progress</h4>
                ${catProgressHtml || '<span class="text-muted" style="font-size: 13px;">No categories configured.</span>'}
            </div>
            
            <h3 style="margin-bottom: 16px;">Trip Activity</h3>
            <div class="card">
                <ul id="trip-activity-list" class="minimal-list interactive-list">
                    ${txs.length ? txs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10).map(window.generateTxHTML).join('') : '<li class="text-muted">No activity logged.</li>'}
                </ul>
            </div>
        `;

        document.getElementById('end-trip-btn-dashboard')?.addEventListener('click', async () => {
            if(!confirm("End this trip? You will return to your standard budget constraints.")) return;
            await window.supabase.from('settings').update({ active_trip_id: null }).eq('user_id', window.currentUser.id);
            await window.supabase.from('trips').update({ status: 'completed' }).eq('id', window.userSettings.activeTripId);
            window.userSettings.activeTripId = null;
            window.bootUI();
        });

        const tripLogsList = document.getElementById('trip-activity-list');
        if (tripLogsList) {
            tripLogsList.addEventListener('click', (e) => {
                const li = e.target.closest('.tx-item');
                if (li) {
                    const entryId = parseInt(li.getAttribute('data-id'));
                    const entry = window.appData.find(x => x._id === entryId);
                    if (entry) window.openReceiptModal(entry);
                }
            });
        }

        return;
    }

    const pastTrips = window.tripsData.filter(t => t.status !== 'active' || forceShowPast).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    
    let html = '';
    if (forceShowPast && activeTrip) {
        html += `<button class="text-btn" onclick="window.renderTripsView(false)" style="margin-bottom: 24px;">← Back to Active Trip</button>`;
    }

    if (pastTrips.length === 0) {
        html += `<p class="text-muted" style="text-align: center; padding: 40px;">No trip history found.</p>`;
    } else {
        html += `<div style="display: flex; flex-direction: column; gap: 16px;">` + pastTrips.map(trip => {
            const txs = window.appData.filter(t => t.trip_id === trip.id);
            const spent = txs.filter(t => t.type !== 'TRANSFER' && !(t.type || '').toUpperCase().includes('INCOM'))
                             .reduce((sum, t) => sum - (parseFloat(t.amount) || 0), 0);
            const isActiveLabel = trip.status === 'active' ? `<span style="color:var(--primary); font-size:12px; font-weight:700; margin-left:8px;">(Active)</span>` : '';
            
            return `
                <div class="card" style="display: flex; flex-direction: column; gap: 16px; padding: 20px; border-left: 4px solid var(--primary);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <h3 style="margin-bottom: 4px;">${trip.name} ${isActiveLabel}</h3>
                            <p class="text-muted" style="font-size: 13px;">${window.getTripDates(trip.id)}</p>
                        </div>
                        <div style="text-align: right;">
                            <p class="text-muted" style="font-size: 12px; margin-bottom: 2px;">Total Spent</p>
                            <h4 style="font-size: 18px; color: var(--primary);">${window.formatMoney(spent, true)}</h4>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 8px; border-top: 1px solid var(--border); padding-top: 16px; flex-wrap: wrap;">
                        <button class="primary-btn" style="flex: 1; min-width: 120px; font-size: 13px;" onclick="window.openTripInsights('${trip.id}')">✨ View Insights</button>
                        <button class="secondary-btn" style="flex: 1; min-width: 120px; font-size: 13px;" onclick="window.openTripDetails('${trip.id}')">📊 Budget & Logs</button>
                        <button class="icon-btn" style="color: var(--text-secondary);" onclick="window.openTravelSetupModal('${trip.id}')" title="Edit Setup">✎</button>
                        <button class="icon-btn" style="color: var(--accent-red);" onclick="window.openDeleteTripModal('${trip.id}', '${trip.name.replace(/'/g, "\\'")}')" title="Delete">✕</button>
                    </div>
                </div>
            `;
        }).join('') + `</div>`;
    }

    container.innerHTML = html;
};

window.openDeleteTripModal = (tripId, tripName) => {
    window.tripToDeleteId = tripId;
    document.getElementById('delete-trip-name-display').innerText = tripName;
    document.getElementById('delete-trip-overlay').classList.add('active');
};

window.closeDeleteTripModal = () => {
    document.getElementById('delete-trip-overlay').classList.remove('active');
    window.tripToDeleteId = null;
};

// --- TRIP DETAILS MODAL ---
window.openTripDetails = (tripId) => {
    const trip = window.tripsData.find(t => t.id === tripId);
    if (!trip) return;

    const overlay = document.getElementById('trip-details-overlay');
    const card = overlay.querySelector('.modal-card');
    
    // Make background opaque & lock z-index properly
    if (card) { card.style.background = 'var(--surface, #ffffff)'; card.style.position = 'relative'; card.style.zIndex = '100'; }
    const receiptOverlay = document.getElementById('receipt-overlay');
    if (receiptOverlay) receiptOverlay.style.zIndex = '9999';

    const txs = window.appData.filter(t => t.trip_id === tripId);
    const spent = txs.filter(t => t.type !== 'TRANSFER' && !(t.type || '').toUpperCase().includes('INCOM'))
                     .reduce((sum, t) => sum - (parseFloat(t.amount) || 0), 0);
    
    let limit = 0;
    if (trip.budget_source_type === 'fixed') limit = parseFloat(trip.fixed_budget_amount) || 0;
    else if (trip.budget_source_type === 'goal') {
        const goal = window.userGoals.find(g => g.id === trip.budget_source_id);
        limit = goal ? parseFloat(goal.target_amount) : 0;
    } else {
        limit = txs.filter(t => (t.type || '').toUpperCase().includes('INCOM'))
                   .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    }

    const remaining = limit - spent;
    
    const dates = txs.map(t => new Date(t.timestamp).setHours(0,0,0,0));
    const uniqueDates = [...new Set(dates)];
    const numDays = Math.max(1, uniqueDates.length);
    const avgDaily = spent / numDays;

    document.getElementById('details-trip-name').innerText = trip.name;
    document.getElementById('details-trip-dates').innerText = window.getTripDates(tripId);
    document.getElementById('details-trip-budget').innerText = window.formatMoney(limit, true);
    
    const spentEl = document.getElementById('details-trip-spent');
    spentEl.innerText = window.formatMoney(spent, true);
    spentEl.style.color = (limit > 0 && spent > limit) ? 'var(--accent-red)' : 'var(--primary)';

    const remEl = document.getElementById('details-trip-left');
    remEl.innerText = window.formatMoney(Math.abs(remaining), true) + (remaining < 0 ? ' Over' : ' Left');
    remEl.style.color = remaining < 0 ? 'var(--accent-red)' : 'var(--text)';
    
    document.getElementById('details-trip-avg').innerText = window.formatMoney(avgDaily, true) + '/day';

    const catHtml = (trip.categories || []).map(cat => {
        const allocated = limit * (parseFloat(cat.percent) / 100);
        const catSpent = txs.filter(t => t.type !== 'TRANSFER' && !(t.type || '').toUpperCase().includes('INCOM') && (t.category || '').toUpperCase() === cat.name.toUpperCase())
                            .reduce((sum, t) => sum - (parseFloat(t.amount) || 0), 0);
        const catPct = allocated > 0 ? (catSpent / allocated) * 100 : (catSpent > 0 ? 100 : 0);
        const over = catPct > 100;
        const cColor = over ? 'var(--accent-red)' : 'var(--primary)';

        return `
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                    <span style="font-weight: 600;">${cat.name}</span>
                    <span style="font-weight: 700; color: ${cColor};">${window.formatMoney(catSpent, true)} / ${window.formatMoney(allocated, true)}</span>
                </div>
                <div style="width: 100%; height: 6px; background-color: var(--border); border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: ${Math.min(catPct, 100)}%; background-color: ${cColor}; transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
    }).join('');
    document.getElementById('details-trip-categories').innerHTML = catHtml || '<p class="text-muted">No categories configured.</p>';

    const logsList = document.getElementById('details-trip-logs');
    if (txs.length) {
        logsList.innerHTML = txs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).map(window.generateTxHTML).join('');
        logsList.onclick = (e) => {
            const li = e.target.closest('.tx-item');
            if (li) {
                const entryId = parseInt(li.getAttribute('data-id'));
                const entry = window.appData.find(x => x._id === entryId);
                if (entry) window.openReceiptModal(entry);
            }
        };
    } else {
        logsList.innerHTML = '<li class="text-muted">No activity logged.</li>';
    }

    overlay.classList.add('active');
};

// --- SPOTIFY WRAPPED INSIGHTS ---
window.currentInsightSlide = 0;
window.totalInsightSlides = 0;
window.isNavigatingInsights = false;

window.toggleWrappedCensor = () => {
    const isCensored = document.getElementById('censor-insights-toggle')?.checked;
    document.querySelectorAll('.wrapped-money').forEach(el => {
        el.innerText = isCensored ? '••••••' : el.getAttribute('data-raw');
    });
};

const wrappedMoney = (amount) => {
    const formatted = window.formatMoney(amount, true);
    const isCensored = document.getElementById('censor-insights-toggle')?.checked;
    return `<span class="wrapped-money" data-raw="${formatted}">${isCensored ? '••••••' : formatted}</span>`;
};

window.openTripInsights = (tripId) => {
    // Dynamically inject CSS once to ensure slides render correctly
    if (!document.getElementById('wrapped-dynamic-styles')) {
        const style = document.createElement('style');
        style.id = 'wrapped-dynamic-styles';
        style.innerHTML = `
            .wrapped-container { width: 100%; max-width: 400px; aspect-ratio: 9/16; max-height: 85vh; border-radius: 20px; position: relative; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; margin: 0 auto; background: #111; }
            .wrapped-slide { position: absolute; inset: 0; display: none; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 32px; color: #fff; z-index: 2; box-sizing: border-box; }
            .wrapped-slide.active { display: flex !important; animation: slideUpFade 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
            .wrapped-shape { position: absolute; opacity: 0.15; pointer-events: none; }
            .shape-circle { width: 150px; height: 150px; border-radius: 50%; background: #fff; top: -40px; right: -40px; }
            .shape-square { width: 200px; height: 200px; background: #fff; transform: rotate(45deg); bottom: -80px; left: -80px; }
            .shape-triangle { width: 0; height: 0; border-left: 90px solid transparent; border-right: 90px solid transparent; border-bottom: 180px solid #fff; top: 15%; left: -40px; transform: rotate(20deg); }
            @keyframes slideUpFade { 0% { opacity: 0; transform: translateY(30px) scale(0.95); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
            .watermark { position: absolute; bottom: 20px; left: 0; width: 100%; text-align: center; font-size: 12px; opacity: 0.7; z-index: 10; letter-spacing: 3px; font-weight: 600; color: white; text-shadow: 0 1px 4px rgba(0,0,0,0.6); }
            .wrapped-value { font-size: 42px; font-weight: 900; line-height: 1.1; margin: 20px 0; letter-spacing: -1.5px; text-shadow: 0 4px 15px rgba(0,0,0,0.3); }
            .wrapped-label { font-size: 15px; font-weight: 700; opacity: 0.85; text-transform: uppercase; letter-spacing: 2px; }
            .wrapped-sub { font-size: 18px; font-weight: 500; opacity: 0.95; margin-bottom: 8px; line-height: 1.4; }
            .wrapped-list-item { font-size: 16px; font-weight: 700; display: flex; justify-content: space-between; width: 100%; border-bottom: 1px solid rgba(255,255,255,0.25); padding: 12px 0; }
            .wrapped-list-item span:last-child { font-weight: 500; opacity: 0.8; text-align: right; }
            .wrapped-list-item:last-child { border-bottom: none; }
        `;
        document.head.appendChild(style);
    }

    // Inject Censor Toggle Button into DOM
    if (!document.getElementById('censor-insights-container')) {
        const overlayDiv = document.querySelector('#trip-insights-overlay > div');
        if (overlayDiv) {
            const toggleHtml = `
                <div id="censor-insights-container" style="display:flex; align-items:center; gap: 8px; margin-top: 16px; color: white; z-index: 10;">
                    <input type="checkbox" id="censor-insights-toggle" onchange="window.toggleWrappedCensor()" style="width: 16px; height: 16px; cursor: pointer;">
                    <label for="censor-insights-toggle" style="font-size: 14px; cursor: pointer;">Hide Amounts (Censor)</label>
                </div>
            `;
            overlayDiv.insertAdjacentHTML('beforeend', toggleHtml);
        }
    }

    const trip = window.tripsData.find(t => t.id === tripId);
    if (!trip) return;

    const captureArea = document.getElementById('wrapped-capture-area');
    if (captureArea) {
        let headerEl = document.getElementById('wrapped-card-header');
        if (!headerEl) {
            headerEl = document.createElement('div');
            headerEl.id = 'wrapped-card-header';
            // Positioned at the top, z-index 20 keeps it above slides, gradient ensures text readability
            headerEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; padding: 24px 20px; box-sizing: border-box; display: flex; justify-content: space-between; align-items: flex-start; z-index: 20; background: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%); pointer-events: none;';
            captureArea.appendChild(headerEl); 
        }
        
        // Grab user profile data (with fallbacks)
        const avatarUrl = window.currentUser?.user_metadata?.avatar_url || 'https://ui-avatars.com/api/?name=' + (window.userProfile?.username || 'U') + '&background=random';
        const username = window.userProfile?.username || 'User';

        headerEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${avatarUrl}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.2);">
                <span style="font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.95); text-shadow: 0 1px 3px rgba(0,0,0,0.8);">@${username}</span>
            </div>
            <div style="text-align: right; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
                <h4 style="margin: 0; font-size: 15px; font-weight: 800; color: white;">${trip.name}</h4>
                <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.8);">Trip Insights</span>
            </div>
        `;
    }

    // Grab strict expenses (no incomes, no transfers)
    const expenses = window.appData.filter(t => t.trip_id === tripId && t.type !== 'TRANSFER' && !(t.type || '').toUpperCase().includes('INCOM'));
    
    if (expenses.length === 0) {
        alert("Not enough expense data to generate insights for this trip!");
        return;
    }

    const totalSpent = expenses.reduce((sum, t) => sum - (parseFloat(t.amount) || 0), 0);
    const avgTxValue = totalSpent / Math.max(1, expenses.length);
    
    const dates = expenses.map(t => new Date(t.timestamp).setHours(0,0,0,0));
    const numDays = Math.max(1, [...new Set(dates)].length);
    const avgDaily = totalSpent / numDays;

    let limit = trip.budget_source_type === 'fixed' ? (parseFloat(trip.fixed_budget_amount) || 0) : 
                trip.budget_source_type === 'goal' ? (parseFloat(window.userGoals.find(g => g.id === trip.budget_source_id)?.target_amount) || 0) :
                window.appData.filter(t => t.trip_id === tripId && (t.type || '').toUpperCase().includes('INCOM')).reduce((sum, t) => sum + (parseFloat(t.amount)||0), 0);

    const largestTx = expenses.reduce((max, t) => Math.abs(t.amount) > Math.abs(max.amount) ? t : max, expenses[0]);

// Grouping Helper (safely removing trails, preserving original case and hyphens)
    const groupItems = (items, key) => {
            const counts = {}; const sums = {}; const sampleName = {};
            items.forEach(t => {
                let raw = t[key];
                if (!raw) return;
                
                let displayClean = raw.trim();
                
                // Only clean trailing numbers for names/merchants, NOT dates
                if (key !== 'dateStr') {
                    // Removes endings like " - 1", " 2", " #3" but preserves "MNL-HKG" and "7-11"
                    displayClean = displayClean.replace(/\s+(?:-\s*\d+|#\d+|\d+)$/, '').trim();
                }
                
                if (displayClean === '') displayClean = 'Unknown';
                
                // Group mathematically using uppercase
                let norm = displayClean.toUpperCase();
                
                counts[norm] = (counts[norm] || 0) + 1;
                sums[norm] = (sums[norm] || 0) - (parseFloat(t.amount) || 0); 
                
                // Save the first properly-cased version we encounter
                if (!sampleName[norm]) sampleName[norm] = displayClean; 
            });
            return { counts, sums, sampleName };
    };

    const groupedMerchants = groupItems(expenses, 'merchant');
    const topMerchants = Object.entries(groupedMerchants.counts).sort((a,b) => b[1] - a[1]);
    
    const groupedCats = groupItems(expenses, 'category');
    const topCats = Object.entries(groupedCats.sums).sort((a,b) => b[1] - a[1]);

    // Hall of fame logic: Top item globally + top items in other categories
    const itemsByCategory = {};
    expenses.forEach(t => {
        const cat = t.category || 'Uncategorized';
        if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
        itemsByCategory[cat].push(t);
    });

    const topItemPerCat = [];
    for (const cat in itemsByCategory) {
        const grouped = groupItems(itemsByCategory[cat], 'name');
        let topItem = null; let maxVal = -1;
        for (const name in grouped.sums) {
            if (grouped.sums[name] > maxVal) { maxVal = grouped.sums[name]; topItem = grouped.sampleName[name]; }
        }
        if (topItem) topItemPerCat.push({ cat, name: topItem, amount: maxVal });
    }
    topItemPerCat.sort((a,b) => b.amount - a.amount);
    
    const overallTopItem = topItemPerCat.length > 0 ? topItemPerCat[0] : null;
    const runnerUps = topItemPerCat.length > 1 ? topItemPerCat.slice(1, 4) : [];

    // Timeline logic
    const txsWithMetrics = expenses.map(t => {
        const d = new Date(t.timestamp);
        return {
            ...t, 
            dateStr: d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}),
            isWeekend: (d.getDay() === 0 || d.getDay() === 6),
            hour: d.getHours()
        }
    });

    const topDaysCount = Object.entries(groupItems(txsWithMetrics, 'dateStr').counts).sort((a,b) => b[1] - a[1]);
    const topDaysAmount = Object.entries(groupItems(txsWithMetrics, 'dateStr').sums).sort((a,b) => b[1] - a[1]);
    const weekendPct = Math.round((txsWithMetrics.filter(t => t.isWeekend).reduce((sum, t) => sum - (parseFloat(t.amount)||0), 0) / totalSpent) * 100);

    let slides = [];

    // Slide 1: Welcome & Total (with top 3 categories highlighted)
    let catListHtml = topCats.slice(0, 3).map((c) => `<span style="display:inline-block; background:rgba(0,0,0,0.2); padding: 4px 12px; border-radius: 12px; margin: 4px; font-size: 13px;">${groupedCats.sampleName[c[0]] || c[0]}</span>`).join('');
    slides.push(`
            <div class="wrapped-slide active" style="background: linear-gradient(45deg, #FF416C, #FF4B2B);">
                <div class="wrapped-shape shape-circle"></div><div class="wrapped-shape shape-triangle"></div>
                <p class="wrapped-label">Your Trip Unwrapped</p>
                <h2 class="wrapped-value" style="font-size:32px;">${trip.name}</h2>
                <h2 class="wrapped-value" style="color: #FFD700; margin-top: 0;">${wrappedMoney(totalSpent)}</h2>
                <p class="wrapped-sub">across <b>${expenses.length}</b> transactions.</p>
                <div style="margin-top: 16px;">${catListHtml}</div>
            </div>
    `);

    // Slide 2: Hall of Fame (Most spent on item + top items in other categories)
    if (overallTopItem) {
        let runnerUpHtml = runnerUps.length > 0 ? runnerUps.map(r => `<div class="wrapped-list-item" style="padding: 8px 0; font-size:14px;"><span>${r.name} <span style="font-size:11px; opacity:0.6; display:block;">${r.cat}</span></span><span>${wrappedMoney(r.amount)}</span></div>`).join('') : '';
        slides.push(`
            <div class="wrapped-slide" style="background: linear-gradient(135deg, #8E2DE2, #4A00E0);">
                <div class="wrapped-shape shape-square"></div>
                <p class="wrapped-label">The Hall of Fame</p>
                <p class="wrapped-sub" style="font-size:14px;">You spent the most on:</p>
                <h2 class="wrapped-value" style="font-size:28px;">${overallTopItem.name}</h2>
                <p style="color: #FFD700; font-weight:bold; font-size:20px;">${wrappedMoney(overallTopItem.amount)} <span style="opacity:0.7; font-weight:normal; font-size:14px;">(${overallTopItem.cat})</span></p>
                ${runnerUpHtml ? `<div style="width:100%; margin-top:24px; text-align:left;"><p class="wrapped-sub" style="font-size:13px; border-bottom:1px solid rgba(255,255,255,0.3); padding-bottom:8px;">Top Spends in Other Categories:</p>${runnerUpHtml}</div>` : ''}
            </div>
        `);
    }

    // Slide 3: Velocity / Average
    slides.push(`
        <div class="wrapped-slide" style="background: linear-gradient(225deg, #00B4DB, #0083B0);">
            <div class="wrapped-shape shape-circle" style="bottom:-40px; top:auto;"></div>
            <p class="wrapped-label">The Pace</p>
            <p class="wrapped-sub">You were burning through</p>
            <h2 class="wrapped-value">${wrappedMoney(avgDaily)}</h2>
            <p class="wrapped-sub">every single day for ${numDays} days.</p>
        </div>
    `);

    // Slide 4: Budget Check
    if (limit > 0) {
        const pct = Math.round((totalSpent / limit) * 100);
        slides.push(`
            <div class="wrapped-slide" style="background: linear-gradient(45deg, #f12711, #f5af19);">
                <div class="wrapped-shape shape-triangle" style="transform: rotate(180deg);"></div>
                <p class="wrapped-label">The Budget Check</p>
                <h2 class="wrapped-value">${pct}%</h2>
                <p class="wrapped-sub">of your ${wrappedMoney(limit)} budget was consumed.</p>
                <p style="font-size: 14px; margin-top: 16px;">${pct > 100 ? "Whoops... you went a little overboard! 💸" : "Great job staying within limits! 🏆"}</p>
            </div>
        `);
    }

    // Slide 4.5: NEW Category Overview (Counts vs Amounts)
        const topCatsCount = Object.entries(groupedCats.counts).sort((a,b) => b[1] - a[1]).slice(0, 5);
        const topCatsSum = Object.entries(groupedCats.sums).sort((a,b) => b[1] - a[1]).slice(0, 5);

        let topCatsCountHtml = topCatsCount.map((c, i) => `<div class="wrapped-list-item" style="font-size:13px; padding: 4px 0;"><span>#${i+1} ${groupedCats.sampleName[c[0]] || c[0]}</span><span>${c[1]}x</span></div>`).join('');
        let topCatsSumHtml = topCatsSum.map((c, i) => `<div class="wrapped-list-item" style="font-size:13px; padding: 4px 0;"><span>#${i+1} ${groupedCats.sampleName[c[0]] || c[0]}</span><span>${wrappedMoney(c[1])}</span></div>`).join('');

        slides.push(`
            <div class="wrapped-slide" style="background: linear-gradient(135deg, #11998e, #38ef7d);">
                <div class="wrapped-shape shape-square" style="transform: rotate(15deg);"></div>
                <p class="wrapped-label">Category Breakdown</p>
                
                <div style="width: 100%; text-align: left; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px; margin-bottom: 12px; margin-top: 16px;">
                    <p style="font-size:11px; opacity:0.8; text-transform:uppercase; margin-bottom:8px; font-weight:bold;">Most Frequent (Swipes)</p>
                    ${topCatsCountHtml}
                </div>
                
                <div style="width: 100%; text-align: left; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px;">
                    <p style="font-size:11px; opacity:0.8; text-transform:uppercase; margin-bottom:8px; font-weight:bold;">Highest Spend (Amount)</p>
                    ${topCatsSumHtml}
                </div>
            </div>
        `);

// Dynamic Category Deep Dives (Filter Count > 1)
        const sortedCats = Object.entries(groupedCats.sums).sort((a,b) => b[1] - a[1]);
        sortedCats.forEach((catEntry, idx) => {
            const catKey = catEntry[0];
            const catTotal = catEntry[1];
            const catName = groupedCats.sampleName[catKey] || catKey; // FIX: Pull original casing
            
            const catTxs = itemsByCategory[catName] || expenses.filter(e => (e.category||'').toUpperCase() === catKey);
            
            // FIX: Isolate grouping to pull out the sampleName properly
            const catMerchGroup = groupItems(catTxs, 'merchant');
            const catMerchants = Object.entries(catMerchGroup.counts).filter(m => m[1] > 1).sort((a,b) => b[1] - a[1]).slice(0, 3);
            
            const catItemGroup = groupItems(catTxs, 'name');
            const catItems = Object.entries(catItemGroup.counts).filter(i => i[1] > 1).sort((a,b) => b[1] - a[1]).slice(0, 3);
                
            // Don't render a slide if the category is totally barren of repeat transactions
            if (catMerchants.length === 0 && catItems.length === 0) return;

            let merchHtml = catMerchants.length ? catMerchants.map((m, i) => `<div class="wrapped-list-item" style="font-size:14px; padding: 6px 0;"><span>#${i+1} ${catMerchGroup.sampleName[m[0]] || m[0]}</span><span>${m[1]}x</span></div>`).join('') : '<p style="font-size:13px; opacity:0.6;">No repeat merchants</p>';
            let itemHtml = catItems.length ? catItems.map((item, i) => `<div class="wrapped-list-item" style="font-size:14px; padding: 6px 0;"><span>#${i+1} ${catItemGroup.sampleName[item[0]] || item[0]}</span><span>${item[1]}x</span></div>`).join('') : '<p style="font-size:13px; opacity:0.6;">No repeat items</p>';

            const bgColors = [
                'linear-gradient(135deg, #11998e, #38ef7d)', 'linear-gradient(45deg, #FF0099, #493240)', 'linear-gradient(135deg, #b92b27, #1565C0)',
                'linear-gradient(45deg, #FF8008, #FFA081)', 'linear-gradient(135deg, #1D976C, #93F9B9)', 'linear-gradient(45deg, #4CB8C4, #3CD3AD)'
            ];
            const bgActive = bgColors[idx % bgColors.length];

            slides.push(`
                <div class="wrapped-slide" style="background: ${bgActive};">
                    <div class="wrapped-shape shape-square" style="opacity:0.1; top:-50px; right:-50px; left:auto;"></div>
                    <p class="wrapped-label">By Category</p>
                    <h2 class="wrapped-value" style="font-size: 32px; margin-bottom: 4px;">${catName}</h2>
                    <p class="wrapped-sub" style="font-size: 14px; margin-bottom: 24px;">Total: ${wrappedMoney(catTotal)}</p>
                    
                    <div style="width: 100%; text-align: left; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px; margin-bottom: 12px;">
                        <p style="font-size:12px; opacity:0.8; text-transform:uppercase; margin-bottom:8px; font-weight:bold;">Top Merchants</p>
                        ${merchHtml}
                    </div>
                    
                    <div style="width: 100%; text-align: left; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px;">
                        <p style="font-size:12px; opacity:0.8; text-transform:uppercase; margin-bottom:8px; font-weight:bold;">Top Items</p>
                        ${itemHtml}
                    </div>
                </div>
            `);
        });
        
    // Slide 6: Biggest Flex (Largest Tx)
    slides.push(`
        <div class="wrapped-slide" style="background: linear-gradient(135deg, #7F00FF, #E100FF);">
            <div class="wrapped-shape shape-square" style="transform: rotate(15deg);"></div>
            <p class="wrapped-label">The Big Flex</p>
            <p class="wrapped-sub">Your single heaviest swipe:</p>
            <h2 class="wrapped-value">${wrappedMoney(Math.abs(largestTx.amount))}</h2>
            <p class="wrapped-sub">on ${largestTx.name}</p>
        </div>
    `);

    // Slide 7: Most Expensive Day vs Busiest Day
    if (topDaysAmount.length > 0 && topDaysCount.length > 0) {
        slides.push(`
            <div class="wrapped-slide" style="background: linear-gradient(135deg, #b92b27, #1565C0);">
                <div class="wrapped-shape shape-square" style="top: -50px; left: auto; right: -50px;"></div>
                <p class="wrapped-label">Timeline</p>
                <div style="margin: 24px 0;">
                    <p class="wrapped-sub" style="font-size: 14px;">Most Expensive Day</p>
                    <h3 style="font-size: 24px; font-weight: 800;">${topDaysAmount[0][0]}</h3>
                    <p style="font-size: 13px; opacity: 0.8;">${wrappedMoney(topDaysAmount[0][1])} spent</p>
                </div>
                <div style="margin: 24px 0;">
                    <p class="wrapped-sub" style="font-size: 14px;">Busiest Day</p>
                    <h3 style="font-size: 24px; font-weight: 800;">${topDaysCount[0][0]}</h3>
                    <p style="font-size: 13px; opacity: 0.8;">${topDaysCount[0][1]} transactions</p>
                </div>
            </div>
        `);
    }

// Slide 7.5: Frequent Flyers (Top Merchant per Category, Top 5 Overall)
// Slide 7.5: Frequent Flyers (Top Merchant per Category, Top 5 Overall, Branch Merging)
        const topMerchantsPerCat = [];

        // 1. Find the most visited merchant in each category
        for (const cat in itemsByCategory) {
            const catTxs = itemsByCategory[cat];
            
            // Custom grouping specifically for this slide to merge branches
            const branchCounts = {};
            const branchSums = {};
            const branchNames = {};
            
            catTxs.forEach(t => {
                if (!t.merchant) return;
                
                // Safely grab the base name before any " - " (e.g., "FamilyMart - 1" -> "FamilyMart")
                // This will not break "MNL-HKG" because there are no spaces around that hyphen.
                let baseName = t.merchant.split(' - ')[0].trim();
                if (!baseName) return;
                
                let norm = baseName.toUpperCase();
                branchCounts[norm] = (branchCounts[norm] || 0) + 1;
                branchSums[norm] = (branchSums[norm] || 0) - (parseFloat(t.amount) || 0);
                
                // Save original casing for the UI
                if (!branchNames[norm]) branchNames[norm] = baseName;
            });
            
            let topMerch = null;
            let maxCount = 0;
            
            for (const mKey in branchCounts) {
                if (branchCounts[mKey] > maxCount) {
                    maxCount = branchCounts[mKey];
                    topMerch = {
                        name: branchNames[mKey],
                        count: maxCount,
                        amount: branchSums[mKey],
                        category: cat
                    };
                }
            }
            
            // 2. Only include if visited more than once (kills the 1-transaction bug)
            if (topMerch && topMerch.count > 1) {
                topMerchantsPerCat.push(topMerch);
            }
        }

        // 3. Sort these category champions by visit count and take the top 5
        const frequentMerchants = topMerchantsPerCat
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        if (frequentMerchants.length > 0) {
            let freqHtml = frequentMerchants.map((m, i) => {
                return `
                    <div class="wrapped-list-item" style="padding: 12px 0;">
                        <div>
                            <span style="font-size: 15px; display: block;">#${i+1} ${m.name}</span>
                            <span style="font-size: 11px; opacity: 0.7; font-weight: normal;">${m.category}</span>
                        </div>
                        <div style="text-align: right;">
                            <span style="display: block; font-weight: 800; font-size: 16px;">${m.count} visits</span>
                            <span style="font-size: 12px; opacity: 0.7;">${wrappedMoney(m.amount)} total</span>
                        </div>
                    </div>`;
            }).join('');

            slides.push(`
                <div class="wrapped-slide" style="background: linear-gradient(135deg, #f2709c, #ff9472);">
                    <div class="wrapped-shape shape-circle" style="width: 200px; height: 200px; top: -80px; right: auto; left: -80px;"></div>
                    <p class="wrapped-label">Frequent Flyers</p>
                    <p class="wrapped-sub" style="margin-bottom: 24px; font-size: 14px;">Your top destinations across categories:</p>
                    <div style="width: 100%; text-align: left; background: rgba(0,0,0,0.2); padding: 16px; border-radius: 12px;">
                        ${freqHtml}
                    </div>
                </div>
            `);
        }

        
    // Slide 8: Habits
    slides.push(`
        <div class="wrapped-slide" style="background: linear-gradient(45deg, #FF8008, #FFA081);">
            <div class="wrapped-shape shape-triangle"></div>
            <p class="wrapped-label">Habits</p>
            <p class="wrapped-sub" style="margin-bottom: 24px;">You dropped ${weekendPct}% of your money on the Weekend.</p>
            <h3 style="font-size: 24px; margin: 12px 0;">${wrappedMoney(avgTxValue)} avg/tx</h3>
            <p style="font-size: 13px; opacity: 0.8;">That's your average swipe value.</p>
        </div>
    `);

    // Slide 9: Outro
    slides.push(`
        <div class="wrapped-slide" style="background: linear-gradient(135deg, #1D976C, #93F9B9);">
            <div class="wrapped-shape shape-circle"></div>
            <p class="wrapped-label">That's a Wrap!</p>
            <h2 class="wrapped-value">End of Trip.</h2>
            <p class="wrapped-sub" style="margin-top:20px; font-size:14px; color:#111;">Hope the memories were worth it!</p>
        </div>
    `);

    const slidesContainer = document.getElementById('wrapped-slides-container');
    slidesContainer.innerHTML = slides.join('');

    window.currentInsightSlide = 0;
    window.totalInsightSlides = slides.length;
    
    document.getElementById('insights-prev-btn').style.display = 'block';
    document.getElementById('insights-next-btn').style.display = 'block';
    window.updateInsightProgressBars();

    document.getElementById('trip-insights-overlay').classList.add('active');
};

window.updateInsightProgressBars = () => {
    const pBarContainer = document.getElementById('wrapped-progress-bar');
    if (!pBarContainer) return;
    let pBars = '';
    for (let i = 0; i < window.totalInsightSlides; i++) {
        const bg = i <= window.currentInsightSlide ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.3)';
        pBars += `<div style="flex: 1; height: 4px; border-radius: 2px; background: ${bg}; transition: background 0.3s ease;"></div>`;
    }
    pBarContainer.innerHTML = pBars;
};

// Debounce navigation to prevent double advancing
window.navigateInsights = (direction) => {
    if (window.isNavigatingInsights) return;
    window.isNavigatingInsights = true;
    setTimeout(() => { window.isNavigatingInsights = false; }, 400);

    const slides = document.querySelectorAll('.wrapped-slide');
    if (!slides.length) return;

    slides.forEach(s => s.classList.remove('active'));
    
    window.currentInsightSlide += direction;
    if (window.currentInsightSlide < 0) window.currentInsightSlide = window.totalInsightSlides - 1;
    if (window.currentInsightSlide >= window.totalInsightSlides) window.currentInsightSlide = 0;
    
    slides[window.currentInsightSlide].classList.add('active');
    window.updateInsightProgressBars();
};

window.closeInsights = () => {
    document.getElementById('trip-insights-overlay').classList.remove('active');
};

window.shareInsights = () => {
    if (typeof html2canvas === 'undefined') return alert("Image engine still loading.");
    
    const captureArea = document.getElementById('wrapped-capture-area');
    if(!captureArea) return;

    const origRadius = captureArea.style.borderRadius;
    captureArea.style.borderRadius = "0px";
    
    html2canvas(captureArea, { scale: 2, useCORS: true, backgroundColor: null }).then(canvas => {
        captureArea.style.borderRadius = origRadius;
        const link = document.createElement('a');
        link.download = `Trip_Insight_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png'); 
        link.click();
    }).catch(err => {
        captureArea.style.borderRadius = origRadius;
        console.error("Could not generate insight image", err);
        alert("Failed to generate image to share.");
    });
};


// ==========================================
// 2. DOM EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    window.setupAutocomplete('exp-name', 'name');
    window.setupAutocomplete('exp-merchant', 'merchant');
    window.setupAutocomplete('inc-name', 'name');
    window.setupAutocomplete('edit-tx-name', 'name');
    window.setupAutocomplete('edit-tx-merchant', 'merchant');

    window.openGoalModal = (goalId = null) => {
        const modal = document.getElementById('goal-overlay');
        const title = document.getElementById('goal-modal-title');
        const deleteBtn = document.getElementById('delete-goal-btn');
        if (!modal) return;
        
        if (goalId) {
            title.innerText = 'Edit Goal';
            const goal = window.userGoals.find(g => g.id === goalId);
            if (goal) {
                document.getElementById('goal-name').value = goal.name;
                document.getElementById('goal-target').value = goal.target_amount;
                document.getElementById('goal-current').value = goal.current_amount;
                document.getElementById('goal-deadline').value = goal.deadline || '';
                document.getElementById('goal-status').value = goal.status;
                document.getElementById('goal-color').value = goal.theme_color;
                deleteBtn.style.display = 'block';
                deleteBtn.onclick = () => window.deleteGoal(goalId);
            }
        } else {
            title.innerText = 'New Goal';
            document.getElementById('goal-name').value = '';
            document.getElementById('goal-target').value = '';
            document.getElementById('goal-current').value = '';
            document.getElementById('goal-deadline').value = '';
            document.getElementById('goal-status').value = 'Active';
            document.getElementById('goal-color').value = '#00D26A';
            deleteBtn.style.display = 'none';
        }
        modal.classList.add('active');
    };
    
    window.closeGoalModal = () => {
        const modal = document.getElementById('goal-overlay');
        if (modal) modal.classList.remove('active');
    };
    
    window.openSubscriptionModal = (subId = null) => {
        const modal = document.getElementById('subscription-overlay');
        const title = document.getElementById('subscription-modal-title');
        const deleteBtn = document.getElementById('delete-sub-btn');
        if (!modal) return;
        
        if (subId) {
            title.innerText = 'Edit Subscription';
            const sub = window.userSubscriptions.find(s => s.id === subId);
            if (sub) {
                document.getElementById('sub-name').value = sub.name;
                document.getElementById('sub-amount').value = sub.amount;
                document.getElementById('sub-category').value = sub.category;
                document.getElementById('sub-cycle').value = sub.billing_cycle;
                document.getElementById('sub-next-date').value = sub.next_billing_date;
                document.getElementById('sub-notes').value = sub.notes || '';
                document.getElementById('sub-auto-log').checked = sub.auto_log;
                deleteBtn.style.display = 'block';
                deleteBtn.onclick = () => window.deleteSubscription(subId);
            }
        } else {
            title.innerText = 'New Subscription';
            document.getElementById('sub-name').value = '';
            document.getElementById('sub-amount').value = '';
            document.getElementById('sub-category').value = '';
            document.getElementById('sub-cycle').value = 'Monthly';
            document.getElementById('sub-next-date').value = '';
            document.getElementById('sub-notes').value = '';
            document.getElementById('sub-auto-log').checked = false;
            deleteBtn.style.display = 'none';
        }
        modal.classList.add('active');
    };
    
    window.closeSubscriptionModal = () => {
        const modal = document.getElementById('subscription-overlay');
        if (modal) modal.classList.remove('active');
    };

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
            window.userSettings.defaultAccountBehavior = document.getElementById('setting-default-acc-behavior')?.value || 'blank';
            window.userSettings.defaultAccountId = document.getElementById('setting-default-acc-custom')?.value || null;

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

    document.getElementById('allocate-goals-btn')?.addEventListener('click', () => window.openGoalAllocationModal());

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

    document.querySelectorAll('.nav-btn, .nav-proxy').forEach(btn => {
        btn.addEventListener('click', async () => {
            const target = btn.getAttribute('data-target');
            window.switchView(target);
            
            if (target === 'goals') {
                await window.renderGoals();
            } else if (target === 'subscriptions') {
                await window.renderSubscriptions();
            } else if (target === 'trips') {
                window.renderTripsView();
            }
        });
    });

    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
    if (toggleFiltersBtn) {
        toggleFiltersBtn.addEventListener('click', () => {
            const panel = document.getElementById('advanced-filters-panel');
            if(panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
    }

    ['search-input', 'filter-date-start', 'filter-date-end', 'filter-amount-min', 'filter-amount-max', 'filter-type', 'filter-trip'].forEach(id => {
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

    const expandBtn = document.getElementById('acc-expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const section = document.getElementById('acc-expand-section');
            const isVisible = section.style.display !== 'none';
            section.style.display = isVisible ? 'none' : 'block';
            expandBtn.innerText = isVisible ? '+ More Options' : '- Less Options';
        });
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
        document.getElementById('acc-currency').value = '';
        document.getElementById('acc-custom-type').value = '';
        
        const customGroup = document.getElementById('custom-type-group');
        if (customGroup) customGroup.style.display = 'none';
        
        const expandSection = document.getElementById('acc-expand-section');
        if (expandSection) expandSection.style.display = 'none';
        
        const expandBtn = document.getElementById('acc-expand-btn');
        if (expandBtn) expandBtn.innerText = '+ More Options';
        
        const saveBtn = document.getElementById('save-account-btn');
        if (saveBtn) saveBtn.innerText = 'Save Account';
        
        const overlay = document.getElementById('account-overlay');
        if(overlay) overlay.classList.add('active');
    });

    const saveAccBtn = document.getElementById('save-account-btn');
    if (saveAccBtn) {
        saveAccBtn.addEventListener('click', async () => {
            const typeValue = document.getElementById('acc-type')?.value || 'bank';
            
            const accData = {
                name: document.getElementById('acc-name')?.value || 'Unnamed',
                type: typeValue,
                balance: parseFloat(document.getElementById('acc-balance')?.value) || 0,
                color: document.getElementById('acc-color')?.value || '#00D26A',
                note: document.getElementById('acc-note')?.value || '',
                favorite: document.getElementById('acc-favorite')?.checked || false,
                currency: document.getElementById('acc-currency')?.value?.toUpperCase() || ''
            };
            
            if (typeValue === 'custom') {
                accData.customType = document.getElementById('acc-custom-type')?.value || 'Custom';
            } else {
                accData.customType = null; 
            }
            
            if (window.editingAccountIndex !== undefined) {
                accData.id = window.accountsData[window.editingAccountIndex].id;
                window.accountsData[window.editingAccountIndex] = accData;
            } else {
                accData.id = window.generateUUID();
                window.accountsData.push(accData);
            }
            
            await window.saveAccountsToCloud();
            
            ['acc-name','acc-balance','acc-note','acc-custom-type','acc-currency'].forEach(id => { 
                const el = document.getElementById(id); 
                if(el) el.value = ''; 
            });
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
        const accountId = document.getElementById('exp-account').value || null;
        
        const isTrip = document.getElementById('exp-is-trip')?.checked;
        const tripId = isTrip ? document.getElementById('exp-trip-id')?.value : null;

        if (!name || !amount || isNaN(amount)) {
            alert('Please fill in Name and Amount');
            return;
        }

        const selCur = document.getElementById('exp-currency').value;
        const baseCur = window.getCurrencyCodeFromSymbol(window.userSettings?.currency || '₱');
        let finalAmount = amount;
        let exchangeRate = 1;
        
        if (selCur !== baseCur) {
            finalAmount = window.convertCurrency(amount, selCur, baseCur);
            exchangeRate = finalAmount / amount;
        }
        localStorage.setItem('lastUsedCurrency', selCur);

        const transaction = {
            user_id: window.currentUser.id,
            fingerprint: `${new Date().toISOString()}_${name}_${amount}`,
            type: 'EXPENDITURE',
            category: category,
            name: name,
            amount: -finalAmount,          
            original_currency: selCur,     
            original_amount: -amount,      
            exchange_rate: exchangeRate,   
            notes: notes,
            merchant: merchant,
            account_id: accountId,
            trip_id: tripId,
            timestamp: new Date().toISOString()
        };

        const { error } = await window.supabase.from('transactions').insert([transaction]);
        if (error) {
            console.error('Error saving expense:', error);
            alert('Error saving expense');
        } else {
            if (accountId) {
                const accIndex = window.accountsData.findIndex(a => a.id === accountId);
                if (accIndex !== -1) {
                    const targetAcc = window.accountsData[accIndex];
                    const accCur = targetAcc.currency || baseCur;
                    
                    let amountToDeduct = amount; 
                    if (selCur !== accCur) {
                        amountToDeduct = window.convertCurrency(amount, selCur, accCur);
                    }
                    
                    targetAcc.balance -= amountToDeduct;
                    await window.saveAccountsToCloud();
                }
            }

            if (tripId) {
                const trip = window.tripsData?.find(t => t.id === tripId);
                if (trip && trip.budget_source_type === 'goal') {
                    const goal = window.userGoals.find(g => g.id === trip.budget_source_id);
                    if (goal) {
                        goal.current_amount -= finalAmount;
                        await window.saveGoalsToCloud();
                        if(window.renderGoalsWidget) window.renderGoalsWidget();
                    }
                }
            }

            window.closeExpenseModal();
            document.getElementById('exp-name').value = '';
            document.getElementById('exp-amount').value = '';
            document.getElementById('exp-merchant').value = '';
            document.getElementById('exp-notes').value = '';
            await window.loadCloudData();
            window.updateDashboard();
            window.renderBudgetTracking();
            window.renderActivity?.();
            if(window.renderTripsView && window.userSettings.activeTripId) window.renderTripsView();
        }
    });

    document.getElementById('save-income-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('inc-name').value.trim();
        const amount = parseFloat(document.getElementById('inc-amount').value);
        const category = document.getElementById('inc-category').value || 'INCOME';
        const notes = document.getElementById('inc-notes').value.trim() || '';
        const accountId = document.getElementById('inc-account').value || null;
        
        const isTrip = document.getElementById('inc-is-trip')?.checked;
        const tripId = isTrip ? document.getElementById('inc-trip-id')?.value : null;

        if (!name || !amount || isNaN(amount)) {
            alert('Please fill in Name and Amount');
            return;
        }

        const selCur = document.getElementById('inc-currency').value;
        const baseCur = window.getCurrencyCodeFromSymbol(window.userSettings?.currency || '₱');
        let finalAmount = amount;
        let exchangeRate = 1;
        
        if (selCur !== baseCur) {
            finalAmount = window.convertCurrency(amount, selCur, baseCur);
            exchangeRate = finalAmount / amount;
        }
        localStorage.setItem('lastUsedCurrency', selCur);

        const transaction = {
            user_id: window.currentUser.id,
            fingerprint: `${new Date().toISOString()}_${name}_${amount}`,
            type: 'INCOMING',
            category: category,
            name: name,
            amount: finalAmount,           
            original_currency: selCur,     
            original_amount: amount,      
            exchange_rate: exchangeRate,   
            notes: notes,
            account_id: accountId,
            trip_id: tripId,
            timestamp: new Date().toISOString()
        };

        const { error } = await window.supabase.from('transactions').insert([transaction]);
        if (error) {
            console.error('Error saving income:', error);
            alert('Error saving income');
        } else {
            if (accountId) {
                const accIndex = window.accountsData.findIndex(a => a.id === accountId);
                if (accIndex !== -1) {
                    const targetAcc = window.accountsData[accIndex];
                    const accCur = targetAcc.currency || baseCur;
                    
                    let amountToAdd = amount;
                    if (selCur !== accCur) {
                        amountToAdd = window.convertCurrency(amount, selCur, accCur);
                    }
                    
                    targetAcc.balance += amountToAdd;
                    await window.saveAccountsToCloud();
                }
            }

            if (tripId) {
                const trip = window.tripsData?.find(t => t.id === tripId);
                if (trip && trip.budget_source_type === 'goal') {
                    const goal = window.userGoals.find(g => g.id === trip.budget_source_id);
                    if (goal) {
                        goal.current_amount += finalAmount;
                        await window.saveGoalsToCloud();
                        if(window.renderGoalsWidget) window.renderGoalsWidget();
                    }
                }
            }

            window.closeIncomeModal();
            document.getElementById('inc-name').value = '';
            document.getElementById('inc-amount').value = '';
            document.getElementById('inc-notes').value = '';
            await window.loadCloudData();
            window.updateDashboard();
            window.renderBudgetTracking();
            window.renderActivity?.();
            if(window.renderTripsView && window.userSettings.activeTripId) window.renderTripsView();
        }
    });

    document.getElementById('save-transfer-btn')?.addEventListener('click', async () => {
        const amount = parseFloat(document.getElementById('transfer-amount').value);
        const fromId = document.getElementById('transfer-from').value || null;
        const toId = document.getElementById('transfer-to').value || null;
        const notes = document.getElementById('transfer-notes').value.trim();

        if (!amount || isNaN(amount) || amount <= 0) return alert("Enter a valid amount.");
        if (!fromId && !toId) return alert("You must select at least one internal account.");
        if (fromId === toId) return alert("Cannot transfer to the same account.");

        const selCur = document.getElementById('transfer-currency').value;
        const baseCur = window.getCurrencyCodeFromSymbol(window.userSettings?.currency || '₱');
        let finalAmount = amount;
        let exchangeRate = 1;
        
        if (selCur !== baseCur) {
            finalAmount = window.convertCurrency(amount, selCur, baseCur);
            exchangeRate = finalAmount / amount;
        }
        localStorage.setItem('lastUsedCurrency', selCur);

        const transaction = {
            user_id: window.currentUser.id,
            fingerprint: `${new Date().toISOString()}_transfer_${amount}`,
            type: 'TRANSFER',
            category: 'TRANSFER',
            name: notes || 'Account Ledger Transfer',
            amount: finalAmount,           
            original_currency: selCur,     
            original_amount: amount,      
            exchange_rate: exchangeRate,   
            notes: notes,
            account_id: fromId,
            to_account_id: toId,
            timestamp: new Date().toISOString()
        };

        const { error } = await window.supabase.from('transactions').insert([transaction]);
        if (error) return alert('Error saving transfer');

        if (fromId) {
            const fromAcc = window.accountsData.find(a => a.id === fromId);
            if (fromAcc) {
                const fromCur = fromAcc.currency || baseCur;
                let deductAmt = amount;
                if (selCur !== fromCur) deductAmt = window.convertCurrency(amount, selCur, fromCur);
                fromAcc.balance -= deductAmt;
            }
        }
        if (toId) {
            const toAcc = window.accountsData.find(a => a.id === toId);
            if (toAcc) {
                const toCur = toAcc.currency || baseCur;
                let addAmt = amount;
                if (selCur !== toCur) addAmt = window.convertCurrency(amount, selCur, toCur);
                toAcc.balance += addAmt;
            }
        }

        if (fromId || toId) await window.saveAccountsToCloud();

        window.closeTransferModal();
        await window.loadCloudData();
        window.bootUI();
    });

    document.getElementById('dashboard-metric-selector')?.addEventListener('change', (e) => {
        window.dashboardMetric = e.target.value;
        window.updateDashboard();
    });

    const importBtn = document.getElementById('import-btn');
    if (importBtn) {
        importBtn.addEventListener('click', async () => {
            const fileInput = document.getElementById('csv-file-input');
            const statusMsg = document.getElementById('import-status');
            if(!fileInput || !statusMsg) return;

            const file = fileInput.files[0];
            
            if (file) {
                let confirmed;
                if (typeof window.showConfirmation === 'function') {
                    confirmed = await window.showConfirmation(
                        'Import Transactions?',
                        `This will import and merge "${file.name}" with your existing activity records.\n\nContinue?`
                    );
                } else {
                    confirmed = confirm(`This will import and merge "${file.name}" with your existing activity records?\n\nContinue?`);
                }
                
                if (!confirmed) {
                    statusMsg.innerText = "Import cancelled.";
                    statusMsg.style.color = "var(--text-secondary)";
                    return;
                }

                statusMsg.innerText = "Processing Data..."; 
                statusMsg.style.color = "var(--text)";
                
                const reader = new FileReader();
                reader.onload = async (e) => {
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
                                const year = ts.getFullYear();
                                const month = String(ts.getMonth() + 1).padStart(2, '0');
                                const day = String(ts.getDate()).padStart(2, '0');
                                const hours = String(ts.getHours()).padStart(2, '0');
                                const minutes = String(ts.getMinutes()).padStart(2, '0');
                                const seconds = String(ts.getSeconds()).padStart(2, '0');
                                const newTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                                resolvedData.push({ ...item, timestamp: newTimestamp });
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
            } else {
                let confirmed;
                if (typeof window.showConfirmation === 'function') {
                    confirmed = await window.showConfirmation(
                        'Sync Data to Cloud?',
                        'This will upload your accounts, goals, subscriptions and settings to Supabase.'
                    );
                } else {
                    confirmed = confirm('Sync data to cloud? This will upload your accounts, goals, subscriptions and settings to Supabase.');
                }
                
                if (!confirmed) {
                    statusMsg.innerText = "Sync cancelled.";
                    statusMsg.style.color = "var(--text-secondary)";
                    return;
                }

                statusMsg.innerText = "Syncing data..."; 
                statusMsg.style.color = "var(--text)";
                
                try {
                    await window.saveAccountsToCloud();
                    await window.saveGoalsToCloud();
                    await window.saveSubscriptionsToCloud();
                    await window.saveSettingsToCloud();
                    
                    statusMsg.innerText = "✓ All data synced to cloud successfully!";
                    statusMsg.style.color = "var(--primary)";
                    
                    setTimeout(() => {
                        statusMsg.innerText = "";
                    }, 3000);
                } catch (error) {
                    console.error('Sync error:', error);
                    statusMsg.innerText = "Error syncing data. Please try again.";
                    statusMsg.style.color = "var(--accent-red)";
                }
            }
        });
    }

    document.getElementById('save-goal-btn')?.addEventListener('click', async () => {
        const goalId = document.getElementById('goal-modal-title').innerText.includes('Edit') 
            ? window.userGoals.find(g => g.name === document.getElementById('goal-name').value)?.id
            : null;
        
        const goalData = {
            name: document.getElementById('goal-name').value,
            target_amount: parseFloat(document.getElementById('goal-target').value) || 0,
            current_amount: parseFloat(document.getElementById('goal-current').value) || 0,
            deadline: document.getElementById('goal-deadline').value || null,
            status: document.getElementById('goal-status').value,
            theme_color: document.getElementById('goal-color').value
        };
        
        if (!goalData.name.trim()) { alert('Goal name is required'); return; }
        if (goalData.target_amount <= 0) { alert('Target amount must be greater than 0'); return; }
        
        if (goalId) {
            const idx = window.userGoals.findIndex(g => g.id === goalId);
            if (idx >= 0) window.userGoals[idx] = { ...window.userGoals[idx], ...goalData };
        } else {
            window.userGoals.push({
                id: crypto.randomUUID?.() || 'goal-' + Date.now(),
                user_id: window.currentUser?.id,
                ...goalData,
                created_at: new Date().toISOString()
            });
        }
        
        await window.saveGoalsToCloud();
        await window.renderGoals();
        window.closeGoalModal();
    });
    
    document.getElementById('save-sub-btn')?.addEventListener('click', async () => {
        const subId = document.getElementById('subscription-modal-title').innerText.includes('Edit')
            ? window.userSubscriptions.find(s => s.name === document.getElementById('sub-name').value)?.id
            : null;
        
        const subData = {
            name: document.getElementById('sub-name').value,
            amount: parseFloat(document.getElementById('sub-amount').value) || 0,
            category: document.getElementById('sub-category').value,
            billing_cycle: document.getElementById('sub-cycle').value,
            next_billing_date: document.getElementById('sub-next-date').value,
            notes: document.getElementById('sub-notes').value,
            auto_log: document.getElementById('sub-auto-log').checked
        };
        
        if (!subData.name.trim()) { alert('Subscription name is required'); return; }
        if (subData.amount <= 0) { alert('Amount must be greater than 0'); return; }
        if (!subData.next_billing_date) { alert('Next billing date is required'); return; }
        
        if (subId) {
            const idx = window.userSubscriptions.findIndex(s => s.id === subId);
            if (idx >= 0) window.userSubscriptions[idx] = { ...window.userSubscriptions[idx], ...subData };
        } else {
            window.userSubscriptions.push({
                id: crypto.randomUUID?.() || 'sub-' + Date.now(),
                user_id: window.currentUser?.id,
                ...subData,
                created_at: new Date().toISOString()
            });
        }
        
        await window.saveSubscriptionsToCloud();
        await window.renderSubscriptions();
        window.closeSubscriptionModal();
    });
    
    const addGoalBtn = document.getElementById('add-goal-btn');
    const addSubBtn = document.getElementById('add-subscription-btn');
    
    if (addGoalBtn) {
        addGoalBtn.addEventListener('click', () => window.openGoalModal());
    }
    if (addSubBtn) {
        addSubBtn.addEventListener('click', () => window.openSubscriptionModal());
    }
    
    document.getElementById('goal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'goal-overlay') window.closeGoalModal();
    });
    document.getElementById('subscription-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'subscription-overlay') window.closeSubscriptionModal();
    });
    document.getElementById('goal-allocation-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'goal-allocation-overlay') window.closeGoalAllocationModal();
    });
    
    // Close Trip Details when clicking outside
    document.getElementById('trip-details-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'trip-details-overlay') e.target.classList.remove('active');
    });

    // Handle insight clicks safely via delegated bounds check
    document.getElementById('wrapped-capture-area')?.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // Do not trigger on internal buttons
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < rect.width / 2) window.navigateInsights(-1);
        else window.navigateInsights(1);
    });
    
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('main-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    
    if (mobileMenuBtn && sidebar && backdrop) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.add('mobile-open');
            backdrop.classList.add('active');
        });
        
        backdrop.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            backdrop.classList.remove('active');
        });
    }

    // --- TRAVEL MODE LISTENERS ---

    document.getElementById('add-trip-cat-btn')?.addEventListener('click', () => {
        const nameEl = document.getElementById('new-trip-cat-name'); 
        const pctEl = document.getElementById('new-trip-cat-pct');
        if(!nameEl || !pctEl) return;

        const name = nameEl.value.trim().toUpperCase();
        const pct = parseFloat(pctEl.value);
        
        if(name && pct > 0) {
            const existing = window.tempTripCategories.find(c => c.name.toUpperCase() === name);
            if (existing) existing.percent = pct;
            else window.tempTripCategories.push({ name, percent: pct });
            
            nameEl.value = ''; pctEl.value = '';
            window.renderTripCategoriesList();
        }
    });
    
    document.getElementById('travel-mode-btn')?.addEventListener('click', () => {
        if (window.userSettings.activeTripId) {
            window.switchView('trips');
        } else {
            window.openTravelSetupModal();
        }
    });

    document.getElementById('trip-budget-type')?.addEventListener('change', (e) => {
        const type = e.target.value;
        document.getElementById('trip-fixed-amount-group').style.display = type === 'fixed' ? 'block' : 'none';
        document.getElementById('trip-goal-group').style.display = type === 'goal' ? 'block' : 'none';
    });

    document.getElementById('start-trip-btn')?.addEventListener('click', async () => {
        const editingId = document.getElementById('editing-trip-id').value;
        const name = document.getElementById('trip-name').value.trim();
        const bType = document.getElementById('trip-budget-type').value;
        const fixedAmt = document.getElementById('trip-amount').value;
        const goalId = document.getElementById('trip-goal-id').value;

        if(!name) return alert("Trip name required");
        let sum = 0; window.tempTripCategories.forEach(c => sum += parseFloat(c.percent) || 0);
        if (window.tempTripCategories.length > 0 && Math.round(sum) !== 100) {
            return alert("Category percentages must add up to exactly 100%.");
        }

        const payload = {
            user_id: window.currentUser.id,
            name: name,
            budget_source_type: bType,
            budget_source_id: (bType === 'goal' && goalId) ? goalId : null,
            fixed_budget_amount: bType === 'fixed' ? (parseFloat(fixedAmt) || 0) : 0,
            status: 'active',
            categories: window.tempTripCategories
        };

        if (editingId) {
            const { error } = await window.supabase.from('trips').update(payload).eq('id', editingId);
            if(error) return alert("Failed to update trip: " + error.message);
            const tIdx = window.tripsData.findIndex(t => t.id === editingId);
            if(tIdx > -1) window.tripsData[tIdx] = { ...window.tripsData[tIdx], ...payload };
        } else {
            const { data, error } = await window.supabase.from('trips').insert(payload).select().single();
            if(error) return alert("Failed to start trip: " + error.message);
            if(!window.tripsData) window.tripsData = [];
            window.tripsData.push(data);
            window.userSettings.activeTripId = data.id;
            await window.supabase.from('settings').update({ active_trip_id: data.id }).eq('user_id', window.currentUser.id);
        }
        
        document.getElementById('travel-overlay').classList.remove('active');
        window.bootUI();
    });

    document.getElementById('stats-include-travel')?.addEventListener('change', () => {
        window.renderStatistics(window.currentStatRange);
    });

    window.setupTxTripToggle = (prefix, overrideTripId = undefined) => {
        const isTripCb = document.getElementById(`${prefix}-is-trip`);
        const tripSel = document.getElementById(`${prefix}-trip-id`);
        
        const catSelectId = prefix === 'edit' ? 'edit-tx-category' : `${prefix}-category`;
        const catSelect = document.getElementById(catSelectId);
        
        if (!isTripCb || !tripSel || !catSelect) return;

        tripSel.innerHTML = (window.tripsData || []).map(t => `<option value="${t.id}">${t.name} (${t.status})</option>`).join('');
        
        let targetTripId = overrideTripId !== undefined ? overrideTripId : window.userSettings.activeTripId;
        if (targetTripId === 'null' || targetTripId === '') targetTripId = null;

        if (targetTripId) {
            isTripCb.checked = true;
            tripSel.style.display = 'block';
            tripSel.value = targetTripId;
        } else {
            isTripCb.checked = false;
            tripSel.style.display = 'none';
        }

        const updateCategories = () => {
            catSelect.innerHTML = '';
            
            let isIncomeTx = false;
            if (prefix === 'inc') isIncomeTx = true;
            if (prefix === 'edit' && window.currentEditingTransaction) {
                isIncomeTx = (window.currentEditingTransaction.type || '').toUpperCase().includes('INCOM');
            }

            if (isTripCb.checked && tripSel.value && !isIncomeTx) {
                const trip = window.tripsData.find(t => t.id === tripSel.value);
                if (trip && trip.categories && trip.categories.length) {
                    trip.categories.forEach(c => {
                        const opt = document.createElement('option'); opt.value = c.name; opt.innerText = c.name; catSelect.appendChild(opt);
                    });
                    return; 
                }
            }
            
            const baseCategories = isIncomeTx 
                ? (window.userSettings.incomeCategories || [])
                : (window.userSettings.categories?.map(c => c.name) || []);
            
            baseCategories.forEach(c => {
                const opt = document.createElement('option'); opt.value = c; opt.innerText = c; catSelect.appendChild(opt);
            });
        };
        
        isTripCb.onchange = (e) => { tripSel.style.display = e.target.checked ? 'block' : 'none'; updateCategories(); };
        tripSel.onchange = updateCategories;
        updateCategories(); 
    };

    const origExp = window.openExpenseModal;
    window.openExpenseModal = () => { origExp(); if(window.setupTxTripToggle) window.setupTxTripToggle('exp'); };
    const origInc = window.openIncomeModal;
    window.openIncomeModal = () => { origInc(); if(window.setupTxTripToggle) window.setupTxTripToggle('inc'); };
    
    // ==========================================
    // GOAL ALLOCATION FUNCTIONS
    // ==========================================
    
    window.openGoalAllocationModal = async () => {
        const modal = document.getElementById('goal-allocation-overlay');
        if (!modal || !window.userGoals || window.userGoals.length === 0) {
            alert('Create at least one goal first!');
            return;
        }
        
        const activeGoals = window.userGoals.filter(g => g.status === 'Active');
        if (activeGoals.length === 0) {
            alert('No active goals. Create or activate a goal first!');
            return;
        }
        
        const list = document.getElementById('goal-allocation-list');
        list.innerHTML = activeGoals.map(goal => {
            const currentPercent = window.getAllocationPercentForGoal(goal.id) || 0;
            return `
                <div style="margin-bottom: 20px; padding: 16px; background: var(--border); border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                        <label style="font-weight: 500;">${goal.name}</label>
                        <input type="number" value="${currentPercent}" min="0" max="100" class="goal-allocation-input" data-goal-id="${goal.id}" style="width: 60px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; text-align: right;" onchange="window.updateGoalAllocationDisplay()">
                        <span style="width: 40px; text-align: right; font-weight: 600;" class="goal-allocation-display">${currentPercent}%</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: var(--text-secondary); border-radius: 4px; overflow: hidden; opacity: 0.3;">
                        <div class="goal-allocation-bar" style="height: 100%; width: ${currentPercent}%; background: ${goal.theme_color}; transition: width 0.2s;"></div>
                    </div>
                </div>
            `;
        }).join('');
        
        modal.classList.add('active');
        window.updateGoalAllocationDisplay();
    };
    
    window.closeGoalAllocationModal = () => {
        const modal = document.getElementById('goal-allocation-overlay');
        if (modal) modal.classList.remove('active');
    };
    
    window.updateGoalAllocationDisplay = () => {
        let total = 0;
        document.querySelectorAll('.goal-allocation-input').forEach(input => {
            const percent = parseInt(input.value) || 0;
            input.parentElement.querySelector('.goal-allocation-display').innerText = `${percent}%`;
            input.parentElement.querySelector('.goal-allocation-bar').style.width = `${percent}%`;
            total += percent;
        });
        
        document.getElementById('total-allocated-percent').innerText = `${total}%`;
        document.getElementById('total-allocated-bar').style.width = `${Math.min(100, total)}%`;
    };
    
    window.equalSplitGoals = () => {
        const activeGoals = window.userGoals.filter(g => g.status === 'Active');
        const equalPercent = Math.floor(100 / activeGoals.length);
        
        document.querySelectorAll('.goal-allocation-input').forEach((input, idx) => {
            input.value = idx === activeGoals.length - 1 
                ? 100 - (equalPercent * (activeGoals.length - 1))
                : equalPercent;
        });
        
        window.updateGoalAllocationDisplay();
    };
    
    window.saveGoalAllocations = async () => {
        document.querySelectorAll('.goal-allocation-input').forEach(input => {
            const goalId = input.getAttribute('data-goal-id');
            const percent = parseInt(input.value) || 0;
            window.setGoalAllocation(goalId, Math.max(0, Math.min(100, percent)));
        });
        
        await window.saveSettingsToCloud();
        alert('Allocations saved! Your savings will now be distributed across these goals.');
        window.closeGoalAllocationModal();
    };

    document.getElementById('confirm-delete-trip-btn')?.addEventListener('click', async () => {
        const tripId = window.tripToDeleteId;
        const revertBalances = document.getElementById('delete-trip-revert-balances').checked;
        if (!tripId) return;

        try {
            const txsToRevert = window.appData.filter(t => t.trip_id === tripId);
            
            if (revertBalances) {
                let accountsChanged = false;
                txsToRevert.forEach(tx => {
                    if (tx.account_id) {
                        const acc = window.accountsData.find(a => a.id === tx.account_id);
                        if (acc) {
                            acc.balance -= tx.amount; 
                            accountsChanged = true;
                        }
                    }
                });
                if (accountsChanged) await window.saveAccountsToCloud();
            }

            await window.supabase.from('transactions').delete().eq('trip_id', tripId);
            await window.supabase.from('trips').delete().eq('id', tripId);

            window.appData = window.appData.filter(t => t.trip_id !== tripId);
            window.tripsData = window.tripsData.filter(t => t.id !== tripId);

            if (window.userSettings.activeTripId === tripId) {
                window.userSettings.activeTripId = null;
                await window.supabase.from('settings').update({ active_trip_id: null }).eq('user_id', window.currentUser.id);
                document.body.classList.remove('travel-theme');
            }

            window.closeDeleteTripModal();
            window.bootUI();
        } catch (e) {
            console.error("Failed to delete trip:", e);
            alert("An error occurred while deleting the trip.");
        }
    });

});