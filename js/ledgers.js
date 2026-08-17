window.LedgersEngine = {
    init: () => {
        window.LedgersEngine.injectModals();
        
        // Hook into the main app's boot sequence to render our ledgers automatically
        const origBoot = window.bootUI;
        window.bootUI = () => {
            if(origBoot) origBoot();
            window.LedgersEngine.renderList();
        };
    },

    // Dynamically injects all necessary modals to prevent HTML bloat
// Dynamically injects all necessary modals to prevent HTML bloat
    injectModals: () => {
        const modalsHTML = `
            <!-- Create Ledger Modal -->
            <div id="new-ledger-overlay" class="modal-overlay">
                <div class="account-modal-content card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <h3 style="margin:0;">Create New Ledger</h3>
                        <button class="icon-btn" onclick="document.getElementById('new-ledger-overlay').classList.remove('active')">✕</button>
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="text-muted">Person or Entity Name</label>
                        <input type="text" id="new-ledger-name" class="form-input" placeholder="e.g., John Doe">
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="text-muted">Currency</label>
                        <select id="new-ledger-currency" class="form-input"></select>
                    </div>
                    <button class="primary-btn" style="width: 100%; margin-top: 12px;" onclick="window.LedgersEngine.saveNewLedger()">Create Ledger</button>
                </div>
            </div>

            <!-- Ledger Details & Receipt Modal -->
            <div id="ledger-details-overlay" class="modal-overlay">
                <div class="account-modal-content card" style="max-width: 600px; width: 95%; max-height: 90vh; display: flex; flex-direction: column;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <div>
                            <h2 id="ledger-detail-name" style="margin-bottom: 4px;">Ledger Name</h2>
                            <p id="ledger-detail-status" class="text-muted" style="font-size: 13px; font-weight: bold; margin: 0;"></p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="icon-btn" onclick="window.LedgersEngine.generateReceipt()" title="Download Statement">📄</button>
                            <button class="icon-btn" onclick="document.getElementById('ledger-details-overlay').classList.remove('active')">✕</button>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                        <button class="secondary-btn" onclick="window.LedgersEngine.openAddItem()">+ Add Item</button>
                        <button class="primary-btn" onclick="window.LedgersEngine.openAddPayment()">+ Log Payment</button>
                    </div>

                    <div style="overflow-y: auto; flex: 1; padding-right: 8px;">
                        <h4 style="margin: 16px 0 8px 0; font-size: 14px;">Ledger History</h4>
                        <ul id="ledger-history-list" class="minimal-list"></ul>
                    </div>
                    
                    <!-- Hidden Receipt Canvas Area -->
                    <div id="ledger-receipt-capture" style="position: absolute; left: -9999px; top: -9999px; background: white; color: black; width: 800px; padding: 40px; border-radius: 8px; font-family: 'DM Sans', sans-serif;"></div>
                </div>
            </div>

            <!-- Add Ledger Item Modal -->
            <div id="ledger-item-overlay" class="modal-overlay" style="z-index: 9999;">
                <div class="account-modal-content card">
                    <h3 style="margin-bottom: 20px;">Log Ledger Item</h3>
                    <div class="form-group" style="display: flex; gap: 8px; margin-bottom: 16px;">
                        <button id="btn-lent-them" class="primary-btn" style="flex: 1;" onclick="window.LedgersEngine.setItemDirection(1)">I Lent Them</button>
                        <button id="btn-lent-me" class="secondary-btn" style="flex: 1;" onclick="window.LedgersEngine.setItemDirection(-1)">They Lent Me</button>
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="text-muted">Item / Reason</label>
                        <input type="text" id="ledger-item-name" class="form-input" placeholder="e.g., Dinner, Movie Tickets">
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="text-muted">Cost / Amount</label>
                        <input type="number" id="ledger-item-amount" class="form-input" placeholder="0.00">
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="text-muted">Notes (Optional)</label>
                        <input type="text" id="ledger-item-notes" class="form-input">
                    </div>
                    <div style="display: flex; gap: 12px; margin-top: 24px;">
                        <button class="secondary-btn" style="flex: 1;" onclick="document.getElementById('ledger-item-overlay').classList.remove('active')">Cancel</button>
                        <button class="primary-btn" style="flex: 1;" onclick="window.LedgersEngine.saveItem()">Save Item</button>
                    </div>
                </div>
            </div>

            <!-- Add Ledger Payment Modal -->
            <div id="ledger-payment-overlay" class="modal-overlay" style="z-index: 9999;">
                <div class="account-modal-content card">
                    <h3 style="margin-bottom: 20px;">Log Payment</h3>
                    <div class="form-group" style="display: flex; gap: 8px; margin-bottom: 16px;">
                        <button id="btn-paid-me" class="primary-btn" style="flex: 1;" onclick="window.LedgersEngine.setPaymentDirection(1)">They Paid Me</button>
                        <button id="btn-paid-them" class="secondary-btn" style="flex: 1;" onclick="window.LedgersEngine.setPaymentDirection(-1)">I Paid Them</button>
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="text-muted">Amount Paid</label>
                        <input type="number" id="ledger-payment-amount" class="form-input" placeholder="0.00">
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label id="ledger-payment-account-label" class="text-muted">Received To Account</label>
                        <select id="ledger-payment-account" class="form-input"></select>
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="text-muted">Notes / Mode of Payment</label>
                        <input type="text" id="ledger-payment-notes" class="form-input" placeholder="e.g., GCash, Cash, Bank Transfer">
                    </div>
                    <div style="display: flex; gap: 12px; margin-top: 24px;">
                        <button class="secondary-btn" style="flex: 1;" onclick="document.getElementById('ledger-payment-overlay').classList.remove('active')">Cancel</button>
                        <button class="primary-btn" style="flex: 1;" onclick="window.LedgersEngine.savePayment()">Save Payment</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalsHTML);
    },

    activeLedgerId: null,
    itemDirection: 1, // 1 = I lent them, -1 = They lent me
    paymentDirection: 1, // 1 = They paid me, -1 = I paid them

    renderList: () => {
        const container = document.getElementById('ledgers-list-container');
        if (!container) return;

        const ledgers = window.accountsData.filter(a => a.type === 'ledger');
        
        if (ledgers.length === 0) {
            container.innerHTML = `<div class="card" style="text-align: center; padding: 40px; color: var(--text-secondary);">No ledgers created yet. Create one to start tracking debts!</div>`;
            return;
        }

        container.innerHTML = ledgers.map(acc => {
            const sym = acc.currency ? window.getCurrencySymbol(acc.currency) : window.getCurrencySymbol(window.userSettings?.currency || '₱');
            const isOwed = acc.balance > 0;
            const isClear = acc.balance === 0;
            const statusColor = isClear ? 'var(--text-secondary)' : (isOwed ? 'var(--primary)' : 'var(--accent-red)');
            const statusText = isClear ? 'Settled' : (isOwed ? 'Owes you' : 'You owe');

            return `
                <div class="card" style="padding: 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${statusColor};" onclick="window.LedgersEngine.openDetails('${acc.id}')">
                    <div>
                        <h3 style="margin: 0 0 4px 0;">${acc.name}</h3>
                        <span style="font-size: 13px; color: ${statusColor}; font-weight: 600;">${statusText}</span>
                    </div>
                    <div style="text-align: right;">
                        <h3 style="margin: 0; color: ${statusColor};">${window.formatMoneyWithSymbol(Math.abs(acc.balance), sym)}</h3>
                    </div>
                </div>
            `;
        }).join('');
    },

    openNewLedgerModal: () => {
        const currencySelect = document.getElementById('new-ledger-currency');
        currencySelect.innerHTML = document.getElementById('exp-currency').innerHTML;
        window.setDefaultCurrencyDropdown('new-ledger-currency');
        document.getElementById('new-ledger-name').value = '';
        document.getElementById('new-ledger-overlay').classList.add('active');
    },

    saveNewLedger: async () => {
        const name = document.getElementById('new-ledger-name').value.trim();
        const currency = document.getElementById('new-ledger-currency').value;
        if (!name) return alert("Please enter a name for the ledger.");

        const accData = {
            id: window.generateUUID(),
            name: name,
            type: 'ledger',
            balance: 0,
            color: '#3A5DFF',
            note: 'Debt & Loan Tracking',
            favorite: false,
            currency: currency
        };

        window.accountsData.push(accData);
        await window.saveAccountsToCloud();
        
        document.getElementById('new-ledger-overlay').classList.remove('active');
        window.LedgersEngine.renderList();
    },

    openDetails: (id) => {
        window.LedgersEngine.activeLedgerId = id;
        const ledger = window.accountsData.find(a => a.id === id);
        if (!ledger) return;

        const sym = ledger.currency ? window.getCurrencySymbol(ledger.currency) : window.getCurrencySymbol(window.userSettings?.currency || '₱');
        
        document.getElementById('ledger-detail-name').innerText = ledger.name;
        
        const isOwed = ledger.balance > 0;
        const isClear = ledger.balance === 0;
        const statusEl = document.getElementById('ledger-detail-status');
        statusEl.innerText = isClear ? 'All Settled' : (isOwed ? `Owes you ${window.formatMoneyWithSymbol(Math.abs(ledger.balance), sym)}` : `You owe ${window.formatMoneyWithSymbol(Math.abs(ledger.balance), sym)}`);
        statusEl.style.color = isClear ? 'var(--text-secondary)' : (isOwed ? 'var(--primary)' : 'var(--accent-red)');

        // Gather all ledger items and related transfers
        const txs = window.appData.filter(t => 
            (t.type === 'LEDGER_ITEM' && t.account_id === id) || 
            (t.type === 'TRANSFER' && (t.account_id === id || t.to_account_id === id))
        ).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

        const list = document.getElementById('ledger-history-list');
        if (txs.length === 0) {
            list.innerHTML = '<li class="text-muted" style="text-align: center; padding: 20px;">No history recorded yet.</li>';
        } else {
            list.innerHTML = txs.map(t => {
                const date = new Date(t.timestamp).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                let title, amtColor, sign, sub;

                if (t.type === 'LEDGER_ITEM') {
                    title = t.name;
                    sub = t.notes || 'Item Logged';
                    amtColor = t.amount > 0 ? 'var(--primary)' : 'var(--accent-red)';
                    sign = t.amount > 0 ? '+' : '-';
                } else {
                    // Transfer / Payment logic
                    if (t.to_account_id === id) {
                        // Money went from Bank TO Ledger (I paid them)
                        title = 'You paid them';
                        sub = t.notes || 'Payment Sent';
                        amtColor = 'var(--primary)'; // Pushes balance positive
                        sign = '+';
                    } else {
                        // Money went from Ledger TO Bank (They paid me)
                        title = 'They paid you';
                        sub = t.notes || 'Payment Received';
                        amtColor = 'var(--accent-red)'; // Pushes balance negative
                        sign = '-';
                    }
                }

                return `
                    <li style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border);">
                        <div>
                            <span style="display: block; font-weight: 600;">${title}</span>
                            <span style="font-size: 11px; color: var(--text-secondary);">${date} • ${sub}</span>
                        </div>
                        <span style="font-weight: 700; color: ${amtColor};">${sign}${window.formatMoneyWithSymbol(Math.abs(t.amount), sym)}</span>
                    </li>
                `;
            }).join('');
        }

        document.getElementById('ledger-details-overlay').classList.add('active');
    },

    setItemDirection: (dir) => {
        window.LedgersEngine.itemDirection = dir;
        const btnLentThem = document.getElementById('btn-lent-them');
        const btnLentMe = document.getElementById('btn-lent-me');
        if (dir === 1) {
            btnLentThem.className = 'primary-btn';
            btnLentMe.className = 'secondary-btn';
        } else {
            btnLentThem.className = 'secondary-btn';
            btnLentMe.className = 'primary-btn';
            btnLentMe.style.backgroundColor = 'var(--accent-red)';
            btnLentMe.style.borderColor = 'var(--accent-red)';
            btnLentMe.style.color = 'white';
        }
    },

    openAddItem: () => {
        document.getElementById('ledger-item-name').value = '';
        document.getElementById('ledger-item-amount').value = '';
        document.getElementById('ledger-item-notes').value = '';
        window.LedgersEngine.setItemDirection(1);
        document.getElementById('ledger-item-overlay').classList.add('active');
    },

    saveItem: async () => {
        const id = window.LedgersEngine.activeLedgerId;
        const ledger = window.accountsData.find(a => a.id === id);
        if (!ledger) return;

        const name = document.getElementById('ledger-item-name').value.trim();
        const rawAmount = parseFloat(document.getElementById('ledger-item-amount').value);
        const notes = document.getElementById('ledger-item-notes').value.trim();

        if (!name || !rawAmount || isNaN(rawAmount)) return alert("Name and Amount required.");

        // Positive if I lent them, Negative if they lent me
        const finalAmount = rawAmount * window.LedgersEngine.itemDirection;

        const tx = {
            user_id: window.currentUser.id,
            fingerprint: `${new Date().toISOString()}_ledgeritem_${rawAmount}`,
            type: 'LEDGER_ITEM',
            category: 'LEDGER',
            name: name,
            amount: finalAmount, // Native ledger currency logic applied
            notes: notes,
            account_id: id,
            timestamp: new Date().toISOString()
        };

        const { error } = await window.supabase.from('transactions').insert([tx]);
        if (error) return alert("Error saving item.");

        ledger.balance += finalAmount;
        await window.saveAccountsToCloud();
        await window.loadCloudData();
        
        document.getElementById('ledger-item-overlay').classList.remove('active');
        window.LedgersEngine.renderList();
        window.LedgersEngine.openDetails(id);
    },

    setPaymentDirection: (dir) => {
        window.LedgersEngine.paymentDirection = dir;
        const btnPaidMe = document.getElementById('btn-paid-me');
        const btnPaidThem = document.getElementById('btn-paid-them');
        const label = document.getElementById('ledger-payment-account-label');

        if (dir === 1) {
            btnPaidMe.className = 'primary-btn';
            btnPaidThem.className = 'secondary-btn';
            label.innerText = 'Received To Account';
        } else {
            btnPaidMe.className = 'secondary-btn';
            btnPaidThem.className = 'primary-btn';
            btnPaidThem.style.backgroundColor = 'var(--accent-red)';
            btnPaidThem.style.borderColor = 'var(--accent-red)';
            btnPaidThem.style.color = 'white';
            label.innerText = 'Paid From Account';
        }
    },

    openAddPayment: () => {
        document.getElementById('ledger-payment-amount').value = '';
        document.getElementById('ledger-payment-notes').value = '';
        window.LedgersEngine.setPaymentDirection(1);
        
        // Populate real accounts (exclude ledgers)
        const selectEl = document.getElementById('ledger-payment-account');
        const realAccounts = window.accountsData.filter(a => a.type !== 'ledger');
        selectEl.innerHTML = realAccounts.map(a => `<option value="${a.id}">${a.name} (${window.formatMoney(a.balance)})</option>`).join('');
        
        // Let Custom UI Wrapper beautify it
        window.applyCustomSelectUI(selectEl, realAccounts);

        document.getElementById('ledger-payment-overlay').classList.add('active');
    },

    savePayment: async () => {
        const ledgerId = window.LedgersEngine.activeLedgerId;
        const ledger = window.accountsData.find(a => a.id === ledgerId);
        const realAccId = document.getElementById('ledger-payment-account').value;
        const realAcc = window.accountsData.find(a => a.id === realAccId);
        
        const rawAmount = parseFloat(document.getElementById('ledger-payment-amount').value);
        const notes = document.getElementById('ledger-payment-notes').value.trim();

        if (!realAcc) return alert("Please select a valid bank/cash account.");
        if (!rawAmount || isNaN(rawAmount)) return alert("Amount required.");

        let fromId, toId;

        if (window.LedgersEngine.paymentDirection === 1) {
            // They paid me: From Ledger To Bank
            fromId = ledgerId;
            toId = realAccId;
        } else {
            // I paid them: From Bank To Ledger
            fromId = realAccId;
            toId = ledgerId;
        }

        // We assume the amount entered is in the Ledger's native currency for simplicity here.
        // Transfer logic natively deducts from 'From' and adds to 'To'.
        const tx = {
            user_id: window.currentUser.id,
            fingerprint: `${new Date().toISOString()}_ledgerpayment_${rawAmount}`,
            type: 'TRANSFER',
            category: 'TRANSFER',
            name: notes || 'Ledger Payment',
            amount: rawAmount,           
            notes: notes,
            account_id: fromId,
            to_account_id: toId,
            timestamp: new Date().toISOString()
        };

        const { error } = await window.supabase.from('transactions').insert([tx]);
        if (error) return alert("Error saving payment.");

        if (window.LedgersEngine.paymentDirection === 1) {
            ledger.balance -= rawAmount;
            realAcc.balance += rawAmount; // Convert if different currencies later via convertCurrency
        } else {
            realAcc.balance -= rawAmount;
            ledger.balance += rawAmount;
        }

        await window.saveAccountsToCloud();
        await window.loadCloudData();
        
        document.getElementById('ledger-payment-overlay').classList.remove('active');
        window.LedgersEngine.renderList();
        window.LedgersEngine.openDetails(ledgerId);
        window.bootUI(); // Refresh main dashboard
    },

    generateReceipt: () => {
        const id = window.LedgersEngine.activeLedgerId;
        const ledger = window.accountsData.find(a => a.id === id);
        if (!ledger) return;

        const sym = ledger.currency ? window.getCurrencySymbol(ledger.currency) : window.getCurrencySymbol(window.userSettings?.currency || '₱');
        
        const txs = window.appData.filter(t => 
            (t.type === 'LEDGER_ITEM' && t.account_id === id) || 
            (t.type === 'TRANSFER' && (t.account_id === id || t.to_account_id === id))
        ).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)); // Oldest to newest

        const items = txs.filter(t => t.type === 'LEDGER_ITEM');
        const payments = txs.filter(t => t.type === 'TRANSFER');

        const formatDt = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        const itemsRows = items.map(t => `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${formatDt(t.timestamp)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${t.name} <br><span style="font-size: 11px; color: #6B7280;">${t.notes||''}</span></td>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; color: #00B85C; font-weight: bold;">${t.amount > 0 ? window.formatMoneyWithSymbol(t.amount, sym) : '-'}</td>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; color: #FF4A4A; font-weight: bold;">${t.amount < 0 ? window.formatMoneyWithSymbol(Math.abs(t.amount), sym) : '-'}</td>
            </tr>
        `).join('');

        const paymentsRows = payments.map(t => {
            const theyPaid = t.to_account_id !== id;
            return `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${formatDt(t.timestamp)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">${theyPaid ? 'Payment Received' : 'Payment Sent'} <br><span style="font-size: 11px; color: #6B7280;">${t.notes||''}</span></td>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; font-weight: bold; color: #111;">${theyPaid ? '+' : '-'}${window.formatMoneyWithSymbol(t.amount, sym)}</td>
            </tr>`;
        }).join('');

        const isOwed = ledger.balance > 0;
        const statusText = ledger.balance === 0 ? 'Fully Settled' : (isOwed ? 'Outstanding Balance (They Owe)' : 'Outstanding Balance (You Owe)');
        const statusColor = ledger.balance === 0 ? '#6B7280' : (isOwed ? '#00B85C' : '#FF4A4A');

        const captureDiv = document.getElementById('ledger-receipt-capture');
        captureDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #111; padding-bottom: 20px; margin-bottom: 24px;">
                <div>
                    <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -1px;">Statement of Account</h1>
                    <p style="margin: 4px 0 0 0; color: #6B7280; font-size: 14px;">Ledger Entity: <b>${ledger.name}</b></p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-size: 12px; color: #6B7280; text-transform: uppercase;">Generated On</p>
                    <p style="margin: 0; font-weight: 700; font-size: 14px;">${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric'})}</p>
                </div>
            </div>

            <h3 style="font-size: 16px; margin-bottom: 12px; color: #111;">1. Itemized Transactions</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 32px; text-align: left;">
                <thead>
                    <tr style="background: #F3F4F6;">
                        <th style="padding: 12px;">Date</th>
                        <th style="padding: 12px;">Item / Description</th>
                        <th style="padding: 12px;">You Lent (+)</th>
                        <th style="padding: 12px;">They Lent (-)</th>
                    </tr>
                </thead>
                <tbody>${itemsRows || '<tr><td colspan="4" style="padding: 12px; text-align: center; color: #6B7280;">No items recorded.</td></tr>'}</tbody>
            </table>

            <h3 style="font-size: 16px; margin-bottom: 12px; color: #111;">2. Payment History</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 32px; text-align: left;">
                <thead>
                    <tr style="background: #F3F4F6;">
                        <th style="padding: 12px;">Date</th>
                        <th style="padding: 12px;">Mode / Notes</th>
                        <th style="padding: 12px;">Amount Applied</th>
                    </tr>
                </thead>
                <tbody>${paymentsRows || '<tr><td colspan="3" style="padding: 12px; text-align: center; color: #6B7280;">No payments recorded.</td></tr>'}</tbody>
            </table>

            <div style="background: #F9FAFB; padding: 24px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 18px; color: #111;">${statusText}</h3>
                <h2 style="margin: 0; font-size: 28px; font-weight: 900; color: ${statusColor};">${window.formatMoneyWithSymbol(Math.abs(ledger.balance), sym)}</h2>
            </div>
        `;

        if (typeof html2canvas === 'undefined') return alert("Image engine still loading.");
        
        html2canvas(captureDiv, { scale: 2, backgroundColor: '#FFFFFF' }).then(canvas => {
            const link = document.createElement('a');
            link.download = `Ledger_Statement_${ledger.name.replace(/\s+/g, '_')}.png`;
            link.href = canvas.toDataURL('image/png'); link.click();
        });
    }
};

// Initialize Ledgers module automatically
document.addEventListener('DOMContentLoaded', () => {
    window.LedgersEngine.init();
});