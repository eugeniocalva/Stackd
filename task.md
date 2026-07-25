# Debt Simulator — Task Tracker

- [x] **store.js** — Add `loans[]` state, `ADD_LOAN` / `UPDATE_LOAN` / `DELETE_LOAN`, `computeLoanRemainingBalance()`, 60-month recurrence cap, cross-tab sync
- [x] **router.js** — Add `#debt` route
- [x] **main.js** — Register `DebtView` in render switch
- [x] **components.js** — Add "Debt" to FAB menu, update `RecurringSettingsModal` cap warning to 60 months
- [x] **views.js** — Add `DebtView` (simulator + dashboard + delete warning + prefill bridge)
- [x] **components.css** — Debt card styles, progress bar, disclaimer
- [ ] **Smoke test** — Manually verify all flows
    - [x] Verify sticky behavior in Budget and Analytics
    - [x] Verify visual coherency with History view
