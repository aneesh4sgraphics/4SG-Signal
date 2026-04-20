# 4S Graphics — Product Pricing Specification

## Core Rule

> **Price = $/m² rate × totalSqm of the selected product size**

All tier price columns in `product_pricing_master` store the **per square metre ($/m²) rate** for that product family size and pricing tier. They do NOT store a total price.

---

## How It Works End-to-End

### 1. Admin enters prices (Product Pricing page)
- Admin selects Category → Type → Size
- For each of the 10 pricing tiers, admin types a **$/m² rate** (e.g. `1.65`)
- That exact value (`1.65`) is stored in the database column (e.g. `landed_price = 1.65`)

### 2. QuickQuotes calculation
When building a quote line item:
```
pricePerSheet = ($/m² rate × totalSqm) / minQuantity
totalPrice    = pricePerSheet × quantity
```

| Variable | Source |
|---|---|
| `$/m² rate` | `product_pricing_master.landed_price` (or other tier column) |
| `totalSqm` | `product_pricing_master.total_sqm` (total sqm of the minimum order unit) |
| `minQuantity` | `product_pricing_master.min_quantity` (sheets/units in the minimum order) |

---

## Examples

### Example 1 — Sheet product (individual sheet)
| Field | Value |
|---|---|
| Product | Gloss Photo Paper 5mil — 8.5×11" |
| `total_sqm` | `0.0603` (sqm of one sheet) |
| `min_quantity` | `1` |
| `rollSheet` | `Sheet` |
| Landed $/m² | `3.50` |
| **Price per sheet** | `3.50 × 0.0603 / 1 = $0.21/sheet` |

### Example 2 — Packet product (pack of 50 sheets)
| Field | Value |
|---|---|
| Product | Graffiti Polyester 5mil — 8.5×11" |
| `total_sqm` | `3.0161` (sqm of the whole pack of 50 sheets) |
| `min_quantity` | `50` |
| `rollSheet` | `Packet` |
| Landed $/m² | `0.63` |
| **Price per pack** | `0.63 × 3.0161 = $1.90/pack` |
| **Price per sheet** | `$1.90 / 50 = $0.038/sheet` |

### Example 3 — Roll product
| Field | Value |
|---|---|
| Product | Graffiti Polyester Paper 5mil — 12"×150' |
| `total_sqm` | `6.9677` (sqm of the full roll) |
| `min_quantity` | `1` |
| `rollSheet` | `Roll` |
| Landed $/m² | `1.65` |
| **Price per roll** | `1.65 × 6.9677 = $11.50/roll` |

---

## Pricing Tiers

| DB Column | Label | Tier Key |
|---|---|---|
| `landed_price` | Landed | `landedPrice` |
| `export_price` | Export | `exportPrice` |
| `master_distributor_price` | Distributor | `masterDistributorPrice` |
| `dealer_price` | Dealer-VIP | `dealerPrice` |
| `dealer2_price` | Dealer | `dealer2Price` |
| `approval_needed_price` | Shopify 3 (Lowest) | `approvalNeededPrice` |
| `tier_stage25_price` | Shopify 2 | `tierStage25Price` |
| `tier_stage2_price` | Shopify 1 | `tierStage2Price` |
| `tier_stage15_price` | Shopify Account | `tierStage15Price` |
| `tier_stage1_price` | Retail | `tierStage1Price` |
| `retail_price` | Retail (public) | `retailPrice` |

---

## Important Notes

- Products with `total_sqm = 0` cannot be priced (no valid sqm area)
- Packet/Carton products: `total_sqm` covers the **entire pack**, not one sheet
- The per-sheet price shown in the Product Pricing UI is always `(rate × totalSqm) / minQuantity`
- The $/m² rate is the **primary stored value** — per-sheet/roll prices are always derived
