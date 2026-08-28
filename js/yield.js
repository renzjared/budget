window.YieldEngine = {
    catalog: [],
    userRates: JSON.parse(localStorage.getItem('yield_user_rates') || '{}'),
    userExcludedBanks: JSON.parse(localStorage.getItem('yield_excluded_banks') || '[]'),
    currentSelectedProduct: null,

    init: async () => {
        const backBtn = document.getElementById('yield-back-btn');
        if (backBtn) backBtn.style.display = window.currentUser ? 'none' : 'block';
        
        try {
            const { data } = await window.supabase.from('banks_catalog').select('*').order('name');
            if (data) {
                window.YieldEngine.catalog = data;
                window.YieldEngine.renderBankBrowser();
            }
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
        filteredCatalog.sort((a, b) => a.name.localeCompare(b.name));
        
        container.innerHTML = filteredCatalog.map(bank => {
            const isExcluded = window.YieldEngine.userExcludedBanks.includes(bank.id);
            const productsHtml = (bank.products || []).map(prod => {
                const tiersHtml = (prod.tiers || []).map((tier, idx) => {
                    const customRate = window.YieldEngine.userRates[bank.id]?.[prod.id]?.[idx] !== undefined 
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

    // --- PROGRESSIVE YIELD ALLOCATION ENGINE ---
    calculate: () => {
        const inputEl = document.getElementById('yield-input-amount');
        let remaining = parseFloat(inputEl.value) || 0;
        const initialAmount = remaining;
        const allowTD = document.getElementById('yield-allow-td').checked;
        
        if (remaining <= 0) return alert("Please enter a valid amount to invest.");

        const productStates = {}; 
        
        window.YieldEngine.catalog.forEach(bank => {
            if (window.YieldEngine.userExcludedBanks.includes(bank.id)) return;
            
            (bank.products || []).forEach(prod => {
                if (!allowTD && prod.type === 'time_deposit') return;
                
                // Map the tiers and inject custom user rates
                const processedTiers = (prod.tiers || []).map((tier, idx) => {
                    const customRate = window.YieldEngine.userRates[bank.id]?.[prod.id]?.[idx] !== undefined 
                        ? window.YieldEngine.userRates[bank.id][prod.id][idx] : tier.rate;
                    return { ...tier, rate: customRate, max: tier.max || Infinity };
                });

                productStates[`${bank.id}_${prod.id}`] = {
                    bankId: bank.id, bankName: bank.name, color: bank.color, referral: bank.referral_code,
                    productId: prod.id, productName: prod.name, isTD: prod.type === 'time_deposit',
                    lockupDays: prod.lockup_days, crediting: prod.crediting, tax: prod.tax || 0.20,
                    tiers: processedTiers.sort((a,b) => (a.min || 0) - (b.min || 0)), 
                    currentTierIndex: 0,
                    allocatedInCurrentTier: 0,
                    totalAllocated: 0,
                    totalEarnings: 0,
                    breakdown: []
                };
            });
        });

        const activeAllocations = {};

        // The Progressive Pour
        while (remaining > 0.01) { 
            let bestProduct = null;
            let bestNetRate = -1;
            let availableCapForBest = 0;

            for (const [key, state] of Object.entries(productStates)) {
                if (state.currentTierIndex < state.tiers.length) {
                    const currentTier = state.tiers[state.currentTierIndex];
                    const netRate = currentTier.rate * (1 - state.tax); 
                    
                    if (netRate > bestNetRate) {
                        bestNetRate = netRate;
                        bestProduct = state;
                        availableCapForBest = currentTier.max - state.allocatedInCurrentTier;
                    }
                }
            }

            if (!bestProduct || bestNetRate === -1) break;

            const pourAmount = Math.min(remaining, availableCapForBest);
            remaining -= pourAmount;
            
            bestProduct.allocatedInCurrentTier += pourAmount;
            bestProduct.totalAllocated += pourAmount;
            
            const earnedHere = pourAmount * bestNetRate;
            bestProduct.totalEarnings += earnedHere;
            
            bestProduct.breakdown.push(`₱${pourAmount.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} @ ${(bestNetRate / (1 - bestProduct.tax) * 100).toFixed(2)}%`);

            if (bestProduct.allocatedInCurrentTier >= bestProduct.tiers[bestProduct.currentTierIndex].max) {
                bestProduct.currentTierIndex++;
                bestProduct.allocatedInCurrentTier = 0; 
            }
            
            activeAllocations[`${bestProduct.bankId}_${bestProduct.productId}`] = bestProduct;
        }

        const finalResults = Object.values(activeAllocations).sort((a,b) => b.totalEarnings - a.totalEarnings);
        const totalNetEarnings = finalResults.reduce((sum, res) => sum + res.totalEarnings, 0);
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
    },

    // --- BANK BROWSER & STANDALONE CALCULATOR ---
    renderBankBrowser: () => {
        const grid = document.getElementById('bank-browser-grid');
        if (!grid || !window.YieldEngine.catalog) return;

        grid.innerHTML = window.YieldEngine.catalog.map(bank => `
            <div class="card" style="cursor: pointer; text-align: center; padding: 24px 16px; transition: transform 0.2s; background: var(--surface);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" onclick="window.YieldEngine.openBankProducts('${bank.id}')">
                <div style="font-size: 32px; margin-bottom: 12px; display: flex; justify-content: center;">
                    ${bank.icon_type === 'image' ? `<img src="${bank.icon_value}" style="height: 32px; width: 32px; object-fit: contain;">` : bank.icon_type === 'icon' ? atob(bank.icon_value) : bank.icon_value || '🏦'}
                </div>
                <h4 style="margin: 0; font-size: 14px;">${bank.name}</h4>
                <p class="text-muted" style="font-size: 11px; margin-top: 4px;">${bank.products.length} Products</p>
            </div>
        `).join('');
    },

    openBankProducts: (bankId) => {
        const bank = window.YieldEngine.catalog.find(b => b.id === bankId);
        if (!bank) return;

        document.getElementById('browser-bank-name').innerText = bank.name;
        
        document.getElementById('browser-products-list').innerHTML = bank.products.map(prod => {
            const maxRate = Math.max(...prod.tiers.map(t => t.rate));
            return `
                <div style="padding: 16px; background: var(--surface-hover); border-radius: 12px; cursor: pointer; border: 1px solid var(--border);" onclick="window.YieldEngine.openProductCalculator('${bank.id}', '${prod.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h4 style="margin: 0; font-size: 15px;">${prod.name}</h4>
                            <p class="text-muted" style="font-size: 12px; margin-top: 4px;">Up to ${(maxRate * 100).toFixed(2)}% Gross APY</p>
                        </div>
                        <span style="color: var(--primary);">➔</span>
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('bank-products-overlay').classList.add('active');
    },

    openProductCalculator: (bankId, productId) => {
        const bank = window.YieldEngine.catalog.find(b => b.id === bankId);
        window.YieldEngine.currentSelectedProduct = bank.products.find(p => p.id === productId);
        
        document.getElementById('calc-bank-name').innerText = bank.name;
        document.getElementById('calc-product-name').innerText = window.YieldEngine.currentSelectedProduct.name;
        
        document.getElementById('standalone-calc-input').value = '';
        window.YieldEngine.runStandaloneCalculator();

        document.getElementById('bank-products-overlay').classList.remove('active');
        document.getElementById('product-calculator-overlay').classList.add('active');
    },

runStandaloneCalculator: () => {
        const amount = parseFloat(document.getElementById('standalone-calc-input').value) || 0;
        const prod = window.YieldEngine.currentSelectedProduct;
        if (!prod) return;

        let remaining = amount;
        let totalAnnualNetInterest = 0;
        const sortedTiers = [...prod.tiers].sort((a,b) => (a.min || 0) - (b.min || 0));

        let breakdownHtml = '';
        let hasTiers = false;

        // Progressive filling for this single product
        for (const tier of sortedTiers) {
            if (remaining <= 0) break;
            
            const tierLimit = tier.max || Infinity;
            const fillAmount = Math.min(remaining, tierLimit);
            const netRate = tier.rate * (1 - (prod.tax || 0.20)); 
            
            totalAnnualNetInterest += fillAmount * netRate;
            remaining -= fillAmount;

            if (fillAmount > 0) {
                hasTiers = true;
                const formatAmt = window.formatMoney ? window.formatMoney(fillAmount, true) : '₱'+fillAmount.toLocaleString(undefined, {minimumFractionDigits:2});
                const rateStr = (tier.rate * 100).toFixed(2);
                const netStr = (netRate * 100).toFixed(2);
                
                breakdownHtml += `
                    <div style="background: var(--surface-hover); padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border);">
                        <span style="font-weight: 700; font-size: 14px;">${formatAmt}</span>
                        <div style="text-align: right;">
                            <span style="display: block; color: var(--primary); font-weight: 800; font-size: 14px;">${rateStr}% Gross</span>
                            <span class="text-muted" style="font-size: 11px;">${netStr}% Net</span>
                        </div>
                    </div>
                `;
            }
        }

        // Toggle the breakdown UI visibility based on whether we have allocations
        const bdContainer = document.getElementById('calc-tier-breakdown-container');
        if (bdContainer) {
            if (hasTiers && amount > 0) {
                bdContainer.style.display = 'block';
                document.getElementById('calc-tier-breakdown').innerHTML = breakdownHtml;
            } else {
                bdContainer.style.display = 'none';
            }
        }

        const dailyInterest = totalAnnualNetInterest / 360;
        const monthlyInterest = totalAnnualNetInterest / 12;
        const sixMonthInterest = monthlyInterest * 6;

        const safeSet = (id, val) => { 
            const el = document.getElementById(id); 
            if (el) el.innerText = window.formatMoney ? window.formatMoney(val, true) : '₱'+val.toLocaleString(undefined, {minimumFractionDigits:2}); 
        };
        
        safeSet('calc-daily-yield', dailyInterest);
        safeSet('calc-1mo-yield', monthlyInterest);
        safeSet('calc-6mo-yield', sixMonthInterest);
        safeSet('calc-1yr-yield', totalAnnualNetInterest);
    }
};

document.addEventListener('DOMContentLoaded', () => { 
    window.YieldEngine.init(); 
});