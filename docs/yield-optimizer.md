# High-Yield Optimizer

The Yield Optimizer is a proprietary tool designed to algorithmically maximize your interest earnings across various Philippine Digital Banks using a greedy allocation strategy.

## How the Algorithm Works

When you input a principal amount, the engine performs the following operations:
1. **Query**: Fetches the live bank catalog and current interest tiers.
2. **Filter**: Removes banks you have explicitly excluded in your settings.
3. **Sort**: Ranks every available tier by its **Net APY** (Gross Rate - Withholding Tax).
4. **Allocate**: Pours your funds into the highest-yielding bucket until its cap is reached, then spills the remainder into the next highest bucket.

---

## Overriding Rates (Gamified Tiers)

Many digital banks (like Maya) offer gamified interest rates (e.g., 3.5% base, up to 15% boosted). The global catalog sets the baseline, but you can override this locally.

### Steps to Override:
1. Open the Yield Optimizer.
2. Click the **⚙️ Settings** icon in the top right.
3. Find your target bank in the list.
4. Click the `%` input box next to the tier cap and enter your personal unlocked rate.
5. Click **Save & Recalculate**.

| Bank | Standard Base | Maximum Boosted | Crediting |
| :--- | :--- | :--- | :--- |
| **Maya** | 3.50% | 15.00% | Daily |
| **SeaBank** | 4.50% | 4.50% | Daily |
| **OwnBank** | 6.00% | 6.00% | Daily |

*Note: All Philippine bank interest is subject to a standard 20% withholding tax. The Yield Optimizer calculates earnings based on the post-tax net.*