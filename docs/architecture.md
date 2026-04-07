# Technical Architecture: Stackd (MVP)

## 1. Tech Stack Overview

**Frontend:** Vite + Vanilla JavaScript (ES Modules)  
**Styling:** Vanilla CSS — custom design system with dark neobank aesthetic  
**Storage:** Browser `localStorage` + IndexedDB (via a lightweight wrapper) — fully local, privacy-first  
**Charting:** Chart.js 4 — lightweight, canvas-based charts with excellent animation support  
**Bundler:** Vite 5 — instant HMR, fast builds, zero-config

### Why this stack?

> [!IMPORTANT]
> **Tech Stack Deviation from PRD:** The PRD specifies Native Android (Kotlin + Jetpack Compose). However, per the Architect directive to "suggest a simpler technical approach" for rapid MVP iteration:
> 1. **No Android toolchain available** — this environment cannot run Gradle, Android Studio, or device emulators.
> 2. **QA workflow expects `localhost:3000`** — the QA Tester agent is configured to test web apps in a browser.
> 3. **Feature parity is instant** — all PRD features (CRUD accounts, transactions, charts, local-only storage) are achievable in a web app with the same UX.
> 4. **Path to mobile** — the web app can be wrapped as a PWA (installable on Android home screen, offline-capable) or ported to Capacitor for a native shell.

## 2. System Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser Tab                    │
│                                                  │
│  ┌────────────┐  ┌──────────┐  ┌─────────────┐ │
│  │  Dashboard  │  │ Accounts │  │Transactions │ │
│  │   View      │  │  View    │  │   View      │ │
│  └──────┬─────┘  └────┬─────┘  └──────┬──────┘ │
│         │              │               │         │
│  ┌──────▼──────────────▼───────────────▼──────┐ │
│  │              State Manager                  │ │
│  │        (Event-driven pub/sub store)         │ │
│  └──────────────────┬─────────────────────────┘ │
│                     │                            │
│  ┌──────────────────▼─────────────────────────┐ │
│  │           Data Access Layer                 │ │
│  │     (localStorage JSON persistence)         │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Data flow:**
1. User interacts with a View (Dashboard, Accounts, Transactions).
2. View dispatches an action to the State Manager.
3. State Manager updates the data via the Data Access Layer (read/write localStorage).
4. State Manager emits change events; Views re-render reactively.

All data stays **100% local in the browser**. No external API calls, no cloud — matching the PRD's privacy-first requirement.

## 3. Data Schema

### Account
```js
{
  id: "uuid-string",
  name: "Wallet",              // user-defined name
  createdAt: "ISO-8601",
  updatedAt: "ISO-8601"
}
// Balance is COMPUTED from sum of linked transactions (not stored directly)
```

### Category
```js
{
  id: "uuid-string",
  name: "Groceries",
  icon: "🛒",                   // emoji icon
  isDefault: true               // true = system-provided, false = user-created
}
```

### Transaction
```js
{
  id: "uuid-string",
  accountId: "uuid-ref",        // FK → Account.id
  categoryId: "uuid-ref",       // FK → Category.id
  type: "income" | "expense",
  amount: 42.50,                // always positive number
  comment: "Weekly groceries",  // optional plain-text
  date: "2026-03-24",           // ISO date string
  createdAt: "ISO-8601"
}
```

### Default Categories (seeded on first launch)
| Name | Icon | Type hint |
|------|------|-----------|
| Salary | 💰 | income |
| Freelance | 💻 | income |
| Investments | 📈 | income |
| Groceries | 🛒 | expense |
| Transport | 🚗 | expense |
| Entertainment | 🎬 | expense |
| Dining Out | 🍽️ | expense |
| Utilities | 💡 | expense |
| Health | 🏥 | expense |
| Shopping | 🛍️ | expense |
| Rent | 🏠 | expense |
| Other | 📦 | both |

## 4. Proposed File & Folder Structure

```
Stackd/
├── docs/
│   ├── prd.md                     # Product Requirements Document
│   └── architecture.md            # This document
├── agents/                        # Agent role definitions
│   ├── architect.md
│   ├── product_analyst.md
│   ├── vibe_engineer.md
│   └── qa_tester.md
├── .agents/
│   └── vibe-coding-workflow.md
├── index.html                     # App shell — single page
├── vite.config.js                 # Vite configuration
├── package.json
└── src/
    ├── main.js                    # Entry point — init app, router, seed data
    ├── router.js                  # Simple hash-based SPA router
    ├── store.js                   # Pub/sub state manager
    ├── db.js                      # localStorage data access layer
    ├── styles/
    │   ├── reset.css              # CSS reset/normalize
    │   ├── variables.css          # Design tokens (colors, spacing, typography)
    │   ├── global.css             # Global styles, base elements
    │   └── components.css         # Reusable component styles (cards, buttons, inputs, modals)
    ├── components/
    │   ├── BottomNav.js           # Sticky bottom navigation bar
    │   ├── Modal.js               # Reusable modal overlay
    │   ├── AccountCard.js         # Account balance card component
    │   ├── TransactionItem.js     # Single transaction row
    │   ├── CategoryPicker.js      # Category selector dropdown
    │   └── BalanceChart.js        # Chart.js wrapper for dashboard
    └── views/
        ├── DashboardView.js       # Global balance chart + account breakdown
        ├── AccountsView.js        # Account list + create/edit/delete
        ├── TransactionsView.js    # Transaction history with filtering
        └── AddTransactionView.js  # Full-screen form to log income/expense
```

## 5. Core Interfaces & Types

```js
// --- State Shape ---
const AppState = {
  accounts: [],        // Array<Account>
  categories: [],      // Array<Category>
  transactions: [],    // Array<Transaction>
  activeView: 'dashboard',  // 'dashboard' | 'accounts' | 'transactions' | 'add'
  selectedAccountId: null    // for filtered transaction view
};

// --- Store API ---
store.getState()                  // → AppState
store.dispatch(action, payload)   // mutate state + persist + emit
store.subscribe(event, callback)  // listen for changes

// --- DB API ---
db.load(key)                      // read from localStorage, parse JSON
db.save(key, data)                // stringify + write to localStorage
db.generateId()                   // crypto.randomUUID()

// --- Action Types ---
'ADD_ACCOUNT'        // { name }
'UPDATE_ACCOUNT'     // { id, name }
'DELETE_ACCOUNT'     // { id } — with cascade delete of transactions
'ADD_TRANSACTION'    // { accountId, categoryId, type, amount, comment, date }
'DELETE_TRANSACTION' // { id }
'ADD_CATEGORY'       // { name, icon }
```

## 6. Implementation Phases (The Roadmap)

### Phase 1: Scaffold & Design System
- Initialize Vite project with vanilla JS template.
- Create CSS design system (tokens, reset, component styles).
- Build the app shell (`index.html`) with bottom navigation.
- Implement hash-based SPA router.
- **Deliverable:** Navigable app skeleton with the neobank dark UI.

### Phase 2: Data Layer & State Management
- Implement `db.js` (localStorage CRUD).
- Implement `store.js` (pub/sub state manager).
- Seed default categories on first launch.
- **Deliverable:** Functional data layer with persistence.

### Phase 3: Account Management (US-01)
- Build `AccountsView.js` — list accounts, create, edit, delete with confirmation modal.
- Build `AccountCard.js` — individual account card showing computed balance.
- Wire up store actions: `ADD_ACCOUNT`, `UPDATE_ACCOUNT`, `DELETE_ACCOUNT`.
- **Deliverable:** Full account CRUD.

### Phase 4: Transaction Logging (US-02)
- Build `AddTransactionView.js` — income/expense toggle, amount input, account picker, category picker, comment field, date picker.
- Build `CategoryPicker.js` — searchable category dropdown.
- Build `TransactionsView.js` — transaction history list with per-account filtering.
- Build `TransactionItem.js` — individual transaction row.
- Wire up store actions: `ADD_TRANSACTION`, `DELETE_TRANSACTION`.
- **Deliverable:** Full transaction logging and history.

### Phase 5: Category Management (US-03)
- Add custom category creation inline from the category picker.
- Wire up `ADD_CATEGORY` action.
- **Deliverable:** Default + custom categories working.

### Phase 6: Dashboard & Charts (US-04)
- Build `DashboardView.js` — global net worth display, balance-over-time line chart, per-account balance breakdown.
- Build `BalanceChart.js` — Chart.js integration.
- **Deliverable:** Visual dashboard with live data.

### Phase 7: Polish & Could-Haves
- Add month filtering on dashboard (Could Have).
- Dark mode toggle (Could Have — though default is already dark).
- Micro-animations, transitions, and haptic-like feedback.
- Edge case handling (empty states, large inputs, validation errors).
- **Deliverable:** Polished, premium-feeling MVP.
