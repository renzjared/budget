window.YieldEngine = {
    // Current catalog of PH Digital Banks (Configurable constraints)
    catalog: [
        {
            id: 'maya_savings',
            name: 'Maya',
            product: 'Personal Savings',
            color: '#000000',
            tax: 0.20,
            active: true,
            tiers: [
                { min: 0, max: 100000, rate: 0.10, note: 'Assuming 10% boosted promo' },
                { min: 100000, max: 5000000, rate: 0.035, note: 'Base rate' }
            ]
        },
        {
            id: 'seabank',
            name: 'SeaBank',
            product: 'Savings Account',
            color: '#FF6B00',
            tax: 0.20,
            active: true,
            tiers: [
                { min: 0, max: 300000, rate: 0.045, note: '4.5% up to 300k' },
                { min: 300000, max: Infinity, rate: 0.03, note: 'Excess base rate' }
            ]
        },
        {
            id: 'ownbank',
            name: 'OwnBank',
            product: 'Own It Savings',
            color: '#FFC800',
            tax: 0.20,
            active: true,
            tiers: [
                { min: 0, max: Infinity, rate: 0.06, note: 'Uncapped 6% p.a.' }
            ]
        },
        {
            id: 'netbank',
            name: 'Netbank',
            product: 'Savings',
            color: '#00B4DB',
            tax: 0.20,
            active: true,
            tiers: [
                { min: 0, max: Infinity, rate: 0.05, note: 'Uncapped 5% p.a.' }
            ]
        },
        {
            id: 'gotyme',
            name: 'GoTyme',
            product: 'GoSave',
            color: '#002BFF',
            tax: 0.20,
            active: true,
            tiers: [
                { min: 0, max: Infinity, rate: 0.04, note: 'Uncapped 4% p.a.' }
            ]
        },
        {
            id: 'cimb_upsave',
            name: 'CIMB',
            product: 'UpSave',
            color: '#E50000',
            tax: 0.20,
            active: true,
            tiers: [
                { min: 0, max: Infinity, rate: 0.025, note: 'Base rate (Excludes ad-hoc promos)' }
            ]
        }
    ],

init: async () => {
        const backBtn = document.getElementById('yield-back-btn');
        if (backBtn) {
            backBtn.style.display = window.currentUser ? 'none' : 'block';
        }
        
        // Fetch Live Database Catalog for Public Access
        const { data } = await window.supabase.from('banks_catalog').select('*').order('name');
        if (data && data.length > 0) {
            window.YieldEngine.catalog = data;
        }
        
        window.YieldEngine.injectModals();
    },
    
    injectModals: () => {
        if (document.getElementById('yield-settings-overlay')) return;
        
        const modalHTML = `
            <div id="yield-settings-overlay" class="modal-overlay" style="z-index: 100000;">
                <div class="account-modal-content card" style="max-width: 500px; width: 95%;">
                    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <h3 style="margin: 0;">Bank Filters</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('yield-settings-overlay').classList.remove('active')">✕</button>
                    </header>
                    <p class="text-muted" style="font-size: 13px; margin-bottom: 16px;">Check the banks/wallets you currently have accounts with. Unchecked banks will be ignored in the calculation.</p>
                    
                    <div id="yield-bank-toggles" style="display: flex; flex-direction: column; gap: 12px; max-height: 400px; overflow-y: auto; margin-bottom: 24px;">
                        <!-- Injected via JS -->
                    </div>
                    
                    <button class="primary-btn" style="width: 100%;" onclick="window.YieldEngine.saveSettings()">Save & Recalculate</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

openSettings: () => {
        const container = document.getElementById('yield-bank-toggles');
        container.innerHTML = window.YieldEngine.catalog.map(bank => {
            
            // Build the editable rate inputs for each tier
            const tiersHtml = bank.tiers.map((tier, idx) => {
                // Check if user has an override, otherwise show global rate
                const currentRate = window.YieldEngine.userRates[bank.id] && window.YieldEngine.userRates[bank.id][idx] !== undefined 
                    ? window.YieldEngine.userRates[bank.id][idx] 
                    : tier.rate;
                
                const capText = tier.max >= 999999999 ? 'Uncapped' : `Up to ₱${tier.max.toLocaleString()}`;
                
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-top: 6px; padding-left: 30px;">
                        <span class="text-muted">${capText}</span>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <input type="number" class="form-input yield-rate-override" data-bank="${bank.id}" data-tier="${idx}" value="${(currentRate * 100).toFixed(1)}" step="0.1" style="width: 60px; padding: 4px; font-size: 12px; text-align: right;">
                            <span class="text-muted">%</span>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div style="padding: 12px; background: var(--surface-hover); border-radius: 8px; border: 1px solid var(--border);">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" class="yield-bank-checkbox" data-id="${bank.id}" ${bank.active ? 'checked' : ''} style="width: 18px; height: 18px; margin-right: 12px;">
                        <div style="flex: 1;">
                            <span style="font-weight: 600; display: block;">${bank.name}</span>
                            <span class="text-muted" style="font-size: 11px;">${bank.product}</span>
                        </div>
                    </label>
                    ${tiersHtml}
                </div>
            `;
        }).join('');
        
        document.getElementById('yield-settings-overlay').classList.add('active');
    },

    saveSettings: () => {
        // 1. Save Bank Active/Inactive Checkboxes
        document.querySelectorAll('.yield-bank-checkbox').forEach(cb => {
            const id = cb.getAttribute('data-id');
            const bank = window.YieldEngine.catalog.find(b => b.id === id);
            if (bank) bank.active = cb.checked;
        });

        // 2. Save Custom User Rates
        document.querySelectorAll('.yield-rate-override').forEach(input => {
            const bankId = input.getAttribute('data-bank');
            const tierIdx = parseInt(input.getAttribute('data-tier'));
            const customRateDecimal = parseFloat(input.value) / 100;
            
            if (!window.YieldEngine.userRates[bankId]) {
                window.YieldEngine.userRates[bankId] = {};
            }
            window.YieldEngine.userRates[bankId][tierIdx] = customRateDecimal;
        });

        // Commit to localStorage so they survive page refreshes
        localStorage.setItem('yield_user_rates', JSON.stringify(window.YieldEngine.userRates));

        document.getElementById('yield-settings-overlay').classList.remove('active');
        window.YieldEngine.calculate();
    },

    userRates: JSON.parse(localStorage.getItem('yield_user_rates') || '{}'),

calculate: () => {
        const inputEl = document.getElementById('yield-input-amount');
        let amountToAllocate = parseFloat(inputEl.value) || 0;
        const initialAmount = amountToAllocate;
        const allowTD = document.getElementById('yield-allow-td').checked;
        
        if (amountToAllocate <= 0) return alert("Please enter a valid amount to invest.");

        // 1. Break catalog into allocatable tranches (buckets)
        let buckets = [];
        window.YieldEngine.catalog.filter(b => b.active).forEach(bank => {
            // Skip if it's a Time Deposit and the user disabled them
            if (!allowTD && bank.is_time_deposit) return;

            bank.tiers.forEach((tier, tierIdx) => {
                const customRate = window.YieldEngine.userRates[bank.id] && window.YieldEngine.userRates[bank.id][tierIdx] !== undefined 
                    ? window.YieldEngine.userRates[bank.id][tierIdx] 
                    : tier.rate;

                buckets.push({
                    bankId: bank.id,
                    bankName: bank.name,
                    product: bank.product,
                    color: bank.color,
                    tax: bank.tax,
                    isTD: bank.is_time_deposit,
                    lockupDays: bank.lockup_days,
                    grossRate: customRate,
                    netRate: customRate * (1 - bank.tax),
                    capacity: tier.max - tier.min,
                    note: tier.note
                });
            });
        });

        // 2. Sort buckets by Net Rate (Highest Yield First)
        buckets.sort((a, b) => b.netRate - a.netRate);

        // 3. Greedy Allocation
        let allocations = [];
        let totalNetEarnings = 0;

        for (let bucket of buckets) {
            if (amountToAllocate <= 0) break;

            const allocationAmount = Math.min(amountToAllocate, bucket.capacity);
            const netEarnings = allocationAmount * bucket.netRate;

            allocations.push({
                ...bucket,
                allocated: allocationAmount,
                earnings: netEarnings
            });

            amountToAllocate -= allocationAmount;
            totalNetEarnings += netEarnings;
        }

        // Combine multiple tiers of the same bank for cleaner display
        const consolidated = {};
        allocations.forEach(a => {
            if (!consolidated[a.bankId]) {
                consolidated[a.bankId] = {
                    bankName: a.bankName,
                    product: a.product,
                    color: a.color,
                    isTD: a.isTD,
                    lockupDays: a.lockupDays,
                    totalAllocated: 0,
                    totalEarnings: 0,
                    breakdown: []
                };
            }
            consolidated[a.bankId].totalAllocated += a.allocated;
            consolidated[a.bankId].totalEarnings += a.earnings;
            consolidated[a.bankId].breakdown.push(`₱${a.allocated.toLocaleString()} @ ${(a.grossRate * 100).toFixed(1)}%`);
        });

        const finalResults = Object.values(consolidated).sort((a,b) => b.totalEarnings - a.totalEarnings);

        // 4. Render Results
        const blendedRate = initialAmount > 0 ? (totalNetEarnings / initialAmount) : 0;
        
        document.getElementById('yield-total-earnings').innerText = window.formatMoney ? window.formatMoney(totalNetEarnings, true) : `₱${totalNetEarnings.toLocaleString(undefined, {minimumFractionDigits:2})}`;
        document.getElementById('yield-blended-rate').innerText = `${(blendedRate * 100).toFixed(2)}%`;

        const listContainer = document.getElementById('yield-allocation-list');
        if (finalResults.length === 0) {
            listContainer.innerHTML = `<p class="text-muted" style="text-align: center; padding: 24px;">No banks match your criteria. Try enabling Time Deposits or adjusting your filters.</p>`;
        } else {
            listContainer.innerHTML = finalResults.map(res => {
                const pctOfTotal = (res.totalAllocated / initialAmount) * 100;
                // Generate the TD Badge if applicable
                const tdBadge = res.isTD ? `<span style="background: rgba(0,0,0,0.1); padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-left: 8px; vertical-align: middle;">🔒 ${res.lockupDays} Days</span>` : '';

                return `
                    <div class="card" style="padding: 20px; border-left: 4px solid ${res.color};">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div>
                                <h3 style="margin: 0 0 4px 0; display: flex; align-items: center;">${res.bankName} ${tdBadge}</h3>
                                <span class="text-muted" style="font-size: 12px;">${res.product}</span>
                            </div>
                            <div style="text-align: right;">
                                <h3 style="margin: 0; color: var(--primary);">${window.formatMoney ? window.formatMoney(res.totalAllocated, true) : '₱'+res.totalAllocated.toLocaleString()}</h3>
                                <span class="text-muted" style="font-size: 11px;">${pctOfTotal.toFixed(1)}% of funds</span>
                            </div>
                        </div>
                        
                        <div style="background: var(--surface-hover); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
                                ${res.breakdown.join('<br>')}
                            </div>
                            <div style="text-align: right;">
                                <span style="display: block; font-size: 11px; color: var(--text-secondary); text-transform: uppercase;">Est. Annual Net</span>
                                <span style="font-weight: 700; color: var(--text);">${window.formatMoney ? window.formatMoney(res.totalEarnings, true) : '₱'+res.totalEarnings.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 5. Generate Projections Timeline
        const tBody = document.getElementById('yield-projection-tbody');
        const timelines = [
            { label: '1 Month', years: 1/12 },
            { label: '3 Months', years: 3/12 },
            { label: '6 Months', years: 6/12 },
            { label: '1 Year', years: 1 },
            { label: '2 Years', years: 2 },
            { label: '5 Years', years: 5 }
        ];

        tBody.innerHTML = timelines.map(t => {
            let profit = 0;
            if (t.years < 1) {
                // Simple fraction for sub-year projections
                profit = totalNetEarnings * t.years;
            } else {
                // Annual Compounding for multi-year
                profit = initialAmount * (Math.pow(1 + blendedRate, t.years) - 1);
            }
            
            const projectedBalance = initialAmount + profit;
            
            return `
                <tr>
                    <td style="padding: 16px; border-bottom: 1px solid var(--border); font-weight: 600;">${t.label}</td>
                    <td style="padding: 16px; border-bottom: 1px solid var(--border); text-align: right; font-family: monospace; font-size: 15px;">${window.formatMoney ? window.formatMoney(projectedBalance, true) : '₱'+projectedBalance.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td style="padding: 16px; border-bottom: 1px solid var(--border); text-align: right; font-family: monospace; font-size: 15px; color: var(--primary);">+${window.formatMoney ? window.formatMoney(profit, true) : '₱'+profit.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                </tr>
            `;
        }).join('');

        document.getElementById('yield-results-container').style.display = 'block';
    },
};

document.addEventListener('DOMContentLoaded', () => {
    window.YieldEngine.init();
});