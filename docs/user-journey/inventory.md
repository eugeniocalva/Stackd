# Stack'd — screen inventory and persona journeys (working file, UJ)

The shared backbone of the user-journey page (`index.html`), the screenshot
capture (`tools/journey/capture.cjs`) and the journey specs
(`tests/e2e/journey_*.spec.js`). Step ids (N1…, M1…, L1…) are stable: the
page, the screenshots and the tests all refer to them. Written for the
designer's page, so screens are named as the app names them.

Build 1.2.x (public 1.2), English, light theme, invented example data.

---

## A. Screen inventory

### A1. The frame

| Element | What it is | Leads to |
|---|---|---|
| **Bottom bar** | Five tabs: **Home** (always first), then **History**, **Goals**, **Analytics**, **Smart Insights** in the user's order (Settings → Tab bar). Tapping the tab you are on scrolls to the top (History: back to today). | the five tabs |
| **+ button** | Round primary button at the right of the bar. Opens the quick-actions menu over a dimmed background. | the menu |
| **Quick-actions menu** | Five actions: **Add Log**, **Add Account**, **Debt** (Loans), **Add Category**, **Others & Settings**. Tap outside or Back closes it. | New Log · New Account · Loans · New Category · Others |
| **Close ✕** | Full-screen pages (New Log, New Account, editors, Loans simulator and results, Import, Export, Backup, In-app purchases) carry a filled round ✕ at the top right; closing returns to where you came from without pushing history. | back |
| **Android Back / swipe back** | Closes the top sheet, then the menu, then selection mode, then widget edit mode, then asks "Discard changes?" on a dirty form, then goes back; on a bare Home it minimises the app. | — |

### A2. First launch

| Screen | Shows | Controls | Leads to |
|---|---|---|---|
| **Welcome to Stack'd** (sheet, mandatory) | "Set your preferred region. You can always change this later in Others → Region Setting." Two rows: **Currency** (every currency, searchable; opens on the one of the phone's region), **Language** (English, Français, Italiano, Español, Português). Cannot be swiped away. | the two rows open pickers; **Get Started** | Home (empty) |

### A3. Home (Dashboard)

| Part | Shows | Controls | Leads to |
|---|---|---|---|
| **Total balance** | Total across all accounts in the base currency; two deltas vs the start of the month: *as of today* and *projected EOM*. Accounts in another currency are excluded (a note says how many). | — | — |
| **Balances hidden pill** | Only when Hide balances is on: every amount on Home reads `••••`. | tap → **Balances hidden** sheet (Show / Done) | — |
| **Graph pager** | Two panes with dots: the **balance curve** (range chips 1W · 1M · 6M · YTD · 1Y · Max) and **Monthly net** (12 bars, End of month). Drag sideways on the plot to read values into the header; swipe elsewhere to change pane. | chip tap redraws; curve tap → **Balance Trend** sheet (expanded graph: Weekly / Monthly / Quarter, account and category filters, Save View / Reset View); bars tap → Analytics | sheet · Analytics |
| **Wallet cards** | One card per account in the user's order: icon in the account colour, type, name, balance in the account's currency. Last tile **Add Wallet**. Hold a card 0.45 s and drag to reorder. | card tap → History filtered to that account; ⋯ → Edit Account; Add Wallet → New Account | History · Edit Account · New Account |
| **Widgets** | User-configurable cards, small (half row) or wide: Latest transactions, Income vs Expenses, Categories, Net worth, Personal savings, Upcoming transactions, Budget goals, 50/30/20 budget, Account balances, Smart Insights. **Add** opens the gallery; long press enters edit mode (wiggle, × badges, drag to reorder). A fresh install has one wide Latest transactions card. | widget tap → its page (History, Goals, Analytics, Smart Insights); row tap → that transaction | — |
| **Add widget** (sheet) | Gallery → detail with a live preview and a **size rail** (Small / Wide slide) → optional **Configure** step (accounts, categories, look-ahead days, planned income and split). Back arrow walks back. | **Add** | Home |

### A4. History

| Part | Shows | Controls |
|---|---|---|
| **Title row** | "History" and the **Filter and Sort** button (badge = active filter kinds). | Filter sheet |
| **Period bar** | `‹ [November 2026] ›`: filled round arrows step a month (or year, or a custom range by its length) and open the new period at the top; the pill opens the **Period** sheet (Month · Year grid, "Custom range…" calendar). A context row shows **This month** / **This year** (back to now) and one chip per active filter kind (accounts, categories, tags, types) with ✕; **Clear all** when two or more. | — |
| **Summary card** | **Start**, **End**, **Net Change** for the period; with a category / type / tag filter: **In**, **Out**, **Net** (filtered total). Unpaid rows are not counted. | — |
| **Day groups** | A header per day (TUE, NOV 3), compact two-line rows (category + amount; account + tags + paperclip), a `sum:` line per day (grey on spending days, green on positive). Spending is neutral, transfers blue, income green. Rows before an account's opening date are dimmed and not counted. | row tap → Edit Log |
| **Row gestures** | Swipe left → **Edit** · **Delete**; swipe right → **Paid** toggle (an unpaid row shows a marker). Long press 0.45 s → selection mode: the icon flips to a check, a bar **Cancel · n Selected · Select All · Delete (n)** replaces the title. | Delete → confirm sheet; recurring members → "Recurring Items Detected" choice |
| **Filter and Sort** (sheet) | Order (Newest / Oldest first), Transaction Type (Income / Expense), Accounts, Categories, Tags; **Reset**. | Apply |
| **Back to top** | Floating chevron when deep-scrolled. | — |

### A5. New Log / Edit Log

| Part | Shows | Controls |
|---|---|---|
| **Type** | Expense · Income · Transfer segmented control. | — |
| **Amount** | Big amount field with the currency symbol, own caret, decimal keyboard; red for expense, green for income, blue for transfer. | — |
| **Account** / **From Account** + **To Account** | Dropdowns in the user's account order; a new log preselects the Default Wallet. A transfer across currencies adds **Amount received (…)**. | — |
| **Category** + **+ Add custom** | Opens **Select Category** (searchable list by type); Add custom → New Category and back with the form kept (free plan: a Pro lock sheet). | — |
| **Date**, **Time** (if enabled in Others) | — | — |
| **Tags** | Opens the **Tags** picker: tags of the chosen category first, then all; type a name and **+** to create; ✓ applies. | — |
| **Note (Optional)** | Suggests notes used before. | — |
| **Attachments** | "Add a receipt photo or a PDF" → **Add an attachment** sheet (Take a photo · Photo library · PDF file); thumbnails strip; tap → viewer (Share / Delete). | — |
| **Paid** | On: counted in balances; off: excluded until marked paid. | — |
| **Recurrent** | On → "Repeats every…" line (**Repeats Every** picker: 1–30 days / weeks / months / years) and **End Date** (capped at 5 years). | — |
| **Save Transaction** / **Update Transaction** · **Delete Transaction** | Save lands on History. Editing a recurring member → **Recurring Transaction** scope sheet (Only this · This and future · All in the series); deleting one → **Delete Recurring Transaction** scope. An opening-balance row shows a read-only panel with an Edit Account link. Inline field errors (amount, category, date). | History |

### A6. New Account / Edit Account

Account Name · Type (Bank, Debit card, Cash, Savings, Credit card, Investment, Wallet, Account) · icon (Select Icon picker with search) · Account Color (palette) · Currency · Opening Balance with Positive / Negative and **Opening Balance Date** · **Set as Default Wallet** ("Preselected for new logs."). **Create Account** / **Save Changes**; **Delete Account** → "Delete Account?" (all its transactions go). Changing the opening date past existing entries → **Entries before this date** sheet (Open on … instead / Change anyway). A duplicate name is refused inline. Free plan: the third account shows **Account limit reached** with **See Stack'd Pro**.

### A7. Goals (Budget)

Title, the month bar `‹ [November 2026] ›` (pill → Select Month), the **ring** (Allocated in the centre; slices biggest first, Others folds the rest; tap a slice → badge with icon and share; Overspent in red), **Total Spent** / **Remaining**, the **Expenses · Income** switch, one row per category (`€617.84 of €600.00 · Over by €17.84`, a percentage ring, a bar amber at 75 %, red at 90 % or over). Row tap → the **limit editor** (Monthly Limit, Start Month, End Month, Cumulative Rollover, a hint with the recent average; **Save**, **Remove Budget Limit**; "The new limit applies from {month} on").

### A8. Analytics

Title + Filter button; the period bar; **Total Net Balance · Today** hero with "Excludes n upcoming transactions", the change vs the previous period (`+62.4% vs Oct 1 – Oct 8`), a **Today / Nov 30** toggle (actuals vs projection); **Net Flow Analysis** bars (Income − Expenses; a bar tap opens those rows in History); **Distribution** ring with Expenses / Income chips (tap a slice → share; legend row → History on that category). A custom range draws daily / weekly / monthly / yearly buckets and names the compared window.

### A9. Smart Insights

Title "Smart Insights" + "Worked out from your own entries, on this phone." Sections **Needs attention**, **This month**, **Trends**, **Accounts and loans**, **Tidy up**, **Unlocks with more data**. Each insight is a card (eyebrow, figure, headline, body, mini-chart) that opens its destination: History on a category / month, Goals on a budget, the balance graph sheet, a **Recurring payments** sheet, a loan. A new install shows the **Getting started** card ("Log a few days of spending to unlock insights", "n of 10 entries so far", **Add a transaction**).

### A10. Loans (Debt)

| Screen | Shows | Controls |
|---|---|---|
| **Loans hub** | "Simulate loans and track the ones you have"; three tiles **Mortgage**, **Personal Loan**, **Installment Plan** (Simulate); **Simulations** and **My Loans** lists (progress, next payment, "Tracked as a recurring expense"). | tile → simulator; item → results |
| **Simulator** (e.g. Personal Loan) | Loan Amount (Mortgage: Down Payment), Duration + Years / Months, Annual Rate %, First Payment; **Details**: Payment Type (Constant / Declining), interest-only first installment, Rate Changes, Early Repayments, Extra Costs. **Calculate**. Inline errors. | Results |
| **Results** | Monthly Payment, Total Interest, Total Amount, Installments, Last Payment; With Early Repayments (Interest Saved, Months Saved); **Payment Schedule** Brief / Detailed; **Save Simulation** · **Add to My Loans**; on a loan: Progress (paid / remaining, next payment), **Track monthly payment** → "Track this payment?" (Add recurring expense), ⋯ menu (Edit, Add to My Loans, Delete with "Also delete its upcoming payments"). After editing a tracked loan: **Update linked payments?** | hub |

### A11. Categories and tags

**Categories** (Others → Categories): grouped Income / Expense / All Types, a count per category, **+** → New Category (Category Name, type Expense / Income / Both, icon; free plan: Pro lock). Tap → **Category detail** (its transactions, by tag) → ⋮ → **Edit Category** (Delete only when it has no transactions). **Tags** (Others → Tags): every tag with its count and categories; **+** → New tag; tap → **Edit tag** sheet (name, category chips + Add category, "See N transactions" → History over all time, Delete); Save asks a summary confirmation, and a removed category with tagged rows asks keep / lose the tag / move (HG-14).

### A12. Others & Settings

| Card | Rows |
|---|---|
| **Manage** | **Accounts** (n accounts) → **Accounts** sheet: your order with Move up / Move down and a grip, "Default wallet" under the default, **+ Create New Account**; **Categories**; **Tags** |
| **Region Setting** | **Currency** (Choose Currency: search field, Suggested, More currencies; Done / Cancel; switching → **Switch to USD?** confirm naming the excluded accounts and a relabel option); **Language** (Choose Language, live) |
| **Tab bar** | Home locked first; the other tabs with Move up / Move down and a grip; **Restore the default order** |
| **Privacy** | **Hide balances**, **Shake to hide**; on the phone apps **App lock** (create a 4-digit PIN), then **Unlock with Face ID / fingerprint**, **Lock after** (Immediately · 1 minute away · 5 minutes away), **Change PIN** |
| **Data Visualization** / **Preferences** | Enable transaction time input |
| **Appearance** | Theme Light · Dark · System |
| **Data** | **Import and export** → sheet (Import file · Export file); **Backup**; **Import rules** |
| **In-app purchases** | "Free plan — up to 2 accounts and the default categories" / "Stack'd Pro unlocked" → **In-app purchases** screen (One-time purchase tab: Stack'd Pro perks, **Unlock for €4.99**, Restore purchase, Redeem a code, Terms of Use · Privacy Policy; Subscriptions tab) |
| **Support** | FAQ, User Manual (searchable), Send a Feedback, Rate the App, Terms of Use, Privacy Policy |
| **Danger Zone** | **Factory Reset** → "Factory Reset?" (Keep Data) → Welcome again |

### A13. Import, Export, Backup

| Screen | Shows | Controls |
|---|---|---|
| **Import** | A text area ("Paste the text of a CSV, QIF or bank file here, or choose a file."), **Choose a file**, **Import settings** (Column separator, Line break, Date order, Decimal separator, Multiply amounts by, Ignore quotation marks), **Check**. | → Review import (ledger / QIF / Stack'd backup) or **Map Columns** (bank statement) |
| **Map Columns** | n rows · file; Date / Description / Amount (or Debit / Credit) / Bank reference columns, Amount format, Date format, Decimal separator, **Import into account**, live **Preview**, **Continue**. | **Review & Import** |
| **Review & Import** (bank statement) | Statement Details (format, currency, opening / closing balance, balance check); one row per transaction with a category picker ("Remember for …" creates an **Import rule**), badges *Already imported* / *Unreadable*, "Matches an existing entry" → Link to existing / Import as new, "Looks like a transfer" → Pair as transfer; **Select all**; **Import n transactions** → **Import complete** sheet (Balance check, **View transactions**). | History |
| **Review import** (ledger / QIF / backup) | Format, Accounts (Existing / New, opening balances, balance after import), Transfers paired, Categories (Keep name / map), planned rows as unpaid, look-alikes, rows not imported with reasons; **Import n transactions** / **Restore backup**. | — |
| **Export** | Info, **Format** CSV / Text, **Export settings** (separator, date format, decimal mark, quote every field, BOM), **Period** (All time / From – To, include planned payments), **File preview** (n lines), **Copy text**, **Export file**; **Receipts PDF** (n attachments in this period); "Open Backup" link. | — |
| **Backup** | **Automatic backup** switch, **Back up now** ("Last backup …", destination), **Recent backups** (Automatic / Manual / Restore, Saved / Failed, Restore · Share), **Restore from a file**, **Export individual files** (Accounts, Categories, Transactions, Loans, Budgets, Import rules). | — |

### A14. Shared sheets

Period · Filter and Sort · Select Category · Select Icon · Tags · Repeats Every · Recurring Settings · Recurring Transaction (update scope) · Delete Recurring Transaction · Initial Tag Scope · Select Month · Add widget · Balance Trend (expanded graph) · Accounts (manage) · Choose Currency · Choose Language · Switch to … ? · Balances hidden · Recurring payments · Add an attachment · attachment viewer · Import settings · Export settings · Export period · Import Rules · Import complete · Before the opening balance / Entries before this date · Discard changes? · Delete … ? confirmations · Account limit reached / Your own categories are a Pro feature · Storage is full · FAQ · User Manual · Terms & Conditions.

---

## B. Personas and journeys

Each step: **id** · screen · what the user does · what the app shows · screenshot file · what the journey test checks. Seed = `tools/seed.cjs` unless the step says otherwise. Screenshots are 390×844 @2x, English, light.

### B1. Nora — first-time user

*Just installed. Wants to know where her money is, without giving the app a bank login. Two accounts, logs by hand.* Starts from an empty install (no `setup_done`).

| Step | Screen | Nora… | The app shows… | Shot | Test checks |
|---|---|---|---|---|---|
| N1 | Welcome to Stack'd | opens the app; sets Currency EUR and Language English; taps **Get Started** | the mandatory sheet; it cannot be swiped away | `n01-welcome` | sheet visible; backdrop tap does not close; Get Started closes it and `setup_done` is set |
| N2 | Home (empty) | looks around | Total Balance €0.00, an empty graph, the **Add Wallet** tile, the seeded **Latest transactions** widget with "No transactions yet" | `n02-home-empty` | total €0.00; `.wallet-card` count 0; widget empty state |
| N3 | Quick-actions menu | taps **+** | the five actions over a dimmed Home | `n03-menu` | five entries; Add Log, Add Account, Debt, Add Category, Others & Settings |
| N4 | New Account | taps **Add Account**; types "Main Bank", type Bank, opening balance 1,200.00; **Create Account** | the form with sign Positive, today's date, Set as Default Wallet | `n04-new-account` | lands on Home; card "Main Bank" €1,200.00; it is the Default Wallet |
| N5 | Home (one wallet) | sees her first card | Total Balance €1,200.00, the card, a flat graph | `n05-home-first-wallet` | total €1,200.00 |
| N6 | New Log | taps **+ → Add Log**; Expense, 12.50, Groceries, note "Weekly shop"; **Save Transaction** | the form preselects Main Bank; the amount reads red | `n06-new-log` | lands on `#transactions`; History has one row Groceries -€12.50 with note; card now €1,187.50 |
| N7 | History | reads the list | today's day group with two rows — the opening balance ("Adjustment +€1,200.00") and Groceries (-€12.50, neutral) — `sum: €1,187.50`; Start €0.00 / End €1,187.50 / Net Change +€1,187.50 (the opening balance is a row of this period, so Start is the balance before it) | `n07-history-first` | summary values; two rows |
| N8 | Edit Log | taps the row; changes the note to "Weekly shop · Esselunga"; **Update Transaction** | the same form titled Edit Log with **Delete Transaction** | `n08-edit-log` | back on History; the note updated |
| N9 | Home | returns Home | the balance, the curve now dips, Latest shows the row | `n09-home-after-first-log` | Latest widget lists Groceries |
| N10 | Goals | opens **Goals**; taps **Groceries**; Monthly Limit 300; **Save** | the limit editor; then the ring with Allocated €300.00, the row `€12.50 of €300.00`, Remaining €287.50 | `n10-goals-editor`, `n11-goals-set` | ring/row text |
| N11 | New Account (2nd) | Home → **Add Wallet**; "Cash", type Cash, 80.00; **Create Account** | two cards; Total €1,267.50 | `n12-home-two-wallets` | total; order Main Bank, Cash (alphabetical start) |
| N12 | Account limit reached | Home → **Add Wallet** a third time | "Account limit reached — The free plan includes 2 accounts. Unlock Stack'd Pro once to add as many as you need." with **See Stack'd Pro** | `n13-pro-lock` | lock page; no form |
| N13 | In-app purchases | taps **See Stack'd Pro** | One-time purchase tab: perks, the price button, Restore purchase, Redeem a code (on a phone with a store; the web build says "Purchases are available in the mobile app"), Terms of Use · Privacy Policy | `n14-purchases` | the two legal links by name |
| N14 | Smart Insights | opens the 5th tab | the **Getting started** card: "Log a few days of spending to unlock insights · 1 of 5 entries so far", **Add a transaction** | `n15-insights-starter` | starter card; the button opens New Log |
| N15 | Others & Settings | **+ → Others & Settings** | Manage (2 accounts, 14 categories), Region, Tab bar, Privacy, Appearance, Data, In-app purchases (Free plan…), Support, Danger Zone | `n16-settings` | "Free plan — up to 2 accounts and the default categories" |

### B2. Marco — daily logger

*Six months of entries, four accounts, a few budgets. Opens the app most days to log what he spent and glance at where the month stands.* Seeded with `tools/seed.cjs` (Main Bank, Revolut, Cash, Savings; budgets; six months of rows) plus a €60 Dining Out dinner today (puts that budget over its limit) and a €120 payment later this month (an upcoming row). Pro is on (seeded entitlement), so nothing is locked.

| Step | Screen | Marco… | The app shows… | Shot | Test checks |
|---|---|---|---|---|---|
| M1 | Home | opens the app on a new day | Total Balance, the two deltas, the balance curve (1M chip), wallet cards, widgets (Latest, Categories, Income vs Expenses, Personal savings) | `m01-home` | total = sum of the four balances; 4 cards |
| M2 | Home · Monthly net | swipes the graph to the second pane | 12 bars, "Monthly net · End of month", the dot moves | `m02-home-monthly-net` | second dot active |
| M3 | History (one account) | taps the **Revolut** card | History with an **accounts** chip "Revolut", only its rows, Start / End / Net Change for that account | `m03-history-account` | chip present; every row's account is Revolut |
| M4 | History | taps the chip's ✕ | all rows again, Start / End / Net Change | — | chip gone |
| M5 | New Log · Tags | **+ → Add Log**: Expense 46.00, Revolut, Dining Out; taps **Tags**, types "friends", **+**, ✓ | the Tags picker (In Dining Out · All tags), the chip on the form | `m04-tag-picker`, `m05-new-log-tagged` | saved row carries `#friends`; the tag is linked to Dining Out |
| M6 | New Log · Transfer | **Transfer**, 200.00, From Main Bank, To Savings; Save | the amount in blue, From / To dropdowns | `m06-transfer` | History: a blue transfer row; Main Bank −200, Savings +200 |
| M7 | New Log · Recurrent | Expense 9.99, Revolut, Entertainment, note "Streaming"; **Recurrent** on → Repeats every 1 month → End Date in 6 months; Save | the Repeats Every picker; "Repeats every month" and End Date on the form | `m07-repeats-every`, `m08-new-log-recurring` | the series exists with members up to the end date; future members are dated ahead (no paid mark) and do not move today's balance |
| M8 | History · swipe | swipes a future "Streaming" row right → **Paid**; swipes another row left | the Paid action, then the Edit · Delete actions | `m09-swipe-left` | paid toggled on that member only; actions hidden at rest |
| M9 | History · selection | long-presses a row, taps a second, **Delete (2)** | the check flips, the bar **Cancel · 2 Selected · Select All · Delete (2)**; the confirm sheet ("Recurring Items Detected" if a member is in) | `m10-selection`, `m11-delete-confirm` | both rows gone; others intact |
| M10 | Edit Log · scope | taps a Streaming member, changes the amount to 10.99, **Update Transaction**; picks **This and future transactions** | the **Recurring Transaction** sheet with three scopes and notes | `m12-recurring-scope` | that member and later ones at 10.99; earlier unchanged |
| M11 | History · period & filter | taps ‹ (previous month); opens **Filter and Sort**, picks Groceries, Apply | the previous month from the top; the Filter sheet; a **categories** chip and In / Out / Net | `m13-period-prev`, `m14-filter-sheet`, `m15-history-filtered` | label is last month; only Groceries rows |
| M12 | Goals | opens **Goals** | the ring with Allocated, the rows (`€x of €y`, one over budget in red), Expenses · Income | `m16-goals` | the over-budget row says "Over by"; the ring slice tap shows a badge |
| M13 | Analytics | opens **Analytics**; taps **Nov 30** (end of period) | Total Net Balance · Today with "Excludes n upcoming", `% vs …`, Net Flow bars, Distribution ring with legend | `m17-analytics`, `m18-analytics-eom` | toggle changes the hero label to Projected Balance |
| M14 | Analytics → History | taps the Groceries legend row, then **All n transactions** in its tag breakdown | the row expands into its tags; History on Groceries for the month | — | categories chip |
| M15 | Smart Insights | opens the tab; taps the first insight | sections with cards (Needs attention / This month / Trends…); the destination (History, Goals or a sheet) | `m19-insights` | at least one insight; the tap lands where its headline says |
| M16 | Home · widgets | **Add** → Account balances (wide only) → Add; long-presses a widget → edit mode → × on one → Remove | the gallery, the detail with the size rail, the new card; wiggle and × badges | `m20-add-widget`, `m21-widget-edit-mode` | widget count +1 then −1; edit mode clears on navigation |

### B3. Lea — power user

*Moves her data in from a bank file, keeps backups, tracks a mortgage, tunes the app.* Seeded like Marco; Pro on.

| Step | Screen | Lea… | The app shows… | Shot | Test checks |
|---|---|---|---|---|---|
| L1 | Others → Data | opens **Import and export** | the sheet: Import file · Export file | `l01-import-export-sheet` | — |
| L2 | Import | **Import file**; pastes a bank CSV (date; description; amount, decimal comma); **Check** | the text area with the line count, Import settings, Check | `l02-import` | → Map Columns |
| L3 | Map Columns | picks Date / Description / Amount columns, Day / Month / Year, **Import into account** Main Bank; **Continue** | the preview updates live | `l03-map-columns` | → Review & Import |
| L4 | Review & Import | sets a category on a row and **Remember for "ESSELUNGA"**; **Import n transactions** | rows with badges, the category pickers, the summary; then **Import complete** (Balance check) → **View transactions** | `l04-review-import`, `l05-import-complete` | rows in History; an import rule exists |
| L5 | Import (again) | pastes the same file, Check, Continue | every row *Already imported*, "n rows already imported — they will be skipped" | `l06-import-duplicates` | nothing added |
| L6 | Import Rules | Others → **Import rules** | the rule "ESSELUNGA → Groceries" | `l07-import-rules` | one rule |
| L7 | Export | Others → Import and export → **Export file**; Format CSV; **Export settings**; **Period** this month; **Copy text** | the preview (n lines), the settings sheet, Copied | `l08-export`, `l09-export-settings` | the copied text has the header row and this month's rows |
| L8 | Backup | Others → **Backup**; **Back up now** | "Backup saved — … Destination: Downloads folder" (web), the log row Manual · Saved | `l10-backup`, `l11-backup-saved` | a file downloaded; log has one row |
| L9 | Loans hub | **+ → Debt** | the three tiles; My Loans (empty) — Simulations appears once one is saved | `l12-loans-hub` | — |
| L10 | Simulator | **Mortgage**: Loan Amount 180,000, Down Payment 30,000, Duration 25 years, Annual Rate 3.2, First Payment next month; opens **Details** | the form, the Details section | `l13-loan-simulator`, `l14-loan-details` | — |
| L11 | Results | **Calculate**; **Payment Schedule** Detailed | Monthly Payment, Total Interest, Total Amount, Installments, Last Payment, the schedule | `l15-loan-results`, `l16-loan-schedule` | payment ≈ €727 (150,000 at 3.2 % over 300 months) |
| L12 | Results → My Loans | **Add to My Loans** (name "Home"); **Track monthly payment** → **Add recurring expense** | "Track this payment?" with the amount and start date; the results now show Progress and "Tracked as a monthly expense" | `l17-track-payment`, `l18-loan-tracked` | a Loan Payment series exists; hub lists Home under My Loans |
| L13 | Results · edit | ⋯ → **Edit Loan**; rate 2.9; **Save Changes** | **Update linked payments?** with the new amount | `l19-sync-payments` | the series amount updated |
| L14 | Home · reorder | holds the Savings card and drags it first | the card lifts, neighbours slide | `l20-tile-drag` | order saved; survives reload |
| L15 | Accounts sheet | Others → **Accounts**; **Move down** on Savings | the list in her order, Default wallet under Main Bank | `l21-accounts-sheet` | Home follows |
| L16 | Tab bar | Others → **Tab bar**: Move Smart Insights up twice | the rows with arrows; the bottom bar reorders | `l22-tab-bar` | bar order |
| L17 | Privacy | Others → **Hide balances** on; Home | the pill "Balances hidden", every amount `••••`; the sheet with **Show** | `l23-home-hidden`, `l24-hidden-sheet` | masked on Home only; History unmasked |
| L18 | Language | Others → Language → Italiano; back to English | the whole screen re-renders live ("Altro", "Conti") | `l25-settings-italian` | tab labels in Italian; then back |
| L19 | Currency | Others → Currency → USD | **Switch to USD?** naming the accounts that would be excluded; Cancel | `l26-currency-switch` | nothing changed |
| L20 | Analytics · custom range | Period pill → **Custom range…**; picks Sep 14 and Nov 3; Done | the calendar step; bars by week, `vs Jul 25 – Sep 13` | `l27-period-sheet-custom`, `l28-analytics-custom` | label; comparison label |
| L21 | Categories | Others → **Categories**; **+**; "Subscriptions", Expense, icon; **Create Category**; opens it; back, ⋮ on its row → Edit → Delete | the list by type; New Category with Select Icon; the detail (empty); the editor | `l29-categories`, `l30-new-category`, `l31-category-detail` | created then deleted |
| L22 | Tags | Others → **Tags**; taps "friends", then "See 1 transaction" | every tag with a count; the Edit tag sheet; History filtered by that tag over all time | `l32-tags` | tags chip |
| L23 | Edit Account | Home → ⋯ on Cash; Opening Balance Date later than existing rows; Save | **Entries before this date** (n entries … will stay in History but no longer count) → "Open on … instead" | `l33-opening-date-sheet` | date kept at the earliest |
| L24 | Delete account | Edit Account → **Delete Account** → "Yes, Delete Everything" | "Delete Account? All associated transactions will be permanently deleted." | `l34-delete-account` | card gone; totals exclude it |
| L25 | Factory Reset | Others → Danger Zone → **Factory Reset** → confirm | "Factory Reset?"; then the Welcome sheet again | `l35-factory-reset`, `l36-welcome-again` | storage cleared; Welcome shown |

---

## C. Coverage map (filled at the end)

For every step: the journey spec that checks it, and any existing spec that
already covered the same screen. Steps with no automated check are listed.

## D. Findings (filled at the end)

Bugs the journey tests turned up, each with the step, what was expected,
what happened, and the fix commit.
