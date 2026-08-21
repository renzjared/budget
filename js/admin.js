window.AdminEngine = {
    ALLOWED_ADMIN_UID: 'e0b7eea1-cdd7-410c-ad57-86e99040551c',
    
    init: () => {
        window.AdminEngine.verifyAdminAccess();
    },

    verifyAdminAccess: () => {
        if (!window.currentUser) return;
        
        // Check the immutable Supabase User ID
        if (window.currentUser.id === window.AdminEngine.ALLOWED_ADMIN_UID) {
            document.getElementById('admin-nav-btn').style.display = 'flex';
            window.AdminEngine.loadCatalog();
        }
    },

    loadCatalog: async () => {
        const { data, error } = await window.supabase.from('banks_catalog').select('*').order('name');
        if (error) return console.error('Failed to load catalog', error);
        
        // Update local Yield engine catalog
        if (window.YieldEngine) window.YieldEngine.catalog = data;
        
        // Render Admin List
        const list = document.getElementById('admin-bank-list');
        list.innerHTML = data.map(bank => `
            <li class="tx-item" style="padding: 12px 8px; cursor: pointer; border-bottom: 1px solid var(--border);" onclick='window.AdminEngine.editBank(${JSON.stringify(bank).replace(/'/g, "&apos;")})'>
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span style="font-weight: 600;">${bank.name}</span>
                    <span class="text-muted" style="font-size: 12px;">${bank.tiers.length} Tiers</span>
                </div>
            </li>
        `).join('');
    },

    clearForm: () => {
        document.getElementById('admin-editor-card').style.opacity = '1';
        document.getElementById('admin-editor-card').style.pointerEvents = 'auto';
        
        document.getElementById('admin-id').value = '';
        document.getElementById('admin-bank-id').value = '';
        document.getElementById('admin-name').value = '';
        document.getElementById('admin-product').value = '';
        document.getElementById('admin-color').value = '#3A5DFF';
        document.getElementById('admin-tax').value = '0.20';
        document.getElementById('admin-icon-type').value = 'letter';
        document.getElementById('admin-icon-value').value = '';
        document.getElementById('admin-current-icon-display').innerHTML = '?';
        
        document.getElementById('admin-tiers-container').innerHTML = '';
        document.getElementById('admin-delete-btn').style.display = 'none';
        
        document.getElementById('admin-is-td').checked = false;
        document.getElementById('admin-lockup').value = '0';

        window.AdminEngine.addTierRow(); // Add 1 empty row by default
    },

    editBank: (bank) => {
        window.AdminEngine.clearForm();
        
        document.getElementById('admin-id').value = bank.id;
        document.getElementById('admin-bank-id').value = bank.bank_id;
        document.getElementById('admin-name').value = bank.name;
        document.getElementById('admin-product').value = bank.product;
        document.getElementById('admin-color').value = bank.color;
        document.getElementById('admin-tax').value = bank.tax;
        document.getElementById('admin-delete-btn').style.display = 'block';

        document.getElementById('admin-is-td').checked = bank.is_time_deposit || false;
        document.getElementById('admin-lockup').value = bank.lockup_days || 0;

        // Load Icon
        window.iconTargetPrefix = 'admin';
        window.selectIcon(bank.icon_type || 'letter', bank.icon_value || bank.name.charAt(0));

        // Load Tiers
        const container = document.getElementById('admin-tiers-container');
        container.innerHTML = '';
        bank.tiers.forEach(t => window.AdminEngine.addTierRow(t));
    },

    addTierRow: (tier = { min: 0, max: 100000, rate: 0.05, note: '' }) => {
        const row = document.createElement('div');
        row.className = 'tier-row';
        row.style.cssText = 'display: flex; gap: 8px; align-items: flex-end; background: var(--surface-hover); padding: 12px; border-radius: 8px; border: 1px solid var(--border);';
        
        // Max value handling for visual layout (empty means Infinity)
        const displayMax = tier.max >= 999999999 ? '' : tier.max;
        const displayRate = (tier.rate * 100).toFixed(2);

        row.innerHTML = `
            <div style="flex: 1;"><label class="text-muted" style="font-size: 11px;">Min (₱)</label><input type="number" class="form-input t-min" value="${tier.min}"></div>
            <div style="flex: 1;"><label class="text-muted" style="font-size: 11px;">Max Cap (Leave blank for Uncapped)</label><input type="number" class="form-input t-max" value="${displayMax}" placeholder="Uncapped"></div>
            <div style="flex: 1;"><label class="text-muted" style="font-size: 11px;">Gross Rate (%)</label><input type="number" class="form-input t-rate" value="${displayRate}" step="0.01"></div>
            <div style="flex: 2;"><label class="text-muted" style="font-size: 11px;">Note</label><input type="text" class="form-input t-note" value="${tier.note}" placeholder="e.g. Base Rate"></div>
            <button class="icon-btn" style="color: var(--accent-red); margin-bottom: 8px;" onclick="this.parentElement.remove()">✕</button>
        `;
        document.getElementById('admin-tiers-container').appendChild(row);
    },

    saveBank: async () => {
        const id = document.getElementById('admin-id').value;
        const bankId = document.getElementById('admin-bank-id').value.trim();
        const name = document.getElementById('admin-name').value.trim();
        
        if (!bankId || !name) return alert('Bank Code ID and Name are required.');

        // Compile Tiers
        const tiers = [];
        document.querySelectorAll('.tier-row').forEach(row => {
            const min = parseFloat(row.querySelector('.t-min').value) || 0;
            const maxVal = row.querySelector('.t-max').value;
            const max = maxVal ? parseFloat(maxVal) : 999999999; // Represents Infinity
            const rate = (parseFloat(row.querySelector('.t-rate').value) || 0) / 100;
            const note = row.querySelector('.t-note').value.trim();
            tiers.push({ min, max, rate, note });
        });

        const payload = {
            bank_id: bankId,
            name: name,
            product: document.getElementById('admin-product').value.trim(),
            color: document.getElementById('admin-color').value,
            tax: parseFloat(document.getElementById('admin-tax').value) || 0.20,
            icon_type: document.getElementById('admin-icon-type').value,
            icon_value: document.getElementById('admin-icon-value').value,
            is_time_deposit: document.getElementById('admin-is-td').checked,
            lockup_days: parseInt(document.getElementById('admin-lockup').value) || 0,
            tiers: tiers
        };
        if (window.showLoadingToast) window.showLoadingToast('Saving bank to catalog...');

        let req;
        if (id) {
            req = window.supabase.from('banks_catalog').update(payload).eq('id', id);
        } else {
            req = window.supabase.from('banks_catalog').insert([payload]);
        }

        const { error } = await req;
        if (error) return alert('Failed to save bank: ' + error.message);

        if (window.showToast) window.showToast('Bank successfully saved!');
        window.AdminEngine.loadCatalog();
        window.AdminEngine.clearForm();
    },

    deleteBank: async () => {
        if (!confirm('Are you sure you want to delete this bank from the global catalog?')) return;
        
        const id = document.getElementById('admin-id').value;
        const { error } = await window.supabase.from('banks_catalog').delete().eq('id', id);
        
        if (error) return alert('Failed to delete: ' + error.message);
        
        if (window.showToast) window.showToast('Bank deleted');
        window.AdminEngine.loadCatalog();
        window.AdminEngine.clearForm();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Run verification slightly delayed to ensure currentUser is loaded
    setTimeout(() => { window.AdminEngine.init(); }, 1500);
});