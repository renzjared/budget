window.AdminEngine = {
    ALLOWED_ADMIN_UID: 'e0b7eea1-cdd7-410c-ad57-86e99040551c',
    currentBank: null,

    init: () => { window.AdminEngine.verifyAdminAccess(); },

    verifyAdminAccess: () => {
        if (!window.currentUser) return;
        if (window.currentUser.id === window.AdminEngine.ALLOWED_ADMIN_UID) {
            document.getElementById('admin-nav-btn').style.display = 'flex';
            window.AdminEngine.loadCatalog();
        }
    },

    toggleBankCollapse: (bankId) => {
        // Close all other product lists
        document.querySelectorAll('[id^="products-list-"]').forEach(el => {
            if (el.id !== `products-list-${bankId}`) el.style.display = 'none';
        });
        // Reset all arrows
        document.querySelectorAll('[id^="arrow-"]').forEach(el => {
            if (el.id !== `arrow-${bankId}`) el.style.transform = 'rotate(0deg)';
        });

        if (!bankId) return; // If null, we just wanted to collapse everything

        // Toggle the clicked one
        const prodList = document.getElementById(`products-list-${bankId}`);
        const arrow = document.getElementById(`arrow-${bankId}`);
        if (prodList) {
            if (prodList.style.display === 'none') {
                prodList.style.display = 'flex';
                if (arrow) arrow.style.transform = 'rotate(180deg)';
            } else {
                prodList.style.display = 'none';
                if (arrow) arrow.style.transform = 'rotate(0deg)';
            }
        }
    },

    loadCatalog: async () => {
        const { data, error } = await window.supabase.from('banks_catalog').select('*').order('name');
        if (error) return console.error('Failed to load catalog', error);
        
        if (window.YieldEngine) window.YieldEngine.catalog = data;
        
        const list = document.getElementById('admin-bank-list');
        list.innerHTML = data.map(bank => {
            
            // Format the specific products cleanly on their own lines
            const productItems = (bank.products || []).length > 0 
                ? (bank.products || []).map(p => `
                    <div style="font-size: 12px; color: var(--text-secondary); padding: 6px 0 6px 12px; border-left: 2px solid ${bank.color}; margin-left: 4px;">
                        <span style="color: var(--text); font-weight: 500;">${p.name}</span> <span style="opacity: 0.6;">(${p.type === 'time_deposit' ? 'Time Deposit' : 'Savings'})</span>
                    </div>
                `).join('')
                : '<div style="font-size: 11px; color: var(--text-secondary); margin-left: 4px; padding: 4px 0;">No products configured.</div>';

            return `
            <li class="card" style="padding: 12px; border: 1px solid var(--border); transition: border-color 0.2s;">
                <!-- Clickable Header: Contains Name and Capsule stacked vertically -->
                <div style="cursor: pointer; display: flex; flex-direction: column; gap: 8px;" onclick='window.AdminEngine.toggleBankCollapse("${bank.id}"); window.AdminEngine.editBank(${JSON.stringify(bank).replace(/'/g, "&apos;")})'>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 800; color: ${bank.color}; font-size: 16px;">${bank.name}</span>
                        <span id="arrow-${bank.id}" style="font-size: 10px; transition: transform 0.2s; color: var(--text-secondary);">▼</span>
                    </div>
                    <span style="font-size: 10px; background: var(--surface-hover); padding: 4px 8px; border-radius: 4px; width: fit-content; color: var(--text-secondary); font-weight: 700;">${bank.products?.length || 0} Products</span>
                </div>
                
                <!-- Hidden Accordion: Contains the separated list of products -->
                <div id="products-list-${bank.id}" style="display: none; flex-direction: column; gap: 4px; margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px;">
                    ${productItems}
                </div>
            </li>
            `;
        }).join('');
    },

    clearForm: () => {
        window.AdminEngine.toggleBankCollapse(null); // Force close any open dropdowns
        
        document.getElementById('admin-editor-card').style.opacity = '1';
        document.getElementById('admin-editor-card').style.pointerEvents = 'auto';
        
        document.getElementById('admin-id').value = '';
        document.getElementById('admin-name').value = '';
        document.getElementById('admin-color').value = '#3A5DFF';
        document.getElementById('admin-referral').value = '';
        document.getElementById('admin-icon-type').value = 'letter';
        document.getElementById('admin-icon-value').value = '';
        document.getElementById('admin-current-icon-display').innerHTML = '?';
        document.getElementById('admin-delete-btn').style.display = 'none';
        
        window.AdminEngine.currentBank = { products: [] };
        window.AdminEngine.renderProducts();
    },

    editBank: (bank) => {
        window.AdminEngine.clearForm();
        window.AdminEngine.currentBank = bank;
        
        document.getElementById('admin-id').value = bank.id;
        document.getElementById('admin-name').value = bank.name;
        document.getElementById('admin-color').value = bank.color;
        document.getElementById('admin-referral').value = bank.referral_code || '';
        document.getElementById('admin-delete-btn').style.display = 'block';

        window.iconTargetPrefix = 'admin';
        window.selectIcon(bank.icon_type || 'letter', bank.icon_value || bank.name.charAt(0));

        if (!window.AdminEngine.currentBank.products) window.AdminEngine.currentBank.products = [];
        window.AdminEngine.renderProducts();
    },

    addProduct: () => {
        window.AdminEngine.currentBank.products.push({
            id: 'prod_' + Date.now(),
            name: 'New Product',
            type: 'savings',
            crediting: 'monthly',
            lockup_days: 0,
            tax: 0.20,
            tiers: [{ min: 0, max: null, rate: 0.05, note: 'Base' }]
        });
        window.AdminEngine.renderProducts();
    },

    removeProduct: (pIdx) => {
        if (!confirm("Remove this product?")) return;
        window.AdminEngine.currentBank.products.splice(pIdx, 1);
        window.AdminEngine.renderProducts();
    },

    addTier: (pIdx) => {
        window.AdminEngine.currentBank.products[pIdx].tiers.push({ min: 0, max: null, rate: 0.05, note: '' });
        window.AdminEngine.renderProducts();
    },

    removeTier: (pIdx, tIdx) => {
        window.AdminEngine.currentBank.products[pIdx].tiers.splice(tIdx, 1);
        window.AdminEngine.renderProducts();
    },

    syncDOMToState: () => {
        // Grab product data from DOM before re-rendering
        document.querySelectorAll('.admin-product-card').forEach((pCard, pIdx) => {
            const prod = window.AdminEngine.currentBank.products[pIdx];
            prod.name = pCard.querySelector('.p-name').value;
            prod.type = pCard.querySelector('.p-type').value;
            prod.crediting = pCard.querySelector('.p-crediting').value;
            prod.lockup_days = parseInt(pCard.querySelector('.p-lockup').value) || 0;
            prod.tax = parseFloat(pCard.querySelector('.p-tax').value) || 0;

            pCard.querySelectorAll('.tier-row').forEach((tRow, tIdx) => {
                const tier = prod.tiers[tIdx];
                tier.min = parseFloat(tRow.querySelector('.t-min').value) || 0;
                const mVal = tRow.querySelector('.t-max').value;
                tier.max = mVal ? parseFloat(mVal) : null; // null = Infinity
                tier.rate = (parseFloat(tRow.querySelector('.t-rate').value) || 0) / 100;
                tier.note = tRow.querySelector('.t-note').value;
            });
        });
    },

    renderProducts: () => {
        const container = document.getElementById('admin-products-container');
        container.innerHTML = window.AdminEngine.currentBank.products.map((p, pIdx) => {
            
            const tiersHtml = (p.tiers || []).map((t, tIdx) => `
                <div class="tier-row" style="display: flex; gap: 8px; align-items: flex-end; padding: 8px 0; border-bottom: 1px dashed var(--border);">
                    <div style="flex: 1;"><label class="text-muted" style="font-size: 10px;">Min (₱)</label><input type="number" class="form-input t-min" value="${t.min}" onchange="window.AdminEngine.syncDOMToState()"></div>
                    <div style="flex: 1;"><label class="text-muted" style="font-size: 10px;">Max Cap (Blank=∞)</label><input type="number" class="form-input t-max" value="${t.max !== null ? t.max : ''}" placeholder="Uncapped" onchange="window.AdminEngine.syncDOMToState()"></div>
                    <div style="flex: 1;"><label class="text-muted" style="font-size: 10px;">Rate (%)</label><input type="number" class="form-input t-rate" value="${(t.rate * 100).toFixed(2)}" step="0.01" onchange="window.AdminEngine.syncDOMToState()"></div>
                    <div style="flex: 2;"><label class="text-muted" style="font-size: 10px;">Note</label><input type="text" class="form-input t-note" value="${t.note || ''}" onchange="window.AdminEngine.syncDOMToState()"></div>
                    <button class="icon-btn" style="color: var(--accent-red); margin-bottom: 4px;" onclick="window.AdminEngine.syncDOMToState(); window.AdminEngine.removeTier(${pIdx}, ${tIdx})">✕</button>
                </div>
            `).join('');

            return `
                <div class="admin-product-card" style="background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h4 style="margin: 0;">Product #${pIdx + 1}</h4>
                        <button class="text-btn" style="color: var(--accent-red); font-size: 12px;" onclick="window.AdminEngine.syncDOMToState(); window.AdminEngine.removeProduct(${pIdx})">Remove Product</button>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                        <div><label class="text-muted" style="font-size: 11px;">Product Name</label><input type="text" class="form-input p-name" value="${p.name}" onchange="window.AdminEngine.syncDOMToState()"></div>
                        <div><label class="text-muted" style="font-size: 11px;">Type</label><select class="form-input p-type" onchange="window.AdminEngine.syncDOMToState()"><option value="savings" ${p.type === 'savings' ? 'selected' : ''}>Savings</option><option value="time_deposit" ${p.type === 'time_deposit' ? 'selected' : ''}>Time Deposit</option></select></div>
                        <div><label class="text-muted" style="font-size: 11px;">Tax Rate</label><input type="number" class="form-input p-tax" value="${p.tax}" step="0.01" onchange="window.AdminEngine.syncDOMToState()"></div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; padding: 12px; background: var(--surface-hover); border-radius: 8px;">
                        <div><label class="text-muted" style="font-size: 11px;">Interest Crediting</label><select class="form-input p-crediting" onchange="window.AdminEngine.syncDOMToState()"><option value="daily" ${p.crediting === 'daily' ? 'selected' : ''}>Daily</option><option value="monthly" ${p.crediting === 'monthly' ? 'selected' : ''}>Monthly</option><option value="yearly" ${p.crediting === 'yearly' ? 'selected' : ''}>Yearly</option><option value="maturity" ${p.crediting === 'maturity' ? 'selected' : ''}>At Maturity</option></select></div>
                        <div><label class="text-muted" style="font-size: 11px;">Lockup Days (0 if Savings)</label><input type="number" class="form-input p-lockup" value="${p.lockup_days}" onchange="window.AdminEngine.syncDOMToState()"></div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h5 style="margin: 0; color: var(--text-secondary);">Yield Tiers</h5>
                        <button class="secondary-btn" style="padding: 4px 8px; font-size: 11px;" onclick="window.AdminEngine.syncDOMToState(); window.AdminEngine.addTier(${pIdx})">+ Add Tier</button>
                    </div>
                    <div style="background: var(--surface); padding: 8px; border-radius: 8px;">
                        ${tiersHtml}
                    </div>
                </div>
            `;
        }).join('');
    },

    saveBank: async () => {
        window.AdminEngine.syncDOMToState(); // Final grab
        const id = document.getElementById('admin-id').value;
        const name = document.getElementById('admin-name').value.trim();
        if (!name) return alert('Bank Name is required.');

        const payload = {
            name: name,
            color: document.getElementById('admin-color').value,
            referral_code: document.getElementById('admin-referral').value.trim(),
            icon_type: document.getElementById('admin-icon-type').value,
            icon_value: document.getElementById('admin-icon-value').value,
            products: window.AdminEngine.currentBank.products
        };

        if (window.showLoadingToast) window.showLoadingToast('Saving bank to catalog...');

        const { error } = id ? await window.supabase.from('banks_catalog').update(payload).eq('id', id) : await window.supabase.from('banks_catalog').insert([payload]);

        if (error) return alert('Failed to save bank: ' + error.message);
        if (window.showToast) window.showToast('Bank successfully saved!');
        
        window.AdminEngine.loadCatalog();
        window.AdminEngine.clearForm();
    },

    deleteBank: async () => {
        if (!confirm('Permanently delete this bank and all its products?')) return;
        const id = document.getElementById('admin-id').value;
        await window.supabase.from('banks_catalog').delete().eq('id', id);
        if (window.showToast) window.showToast('Bank deleted');
        window.AdminEngine.loadCatalog();
        window.AdminEngine.clearForm();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { window.AdminEngine.init(); }, 1500);
});