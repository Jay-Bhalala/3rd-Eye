# 🛒 NeonMart — Advanced SDK Test Environment

A realistic e-commerce SPA simulation for stress-testing the 3rd Eye SDK beyond the simple demo page. This site exercises **every edge case** the SDK needs to handle in production.

## Quick Start

```bash
cd testing/advanced-demo
python3 -m http.server 8080
# → Open http://localhost:8080
```

> **Tip:** Start the API server (`cd apps/api && pnpm dev`) first if you want AI-enhanced schemas.

## What This Tests

| Feature | What It Exercises | SDK Challenge |
|---------|------------------|---------------|
| **Hash-based SPA router** | 6 pages via `#shop`, `#cart`, etc. | `hashchange` watcher, re-scanning on navigate |
| **8 product cards** | Dynamically rendered buttons (Add, View, Review) | Buttons inside JS-rendered DOM |
| **Shopping cart** | Add/remove/clear with live updates | `MutationObserver` with frequent DOM changes |
| **Multi-step checkout** | 3-step wizard (Shipping → Payment → Review) | Only current step's form is visible; scanner must re-scan on step change |
| **Auth tabs** | Login / Register / Profile tabs | Tab-switched content — hidden forms |
| **3 modals** | Forgot Password, Quick View, Product Review | Forms inside hidden modal overlays |
| **Filter panel** | Toggleable product filters | Form in collapsible UI |
| **Non-standard elements** | `<div>` (live support) and `<span>` (user avatar) | `scanAnnotated()` — elements that aren't `<form>` or `<button>` |
| **Declarative overrides** | `data-tool-*` on most forms and actions | Override names, descriptions, annotations |
| **`data-tool-ignore`** | Admin panel (SQL query, reboot) | Should NOT appear in scanned elements |
| **Destructive tools** | Clear Cart, Delete Account, Delete All Data, Place Order | `destructiveHint` → user confirmation dialog |
| **Read-only tools** | Search, Export Data, Live Support, Filters | `readOnlyHint` → no confirmation needed |
| **Idempotent tools** | Preferences, Dark Mode toggle, Filter toggle | `idempotentHint` |
| **Real-time debug panel** | Shows scanned elements, schemas, watcher status | Visual SDK state without console |

## Expected Tool Count

After SDK initializes, `ThirdEye.getSchemas()` should return approximately:

| Category | Tools | Examples |
|----------|-------|---------|
| **Forms** | ~12 | `search_marketplace`, `user_login`, `create_account`, `update_profile`, `submit_shipping_address`, `submit_payment_info`, `apply_coupon_code`, `update_preferences`, `change_password`, `request_password_reset`, `quick_add_to_cart`, `submit_product_review`, `apply_product_filters` |
| **Standalone buttons** | ~8 | `notif-btn`, `wishlist-btn`, `filter-toggle`, `clear-cart-btn`, `checkout-btn`, `export-data-btn`, `delete-all-btn`, `place-order-btn` |
| **Annotated elements** | ~3 | `open_live_support`, `open_user_menu`, `sort_products` |
| **Ignored** | 0 | Admin form + reboot button (all marked `data-tool-ignore`) |

## Key Verification Steps

```js
// 1. Check tool count
ThirdEye.getSchemas().length  // Should be ~23

// 2. Verify declarative overrides
ThirdEye.getSchemas().find(s => s.name === 'search_marketplace')  // ✅ exists
ThirdEye.getSchemas().find(s => s.name === 'open_live_support')   // ✅ exists (div)
ThirdEye.getSchemas().find(s => s.name === 'open_user_menu')      // ✅ exists (span)

// 3. Verify admin is ignored
ThirdEye.getSchemas().find(s => s.name.includes('admin'))         // ❌ undefined

// 4. Verify annotations
const placeOrder = ThirdEye.getSchemas().find(s => s.name === 'place_order');
placeOrder.annotations  // { destructiveHint: true, openWorldHint: true }

const search = ThirdEye.getSchemas().find(s => s.name === 'search_marketplace');
search.annotations  // { readOnlyHint: true }

// 5. Verify multi-step checkout
// Navigate to checkout: window.location.hash = '#checkout'
// Only step 1 form should be visible initially
// Click through steps and re-scan to see forms appear/disappear

// 6. Verify SPA navigation triggers watcher
window.location.hash = '#settings'  // Watch for [3rdEye] DOM mutation logs
```

## Page Map

```
#shop       → Product catalog (8 cards), filters, sort
#cart       → Cart table, coupon form, clear/checkout buttons
#account    → Login | Register | Profile tabs
#checkout   → 3-step wizard: Shipping → Payment → Review
#settings   → Preferences, password change, danger zone
#admin      → Ignored admin panel (data-tool-ignore)
```

## Comparison with Simple Demo

| Aspect | Simple Demo (`sdk-demo`) | Advanced Demo (`advanced-demo`) |
|--------|-------------------------|--------------------------------|
| Elements | ~8 | ~28+ |
| Pages | 1 | 6 (SPA) |
| Forms | 2 | 12+ |
| Modals | 0 | 3 |
| Non-standard elements | 1 (div) | 3 (div + span + select) |
| Multi-step flow | No | Yes (checkout wizard) |
| Dynamic content | Manual (add/remove in console) | Automatic (cart, tabs, steps) |
| Admin/ignored | 1 button | Entire admin panel |
| Real-time debug | No | Yes (fixed debug panel) |
