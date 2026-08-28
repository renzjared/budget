window.LedgersEngine = {
    init: () => {
        window.LedgersEngine.injectModals();
        
        const origBoot = window.bootUI;
        window.bootUI = () => {
            if(origBoot) origBoot();
            window.LedgersEngine.renderList();
        };
    },

    activeLedgerId: null,
    isReadOnly: false, 
    itemDirection: 1, 
    paymentDirection: 1, 
    sharedOwnerName: null,

    // --- DEEP LINKING URL ROUTER ---
    initSharedView: async (token) => {
        document.getElementById('main-sidebar').style.display = 'none';
        
        // Fetch ledger by URL token
        const { data: ledger, error } = await window.supabase.from('accounts').select('*').eq('share_token', token).single();
        
        if (error || !ledger || ledger.sharing_mode === 'private') {
            document.body.innerHTML = `<div style="padding: 40px; text-align: center; font-family: sans-serif;"><h2>Access Denied</h2><p>This ledger is private or does not exist.</p><a href="/">Go to Homepage</a></div>`;
            return;
        }

        // Identify Owner
        const { data: owner } = await window.supabase.from('profiles').select('username').eq('id', ledger.user_id).single();
        window.LedgersEngine.sharedOwnerName = owner?.username || 'User';

        // Selected Mode Authentication & Invite Check
        if (ledger.sharing_mode === 'selected') {
            if (!window.currentUser) {
                window.location.href = '/'; // Force login if not authenticated
                return;
            }
            
            const currentUsername = window.userProfile?.username?.toLowerCase();
            const meta = window.currentUser?.user_metadata || {};
            const dName1 = (meta.full_name || '').toLowerCase();
            const dName2 = (meta.name || '').toLowerCase();
            const dName3 = (meta.preferred_username || '').toLowerCase();

            const { data: allShares } = await window.supabase.from('ledger_shares').select('*').eq('ledger_id', ledger.id);
            
            let matchedShare = null;
            if (allShares) {
                matchedShare = allShares.find(s => {
                    const target = s.target_username.toLowerCase();
                    // Match legacy format or exact App User format
                    if (target === currentUsername || target === `app#${currentUsername}`) return true;
                    // Match Discord format
                    if (target.startsWith('discord#')) {
                        const dTarget = target.split('#')[1];
                        if (dTarget === dName1 || dTarget === dName2 || dTarget === dName3) return true;
                    }
                    return false;
                });
            }

            // Block access if they are neither the owner nor on the invite list
            if (!matchedShare && ledger.user_id !== window.currentUser.id) {
                document.body.innerHTML = `<div style="padding: 40px; text-align: center; font-family: sans-serif;"><h2>Access Denied</h2><p>You do not have permission to view this ledger.</p><a href="/">Go to Homepage</a></div>`;
                return;
            }

            // If the user accessed the link successfully, auto-convert their status to accepted
            if (matchedShare && matchedShare.status === 'pending') {
                await window.supabase.from('ledger_shares').update({ status: 'accepted' }).eq('id', matchedShare.id);
            }
        }

        // Banner and layout for Logged-Out Guests
        if (!window.currentUser) {
            const publicBanner = document.getElementById('public-ledger-banner');
            if (publicBanner) publicBanner.style.display = 'flex';
            window.switchView('landing'); 
        }

        // Fetch Read-Only Transactions
        const { data: txs } = await window.supabase.from('transactions').select('*').or(`account_id.eq.${ledger.id},to_account_id.eq.${ledger.id}`);
        
        // Safely inject into state so the modal functions don't break
        if (!window.accountsData) window.accountsData = [];
        if (!window.appData) window.appData = [];
        
        if (!window.accountsData.find(a => a.id === ledger.id)) {
            window.accountsData.push(ledger);
        }
        
        if (txs) {
            const existingTxIds = new Set(window.appData.map(t => t.id));
            txs.forEach(t => {
                if (!existingTxIds.has(t.id)) window.appData.push(t);
            });
        }
        
        const isOwner = window.currentUser && ledger.user_id === window.currentUser.id;
        window.LedgersEngine.openDetails(ledger.id, !isOwner); // Force Read Only if not owner
    },

    injectModals: () => {
        const modalsHTML = `
            <!-- Dashboard Ledger Select Modal -->
            <div id="dashboard-ledger-select-overlay" class="modal-overlay" style="z-index: 9999;">
                <div class="account-modal-content card" style="overflow: visible;">
                    <header style="display: flex; justify-content: space-between; margin-bottom: 24px;">
                        <h3 style="margin: 0;">Select Ledger</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('dashboard-ledger-select-overlay').classList.remove('active')">✕</button>
                    </header>
                    <div class="form-group" style="margin-bottom: 24px;">
                        <label class="text-muted" style="display: block; margin-bottom: 12px;">Which ledger do you want to view/manage?</label>
                        <select id="dashboard-ledger-select" class="form-input"></select>
                    </div>
                    <button class="primary-btn" style="width: 100%;" onclick="window.LedgersEngine.openSelectedLedger()">Open Ledger</button>
                </div>
            </div>

            <!-- Create Ledger Modal -->
            <div id="new-ledger-overlay" class="modal-overlay">
                <div class="account-modal-content card">
                    <header style="display: flex; justify-content: space-between; margin-bottom: 24px;">
                        <h3 style="margin: 0;">Create New Ledger</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('new-ledger-overlay').classList.remove('active')">✕</button>
                    </header>
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

            <!-- Ledger Details Modal -->
            <div id="ledger-details-overlay" class="modal-overlay">
                <div class="account-modal-content card" style="max-width: 600px; width: 95%; max-height: 90vh; display: flex; flex-direction: column;">
                    <header style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
                        <div>
                            <h2 id="ledger-detail-name" style="margin-bottom: 4px;">Ledger Name</h2>
                            <p id="ledger-detail-status" class="text-muted" style="font-size: 13px; font-weight: bold; margin: 0;"></p>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <button id="ledger-share-btn" class="icon-btn" onclick="window.LedgersEngine.openShareModal()" title="Share Ledger" style="color: var(--text);">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                            </button>
                            <button class="icon-btn" onclick="window.LedgersEngine.previewReceipt()" title="Statement of Account" style="color: var(--primary);">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            </button>
                            <button class="close-modal-btn" onclick="document.getElementById('ledger-details-overlay').classList.remove('active')">✕</button>
                        </div>
                    </header>
                    
                    <div id="ledger-actions-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                        <button class="secondary-btn" onclick="window.LedgersEngine.openAddItem()">+ Add Item</button>
                        <button class="primary-btn" onclick="window.LedgersEngine.openAddPayment()">+ Log Payment</button>
                    </div>

                    <div style="overflow-y: auto; flex: 1; padding-right: 8px;">
                        <h4 style="margin: 16px 0 8px 0; font-size: 14px;">Ledger History</h4>
                        <ul id="ledger-history-list" class="minimal-list interactive-list"></ul>
                    </div>
                </div>
            </div>

            <!-- Share Ledger Modal -->
            <div id="share-ledger-overlay" class="modal-overlay" style="z-index: 10001;">
                <div class="account-modal-content card">
                    <header style="display: flex; justify-content: space-between; margin-bottom: 24px;">
                        <h3 style="margin: 0;">Share Ledger</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('share-ledger-overlay').classList.remove('active')">✕</button>
                    </header>

                    <div class="form-group" style="margin-bottom: 24px;">
                        <label class="text-muted">General Access</label>
                        <select id="share-mode-select" class="form-input" onchange="window.LedgersEngine.changeSharingMode(this.value)">
                            <option value="private">🔒 Private (Only you)</option>
                            <option value="selected">👥 Selected Users</option>
                            <option value="public">🌐 Anyone with the link</option>
                        </select>
                    </div>

                    <div id="share-link-group" class="form-group" style="margin-bottom: 24px; display: none;">
                        <label class="text-muted">Public Link (View Only)</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="share-link-input" class="form-input" readonly style="color: var(--text-secondary); background: var(--surface-hover);">
                            <button class="primary-btn" onclick="window.LedgersEngine.copyShareLink()">Copy</button>
                        </div>
                    </div>

                    <div id="share-selected-group" style="display: none; border-top: 1px solid var(--border); padding-top: 24px;">
                        <label class="text-muted" style="margin-bottom: 8px; display: block;">Invite Users</label>
                        <p class="text-muted" style="font-size: 12px; margin-bottom: 12px;">Invite users by their Renz-Bot Username or Discord Name. They can join via the public link once invited.</p>
                        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                            <select id="share-platform-select" class="form-input" style="width: auto; padding: 8px 12px; font-size: 13px;">
                                <option value="app">App User</option>
                                <option value="discord">Discord</option>
                            </select>
                            <input type="text" id="share-username-input" class="form-input" placeholder="Username..." style="flex: 1;">
                            <button class="primary-btn" onclick="window.LedgersEngine.addSharedUser()">Invite</button>
                        </div>
                        <ul id="shared-users-list" class="minimal-list"></ul>
                        <div id="share-warning-msg" style="background: rgba(255, 168, 0, 0.1); color: #FFA800; padding: 12px; border-radius: 8px; font-size: 12px; margin-top: 12px; display: none; line-height: 1.4;"></div>
                    </div>
                </div>
            </div>

            <!-- Statement of Account Modal -->
            <div id="ledger-receipt-preview-overlay" class="modal-overlay" style="z-index: 100000;">
                <div class="account-modal-content card" style="max-width: 800px; width: 95%; height: 85vh; max-height: 90vh; display: flex; flex-direction: column; padding: 24px;">
                    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0;">
                        <h3 style="margin: 0;">Statement Preview</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('ledger-receipt-preview-overlay').classList.remove('active')">✕</button>
                    </header>
                    <div style="width: 100%; overflow-y: auto; flex: 1; border-radius: 8px; border: 1px solid var(--border); background: #E5E7EB; padding: 0;">
                        <div id="ledger-receipt-capture" style="background: white; color: black; width: 100%; max-width: 600px; margin: 32px auto; padding: 40px; font-family: 'DM Sans', sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.1); height: max-content; box-sizing: border-box;">
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px; margin-top: 24px; flex-shrink: 0;">
                        <button class="secondary-btn" style="flex: 1;" onclick="document.getElementById('ledger-receipt-preview-overlay').classList.remove('active')">Cancel</button>
                        <button class="primary-btn" style="flex: 2; display: flex; justify-content: center; align-items: center; gap: 8px;" onclick="window.LedgersEngine.downloadReceipt()">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Save as PDF / Print
                        </button>
                    </div>
                </div>
            </div>

            <!-- Add Ledger Item Modal -->
            <div id="ledger-item-overlay" class="modal-overlay" style="z-index: 9999;">
                <div class="account-modal-content card">
                    <header style="display: flex; justify-content: space-between; margin-bottom: 24px;">
                        <h3 style="margin: 0;">Log Ledger Item</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('ledger-item-overlay').classList.remove('active')">✕</button>
                    </header>
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
                        <input type="number" id="ledger-item-amount" class="form-input" placeholder="0.00" step="0.01">
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="text-muted" id="ledger-item-account-label">Funds Taken From (Optional)</label>
                        <select id="ledger-item-account" class="form-input"></select>
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="text-muted">Notes (Optional)</label>
                        <input type="text" id="ledger-item-notes" class="form-input" placeholder="Additional details...">
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
                    <header style="display: flex; justify-content: space-between; margin-bottom: 24px;">
                        <h3 style="margin: 0;">Log Payment</h3>
                        <button class="close-modal-btn" onclick="document.getElementById('ledger-payment-overlay').classList.remove('active')">✕</button>
                    </header>
                    <div class="form-group" style="display: flex; gap: 8px; margin-bottom: 16px;">
                        <button id="btn-paid-me" class="primary-btn" style="flex: 1;" onclick="window.LedgersEngine.setPaymentDirection(1)">They Paid Me</button>
                        <button id="btn-paid-them" class="secondary-btn" style="flex: 1;" onclick="window.LedgersEngine.setPaymentDirection(-1)">I Paid Them</button>
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label class="text-muted">Amount Paid</label>
                        <input type="number" id="ledger-payment-amount" class="form-input" placeholder="0.00" step="0.01">
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

    renderList: () => {
        const container = document.getElementById('ledgers-list-container');
        if (!container) return;

        const ledgers = window.accountsData.filter(a => a.type === 'ledger');
        
        if (ledgers.length === 0) {
            container.innerHTML = `<div class="card" style="text-align: center; padding: 40px; color: var(--text-secondary);">No ledgers created yet. Create one to start tracking debts!</div>`;
            return;
        }

        container.style.gridTemplateColumns = 'repeat(2, 1fr)';
        container.innerHTML = ledgers.map(acc => {
            const sym = acc.currency ? window.getCurrencySymbol(acc.currency) : window.getCurrencySymbol(window.userSettings?.currency || '₱');
            const isOwed = acc.balance > 0;
            const isClear = acc.balance === 0;
            const statusText = isClear ? 'Settled' : (isOwed ? 'Owes you' : 'You owe');

            let iconHtml = `<span style="font-weight:bold;">${(acc.name || '?').charAt(0).toUpperCase()}</span>`;
            if (acc.icon_type === 'image') iconHtml = `<img src="${acc.icon_value}" style="width:100%; height:100%; border-radius:50%; object-fit:contain; background: white; padding: 4px;">`;
            else if (acc.icon_type === 'icon') iconHtml = atob(acc.icon_value);
            else if (acc.icon_type === 'emoji') iconHtml = acc.icon_value;
            else if (acc.icon_type === 'letter' && acc.icon_value) iconHtml = `<span style="font-weight:bold;">${acc.icon_value.toUpperCase()}</span>`;

            const bgLogic = isClear ? '#2C2C2C' : (isOwed ? '#00D26A' : 'linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)');

            return `
                <div class="account-card maya-card maya-card-small" style="background: ${bgLogic};" onclick="window.LedgersEngine.openDetails('${acc.id}')">
                    <div class="card-top">
                        <div class="icon-wrapper" style="${(!acc.icon_type || acc.icon_type === 'letter') ? '' : 'background:transparent; box-shadow:none; overflow:visible;'}">
                            ${iconHtml}
                        </div>
                    </div>
                    <div class="card-body">
                        <h3 class="card-name">${acc.name} <span style="opacity: 0.6;">›</span></h3>
                        <h2 class="card-bal">${window.formatMoneyWithSymbol(Math.abs(acc.balance), sym)}</h2>
                    </div>
                    <div class="card-footer">
                        <span>${statusText}</span>
                        <span></span>
                    </div>
                </div>
            `;
        }).join('');
    },

    openDashboardSelect: () => {
        const ledgers = window.accountsData.filter(a => a.type === 'ledger');
        if (ledgers.length === 0) {
            alert('No ledgers exist yet. Please create one in the Ledgers tab first.');
            return window.switchView('ledgers-view');
        }
        const selectEl = document.getElementById('dashboard-ledger-select');
        selectEl.innerHTML = ledgers.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        window.applyCustomSelectUI(selectEl, ledgers);
        document.getElementById('dashboard-ledger-select-overlay').classList.add('active');
    },

    openSelectedLedger: () => {
        const id = document.getElementById('dashboard-ledger-select').value;
        if (!id) return;
        document.getElementById('dashboard-ledger-select-overlay').classList.remove('active');
        window.switchView('ledgers-view'); 
        window.LedgersEngine.openDetails(id);
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
            currency: currency,
            sharing_mode: 'private',
            share_token: window.generateUUID()
        };

        window.accountsData.push(accData);
        await window.saveAccountsToCloud();
        
        document.getElementById('new-ledger-overlay').classList.remove('active');
        window.LedgersEngine.renderList();
    },

    openDetails: (id, forceReadOnly = false) => {
        window.LedgersEngine.activeLedgerId = id;
        const ledger = window.accountsData.find(a => a.id === id);
        if (!ledger) return;

        // Ensure guests or viewers cannot edit
        const isOwner = window.currentUser && ledger.user_id === window.currentUser.id;
        window.LedgersEngine.isReadOnly = forceReadOnly || !isOwner;
        
        document.getElementById('ledger-actions-grid').style.display = window.LedgersEngine.isReadOnly ? 'none' : 'grid';
        document.getElementById('ledger-share-btn').style.display = window.LedgersEngine.isReadOnly ? 'none' : 'block';

        const receiptOverlay = document.getElementById('receipt-overlay');
        if (receiptOverlay) receiptOverlay.style.zIndex = '10005';

        const sym = ledger.currency ? window.getCurrencySymbol(ledger.currency) : window.getCurrencySymbol(window.userSettings?.currency || '₱');
        
        const isOwed = ledger.balance > 0;
        const isClear = ledger.balance === 0;
        const statusEl = document.getElementById('ledger-detail-status');
        const amtStr = window.formatMoneyWithSymbol(Math.abs(ledger.balance), sym);
        
        let titleName = ledger.name;

        // DYNAMIC GRAMMAR: If guest viewing a shared ledger
        if (window.LedgersEngine.isReadOnly && window.LedgersEngine.sharedOwnerName) {
            titleName = `${window.LedgersEngine.sharedOwnerName}'s Ledger: ${ledger.name}`;
            if (isClear) {
                statusEl.innerText = 'All Settled';
            } else if (isOwed) {
                statusEl.innerText = `${ledger.name} owes ${window.LedgersEngine.sharedOwnerName} ${amtStr}`;
            } else {
                statusEl.innerText = `${window.LedgersEngine.sharedOwnerName} owes ${ledger.name} ${amtStr}`;
            }
        } else {
            // DYNAMIC GRAMMAR: If owner viewing their own ledger
            if (isClear) {
                statusEl.innerText = 'All Settled';
            } else if (isOwed) {
                statusEl.innerText = `${ledger.name} owes you ${amtStr}`;
            } else {
                statusEl.innerText = `You owe ${ledger.name} ${amtStr}`;
            }
        }

        document.getElementById('ledger-detail-name').innerText = titleName;
        statusEl.style.color = isClear ? 'var(--text-secondary)' : (isOwed ? 'var(--primary)' : 'var(--accent-red)');

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
                    if (t.to_account_id === id) { 
                        title = window.LedgersEngine.isReadOnly ? `${window.LedgersEngine.sharedOwnerName} paid them` : 'You paid them'; 
                        sub = t.notes || 'Payment Sent'; amtColor = 'var(--primary)'; sign = '+'; 
                    } else { 
                        title = window.LedgersEngine.isReadOnly ? `They paid ${window.LedgersEngine.sharedOwnerName}` : 'They paid you'; 
                        sub = t.notes || 'Payment Received'; amtColor = 'var(--accent-red)'; sign = '-'; 
                    }
                }

                // Protect read-only viewing of receipts
                const clickAction = window.LedgersEngine.isReadOnly ? '' : `onclick="window.LedgersEngine.openReceipt(${t._id})" style="cursor: pointer;"`;

                return `
                    <li class="tx-item" ${clickAction}>
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

    // --- SHARE SYSTEM LOGIC ---
    openShareModal: async () => {
        const id = window.LedgersEngine.activeLedgerId;
        const ledger = window.accountsData.find(a => a.id === id);
        if (!ledger) return;

        // Inject fallback token if older ledger
        if (!ledger.share_token) ledger.share_token = window.generateUUID();

        document.getElementById('share-mode-select').value = ledger.sharing_mode || 'private';
        window.LedgersEngine.changeSharingMode(ledger.sharing_mode || 'private', false);

        document.getElementById('share-link-input').value = `${window.location.origin}/?ledger=${ledger.share_token}`;
        
        await window.LedgersEngine.renderSharedUsers();
        document.getElementById('share-warning-msg').style.display = 'none';
        document.getElementById('share-ledger-overlay').classList.add('active');
    },

    changeSharingMode: async (mode, autoSave = true) => {
        document.getElementById('share-link-group').style.display = mode === 'public' ? 'block' : 'none';
        document.getElementById('share-selected-group').style.display = mode === 'selected' ? 'block' : 'none';

        if (autoSave) {
            const id = window.LedgersEngine.activeLedgerId;
            const ledger = window.accountsData.find(a => a.id === id);
            ledger.sharing_mode = mode;
            await window.saveAccountsToCloud();
            if (window.showToast) window.showToast('Sharing mode updated');
        }
    },

    copyShareLink: () => {
        const copyText = document.getElementById("share-link-input");
        copyText.select();
        copyText.setSelectionRange(0, 99999); 
        navigator.clipboard.writeText(copyText.value);
        if (window.showToast) window.showToast("Link copied to clipboard");
    },

    renderSharedUsers: async () => {
        const id = window.LedgersEngine.activeLedgerId;
        const { data: shares } = await window.supabase.from('ledger_shares').select('*').eq('ledger_id', id);
        
        const list = document.getElementById('shared-users-list');
        if (!shares || shares.length === 0) {
            list.innerHTML = '<li class="text-muted" style="font-size:12px; padding:8px 0;">No users invited yet.</li>';
            return;
        }

        list.innerHTML = shares.map(share => {
            let displayPlatform = 'App';
            let displayUser = share.target_username;
            if (displayUser.includes('#')) {
                const parts = displayUser.split('#');
                displayPlatform = parts[0] === 'discord' ? 'Discord' : 'App';
                displayUser = parts[1];
            }

            return `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed var(--border);">
                    <div>
                        <span style="font-weight: 600;">@${displayUser}</span>
                        <span style="font-size: 10px; margin-left: 6px; background: var(--surface-hover); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border);">${displayPlatform}</span>
                        <span style="font-size: 11px; margin-left: 6px; color: ${share.status === 'pending' ? '#FFA800' : 'var(--primary)'};">${share.status}</span>
                    </div>
                    <button class="icon-btn" style="color: var(--accent-red);" onclick="window.LedgersEngine.removeSharedUser('${share.id}')">✕</button>
                </li>
            `;
        }).join('');
    },

    addSharedUser: async () => {
        const id = window.LedgersEngine.activeLedgerId;
        const input = document.getElementById('share-username-input');
        const platformSelect = document.getElementById('share-platform-select');
        const username = input.value.trim().toLowerCase();
        const platform = platformSelect ? platformSelect.value : 'app';
        
        if (!username) return;

        if (window.showLoadingToast) window.showLoadingToast('Checking user...');
        const warningEl = document.getElementById('share-warning-msg');

        let profile = null;
        
        // We only verify existing accounts if it's an app user
        if (platform === 'app') {
            // Use limit(1) to be completely safe against multiple row exceptions or 0 row crashes
            const { data: profiles } = await window.supabase.from('profiles').select('id').eq('username', username).limit(1);
            profile = profiles && profiles.length > 0 ? profiles[0] : null;
        }

        const storedUsername = `${platform}#${username}`;

        const sharePayload = {
            ledger_id: id,
            owner_id: window.currentUser.id,
            target_username: storedUsername,
            status: profile ? 'accepted' : 'pending' // If discord, always pending initially
        };

        const { error } = await window.supabase.from('ledger_shares').insert([sharePayload]);
        if (error) {
            if(window.showToast) window.showToast('Error sharing ledger', true);
            return;
        }

        if (profile) {
            // Notify existing App User via Inbox
            await window.supabase.from('notifications').insert([{
                user_id: profile.id,
                title: 'New Ledger Shared',
                message: `@${window.userProfile.username} shared a ledger with you.`,
                action_url: `/?ledger=${window.accountsData.find(a=>a.id===id).share_token}`
            }]);
            warningEl.style.display = 'none';
            if(window.showToast) window.showToast('User invited successfully!');
        } else {
            // Alert that the invite was saved safely as pending
            warningEl.style.display = 'block';
            warningEl.innerText = `⚠️ Invitation sent! The user '${username}' will remain pending until they create an account and click the public link to claim access.`;
            if(window.showToast) window.showToast('Invitation saved as pending.');
        }

        input.value = '';
        await window.LedgersEngine.renderSharedUsers();
    },

    removeSharedUser: async (shareId) => {
        if(!confirm('Remove this user?')) return;
        await window.supabase.from('ledger_shares').delete().eq('id', shareId);
        await window.LedgersEngine.renderSharedUsers();
    },

    // --- STANDARD TRANSACTION METHODS ---
    openReceipt: (localId) => {
        const entry = window.appData.find(x => x._id === localId);
        if (entry) window.openReceiptModal(entry);
    },

    setItemDirection: (dir) => {
        window.LedgersEngine.itemDirection = dir;
        const btnLentThem = document.getElementById('btn-lent-them');
        const btnLentMe = document.getElementById('btn-lent-me');
        const label = document.getElementById('ledger-item-account-label');

        if (dir === 1) {
            btnLentThem.className = 'primary-btn';
            btnLentMe.className = 'secondary-btn';
            label.innerText = 'Funds Taken From (Optional)';
        } else {
            btnLentThem.className = 'secondary-btn';
            btnLentMe.className = 'primary-btn';
            btnLentMe.style.backgroundColor = 'var(--accent-red)';
            btnLentMe.style.borderColor = 'var(--accent-red)';
            btnLentMe.style.color = 'white';
            label.innerText = 'Funds Added To (Optional)';
        }
    },

    openAddItem: () => {
        document.getElementById('ledger-item-name').value = '';
        document.getElementById('ledger-item-amount').value = '';
        document.getElementById('ledger-item-notes').value = '';
        window.LedgersEngine.setItemDirection(1);
        
        const selectEl = document.getElementById('ledger-item-account');
        const realAccounts = window.accountsData.filter(a => a.type !== 'ledger');
        selectEl.innerHTML = '<option value="">-- None --</option>' + realAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        window.applyCustomSelectUI(selectEl, realAccounts);
        
        document.getElementById('ledger-item-overlay').classList.add('active');
    },

    saveItem: async () => {
        const id = window.LedgersEngine.activeLedgerId;
        const ledger = window.accountsData.find(a => a.id === id);
        if (!ledger) return;

        const name = document.getElementById('ledger-item-name').value.trim();
        const rawAmount = parseFloat(document.getElementById('ledger-item-amount').value);
        const notes = document.getElementById('ledger-item-notes').value.trim();
        const linkedAccId = document.getElementById('ledger-item-account').value;
        if (!name || !rawAmount || isNaN(rawAmount)) return alert("Name and Amount required.");

        document.getElementById('ledger-item-overlay').classList.remove('active');
        if(window.showLoadingToast) window.showLoadingToast('Logging ledger item...');

        const finalAmount = rawAmount * window.LedgersEngine.itemDirection;

        const tx = {
            user_id: window.currentUser.id,
            fingerprint: `${new Date().toISOString()}_ledgeritem_${rawAmount}`,
            type: 'LEDGER_ITEM',
            category: 'LEDGER',
            name: name,
            amount: finalAmount, 
            notes: notes,
            account_id: id,
            to_account_id: linkedAccId || null, 
            timestamp: new Date().toISOString()
        };

        const { error } = await window.supabase.from('transactions').insert([tx]);
        if (error) return window.showToast ? window.showToast('Error saving item', true) : alert("Error");

        ledger.balance += finalAmount;

        if (linkedAccId) {
            const realAcc = window.accountsData.find(a => a.id === linkedAccId);
            if (realAcc) {
                realAcc.balance -= finalAmount; 
            }
        }

        await window.saveAccountsToCloud();
        await window.loadCloudData();
        
        document.getElementById('ledger-item-overlay').classList.remove('active');
        window.LedgersEngine.renderList();
        window.LedgersEngine.openDetails(id);
        window.bootUI();
        if (window.showToast) window.showToast('Ledger item logged!');
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
        
        const selectEl = document.getElementById('ledger-payment-account');
        const realAccounts = window.accountsData.filter(a => a.type !== 'ledger');
        selectEl.innerHTML = realAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
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

        document.getElementById('ledger-payment-overlay').classList.remove('active');
        if(window.showLoadingToast) window.showLoadingToast('Processing payment...');

        let fromId, toId;

        if (window.LedgersEngine.paymentDirection === 1) {
            fromId = ledgerId;
            toId = realAccId;
        } else {
            fromId = realAccId;
            toId = ledgerId;
        }

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
        if (error) return window.showToast ? window.showToast('Error saving payment', true) : alert("Error");

        if (window.LedgersEngine.paymentDirection === 1) {
            ledger.balance -= rawAmount;
            realAcc.balance += rawAmount; 
        } else {
            realAcc.balance -= rawAmount;
            ledger.balance += rawAmount;
        }

        await window.saveAccountsToCloud();
        await window.loadCloudData();
        
        document.getElementById('ledger-payment-overlay').classList.remove('active');
        window.LedgersEngine.renderList();
        window.LedgersEngine.openDetails(ledgerId);
        window.bootUI();
        if (window.showToast) window.showToast('Payment logged!');
    },

    previewReceipt: () => {
        const id = window.LedgersEngine.activeLedgerId;
        const ledger = window.accountsData.find(a => a.id === id);
        if (!ledger) return;

        const sym = ledger.currency ? window.getCurrencySymbol(ledger.currency) : window.getCurrencySymbol(window.userSettings?.currency || '₱');
        
        const creatorName = (window.LedgersEngine.isReadOnly && window.LedgersEngine.sharedOwnerName) 
            ? window.LedgersEngine.sharedOwnerName 
            : (window.userProfile?.username || 'You');
            
        const entityName = ledger.name.includes(': ') ? ledger.name.split(': ')[1] : ledger.name;
        
        const txs = window.appData.filter(t => 
            (t.type === 'LEDGER_ITEM' && t.account_id === id) || 
            (t.type === 'TRANSFER' && (t.account_id === id || t.to_account_id === id))
        ).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        const items = txs.filter(t => t.type === 'LEDGER_ITEM');
        const payments = txs.filter(t => t.type === 'TRANSFER');

        const formatDt = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        const itemsRows = items.map(t => `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; vertical-align: top;">${formatDt(t.timestamp)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; vertical-align: top;">${t.name} <br><span style="font-size: 11px; color: #6B7280;">${t.notes||''}</span></td>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; color: #00B85C; font-weight: bold; text-align: right; vertical-align: top;">${t.amount > 0 ? window.formatMoneyWithSymbol(t.amount, sym) : '-'}</td>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; color: #FF4A4A; font-weight: bold; text-align: right; vertical-align: top;">${t.amount < 0 ? window.formatMoneyWithSymbol(Math.abs(t.amount), sym) : '-'}</td>
            </tr>
        `).join('');

        const paymentsRows = payments.map(t => {
            const theyPaid = t.to_account_id !== id;
            return `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; vertical-align: top;">${formatDt(t.timestamp)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; vertical-align: top;">${theyPaid ? 'Payment Received' : 'Payment Sent'} <br><span style="font-size: 11px; color: #6B7280;">${t.notes||''}</span></td>
                <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; font-weight: bold; color: #111; text-align: right; vertical-align: top;">${theyPaid ? '+' : '-'}${window.formatMoneyWithSymbol(Math.abs(t.amount), sym)}</td>
            </tr>`;
        }).join('');

        const isOwed = ledger.balance > 0;
        const statusText = ledger.balance === 0 
            ? 'Fully Settled' 
            : (isOwed ? `Outstanding Balance (${entityName} Owes)` : `Outstanding Balance (${creatorName} Owes)`);
            
        const statusColor = ledger.balance === 0 ? '#6B7280' : (isOwed ? '#00B85C' : '#FF4A4A');

        const captureDiv = document.getElementById('ledger-receipt-capture');
        captureDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #111; padding-bottom: 20px; margin-bottom: 24px;">
                <div>
                    <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -1px;">Statement of Account</h1>
                    <p style="margin: 4px 0 0 0; color: #6B7280; font-size: 14px;">Ledger Entity: <b>${entityName}</b></p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-size: 12px; color: #6B7280; text-transform: uppercase;">Generated On</p>
                    <p style="margin: 0; font-weight: 700; font-size: 14px;">${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric'})}</p>
                </div>
            </div>

            <h3 style="font-size: 16px; margin-bottom: 12px; color: #111;">Itemized Transactions</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 32px; text-align: left;">
                <thead>
                    <tr style="background: #F3F4F6;">
                        <th style="padding: 12px; width: 20%;">Date</th>
                        <th style="padding: 12px; width: 40%;">Description</th>
                        <th style="padding: 12px; width: 20%; text-align: right;">${creatorName} Lent (+)</th>
                        <th style="padding: 12px; width: 20%; text-align: right;">${entityName} Lent (-)</th>
                    </tr>
                </thead>
                <tbody>${itemsRows || '<tr><td colspan="4" style="padding: 12px; text-align: center; color: #6B7280;">No items recorded.</td></tr>'}</tbody>
            </table>

            <h3 style="font-size: 16px; margin-bottom: 12px; color: #111;">Payment History</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 32px; text-align: left;">
                <thead>
                    <tr style="background: #F3F4F6;">
                        <th style="padding: 12px; width: 20%;">Date</th>
                        <th style="padding: 12px; width: 60%;">Mode / Notes</th>
                        <th style="padding: 12px; width: 20%; text-align: right;">Amount Applied</th>
                    </tr>
                </thead>
                <tbody>${paymentsRows || '<tr><td colspan="3" style="padding: 12px; text-align: center; color: #6B7280;">No payments recorded.</td></tr>'}</tbody>
            </table>

            <div style="background: #F9FAFB; padding: 24px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h3 style="margin: 0; font-size: 18px; color: #111;">${statusText}</h3>
                <h2 style="margin: 0; font-size: 28px; font-weight: 900; color: ${statusColor};">${window.formatMoneyWithSymbol(Math.abs(ledger.balance), sym)}</h2>
            </div>
            
            <div style="text-align: center; font-size: 12px; font-weight: 600; color: var(--primary, #00D26A); letter-spacing: 2px; text-transform: uppercase;">
                renzjared.github.io/budget
            </div>
        `;

        document.getElementById('ledger-receipt-preview-overlay').classList.add('active');
    },

    downloadReceipt: () => {
        window.print();
        if (window.showToast) window.showToast('Preparing document...');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.LedgersEngine.init();
});