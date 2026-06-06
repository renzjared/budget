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

    // close sidebar on mobile after clicking a link
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
    
    tx.favorite = !tx.favorite; // Toggle locally
    window.updateDashboard();
    if(window.renderActivity) window.renderActivity();
    
    // Save to Cloud
    const { error } = await window.supabase.from('transactions').update({ favorite: tx.favorite }).eq('id', dbId);
    if (error) {
        console.error("Error updating favorite status", error);
        tx.favorite = !tx.favorite; // Revert on failure
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

    // 1. Favorites (Starred)
    const favorites = window.appData.filter(t => t.favorite);
    const uniqueFavs = []; const favSet = new Set();
    favorites.forEach(f => {
        const key = `${f.name}_${f.amount}`;
        if (!favSet.has(key)) { favSet.add(key); uniqueFavs.push(f); }
    });
    favContainer.innerHTML = uniqueFavs.length ? uniqueFavs.slice(0, 8).map(createChip).join('') : '<span class="text-muted" style="font-size: 12px;">No favorites yet. Click the star icon on any transaction in your Activity list.</span>';

    // 2. Recent (Max 5, deduplicated, excluding favorites)
    const uniqueRecent = []; const recSet = new Set();
    for (let t of window.appData) {
        const key = `${t.name}_${t.amount}`;
        if (!recSet.has(key) && !t.favorite) {
            recSet.add(key); uniqueRecent.push(t);
            if (uniqueRecent.length >= 6) break;
        }
    }
    recContainer.innerHTML = uniqueRecent.length ? uniqueRecent.map(createChip).join('') : '<span class="text-muted" style="font-size: 12px;">No recent transactions.</span>';

    // 3. Most Frequent (Occurs > 2 times in the last 200 txs, excluding favs/recent)
    const freqMap = {};
    
    // Slice the array to only analyze the 200 most recent items
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

    // Ensure the parent form-group can anchor the absolute dropdown
    const parent = input.parentElement;
    parent.style.position = 'relative';

    // Create the dropdown container
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

        // Grab the 200 most recent transactions from local memory (Super fast, 0 API calls)
        const recentTxs = (window.appData || []).slice(0, 200);
        
        // Extract unique matching values
        const uniqueValues = new Set();
        recentTxs.forEach(tx => {
            const text = tx[fieldType]; // 'name' or 'merchant'
            if (text && text.toLowerCase().includes(val)) {
                uniqueValues.add(text);
            }
        });

        // Limit to top 5 suggestions
        const suggestions = Array.from(uniqueValues).slice(0, 5);

        if (suggestions.length > 0) {
            suggestions.forEach(suggestion => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                
                // Highlight the part of the word the user typed
                const regex = new RegExp(`(${val})`, "gi");
                div.innerHTML = suggestion.replace(regex, "<strong style='color: var(--primary)'>$1</strong>");
                
                // On click, fill the input and hide
                div.addEventListener('click', () => {
                    input.value = suggestion;
                    dropdown.style.display = 'none';
                });
                dropdown.appendChild(div);
            });
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    });

    // Hide dropdown if user clicks outside of it
    document.addEventListener('click', (e) => {
        if (e.target !== input && e.target !== dropdown) {
            dropdown.style.display = 'none';
        }
    });
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

    // Default Account Settings UI
    const behaviorSelect = document.getElementById('setting-default-acc-behavior');
    const customSelect = document.getElementById('setting-default-acc-custom');
    
    if (behaviorSelect && customSelect) {
        behaviorSelect.value = window.userSettings.defaultAccountBehavior || 'blank';
        
        // Populate custom dropdown
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

// window.generateTxHTML = (entry) => {
//     const isPositiveEffect = (entry.amount || 0) >= 0;
//     const amountColor = (isPositiveEffect && entry.amount !== 0) ? 'var(--primary)' : 'var(--text)';
//     const sign = isPositiveEffect ? '+' : '-';
//     return `
//         <li class="tx-item" data-id="${entry._id}">
//             <div class="tx-left">
//                 <span class="tx-cat">${entry.category || 'Uncategorized'}</span>
//                 <span class="tx-name">${entry.name || 'Unnamed Transaction'}</span>
//             </div>
//             <div class="tx-right">
//                 <span class="tx-date">${window.formatListDate(entry.timestamp)}</span>
//                 <span class="tx-amount" style="color: ${amountColor}">${sign}${window.formatMoney(entry.amount)}</span>
//             </div>
//         </li>`;
// };
window.generateTxHTML = (entry) => {
    const isPositiveEffect = (entry.amount || 0) >= 0;
    const amountColor = (isPositiveEffect && entry.amount !== 0) ? 'var(--primary)' : 'var(--text)';
    const sign = isPositiveEffect ? '+' : '-';
    const starColor = entry.favorite ? '#FFD700' : 'var(--border)';
    
    return `
        <li class="tx-item" data-id="${entry._id}" style="padding-right: 8px;">
            <div class="tx-left">
                <span class="tx-cat">${entry.category || 'Uncategorized'}</span>
                <span class="tx-name">${entry.name || 'Unnamed Transaction'}</span>
            </div>
            <div class="tx-right" style="margin-left: auto; padding-right: 12px;">
                <span class="tx-date">${window.formatListDate(entry.timestamp)}</span>
                <span class="tx-amount" style="color: ${amountColor}">${sign}${window.formatMoney(entry.amount)}</span>
            </div>
            <button class="star-btn" style="position: static; padding: 4px; color: ${starColor}; fill: ${starColor};" 
                onclick="event.stopPropagation(); window.toggleTxFavorite('${entry.id}', ${entry._id})">
                <svg class="tx-star" viewBox="0 0 24 24" style="width: 20px; height: 20px; color: inherit; fill: inherit;">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                </svg>
            </button>
        </li>`;
};

window.populateAccountDropdowns = (targetSelectId) => {
    const selectEl = document.getElementById(targetSelectId);
    if (!selectEl) return;

    // 1. Calculate "Last Used" timestamp for every account based on transactions
    const getAccountLastUsed = (accId) => {
        const txs = window.appData.filter(t => t.account_id === accId);
        if (!txs.length) return 0;
        return Math.max(...txs.map(t => new Date(t.timestamp).getTime()));
    };

    // 2. Sort: Favorites first, then by most recently used
    const sortedAccounts = [...window.accountsData].sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return getAccountLastUsed(b.id) - getAccountLastUsed(a.id);
    });

    // 3. Build HTML
    let html = '<option value="">-- None --</option>';
    sortedAccounts.forEach(acc => {
        const favIndicator = acc.favorite ? '★ ' : '';
        html += `<option value="${acc.id}">${favIndicator}${acc.name} (${window.formatMoney(acc.balance)})</option>`;
    });
    selectEl.innerHTML = html;

    // 4. Determine Default Selection based on User Settings
    let defaultVal = '';
    const behavior = window.userSettings.defaultAccountBehavior || 'blank';
    
    if (behavior === 'custom') {
        const customId = window.userSettings.defaultAccountId;
        if (window.accountsData.find(a => a.id === customId)) defaultVal = customId;
    } else if (behavior === 'recent') {
        const recentTx = window.appData.find(t => t.account_id);
        if (recentTx && window.accountsData.find(a => a.id === recentTx.account_id)) {
            defaultVal = recentTx.account_id;
        }
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

// Phase 4: Upcoming Subscriptions Timeline Widget
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
    
    // Group by date
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
    
    // Add total upcoming spend footer
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
        const isIncome = (e.type || '').toUpperCase().includes('INCOM');
        if (isIncome) {
            weeklyIncome += e.amount;
        } else {
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
        sortedData.forEach(entry => displayTotal += (entry.amount || 0));
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
    
    // Render Goals Widget
    if (window.renderGoalsWidget) window.renderGoalsWidget();
    
    // Render Upcoming Subscriptions Widget
    if (window.renderUpcomingSubscriptions) window.renderUpcomingSubscriptions();
    
    // NEW: Trigger Dashboard Widgets
    if (window.renderDashboardInsights) window.renderDashboardInsights();

    // Render Quick Add Widget
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
    
    const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
    const displayAmount = isIncome ? entry.amount : -entry.amount;
    
    document.getElementById('edit-tx-name').value = entry.name || '';
    document.getElementById('edit-tx-amount').value = displayAmount || 0;
    document.getElementById('edit-tx-merchant').value = entry.merchant || '';
    document.getElementById('edit-tx-notes').value = entry.notes || '';
    
    const catSelect = document.getElementById('edit-tx-category');
    catSelect.innerHTML = '';
    
    const baseCategories = isIncome 
        ? (window.userSettings.incomeCategories || [])
        : (window.userSettings.categories?.map(c => c.name) || []);
        
    const allCategories = new Set([...baseCategories, entry.category]);
    
    Array.from(allCategories).forEach(cat => {
        if (!cat) return; // Prevent empty options
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

window.setupAccountDragDrop = () => {
    let draggedElement = null;
    let draggedType = null;
    
    const handleDragStart = (e) => {
        draggedElement = e.target.closest('[draggable="true"]');
        if (!draggedElement) return;
        
        e.stopPropagation(); // Prevent card drags from dragging the section
        
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
        
        // --- 1. Handle Account Card Drag ---
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
                    // Fixes the off-by-one bug when dragging downwards
                    const insertIdx = draggedIdx < targetIdx ? targetIdx - 1 : targetIdx;
                    window.accountsData.splice(insertIdx, 0, draggedAcc);
                } else {
                    window.accountsData.push(draggedAcc); 
                }
                
                await window.saveAccountsToCloud();
                await window.renderAccounts();
            }
        }
        // --- 2. Handle Type Section Drag ---
        else if (typeSection && targetType) {
            // Read the absolute DOM order to avoid array-splicing mistakes
            const currentDOMOrder = Array.from(document.querySelectorAll('.account-type-section')).map(el => el.getAttribute('data-type'));
            const draggedTypeIdx = currentDOMOrder.indexOf(typeSection);
            const targetTypeIdx = currentDOMOrder.indexOf(targetType);
            
            if (draggedTypeIdx !== -1 && targetTypeIdx !== -1 && draggedTypeIdx !== targetTypeIdx) {
                // Move visually in the DOM first
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
                
                // Record the final exact visual order and save to cloud
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
    
    if (!newName || !newAmount || isNaN(newAmount)) {
        alert('Please fill in Name and Amount');
        return;
    }
    
    const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
    const finalAmount = isIncome ? newAmount : -newAmount;
    
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
                const isIncome = (entry.type || '').toUpperCase().includes('INCOM');
                if (isIncome) { 
                    totalIncome += entry.amount; 
                } else { 
                    totalExpense -= entry.amount; 
                    expensesList.push(entry); 
                }
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
        const isIncome = (e.type || '').toUpperCase().includes('INCOM');
        if (isIncome) {
            cycleIncome += e.amount;
        } else { 
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
    
    // Pre-fetch all unique currencies to cache prices
    const uniqueCurrencies = [...new Set(window.accountsData.map(acc => acc.currency || userCurrency).filter(c => c !== userCurrency))];
    for (const curr of uniqueCurrencies) {
        await window.getPrice(curr);
    }
    
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
    });
    
    // Get type labels
    const typeLabels = {
        'bank': 'Banks & E-Wallets',
        'onhand': 'On-hand Cash',
        'investment': 'Investments',
        'custom': 'Custom'
    };
    
    // Use saved typeOrder or generate default order
    const defaultOrder = ['bank', 'onhand', 'investment'];
    const allTypes = Object.keys(groupedByType);
    const customTypes = allTypes.filter(t => t.startsWith('custom:') || (!defaultOrder.includes(t) && !['bank', 'onhand', 'investment'].includes(t)));
    if (typeof window.userSettings.typeOrder === 'string') {
        try {
            window.userSettings.typeOrder = JSON.parse(window.userSettings.typeOrder);
        } catch (e) {
            window.userSettings.typeOrder = []; // fallback if parsing fails
        }
    }

    // 2. Fallback: if it is still not a valid array, or is empty, generate the default order
    if (!Array.isArray(window.userSettings.typeOrder) || window.userSettings.typeOrder.length === 0) {
        window.userSettings.typeOrder = [...defaultOrder.filter(t => allTypes.includes(t)), ...customTypes.sort()];
    }
    
    // Use saved order, but include any new types that weren't in the saved order
    const orderedTypes = [
        ...window.userSettings.typeOrder.filter(t => allTypes.includes(t)),
        ...allTypes.filter(t => !window.userSettings.typeOrder.includes(t))
    ];
    
    // Render each type section
    let html = '';
    for (const type of orderedTypes) {
        const accounts = groupedByType[type];
        if (!accounts || accounts.length === 0) continue;
        
        const typeLabel = typeLabels[type] || (type.startsWith('custom:') ? type.substring(7) : type.charAt(0).toUpperCase() + type.slice(1));
        let typeTotal = 0;
        
        // Calculate type total (converting all to user's currency using cached prices)
        const cache = window.getPriceCache();
        for (const acc of accounts) {
            const balance = parseFloat(acc.balance || 0);
            const accCurrency = acc.currency || userCurrency;
            
            if (accCurrency === userCurrency) {
                typeTotal += balance;
            } else {
                // Use cached price
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
                    <span style="font-weight: 700; color: ${typeTotalColor};">${typeSign}${window.formatMoney(Math.abs(typeTotal))}</span>
                </div>
                <div class="accounts-grid account-type-grid" data-type="${type}">
                    ${accounts.map((acc, idx) => {
                        const initial = (acc.name || '?').charAt(0).toUpperCase();
                        const isFavorite = acc.favorite || false;
                        const favIcon = isFavorite ? '★' : '☆';
                        const favColor = isFavorite ? '#FFD700' : 'var(--text-secondary)';
                        const balanceColor = acc.balance < 0 ? 'var(--accent-red)' : 'var(--text)';
                        const accCurrency = acc.currency || userCurrency;
                        
                        // Get cached price to calculate converted amount
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
                                <div style="cursor:pointer;" onclick="window.editAccount(${acc._index})">
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
        totalBalEl.innerText = window.formatMoney(grandTotal);
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
        
        // Prevent the drag event from bubbling up to the parent section
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
        
        // Safely get the type of the section, whether we dropped on a card or the section header
        const targetType = dropTarget.getAttribute('data-type') || dropTarget.closest('.account-type-section')?.getAttribute('data-type');
        
        // --- 1. Handle Account Card Drag ---
        if (accountIndex) {
            const draggedIdx = parseInt(accountIndex);
            const targetIdx = parseInt(targetAccountIndex);
            
            if (!isNaN(draggedIdx)) {
                const draggedAcc = window.accountsData[draggedIdx];
                
                // If dragged to a different type section, update the account's type
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

                // Remove from original position
                window.accountsData.splice(draggedIdx, 1);
                
                // Insert at new position
                if (!isNaN(targetIdx)) {
                    window.accountsData.splice(targetIdx, 0, draggedAcc);
                } else {
                    window.accountsData.push(draggedAcc); // Appended if dropped directly on a section header
                }
                
                await window.saveAccountsToCloud();
                await window.renderAccounts();
            }
        }
        // --- 2. Handle Type Section Drag ---
        else if (typeSection && targetType) {
            const draggedTypeIdx = window.userSettings.typeOrder.indexOf(typeSection);
            const targetTypeIdx = window.userSettings.typeOrder.indexOf(targetType);
            
            if (draggedTypeIdx !== -1 && targetTypeIdx !== -1 && draggedTypeIdx !== targetTypeIdx) {
                // Remove the section and insert it exactly at the target index
                const draggedTypeValue = window.userSettings.typeOrder.splice(draggedTypeIdx, 1)[0];
                window.userSettings.typeOrder.splice(targetTypeIdx, 0, draggedTypeValue);
                
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
        
        // Handle custom type visibility and population
        const customGroup = document.getElementById('custom-type-group');
        if (acc.type === 'custom') {
            document.getElementById('acc-custom-type').value = acc.customType || '';
            if (customGroup) customGroup.style.display = 'block';
        } else {
            if (customGroup) customGroup.style.display = 'none';
        }

        // Expand the "More Options" section if favorite or currency has data
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
    window.populateAccountDropdowns('exp-account');
    if (overlay) overlay.classList.add('active');
};

window.closeExpenseModal = () => {
    const overlay = document.getElementById('expense-overlay');
    if (overlay) overlay.classList.remove('active');
};

window.openIncomeModal = () => {
    const overlay = document.getElementById('income-overlay');
    window.populateAccountDropdowns('inc-account');
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

    // --- INITIALIZE AUTOCOMPLETE ---
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
            
            // Render specific views when opened
            if (target === 'goals') {
                await window.renderGoals();
            } else if (target === 'subscriptions') {
                await window.renderSubscriptions();
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

    // Toggle More Options in account modal
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
            
            // Assign customType if applicable, otherwise clear it
            if (typeValue === 'custom') {
                accData.customType = document.getElementById('acc-custom-type')?.value || 'Custom';
            } else {
                accData.customType = null; 
            }
            
            if (window.editingAccountIndex !== undefined) {
                // Preserve the existing ID when updating
                accData.id = window.accountsData[window.editingAccountIndex].id;
                window.accountsData[window.editingAccountIndex] = accData;
            } else {
                // Generate a new ID for new accounts
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
            amount: -amount,
            notes: notes,
            merchant: merchant,
            account_id: accountId,
            timestamp: new Date().toISOString()
        };

        const { error } = await window.supabase.from('transactions').insert([transaction]);
        if (error) {
            console.error('Error saving expense:', error);
            alert('Error saving expense');
        } else {
            // Deduct from Account Balance ---
            if (accountId) {
                const accIndex = window.accountsData.findIndex(a => a.id === accountId);
                if (accIndex !== -1) {
                    window.accountsData[accIndex].balance -= amount;
                    await window.saveAccountsToCloud();
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
        }
    });

    document.getElementById('save-income-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('inc-name').value.trim();
        const amount = parseFloat(document.getElementById('inc-amount').value);
        const category = document.getElementById('inc-category').value || 'INCOME';
        const notes = document.getElementById('inc-notes').value.trim() || '';
        const accountId = document.getElementById('inc-account').value || null;

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
            amount: amount,
            notes: notes,
            account_id: accountId,
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
                    window.accountsData[accIndex].balance += Math.abs(amount);
                    await window.saveAccountsToCloud();
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
        }
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
            
            // If file selected, import CSV; otherwise sync to cloud
            if (file) {
                // CSV IMPORT FLOW
                // Show styled confirmation
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
                                // Parse timestamp while preserving timezone (don't use toISOString)
                                let ts = new Date(item.timestamp);
                                ts.setSeconds(ts.getSeconds() + occurrenceNum);
                                // Keep original timestamp format to avoid timezone shifts
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
                // SYNC TO CLOUD FLOW
                // Show confirmation
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
                    // Save all data to cloud
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


    // Save Goal Handler
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
    
    // Save Subscription Handler
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
    
    // Add Goal/Subscription Button Handlers
    const addGoalBtn = document.getElementById('add-goal-btn');
    const addSubBtn = document.getElementById('add-subscription-btn');
    
    if (addGoalBtn) {
        addGoalBtn.addEventListener('click', () => window.openGoalModal());
    }
    if (addSubBtn) {
        addSubBtn.addEventListener('click', () => window.openSubscriptionModal());
    }
    
    // Close modals when clicking outside
    document.getElementById('goal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'goal-overlay') window.closeGoalModal();
    });
    document.getElementById('subscription-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'subscription-overlay') window.closeSubscriptionModal();
    });
    document.getElementById('goal-allocation-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'goal-allocation-overlay') window.closeGoalAllocationModal();
    });
    
    // --- MOBILE MENU HANDLERS ---
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

});