# Product Requirements Document (PRD): Stackd (MVP)

## 01. Problem Statement

### The Core Problem, What are we solving? Who has this problem?

Many personal finance apps are bloated, require invasive bank API connections, or feature cluttered, outdated user interfaces. Privacy-conscious users and those who prefer manual tracking need a rigorous, beautiful, and distraction-free tool to log expenses and revenues across multiple fragmented accounts (cash, digital banks, traditional banks).

### Why now? Why is the right time to solve it?

With economic uncertainty, granular financial tracking is a priority. Simultaneously, users are experiencing "app fatigue" with heavy, feature-stuffed financial platforms. There is a strong market appetite for minimalist, "Revolut-like" aesthetics combined with local, privacy-first manual data entry.

### Current Workarounds, how do users currently cope without this feature?

Users currently rely on cumbersome spreadsheet templates (Excel/Google Sheets), basic generic note-taking apps, or bloated legacy finance apps that push premium subscriptions and unwanted features.

## 02. Goals & Non-Goals

### Goals - what success looks like, users can....

- Create and manage multiple manual financial accounts (e.g., "Cash", "Revolut", "Main Bank").
- Manually log revenues and expenses with a seamless, low-friction UI.
- Categorize transactions using a default system list, with the ability to add custom categories.
- Add plain-text comments to individual transactions for context.
- Instantly view a global net worth chart and a breakdown of money per account.
- Experience a modern, minimalist, low-color UI inspired by neo-banks like Revolut.

### Non-Goals - explicitly out of scope, this does not include...

- Web portal or iOS application.
- Automated bank account syncing (e.g., Plaid/Tink integrations).
- Hashtag system for sub-categorization.
- Multi-currency conversions and live exchange rates.
- Complex budgeting, forecasting, or bill-split features.

## 03. User Stories with acceptance criteria

### US-01: Manage Accounts

As a user, I want to create and name custom accounts so that I can track balances across different real-world storage places.

**Acceptance Criteria:**
- User can create a new account by providing a name (e.g., "Wallet").
- User can view a list of all created accounts.
- User can edit or delete an account (deleting an account prompts a warning about linked transactions).

### US-02: Log Transactions

As a user, I want to log an expense or revenue so that my account balances stay up to date.

**Acceptance Criteria:**
- User can input an amount, select transaction type (Income/Expense), and assign it to a specific account.
- User must select a category from a dropdown/list.
- User has an optional plain-text "comment" field.
- Upon saving, the respective account balance updates immediately.

### US-03: Category Management

As a user, I want to use pre-defined categories and create new ones so that my tracking matches my specific lifestyle.

**Acceptance Criteria:**
- App provides a default list of categories (e.g., Groceries, Transport, Salary, Entertainment).
- User can add a new custom category name.

### US-04: Dashboard & Visualization

As a user, I want to view my total global money and per-account balances visually so that I have a clear snapshot of my financial health.

**Acceptance Criteria:**
- Dashboard features a main chart/graph displaying the global aggregated balance of all accounts.
- Dashboard features a list or visual breakdown showing the current balance of each individual account.
- UI matches a modern, low-color, neo-bank aesthetic.

## 04. Scope - MoSCoW Prioritisation

### Must Have, non-negotiable features

- Native Android application.
- Manual account creation and balance tracking.
- Manual transaction logging (Income/Expense).
- Default system categories.
- Global balance chart and individual account balance views.
- Minimalist, modern UI design.

### Should Have, important but not critical

- Custom category creation.
- Plain-text comment field on transactions.
- Basic transaction history list per account.

### Could Have, nice to have if time allows

- Simple date filtering on the dashboard (e.g., "Current Month").
- Dark mode toggle.

### Won't Have, explicitly deferred

- Bank API syncing.
- Web or iOS versions.
- Hashtags.
- Cloud account backup/sync.

## 05. Technical Notes & Constraints

### Tech Stack

- **Frontend/App:** Android Native (Kotlin with Jetpack Compose recommended for the modern, fluid UI requirements).
- **Backend/Storage:** Local Database (Room / SQLite) — No cloud backend required for MVP to ensure rapid development and user privacy.
- **Charting:** MPAndroidChart or a native Compose charting library for the dashboard visualizations.

### Constraints & Dependencies

- **Data Loss Risk:** Since the MVP relies on local storage without cloud sync, app deletion will result in data loss. (Can be addressed post-MVP with local file exports).
- **Android Only:** Restricts the initial user base but ensures higher quality and faster iteration for the MVP.

## 06. Success Metrics

### Key Metrics

- **Activation Rate:** Percentage of users who create at least one account and log their first transaction within 24 hours of install.
- **Engagement:** Average number of transactions logged per active user per week.
- **Retention:** Day 7 and Day 30 user retention rates.

### Definition of Done

- App is fully functional on Android OS (tested on current standard screen sizes).
- All "Must Have" and "Should Have" features are implemented.
- UI adheres to the minimalist, low-color design spec.
- Code is merged, passes basic local QA with no critical crashes, and is ready for an internal alpha release.
