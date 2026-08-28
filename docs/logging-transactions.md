# Logging Transactions

Accurate logging is the foundation of the budget tracker. Renz-Bot uses an intelligent predictive engine to make this as fast as possible.

## Income vs. Expense vs. Transfer
*   **Expense (Red):** Money leaving your possession. Decreases your net worth and impacts your category budget limits.
*   **Income (Green):** New money entering your possession. Increases your net worth and generates new budget allocations for your categories.
*   **Transfer (Gray):** Money moving *between* your accounts. Does not affect net worth, budgets, or analytics.

## Using the Autocomplete Engine
When typing in the **Description** or **Merchant** fields, the app scans your last 200 transactions. 
* If it finds a match, a dropdown will appear.
* Clicking the suggestion will auto-fill the text **and** automatically select the Category, Account, and Currency you used the last time you made that specific purchase.

## Multi-Currency Swiping
If you are traveling or buying software online, you can change the currency directly in the Add Expense modal.
1. Enter the exact foreign amount on the receipt.
2. Select the foreign currency from the dropdown.
3. The app will pull the live exchange rate, log the exact foreign amount for your records, but deduct the converted Base Currency amount from your actual balances.

## Receipt Modals & Editing
Clicking on any transaction in the Activity list or Dashboard opens the **Receipt Modal**.
*   This modal shows the exact timestamp, category, and exchange rate data.
*   Click **Edit Transaction** to fix mistakes.
*   Click **Share Receipt** to generate a clean, shareable PNG image of the transaction details.

## Quick Add Widgets
On the Dashboard, the **Quick Add** panel utilizes an algorithm to surface your most frequent and recently used transactions. Clicking a "Chip" instantly opens a pre-filled Expense/Income modal, allowing you to log repetitive purchases in exactly two clicks.