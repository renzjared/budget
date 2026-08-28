# Managing Accounts

While Renz-Bot functions perfectly using a single global "Running Balance," the **Accounts** module allows you to mirror your actual real-world portfolio.

## Creating an Account
1. Navigate to the **Accounts** tab and click **+ Add Account**.
2. **Assign an Icon:** Click the placeholder icon to open the Universal Icon Selector. You can search for official Bank Logos, select an emoji, or use a custom letter.
3. **Set the Type:** Categorize it as a Bank, On-hand Cash, Investment, or create a Custom Type.
4. **Color Coding:** Use the screen eyedropper or color picker to assign a theme color. This color is used on the card gradients and Sankey flow diagrams.

## Multi-Currency Support
If you hold foreign accounts (e.g., a USD Paypal account or a JPY savings account), you can assign a specific currency in the "More Options" dropdown.
* The app automatically fetches live exchange rates via the AlphaVantage and CoinGecko APIs.
* The account card will display its native currency, but its contribution to your global "Total Balance" will be automatically converted to your Base Currency.

## Drag and Drop Reordering
Your accounts are grouped by type (Banks, Cash, Investments). 
* Click and drag the **⋮⋮** handle on a group header to reorder the sections.
* Click and drag an individual Account Card to rearrange it within its group or drop it into a new category.

## The Account Ledger
Clicking on any Account Card opens its specific Ledger. This view isolates your global transaction history to only show money entering or leaving this specific account, allowing you to easily reconcile your app data with your real-life bank statements.