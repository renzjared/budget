window.YieldEngine = {
    catalog: [],
    userRates: JSON.parse(localStorage.getItem('yield_user_rates') || '{}'),
    userExcludedBanks: JSON.parse(localStorage.getItem('yield_excluded_banks') || '[]'),

    init: async () => {
        const backBtn = document.getElementById('yield-back-btn');
        if (backBtn) backBtn.style.display = window.currentUser ? 'none' : 'block';
        
        try {
            const { data } = await window.supabase.from('banks_catalog').select('*').order('name');
            if (data) window.YieldEngine.catalog = data;
        } catch (e) { console.error("Failed to fetch catalog:", e); }
        
        window.YieldEngine.injectModals();
    },

    injectModals: () => {
        if (document.getElementById('yield-settings-overlay')) return;
        const modalHTML = `
            <div id="yield-settings-overlay" class="modal-overlay" style="z-index: 100000;">
                <div class="account-modal-content card" style="max-width: 600px; width: 95%; max-height: 90vh; display: flex; flex-direction: column;">
                    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0;">
                        <h3 style="margin: 0;">Optimizer Settings</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('yield-settings-overlay').classList.remove('active')">✕</button>
                    </header>
                    <input type="text" id="yield-bank-search" class="form-input" placeholder="Search banks or products..." style="margin-bottom: 16px; flex-shrink: 0;">
                    <p class="text-muted" style="font-size: 13px; margin-bottom: 16px; flex-shrink: 0;">Toggle banks you don't use, or override the APY% if you unlocked special missions.</p>
                    
                    <div id="yield-bank-toggles" style="display: flex; flex-direction: column; gap: 16px; flex: 1; overflow-y: auto; margin-bottom: 24px; padding-right: 8px;">
                        <!-- Injected via JS -->
                    </div>
                    
                    <button class="primary-btn" style="width: 100%; flex-shrink: 0;" onclick="window.YieldEngine.saveSettings()">Save & Recalculate</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.getElementById('yield-bank-search').addEventListener('input', window.YieldEngine.renderSettingsList);
    },

    openSettings: () => {
        document.getElementById('yield-bank-search').value = '';
        window.YieldEngine.renderSettingsList();
        document.getElementById('yield-settings-overlay').classList.add('active');
    },

    renderSettingsList: () => {
        const query = document.getElementById('yield-bank-search').value.toLowerCase();
        const container = document.getElementById('yield-bank-toggles');
        
        let filteredCatalog = window.YieldEngine.catalog.filter(b => b.name.toLowerCase().includes(query) || (b.products || []).some(p => p.name.toLowerCase().includes(query)));
        filteredCatalog.sort((a, b) => a.name.localeCompare(b.name)); // Alphabetical Sort
        
        container.innerHTML = filteredCatalog.map(bank => {
            const isExcluded = window.YieldEngine.userExcludedBanks.includes(bank.id);
            
            const productsHtml = (bank.products || []).map(prod => {
                const tiersHtml = (prod.tiers || []).map((tier, idx) => {
                    const customRate = window.YieldEngine.userRates[bank.id] && window.YieldEngine.userRates[bank.id][prod.id] && window.YieldEngine.userRates[bank.id][prod.id][idx] !== undefined 
                        ? window.YieldEngine.userRates[bank.id][prod.id][idx] : tier.rate;
                    const capText = tier.max ? `Up to ₱${tier.max.toLocaleString()}` : 'Uncapped';
                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding: 4px 0; border-top: 1px dashed var(--border);">
                            <span class="text-muted" style="flex:1;">${capText} <i style="opacity:0.6">${tier.note ? '('+tier.note+')' : ''}</i></span>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="number" class="form-input yield-rate-override" data-bank="${bank.id}" data-prod="${prod.id}" data-tier="${idx}" value="${(customRate * 100).toFixed(2)}" step="0.01" style="width: 60px; padding: 4px; font-size: 11px; text-align: right;">
                                <span class="text-muted">%</span>
                            </div>
                        </div>`;
                }).join('');

                return `
                    <div style="margin-top: 12px; padding: 12px; background: var(--surface); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-weight: 600; font-size: 13px; color: ${bank.color};">${prod.name} <span style="font-weight: normal; opacity: 0.6;">(${prod.type})</span></span>
                        </div>
                        ${tiersHtml}
                    </div>`;
            }).join('');

            return `
                <div style="padding: 16px; background: var(--surface-hover); border-radius: 12px; border: 1px solid var(--border);">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" class="yield-bank-checkbox" data-id="${bank.id}" ${!isExcluded ? 'checked' : ''} style="width: 20px; height: 20px; margin-right: 12px;">
                        <span style="font-weight: 800; font-size: 16px;">${bank.name}</span>
                    </label>
                    ${productsHtml}
                </div>
            `;
        }).join('');
    },

    saveSettings: () => {
        const excluded = [];
        document.querySelectorAll('.yield-bank-checkbox').forEach(cb => { if (!cb.checked) excluded.push(cb.getAttribute('data-id')); });
        window.YieldEngine.userExcludedBanks = excluded;
        localStorage.setItem('yield_excluded_banks', JSON.stringify(excluded));

        const newRates = {};
        document.querySelectorAll('.yield-rate-override').forEach(input => {
            const bId = input.getAttribute('data-bank'); const pId = input.getAttribute('data-prod'); const tIdx = parseInt(input.getAttribute('data-tier'));
            const customRate = parseFloat(input.value) / 100;
            if (!newRates[bId]) newRates[bId] = {};
            if (!newRates[bId][pId]) newRates[bId][pId] = {};
            newRates[bId][pId][tIdx] = customRate;
        });
        window.YieldEngine.userRates = newRates;
        localStorage.setItem('yield_user_rates', JSON.stringify(newRates));

        document.getElementById('yield-settings-overlay').classList.remove('active');
        window.YieldEngine.calculate();
    },

    calculate: () => {
        const inputEl = document.getElementById('yield-input-amount');
        let amountToAllocate = parseFloat(inputEl.value) || 0;
        const initialAmount = amountToAllocate;
        const allowTD = document.getElementById('yield-allow-td').checked;
        
        if (amountToAllocate <= 0) return alert("Please enter a valid amount to invest.");

        let buckets = [];
        window.YieldEngine.catalog.forEach(bank => {
            if (window.YieldEngine.userExcludedBanks.includes(bank.id)) return;
            (bank.products || []).forEach(prod => {
                if (!allowTD && prod.type === 'time_deposit') return;
                
                (prod.tiers || []).forEach((tier, tIdx) => {
                    const customRate = window.YieldEngine.userRates[bank.id]?.[prod.id]?.[tIdx] !== undefined ? window.YieldEngine.userRates[bank.id][prod.id][tIdx] : tier.rate;
                    const maxCap = tier.max || Infinity;

                    buckets.push({
                        bankId: bank.id, bankName: bank.name, color: bank.color, referral: bank.referral_code,
                        productId: prod.id, productName: prod.name, isTD: prod.type === 'time_deposit',
                        lockupDays: prod.lockup_days, crediting: prod.crediting,
                        grossRate: customRate, netRate: customRate * (1 - prod.tax),
                        capacity: maxCap - tier.min
                    });
                });
            });
        });

        buckets.sort((a, b) => b.netRate - a.netRate);

        let allocations = []; let totalNetEarnings = 0;
        for (let bucket of buckets) {
            if (amountToAllocate <= 0) break;
            const allocAmt = Math.min(amountToAllocate, bucket.capacity);
            allocations.push({ ...bucket, allocated: allocAmt, earnings: allocAmt * bucket.netRate });
            amountToAllocate -= allocAmt; totalNetEarnings += (allocAmt * bucket.netRate);
        }

        const cons = {};
        allocations.forEach(a => {
            const key = `${a.bankId}_${a.productId}`;
            if (!cons[key]) cons[key] = {
                bankName: a.bankName, productName: a.productName, color: a.color, referral: a.referral,
                isTD: a.isTD, lockupDays: a.lockupDays, crediting: a.crediting, totalAllocated: 0, totalEarnings: 0, breakdown: []
            };
            cons[key].totalAllocated += a.allocated; cons[key].totalEarnings += a.earnings;
            cons[key].breakdown.push(`₱${a.allocated.toLocaleString()} @ ${(a.grossRate * 100).toFixed(2)}%`);
        });

        const finalResults = Object.values(cons).sort((a,b) => b.totalEarnings - a.totalEarnings);
        const blendedRate = initialAmount > 0 ? (totalNetEarnings / initialAmount) : 0;
        
        document.getElementById('yield-total-earnings').innerText = window.formatMoney ? window.formatMoney(totalNetEarnings, true) : `₱${totalNetEarnings.toLocaleString()}`;
        document.getElementById('yield-blended-rate').innerText = `${(blendedRate * 100).toFixed(2)}%`;

        const listContainer = document.getElementById('yield-allocation-list');
        if (finalResults.length === 0) {
            listContainer.innerHTML = `<p class="text-muted" style="text-align:center; padding:24px;">No banks match your criteria.</p>`;
        } else {
            listContainer.innerHTML = finalResults.map(res => {
                const pct = (res.totalAllocated / initialAmount) * 100;
                const tdBadge = res.isTD ? `<span style="background: rgba(0,0,0,0.1); padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-left: 8px;">🔒 ${res.lockupDays} Days</span>` : '';
                const refHtml = res.referral ? `<div style="font-size: 11px; margin-top: 8px; color: var(--primary);">🎁 Referral: <b>${res.referral}</b></div>` : '';

                return `
                    <div class="card" style="padding: 20px; border-left: 4px solid ${res.color};">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div>
                                <h3 style="margin: 0 0 4px 0; display: flex; align-items: center;">${res.bankName} ${tdBadge}</h3>
                                <span class="text-muted" style="font-size: 12px;">${res.productName} • ${res.crediting} payout</span>
                                ${refHtml}
                            </div>
                            <div style="text-align: right;">
                                <h3 style="margin: 0; color: var(--primary);">${window.formatMoney ? window.formatMoney(res.totalAllocated, true) : '₱'+res.totalAllocated.toLocaleString()}</h3>
                                <span class="text-muted" style="font-size: 11px;">${pct.toFixed(1)}% of funds</span>
                            </div>
                        </div>
                        <div style="background: var(--surface-hover); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">${res.breakdown.join('<br>')}</div>
                            <div style="text-align: right;">
                                <span style="display: block; font-size: 11px; color: var(--text-secondary); text-transform: uppercase;">Est. Annual Net</span>
                                <span style="font-weight: 700;">${window.formatMoney ? window.formatMoney(res.totalEarnings, true) : '₱'+res.totalEarnings.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        }

        const tBody = document.getElementById('yield-projection-tbody');
        const timelines = [ { label: '1 Month', yrs: 1/12 }, { label: '6 Months', yrs: 6/12 }, { label: '1 Year', yrs: 1 }, { label: '2 Years', yrs: 2 }, { label: '5 Years', yrs: 5 } ];
        
        tBody.innerHTML = timelines.map(t => {
            const profit = t.yrs < 1 ? totalNetEarnings * t.yrs : initialAmount * (Math.pow(1 + blendedRate, t.yrs) - 1);
            return `<tr><td style="padding: 16px; border-bottom: 1px solid var(--border);">${t.label}</td><td style="padding: 16px; border-bottom: 1px solid var(--border); text-align: right; font-family: monospace;">${window.formatMoney ? window.formatMoney(initialAmount + profit, true) : '₱'+(initialAmount + profit).toLocaleString()}</td><td style="padding: 16px; border-bottom: 1px solid var(--border); text-align: right; color: var(--primary); font-family: monospace;">+${window.formatMoney ? window.formatMoney(profit, true) : '₱'+profit.toLocaleString()}</td></tr>`;
        }).join('');
        document.getElementById('yield-results-container').style.display = 'block';
    }
};

document.addEventListener('DOMContentLoaded', () => { window.YieldEngine.init(); });