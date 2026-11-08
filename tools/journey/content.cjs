// The text of the user-journey page (docs/user-journey-plan.md, UJ). Written
// for an external UX/UI designer: plain product language, screens named as
// the app names them. Step ids match docs/user-journey/inventory.md and the
// journey specs (tests/e2e/journey_*.spec.js). build.cjs renders it.
const P = {
  nora: { spec: 'journey_first_time', color: '#0f766e' },
  marco: { spec: 'journey_daily', color: '#1d4ed8' },
  lea: { spec: 'journey_power', color: '#7c3aed' }
};

const mapSvg = `
<svg class="flow" viewBox="0 0 960 330" role="img" aria-label="Map of the app: five tabs, the plus menu and the pages they open">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#94a3b8"/></marker></defs>
  <style>.b{fill:#fff;stroke:#cbd5e1;stroke-width:1.25}.t{fill:#0f172a;font-size:13px;font-weight:600}.s{fill:#475569;font-size:11.5px}.l{fill:none;stroke:#94a3b8;stroke-width:1.25;marker-end:url(#arr)}.acc{fill:#111;stroke:#111}.acct{fill:#fff}</style>
  <text x="16" y="24" class="t" font-size="15">Five tabs along the bottom, one + button for everything you create</text>
  <g><rect class="b" x="16" y="56" width="150" height="54" rx="10"/><text class="t" x="91" y="79" text-anchor="middle">Home</text><text class="s" x="91" y="97" text-anchor="middle">balance · graph · wallets · widgets</text></g>
  <g><rect class="b" x="186" y="56" width="150" height="54" rx="10"/><text class="t" x="261" y="79" text-anchor="middle">History</text><text class="s" x="261" y="97" text-anchor="middle">every transaction by day</text></g>
  <g><rect class="b" x="356" y="56" width="150" height="54" rx="10"/><text class="t" x="431" y="79" text-anchor="middle">Goals</text><text class="s" x="431" y="97" text-anchor="middle">monthly limits per category</text></g>
  <g><rect class="b" x="526" y="56" width="150" height="54" rx="10"/><text class="t" x="601" y="79" text-anchor="middle">Analytics</text><text class="s" x="601" y="97" text-anchor="middle">net balance · flow · distribution</text></g>
  <g><rect class="b" x="696" y="56" width="150" height="54" rx="10"/><text class="t" x="771" y="79" text-anchor="middle">Smart Insights</text><text class="s" x="771" y="97" text-anchor="middle">what stands out, on the phone</text></g>
  <g><circle class="acc" cx="904" cy="83" r="22"/><text class="acct" x="904" y="90" text-anchor="middle" font-size="24" font-weight="700">+</text></g>
  <path class="l" d="M904 105 V 150"/>
  <g><rect class="b" x="560" y="150" width="384" height="42" rx="10"/><text class="t" x="752" y="176" text-anchor="middle">Add Log · Add Account · Debt (Loans) · Add Category · Others &amp; Settings</text></g>
  <path class="l" d="M620 192 V 236"/><path class="l" d="M700 192 V 236"/><path class="l" d="M770 192 V 236"/><path class="l" d="M850 192 V 236"/><path class="l" d="M920 192 V 236"/>
  <g><rect class="b" x="560" y="236" width="118" height="54" rx="10"/><text class="t" x="619" y="259" text-anchor="middle">New Log</text><text class="s" x="619" y="277" text-anchor="middle">expense · income · transfer</text></g>
  <g><rect class="b" x="686" y="236" width="60" height="54" rx="10"/><text class="t" x="716" y="259" text-anchor="middle">New</text><text class="s" x="716" y="277" text-anchor="middle">Account</text></g>
  <g><rect class="b" x="754" y="236" width="60" height="54" rx="10"/><text class="t" x="784" y="259" text-anchor="middle">Loans</text><text class="s" x="784" y="277" text-anchor="middle">hub</text></g>
  <g><rect class="b" x="822" y="236" width="60" height="54" rx="10"/><text class="t" x="852" y="259" text-anchor="middle">New</text><text class="s" x="852" y="277" text-anchor="middle">Category</text></g>
  <g><rect class="b" x="890" y="236" width="54" height="54" rx="10"/><text class="t" x="917" y="259" text-anchor="middle">Others</text><text class="s" x="917" y="277" text-anchor="middle">settings</text></g>
  <path class="l" d="M91 110 V 150"/><path class="l" d="M261 110 V 150"/>
  <g><rect class="b" x="16" y="150" width="150" height="54" rx="10"/><text class="t" x="91" y="173" text-anchor="middle">Edit Account</text><text class="s" x="91" y="191" text-anchor="middle">from a wallet's ⋯</text></g>
  <g><rect class="b" x="186" y="150" width="150" height="54" rx="10"/><text class="t" x="261" y="173" text-anchor="middle">Edit Log</text><text class="s" x="261" y="191" text-anchor="middle">tap a row</text></g>
  <path class="l" d="M917 290 V 300 H 480 V 300"/>
  <g><rect class="b" x="16" y="236" width="420" height="80" rx="10"/><text class="t" x="226" y="259" text-anchor="middle">Reached from Others &amp; Settings</text><text class="s" x="226" y="279" text-anchor="middle">Accounts (reorder) · Categories · Tags · Tab bar · Privacy · Theme · Currency · Language</text><text class="s" x="226" y="297" text-anchor="middle">Import and export · Backup · Import rules · In-app purchases · FAQ · User Manual · Factory Reset</text></g>
</svg>`;

const flow = (title, nodes) => {
  // a row of stage boxes with arrows; nodes = [[label, sub], …]
  const W = 150, gap = 24, x0 = 16;
  const total = x0 * 2 + nodes.length * W + (nodes.length - 1) * gap;
  const boxes = nodes.map(([l, s], i) => { const x = x0 + i * (W + gap); return `<g><rect class="b" x="${x}" y="48" width="${W}" height="60" rx="10"/><text class="t" x="${x + W / 2}" y="73" text-anchor="middle">${l}</text><text class="s" x="${x + W / 2}" y="92" text-anchor="middle">${s}</text></g>` + (i < nodes.length - 1 ? `<path class="l" d="M${x + W} 78 H ${x + W + gap - 2}"/>` : ''); }).join('');
  return `<svg class="flow" viewBox="0 0 ${total} 124" role="img" aria-label="${title}"><defs><marker id="arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#94a3b8"/></marker></defs><style>.b{fill:#f8fafc;stroke:#cbd5e1;stroke-width:1.25}.t{fill:#0f172a;font-size:13px;font-weight:600}.s{fill:#475569;font-size:11px}.l{fill:none;stroke:#94a3b8;stroke-width:1.25;marker-end:url(#arr2)}</style><text x="16" y="24" class="t" font-size="14">${title}</text>${boxes}</svg>`;
};

module.exports = {
  title: "Stack'd — the user journey",
  lead: "Stack'd is a privacy-first personal finance tracker for iPhone and Android: every account, transaction and budget lives on the phone, nothing is sent anywhere. This page walks three people through the app as it ships today (version 1.2, English, light theme), screen by screen, with the friction we see and the questions we would like a designer's view on.",
  meta: [['Build', '1.2 (build 10202 round), 8 November 2026'], ['Platform', 'iPhone and Android, portrait; screenshots 390 × 844'], ['Data', 'invented example finances, the same seed on every screen'], ['Checks', 'each step has an automated journey test where one was possible (see Coverage)']],
  sections: [
    { id: 'primer', title: 'The app in one minute' }, { id: 'personas', title: 'Three people' },
    { id: 'journey-nora', title: 'Nora · first time' }, { id: 'journey-marco', title: 'Marco · daily' }, { id: 'journey-lea', title: 'Lea · power user' },
    { id: 'screens', title: 'Every screen' }, { id: 'coverage', title: 'Coverage' }, { id: 'findings', title: 'Findings and questions' }
  ],

  primer: {
    title: 'The app in one minute',
    paragraphs: [
      "You create **accounts** (the app also calls them wallets: a bank account, a card, cash, savings) with an opening balance, then **log** what you earn, spend and move between them. Balances are never typed in: they are always the sum of the entries. Everything else — the Home graph, **Goals** (monthly limits per category), **Analytics**, **Smart Insights** — is computed from those entries, on the phone.",
      "Money entered by hand is the heart of it, but data can also come in from a bank statement file, a MoneyStats or QIF export, or a Stack'd backup, and go out as a CSV, a PDF of receipts or a one-file backup. There is no login and no server: the free plan allows two accounts and the built-in categories; a one-time **Stack'd Pro** purchase lifts both limits. An optional bank-connection feature exists in the code but is not in the shipped build, so it is not covered here.",
      "The interface is one scrolling screen at a time, a five-tab bar at the bottom and a round **+** button that opens the quick-actions menu. Sheets slide up from the bottom for pickers and confirmations. Light and dark themes, five languages (English, French, Italian, Spanish, Portuguese)."
    ],
    cards: [
      { h: 'Home', p: 'Total balance with two deltas (today and projected end of month), a two-pane graph (balance curve · monthly net), the wallet cards in your order, and the widgets you chose.' },
      { h: 'History', p: 'Every entry by day, one month at a time (‹ › or a Period sheet), filters as chips, swipe a row for Paid / Edit / Delete, long press to select many.' },
      { h: 'Goals', p: 'Monthly limits per category with a ring (Allocated · Spent · Remaining), bars that turn amber then red, rollover month to month.' },
      { h: 'Analytics', p: 'Net balance for the period with the change vs the previous one, income − expenses per bucket, and the category distribution ring.' },
      { h: 'Smart Insights', p: 'A page of plain-language cards: budgets at risk, unusual spending, pace vs last month, upcoming payments, loan progress… each opens where you can act.' },
      { h: 'Loans', p: 'A simulator for a mortgage, personal loan or installment plan (full schedule, early repayments, rate changes), kept as a simulation or tracked as a real loan tied to a recurring payment.' }
    ],
    mapTitle: 'How the screens connect',
    mapSvg,
    mapNote: 'Full-screen pages (New Log, New Account, the editors, Loans, Import, Export, Backup, In-app purchases) carry a round ✕ at the top right and return to where you came from. Sheets close with ✕, Cancel, a tap outside or the phone\'s Back.'
  },

  personasTitle: 'Three people',
  personasLead: 'The journeys below follow three invented users whose habits cover the app end to end. They are not research personas; they are a way to walk every screen in the order a real person would meet it.',
  personas: [
    { name: 'Nora', initial: 'N', role: 'first-time user', color: P.nora.color, bio: 'Installed the app this morning after giving up on a spreadsheet. Two accounts, logs by hand, privacy-minded: she picked Stack\'d because it asks for no bank login.', goal: 'See where her money is by tonight, with as little setup as possible.', worry: 'Getting the first numbers wrong and not knowing how to fix them.', success: 'Her two balances on Home, a first expense in History, one budget set — and a clear idea of what Pro would add.' },
    { name: 'Marco', initial: 'M', role: 'daily logger', color: P.marco.color, bio: 'Six months in: four accounts, a few budgets, a card he uses for almost everything. Opens the app most evenings to log the day and glance at the month.', goal: 'Log three things in under a minute each and know whether the month is on track.', worry: 'Duplicates, a recurring payment he forgot about, a budget blown without noticing.', success: 'Entries logged with tags and a transfer, the streaming subscription set to repeat, Goals and Insights read in passing.' },
    { name: 'Lea', initial: 'L', role: 'power user', color: P.lea.color, bio: 'Brings in her bank statement every month, keeps backups, tracks a mortgage, and tunes the app to her taste — order of accounts and tabs, hidden balances in public, Italian at home.', goal: 'Move the month\'s bank data in without duplicates and keep everything backed up.', worry: 'An import that doubles her entries; losing data on a new phone.', success: 'Statement imported and categorised with rules, a backup saved, the mortgage tracked, the app arranged her way.' }
  ],

  journeys: [
    {
      id: 'journey-nora', short: 'Nora', title: 'Nora · the first hour',
      lead: 'From the first launch to the moment the free plan asks for Pro. Nora starts with an empty install, picks EUR and English, creates two accounts and logs her first expense.',
      flowSvg: flow('Nora: six stages', [['Welcome', 'currency · language'], ['First account', 'name · opening balance'], ['First log', 'expense · category'], ['Reading back', 'History · Home'], ['A goal', 'monthly limit'], ['The limit', 'third account → Pro']]),
      stages: [
        { title: 'Arrive', sub: 'the Welcome sheet and an empty Home', steps: [
          { id: 'N1', screen: 'Welcome to Stack\'d', title: 'Pick a currency and a language', user: 'Opens the app for the first time. Sets Currency to EUR and Language to English, taps **Get Started**.', app: 'A mandatory sheet over a blank Home: "Set your preferred region. You can always change this later in Others → Region Setting." Two rows (Currency, Language) and one button. It cannot be swiped away.', shots: [['n01-welcome', 'Welcome sheet']], friction: 'Nothing says what the app does or what happens next; the only choices are two settings. A returning user who wants to bring data from another app has no door here (import is five taps deep in Others).', question: 'Should the first screen say what Stack\'d is and offer two starts — "Start fresh" and "Bring my data" — before the region question?' },
          { id: 'N2', screen: 'Home (empty)', title: 'An empty dashboard', user: 'Looks around.', app: 'Total Balance €0.00 with two zero deltas, an empty graph area with the range chips, the **Add Wallet** tile alone in the wallets row, a Latest transactions widget saying "No transactions yet".', shots: [['n02-home-empty', 'Home before any account']], friction: 'Three empty states compete (hero, graph, widget). The one action that matters — create an account — is a small dashed tile; the + button is not pointed at.', question: 'Would a single first-run card ("Add your first account to see your balance here") replace the empty graph and widget until there is data?' },
          { id: 'N3', screen: 'Quick-actions menu', title: 'The + menu', user: 'Taps **+**.', app: 'Five actions over a dimmed Home: Add Log, Add Account, Debt, Add Category, Others & Settings.', shots: [['n03-menu', 'The quick-actions menu']], friction: 'The entry says **Debt**; the page it opens is titled **Loans**. "Add Category" sits at the same level as "Add Log" though it is rare. Settings are reachable only from here (there is no gear anywhere else).', question: 'Rename the entry to Loans; demote Add Category; is Settings behind + what you would expect, or does it want a place in the top bar of Home?' }
        ]},
        { title: 'First account', sub: 'New Account', steps: [
          { id: 'N4', screen: 'New Account', title: 'Create "Main Bank"', user: 'Taps Add Account. Types "Main Bank", leaves type Bank, keeps the first colour, types the opening balance 1,200.00 and taps **Create Account**.', app: 'Account Name, Type, Icon, Account Color (a row of dots), Currency (EUR), Opening Balance with Positive / Negative, Opening Balance Date (today), Set as Default Wallet. Save at the bottom.', shots: [['n04-new-account', 'New Account filled in']], friction: 'The opening-balance field is digits-only and shifts right to left (typing 1-2-0-0-0-0 shows 1,200.00): fast once known, surprising the first time. Eight account types and eight colours arrive before the user knows what they are for.', question: 'Is the cents-shift amount entry the right pattern here (it matches the transaction form), or should this field accept a typed "1200"?' },
          { id: 'N5', screen: 'Home', title: 'The first wallet', user: 'Lands back on Home.', app: 'Total Balance €1,200.00, a flat balance line, one wallet card (icon in the account colour, BANK · Main Bank · €1,200.00 in green), the Add Wallet tile.', shots: [['n05-home-first-wallet', 'Home with one wallet']], friction: 'The balance is green because it is positive, the same green that means "income" elsewhere; a flat graph over 1 month says little yet.', question: 'Should positive balances be neutral (black) and green kept for income and gains only?' }
        ]},
        { title: 'First log', sub: 'New Log', steps: [
          { id: 'N6', screen: 'New Log', title: 'Log a €12.50 grocery run', user: 'Taps + → Add Log. Expense is preselected; types 12.50, picks Groceries, writes "Weekly shop", taps **Save Transaction**.', app: 'Expense · Income · Transfer at the top; a large amount in red; Account (Main Bank preselected as the Default Wallet); Category with "+ Add custom"; Date; Tags; Note; Attachments; Paid; Recurrent; Save.', shots: [['n06-new-log', 'New Log with the first expense']], friction: 'A long form for a quick action: nine fields before Save, though only amount and category are needed. The category is a system dropdown, so icons and colours are not shown while choosing.', question: 'Could the form open on amount + category and reveal the rest behind "More" (date, tags, note, attachment, paid, repeat)?' },
          { id: 'N7', screen: 'History', title: 'Read the first day', user: 'Saving lands on History.', app: 'The month pill, a summary card Start €0.00 · End €1,187.50 · Net Change +€1,187.50, today\'s group with two rows: **Adjustment +€1,200.00** (the opening balance) and **Groceries −€12.50**, and the day sum €1,187.50.', shots: [['n07-history-first', 'History after the first log']], friction: 'The opening balance shows up as a transaction called "Adjustment" dated today, so the first thing Nora sees is a +€1,200 entry she did not make and a Net Change of +€1,187.50 for a day she spent €12.50.', question: 'Should an opening balance be a row in History at all? If yes, should it be named "Opening balance", shown differently, and left out of the day sum and Net Change?' },
          { id: 'N8', screen: 'Edit Log', title: 'Fix the note', user: 'Taps the Groceries row, changes the note, taps **Update Transaction**.', app: 'The same form titled Edit Log, with a Delete Transaction button under Save.', shots: [['n08-edit-log', 'Edit Log']], friction: 'Delete sits directly under the primary button; the tap target of a row is the whole card, but swiping is the only way to Paid.', question: null },
          { id: 'N9', screen: 'Home', title: 'Home after the first log', user: 'Returns Home.', app: 'Total €1,187.50 with the two deltas now red (−€12.50, −1.0 % vs. start of month), the curve dips, the wallet card reads €1,187.50, Latest transactions lists Groceries.', shots: [['n09-home-after-first-log', 'Home after one expense']], friction: 'Two red deltas (as of today / projected EOM) say the same thing on day one; the labels "vs. start of mo." and "projected EOM" are terse.', question: 'Are both deltas needed, and can their labels be full words?' }
        ]},
        { title: 'A goal', sub: 'Goals', steps: [
          { id: 'N10', screen: 'Goals', title: 'A €300 limit on Groceries', user: 'Opens Goals, taps Groceries, types 300, taps **Save**.', app: 'The limit editor: Monthly Limit, a hint "So far this month you spent €12.50 on this category — set a limit below that to keep it in check", Start Month, End Month, Cumulative Rollover. Then the ring: Allocated €300.00, Total Spent €12.50, Remaining €287.50, the Groceries row "€12.50 of €300.00".', shots: [['n10-goals-editor', 'The limit editor'], ['n11-goals-set', 'Goals with one limit']], friction: 'The hint suggests a limit *below* €12.50 after one shop: well-meant, wrong on day one. The screen was titled "Budget" while the tab says "Goals" (fixed during this review).', question: 'Should the hint wait for a month of data? Is the Expenses · Income switch clear enough as two budgets in one screen?' }
        ]},
        { title: 'The limit', sub: 'free plan and Stack\'d Pro', steps: [
          { id: 'N11', screen: 'Home · New Account', title: 'A second wallet, Cash', user: 'Taps Add Wallet, creates "Cash" with €80.00.', app: 'Two cards in alphabetical order (Cash, Main Bank), Total €1,267.50.', shots: [['n12-home-two-wallets', 'Two wallets']], friction: 'New accounts land in alphabetical order until moved, so the one created first is not first.', question: null },
          { id: 'N12', screen: 'Account limit reached', title: 'A third wallet meets the free plan', user: 'Taps Add Wallet again.', app: 'A full page instead of the form: "Account limit reached — The free plan includes 2 accounts. Unlock Stack\'d Pro once to add as many as you need." with **See Stack\'d Pro** and Go Back.', shots: [['n13-pro-lock', 'The free-plan lock']], friction: 'The lock appears only after the tap, with no earlier sign that two is the limit.', question: 'Should the Add Wallet tile or Settings show "2 of 2 accounts on the free plan" before the wall?' },
          { id: 'N13', screen: 'In-app purchases', title: 'What Pro is', user: 'Taps See Stack\'d Pro.', app: 'One-time purchase tab: Stack\'d Pro, three perks (unlimited accounts, your own categories, one payment), the price button, Restore purchase, Redeem a code, Terms of Use · Privacy Policy. A Subscriptions tab (empty in this build). In a browser it says "Purchases are available in the mobile app".', shots: [['n14-purchases', 'In-app purchases']], friction: 'A second tab for a subscription that does not exist in this build.', question: 'Hide the Subscriptions tab until there is one?' },
          { id: 'N14', screen: 'Smart Insights', title: 'Too early for insights', user: 'Opens the fifth tab.', app: 'A Getting started card: "Log a few days of spending to unlock insights · 1 of 5 entries so far" with **Add a transaction**; below, the locked insights with what unlocks them.', shots: [['n15-insights-starter', 'Smart Insights on day one']], friction: null, question: 'Is a progress line enough, or should the locked cards show an example of what they will say?' },
          { id: 'N15', screen: 'Others & Settings', title: 'Where everything else is', user: 'Opens + → Others & Settings.', app: 'A long page: Manage (Accounts, Categories, Tags), Region Setting, Tab bar, Privacy, Data Visualization, Appearance, Data (Import and export, Backup, Import rules), In-app purchases ("Free plan — up to 2 accounts and the default categories"), Support, Danger Zone.', shots: [['n16-settings', 'Others & Settings']], friction: 'The page is titled "Others" while the menu says "Others & Settings". Eleven cards without a search.', question: 'Is "Settings" the better title; should Data (import, export, backup) be a top-level destination rather than a card?' }
        ]},
      ],
      summary: 'Nora reaches her goal: two balances, one expense, one limit. The rough edges are at the very start (an onboarding that explains nothing and three empty states), in the first History read (the opening balance posing as a transaction), and in the length of the New Log form for a one-line action.'
    },
    {
      id: 'journey-marco', short: 'Marco', title: 'Marco · an evening with the app',
      lead: 'Six months of entries already in. Marco reads Home, drills into one card, logs a tagged expense, a transfer and a monthly subscription, tidies History with swipes and a selection, then checks Goals, Analytics and Smart Insights.',
      flowSvg: flow('Marco: five stages', [['Read', 'Home · one account'], ['Log', 'tag · transfer · repeat'], ['Tidy', 'swipe · select · scope'], ['Check', 'Goals · Analytics'], ['Tune', 'Insights · widgets']]),
      stages: [
        { title: 'Read', sub: 'Home and one account', steps: [
          { id: 'M1', screen: 'Home', title: 'Home on a new day', user: 'Opens the app.', app: 'Total Balance €28,170.81 with +1.8 % / +1.3 % deltas, the balance curve (1M), the four wallet cards, then Latest transactions, Categories, Income vs Expenses and Personal savings widgets.', shots: [['m01-home', 'Home with six months of data']], friction: 'The header stacks a lot before the first card: total, two deltas with captions, six range chips, the chart. The wallet row shows two cards and a sliver of the third as the only hint that it scrolls.', question: 'What is the one thing Home should answer at a glance — the total, the month\'s net, or "am I on track"? The current order says the total.' },
          { id: 'M2', screen: 'Home · Monthly net', title: 'Swipe to the monthly net', user: 'Swipes the graph sideways.', app: 'The second pane: twelve bars (green up, red down) titled Monthly net · End of month; the second dot is active. A tap opens Analytics.', shots: [['m02-home-monthly-net', 'The monthly net pane']], friction: 'The pager dots are small and sit below the chart; the gesture is not hinted.', question: null },
          { id: 'M3', screen: 'History (one account)', title: 'Tap a wallet card', user: 'Taps the Revolut card.', app: 'History filtered to that account: a chip "Revolut" with ✕ under the month pill, Start · End · Net Change for that account, only its rows.', shots: [['m03-history-account', 'History filtered to one account']], friction: 'The chip row is the only sign of the filter; the card tap is not labelled as "see its history".', question: null }
        ]},
        { title: 'Log', sub: 'three kinds of entry', steps: [
          { id: 'M5', screen: 'New Log · Tags', title: 'A €46 dinner with a tag', user: 'Add Log: Expense 46.00, Revolut, Dining Out. Taps Tags, types "friends", taps +, then ✓.', app: 'The Tags sheet: a search/create field, "In Dining Out" (tags already used with that category) then "All tags"; the created tag appears as a chip on the form.', shots: [['m04-tag-picker', 'The Tags sheet'], ['m05-new-log-tagged', 'New Log with a tag']], friction: 'Tags live in a separate sheet with their own + and ✓; a tag created there is remembered for the category, which the sheet does not say.', question: 'Would inline chips with a type-ahead replace the sheet for the common case of one tag?' },
          { id: 'M6', screen: 'New Log · Transfer', title: '€200 from Main Bank to Savings', user: 'Transfer, 200.00, From Main Bank, To Savings, Save.', app: 'The amount turns blue; Account becomes From Account and To Account; no category.', shots: [['m06-transfer', 'A transfer']], friction: null, question: null },
          { id: 'M7', screen: 'New Log · Recurrent', title: 'A monthly streaming subscription', user: 'Expense 9.99, Entertainment, note Streaming. Turns Recurrent on, taps "Repeats every…", keeps 1 month, sets an End Date six months out, Save.', app: 'The Repeats Every picker (two wheels: number · Days / Weeks / Months / Years); back on the form "Repeats every month" and an End Date field. Saving creates every future payment up to the end date.', shots: [['m07-repeats-every', 'Repeats Every'], ['m08-new-log-recurring', 'A recurring expense']], friction: 'Future payments are created as real rows dated ahead; they appear in History when you step to a later month, which can read as "already spent". A paid mark is per occurrence and set by hand.', question: 'Should future occurrences look different from past ones in History (lighter, "upcoming" label), and should "Paid" default to unpaid for a date in the future?' }
        ]},
        { title: 'Tidy', sub: 'History gestures', steps: [
          { id: 'M8', screen: 'History · swipe', title: 'Swipe a row', user: 'Swipes a row right (Paid), another left (Edit · Delete).', app: 'Actions are hidden until a row is swiped: right reveals Paid, left reveals Edit and Delete; a tap anywhere closes it.', shots: [['m09-swipe-left', 'A row swiped left']], friction: 'Nothing on a row suggests it swipes; the Paid action is only reachable by swipe or in the editor.', question: 'Is a one-time hint (a row peeking its actions on first visit) worth it?' },
          { id: 'M9', screen: 'History · selection', title: 'Select two and delete', user: 'Long-presses a row, taps a second, taps **Delete (2)**.', app: 'The icon flips to a check; the title row becomes Cancel · 2 Selected · Select All · Delete (2); a sheet "Delete these 2 transactions?" with a red button.', shots: [['m10-selection', 'Selection mode'], ['m11-delete-confirm', 'Delete confirmation']], friction: 'Long press is the only way in (by design, no Select button).', question: null },
          { id: 'M10', screen: 'Edit Log · scope', title: 'Change one payment of a series', user: 'Opens a future Streaming payment, changes 9.99 to 10.99, taps Update.', app: 'A sheet "Recurring Transaction": Only this transaction · This and future transactions · All transactions in the series, each with a line of consequence, plus a note that rebuilt payments start as paid.', shots: [['m12-recurring-scope', 'Recurring scope sheet']], friction: 'Three options with four lines of small print; the right default is not marked.', question: 'Should "This and future" be the highlighted default for an amount change, and "Only this" for a date change?' }
        ]},
        { title: 'Check', sub: 'periods, filters, Goals, Analytics', steps: [
          { id: 'M11', screen: 'History · period & filter', title: 'Last month, Groceries only', user: 'Taps ‹, then Filter and Sort → Groceries → Apply.', app: 'October from the top with a "This month" chip to return; the Filter and Sort sheet (Order, Transaction Type, Accounts, Categories, Tags, Reset); then a Groceries chip and In · Out · Net.', shots: [['m13-period-prev', 'The previous month'], ['m14-filter-sheet', 'Filter and Sort'], ['m15-history-filtered', 'History filtered to Groceries']], friction: 'The Filter sheet lists every category as a chip; with many categories it grows long. The summary card changes meaning (Start/End/Net Change → In/Out/Net) when a category filter is on.', question: null },
          { id: 'M12', screen: 'Goals', title: 'The month\'s budgets', user: 'Opens Goals.', app: 'The ring (slices by category, Others folds the small ones) with Allocated in the centre, Total Spent · Remaining, the Expenses · Income switch, one row per category with "€x of €y", a percentage ring and a bar — Dining Out in red with "Over by €5.80".', shots: [['m16-goals', 'Goals']], friction: 'Two rings per row (the big one and a small percentage one) plus a bar repeat the same number three ways.', question: 'Is the per-row percentage ring needed next to the bar?' },
          { id: 'M13', screen: 'Analytics', title: 'The month in numbers', user: 'Opens Analytics; taps Nov 30.', app: 'Total Net Balance · Today €28,114.82, "Excludes 1 upcoming transaction (−€120.00)", a badge "+1.6 % vs Oct 1 – Oct 8", a Today / Nov 30 toggle (Projected Balance · Nov 30), Net Flow Analysis bars, the Distribution ring with Expenses · Income.', shots: [['m17-analytics', 'Analytics'], ['m18-analytics-eom', 'Analytics projected to month end']], friction: 'The comparison window "vs Oct 1 – Oct 8" (the same days of last month) is correct but needs a second read; the Nov 30 toggle is a date, not a word.', question: 'Would "Same days last month" and "End of month" read better than the date ranges?' }
        ]},
        { title: 'Tune', sub: 'Insights and widgets', steps: [
          { id: 'M15', screen: 'Smart Insights', title: 'What stands out', user: 'Opens the fifth tab and taps the first card.', app: 'Sections (Needs attention, This month, Trends…), each card with an eyebrow, a figure, a headline and a small chart; a tap opens History, Goals, a sheet or a loan.', shots: [['m19-insights', 'Smart Insights']], friction: 'Cards are dense: eyebrow, big figure, headline, body and a mini-chart in one card.', question: 'One figure per card or none — which reads faster on a phone?' },
          { id: 'M16', screen: 'Home · widgets', title: 'Add a widget, remove one', user: 'Taps Add in the Widgets section, picks Account balances, Add; long-presses a widget, taps its ×, confirms Remove.', app: 'The Add widget sheet: a gallery of ten widgets with descriptions, a detail with a live preview and a Small / Wide rail; edit mode wiggles the cards and shows × badges; "Remove widget?".', shots: [['m20-add-widget', 'The widget gallery'], ['m21-widget-edit-mode', 'Widget edit mode']], friction: 'The gallery is a long list; ten widgets with two sizes each is a lot of choice on first contact.', question: 'Group the gallery (At a glance · This month · Planning) or show the three most useful first?' }
        ]}
      ],
      summary: 'Marco\'s evening works: each log is a minute, and the month is readable in Goals and Analytics. The friction is in discoverability (swipes, the pager, the card-tap filter) and in density (the Home header, the Insights cards, the scope sheet).'
    },
    {
      id: 'journey-lea', short: 'Lea', title: 'Lea · the monthly routine',
      lead: 'Lea brings in a bank file, exports and backs up, tracks a mortgage, and arranges the app to her taste. Everything here lives behind Others & Settings or the Loans hub.',
      flowSvg: flow('Lea: six stages', [['Import', 'file · map · review'], ['Keep', 'export · backup'], ['Loan', 'simulate · track · edit'], ['Arrange', 'accounts · tabs · privacy'], ['Region', 'language · currency · range'], ['Housekeeping', 'categories · tags · reset']]),
      stages: [
        { title: 'Import', sub: 'a bank CSV, twice', steps: [
          { id: 'L1', screen: 'Others → Data', title: 'Import and export', user: 'Opens Others → Import and export.', app: 'A small sheet: Import file · Export file · Cancel.', shots: [['l01-import-export-sheet', 'The Import and export sheet']], friction: 'A two-button sheet between Settings and the real screens.', question: 'Two rows in the Data card instead of a sheet?' },
          { id: 'L2', screen: 'Import', title: 'Paste the statement and Check', user: 'Pastes a bank CSV (date; description; amount with a decimal comma) and taps **Check**.', app: 'A text area with the line count, Choose a file, Import settings, Check; a hint lists what the app recognises.', shots: [['l02-import', 'Import with pasted text']], friction: 'Pasting raw text is unusual on a phone; the file button is the real path and sits second.', question: null },
          { id: 'L3', screen: 'Map Columns', title: 'Say which column is which', user: 'Picks the Date, Description and Amount columns, Day / Month / Year, the account; taps **Continue**.', app: '"4 rows · Pasted text", dropdowns per role with "Column 1 / 2 / 3", Amount format, Date format, Decimal separator, Import into account, a live Preview.', shots: [['l03-map-columns', 'Map Columns']], friction: 'Columns are named by number, so the user has to remember what Column 2 held; the preview below is the only check.', question: 'Show the first value of each column in the dropdown ("Column 2 · ESSELUNGA MILANO")?' },
          { id: 'L4', screen: 'Review & Import', title: 'Review, remember a rule, import', user: 'Sets Groceries on the ESSELUNGA row and taps "Remember for ESSELUNGA"; taps **Import 4 transactions**.', app: 'One row per transaction with a red "Choose category" pill, the Remember pill, badges for duplicates and errors; then an "Import complete" sheet with a balance check and **View transactions**.', shots: [['l04-review-import', 'Review & Import'], ['l05-import-complete', 'Import complete']], friction: 'Categorising happens row by row in red pills; with 60 rows it is a chore until rules exist.', question: 'Could the review group identical descriptions ("ESSELUNGA × 2") and ask once?' },
          { id: 'L5', screen: 'Import (again)', title: 'The same file again', user: 'Pastes and checks the same text.', app: 'Every row badged "Already imported", "4 rows already imported — they will be skipped", an "Import 0 transactions" button.', shots: [['l06-import-duplicates', 'Nothing to import']], friction: 'A disabled-looking button is the only outcome; the screen still asks for mapping first.', question: null },
          { id: 'L6', screen: 'Import Rules', title: 'The rule it learned', user: 'Opens Others → Import rules.', app: 'A sheet listing "esselunga → Groceries".', shots: [['l07-import-rules', 'Import Rules']], friction: null, question: null }
        ]},
        { title: 'Keep', sub: 'export and backup', steps: [
          { id: 'L7', screen: 'Export', title: 'Export the month', user: 'Others → Import and export → Export file; CSV; Export settings; Period this month; Copy text.', app: 'An info card, Format, Export settings (separator, date format, decimal mark, quotes, BOM), Period, a raw File preview with the line count, Copy text and Export file; Receipts PDF.', shots: [['l08-export', 'Export'], ['l09-export-settings', 'Export settings']], friction: 'The preview is raw CSV text in a box, hard to read on a phone and mostly a reassurance that something will be exported.', question: 'A table preview of the first rows instead of raw text?' },
          { id: 'L8', screen: 'Backup', title: 'Back up now', user: 'Others → Backup → **Back up now**.', app: 'Automatic backup switch, Back up now with the destination, Recent backups (Manual · Saved), Restore from a file, Export individual files; a "Backup saved" notice.', shots: [['l10-backup', 'Backup'], ['l11-backup-saved', 'Backup saved']], friction: null, question: null }
        ]},
        { title: 'Loan', sub: 'the mortgage', steps: [
          { id: 'L9', screen: 'Loans hub', title: 'Loans', user: 'Taps + → Debt.', app: '"Simulate loans and track the ones you have", tiles Mortgage · Personal Loan · Installment Plan, My Loans (empty).', shots: [['l12-loans-hub', 'The Loans hub']], friction: 'Reached as "Debt" from the menu, titled "Loans" here.', question: null },
          { id: 'L10', screen: 'Mortgage simulator', title: 'Enter the mortgage', user: 'Loan Amount 180,000, Down Payment 30,000, Duration 25 years, Annual Rate 3.2, First Payment next month; opens Details.', app: 'A big amount field, Down Payment with its percentage, Duration + unit, Annual Rate, First Payment, Details (payment type, interest-only first installment, rate changes, early repayments, extra costs), Calculate.', shots: [['l13-loan-simulator', 'The simulator'], ['l14-loan-details', 'Details']], friction: 'The amount is red, like an expense; Details is a long accordion of expert options.', question: null },
          { id: 'L11', screen: 'Results', title: 'The schedule', user: 'Taps Calculate; opens the Payment Schedule in Detailed form.', app: 'Monthly Payment €727.02, Total Interest, Total Amount, Installments 300, Last Payment; Add to My Loans · Save Simulation; the schedule with interest · principal per row.', shots: [['l15-loan-results', 'Results'], ['l16-loan-schedule', 'The payment schedule']], friction: null, question: null },
          { id: 'L12', screen: 'Results → My Loans', title: 'Track it as a monthly expense', user: 'Add to My Loans ("Home"), then Track monthly payment → Add recurring expense.', app: '"Track this payment?" with the amount and start date; the results then show Progress and "Tracked as a monthly expense".', shots: [['l17-track-payment', 'Track this payment?'], ['l18-loan-tracked', 'A tracked loan']], friction: null, question: null },
          { id: 'L13', screen: 'Results · edit', title: 'A new rate', user: '⋯ → Edit, rate 2.9, Save Changes.', app: '"Update linked payments?" with the new amount; Update Payments re-prices every upcoming one.', shots: [['l19-sync-payments', 'Update linked payments?']], friction: null, question: null }
        ]},
        { title: 'Arrange', sub: 'accounts, tabs, privacy', steps: [
          { id: 'L14', screen: 'Home · reorder', title: 'Drag a wallet card', user: 'Holds a card and drags it first.', app: 'The card lifts after 0.45 s and the neighbours slide; the order is kept everywhere.', shots: [['l20-tile-drag', 'A card being dragged']], friction: 'Hold-to-drag is invisible until known.', question: null },
          { id: 'L15', screen: 'Accounts (sheet)', title: 'Reorder from Settings', user: 'Others → Accounts, Move down on a row.', app: 'Rows in her order with a grip and ▲ ▼, "Default wallet" under the default, + Create New Account.', shots: [['l21-accounts-sheet', 'The Accounts sheet']], friction: null, question: null },
          { id: 'L16', screen: 'Tab bar', title: 'Move a tab', user: 'Others → Tab bar: Smart Insights up twice.', app: 'Home locked first, the other tabs with ▲ ▼ and a grip; the bottom bar follows.', shots: [['l22-tab-bar', 'Tab bar settings']], friction: null, question: null },
          { id: 'L17', screen: 'Privacy', title: 'Hide balances', user: 'Others → Hide balances; Home.', app: 'A "Balances hidden" pill at the top of Home; every amount reads €••••; the pill opens a sheet with Show / Done. Other screens stay unmasked.', shots: [['l23-home-hidden', 'Home with hidden balances'], ['l24-hidden-sheet', 'Balances hidden sheet']], friction: null, question: 'Should hiding also cover History and Analytics when the phone is shown around?' }
        ]},
        { title: 'Region', sub: 'language, currency, a custom range', steps: [
          { id: 'L18', screen: 'Language', title: 'Italian', user: 'Others → Language → Italiano.', app: 'The whole app re-renders live (Altro, Conti, Cronologia…).', shots: [['l25-settings-italian', 'Settings in Italian']], friction: null, question: null },
          { id: 'L19', screen: 'Currency', title: 'Try switching to USD', user: 'Others → Currency → USD.', app: '"Switch to USD?" — a pre-ticked option to relabel her EUR accounts, a warning that otherwise none would count in totals, "Amounts are never converted".', shots: [['l26-currency-switch', 'Switch to USD?']], friction: 'A dense sheet for a rare action; "relabel only, amounts are not converted" needs a second read.', question: null },
          { id: 'L20', screen: 'Analytics · custom range', title: 'Any two days', user: 'Period pill → Custom range…, picks two days.', app: 'A calendar step in the Period sheet with start / end marks and the day count; Analytics then draws weekly bars and names the compared window ("vs Jul 25 – Sep 13").', shots: [['l27-period-sheet-custom', 'The custom range calendar'], ['l28-analytics-custom', 'Analytics over a custom range']], friction: null, question: null }
        ]},
        { title: 'Housekeeping', sub: 'categories, tags, an account, reset', steps: [
          { id: 'L21', screen: 'Categories', title: 'A new category', user: 'Others → Categories → +, "Subscriptions", Expense, an icon; later deletes it.', app: 'Categories grouped Income / Expense / All Types with counts; New Category (name, type, icon picker); a detail page listing the category\'s entries.', shots: [['l29-categories', 'Categories'], ['l30-new-category', 'New Category'], ['l31-category-detail', 'Category detail']], friction: 'Colour is assigned, not chosen (by design, to keep rings legible); a category with entries cannot be deleted and the screen only says so in a footnote.', question: null },
          { id: 'L22', screen: 'Tags', title: 'Every tag', user: 'Others → Tags, taps one.', app: 'Each tag with its count; a tap opens History filtered by that tag over all time.', shots: [['l32-tags', 'Tags']], friction: null, question: null },
          { id: 'L23', screen: 'Edit Account', title: 'Move an opening date', user: 'Changes Cash\'s Opening Balance Date to after existing entries, Save.', app: '"Entries before this date — 6 entries (−€72.30) are dated before… They will stay in History but no longer count" with "Open on Jun 20, 2026 instead" / "Change anyway".', shots: [['l33-opening-date-sheet', 'Entries before this date']], friction: null, question: null },
          { id: 'L24', screen: 'Delete Account', title: 'Delete an account', user: 'Edit Account → Delete Account.', app: '"Delete Account? Are you sure you want to delete Cash? All associated transactions will be permanently deleted." Yes, Delete Everything · Cancel.', shots: [['l34-delete-account', 'Delete Account?']], friction: null, question: null },
          { id: 'L25', screen: 'Factory Reset', title: 'Start over', user: 'Others → Danger Zone → Factory Reset → confirm.', app: '"Factory Reset?" with a red button; then the Welcome sheet again on an empty app.', shots: [['l35-factory-reset', 'Factory Reset?'], ['l36-welcome-again', 'Back to Welcome']], friction: null, question: null }
        ]}
      ],
      summary: 'Everything Lea needs exists and works, but all of it is two or three taps into Others & Settings, and the Data screens (Import, Map Columns, Review) ask for more reading than the rest of the app.'
    }
  ],

  screens: {
    title: 'Every screen',
    lead: 'The complete list of screens, sheets and menus in the shipped build, with their controls and where each leads — the reference behind the journeys.',
    groups: [
      { title: 'The frame', rows: [
        ['Bottom bar', 'Five tabs: Home (always first), then History, Goals, Analytics, Smart Insights in the user\'s order. Tapping the tab you are on scrolls to the top (History: to today).', 'the five tabs'],
        ['+ button', 'Round primary button at the right of the bar.', 'the quick-actions menu'],
        ['Quick-actions menu', 'Add Log · Add Account · Debt · Add Category · Others & Settings, over a dimmed screen.', 'New Log · New Account · Loans · New Category · Others'],
        ['Close ✕', 'Filled round ✕ on every full-screen page; returns without adding a history entry.', 'back'],
        ['Back (Android, swipe)', 'Closes the top sheet, then the menu, then selection mode, then widget edit mode, then asks "Discard changes?" on a dirty form, then goes back.', '—']
      ]},
      { title: 'First launch', rows: [
        ['Welcome to Stack\'d', 'Mandatory sheet: Currency (USD, EUR, JPY, GBP, CNY), Language (5), "You can always change this later in Others → Region Setting".', 'Get Started → Home']
      ]},
      { title: 'Home', rows: [
        ['Total balance', 'Total in the base currency; deltas as of today and projected EOM vs the start of the month. Accounts in another currency are excluded (a note says how many).', '—'],
        ['Balances hidden pill', 'Only when Hide balances is on; every amount reads ••••.', 'Balances hidden sheet (Show / Done)'],
        ['Graph pager', 'Balance curve with range chips 1W · 1M · 6M · YTD · 1Y · Max; Monthly net (12 bars). Drag on the plot reads values; swipe elsewhere pages.', 'curve tap → Balance Trend sheet; bars tap → Analytics'],
        ['Balance Trend (sheet)', 'The expanded graph: Weekly / Monthly / Quarter, per-account lines, account and category filters, Save View / Reset View.', '—'],
        ['Wallet cards', 'One per account in the user\'s order: icon in the account colour, type, name, balance. Hold 0.45 s and drag to reorder. Last tile Add Wallet.', 'tap → History for that account; ⋯ → Edit Account; Add Wallet → New Account'],
        ['Widgets', 'Latest transactions · Income vs Expenses · Categories · Net worth · Personal savings · Upcoming transactions · Budget goals · 50/30/20 · Account balances · Smart Insights; small or wide. Long press → edit mode (wiggle, ×, drag).', 'widget tap → its page'],
        ['Add widget (sheet)', 'Gallery → detail with live preview and a Small / Wide rail → Configure (accounts, categories, look-ahead, planned income) → Add.', 'Home']
      ]},
      { title: 'History', rows: [
        ['Title row', 'History + Filter and Sort (badge = active filter kinds).', 'Filter and Sort sheet'],
        ['Period bar', '‹ [November 2026] › — arrows step a month / year / custom range and open the new period at the top; the pill opens the Period sheet. Context row: This month / This year, one chip per filter kind with ✕, Clear all.', 'Period sheet'],
        ['Period (sheet)', 'Month · Year grid; Custom range… opens a calendar (tap the first day, then the last).', '—'],
        ['Summary card', 'Start · End · Net Change; with a category / type / tag filter: In · Out · Net. Unpaid rows are not counted.', '—'],
        ['Day groups', 'A header per day, compact rows (category + amount; account + tags + paperclip), a sum per day. Spending neutral, transfers blue, income green; rows before an account\'s opening date dimmed.', 'row tap → Edit Log'],
        ['Row gestures', 'Swipe left → Edit · Delete; swipe right → Paid. Long press → selection mode: Cancel · n Selected · Select All · Delete (n).', 'Delete → confirm sheet'],
        ['Filter and Sort (sheet)', 'Order, Transaction Type, Accounts, Categories, Tags, Reset.', 'Apply'],
        ['Back to top', 'Floating chevron when deep-scrolled.', '—']
      ]},
      { title: 'New Log / Edit Log', rows: [
        ['Type', 'Expense · Income · Transfer.', '—'],
        ['Amount', 'Large field with the currency symbol; red / green / blue by type.', '—'],
        ['Account / From · To', 'Dropdowns in the user\'s order; a new log preselects the Default Wallet; a cross-currency transfer adds Amount received.', '—'],
        ['Category', 'Dropdown + "+ Add custom" (New Category and back with the form kept; free plan: Pro lock).', 'Select Category · New Category'],
        ['Date · Time', 'Time only when enabled in Others.', '—'],
        ['Tags', 'Tags sheet: the category\'s tags first, then all; type and + to create; ✓ applies.', '—'],
        ['Note', 'Suggests notes used before.', '—'],
        ['Attachments', 'Take a photo · Photo library · PDF file; thumbnails; viewer with Share / Delete.', '—'],
        ['Paid', 'Off = excluded until marked paid.', '—'],
        ['Recurrent', 'Repeats Every picker (1–30 days / weeks / months / years) and End Date (capped at 5 years).', '—'],
        ['Save / Update · Delete', 'Save lands on History. A recurring member asks the scope (Only this · This and future · All). An opening-balance row shows a read-only panel.', 'History']
      ]},
      { title: 'Accounts', rows: [
        ['New Account / Edit Account', 'Name, Type (8), icon, colour, currency, Opening Balance ± and date, Set as Default Wallet; Create / Save Changes; Delete Account. Moving the opening date past entries → "Entries before this date". Free plan: third account → Account limit reached.', 'Home'],
        ['Accounts (sheet, from Others)', 'Your order with Move up / Move down and a grip; "Default wallet"; + Create New Account.', 'Edit Account']
      ]},
      { title: 'Goals', rows: [
        ['Goals', 'Month bar, the ring (Allocated; slices biggest first, Others), Total Spent · Remaining, Expenses · Income, one row per category (x of y, percentage ring, bar amber at 75 %, red at 90 % or over, "Over by").', 'row → limit editor'],
        ['Limit editor', 'Monthly Limit, Start Month, End Month, Cumulative Rollover, a hint with the recent average; Save, Remove Budget Limit.', 'Goals']
      ]},
      { title: 'Analytics', rows: [
        ['Analytics', 'Period bar; Total Net Balance · Today with "Excludes n upcoming", change vs the previous window, Today / end-of-period toggle; Net Flow Analysis bars (tap → History); Distribution ring with Expenses · Income (legend row → tag breakdown → History). A custom range draws daily / weekly / monthly / yearly bars.', 'History']
      ]},
      { title: 'Smart Insights', rows: [
        ['Smart Insights', 'Needs attention · This month · Trends · Accounts and loans · Tidy up · Unlocks with more data; each card opens where you can act (History, Goals, the balance graph, Recurring payments sheet, a loan). New install: Getting started card.', 'destinations']
      ]},
      { title: 'Loans', rows: [
        ['Loans hub', 'Mortgage · Personal Loan · Installment Plan tiles; Simulations; My Loans (progress, next payment, tracked badge).', 'simulator · results'],
        ['Simulator', 'Loan Amount (Mortgage: Down Payment), Duration + unit, Annual Rate, First Payment; Details: payment type, interest-only first installment, rate changes, early repayments, extra costs; Calculate.', 'Results'],
        ['Results', 'Monthly Payment, Total Interest, Total Amount, Installments, Last Payment; early-repayment savings; Payment Schedule Brief / Detailed; Save Simulation · Add to My Loans; Track monthly payment; ⋯ Edit · Delete; Update linked payments? after an edit.', 'hub']
      ]},
      { title: 'Categories and tags', rows: [
        ['Categories', 'Grouped Income / Expense / All Types with counts; + → New Category (name, type, icon; free plan: Pro lock); row ⋮ → Edit (Delete only when empty).', 'Category detail · Edit Category'],
        ['Category detail', 'The category\'s entries, by tag.', 'Edit Log'],
        ['Tags', 'Every tag with its count; unused created tags can be removed.', 'History filtered by tag']
      ]},
      { title: 'Others & Settings', rows: [
        ['Manage', 'Accounts · Categories · Tags.', 'sheets / pages'],
        ['Region Setting', 'Currency (Switch to …? confirm with relabel option) · Language (live).', '—'],
        ['Tab bar', 'Home locked; the other tabs with Move up / Move down and a grip; Restore the default order.', '—'],
        ['Privacy', 'Hide balances · Shake to hide.', '—'],
        ['Data Visualization · Appearance', 'Enable transaction time input; Theme Light · Dark · System.', '—'],
        ['Data', 'Import and export (sheet: Import file · Export file) · Backup · Import rules.', 'Import · Export · Backup'],
        ['In-app purchases', 'Free plan line or "Stack\'d Pro unlocked"; the purchases screen (One-time purchase: perks, price, Restore, Redeem; Subscriptions tab).', 'In-app purchases'],
        ['Support', 'FAQ · User Manual (searchable) · Send a Feedback · Rate the App · Terms of Use · Privacy Policy.', 'sheets'],
        ['Danger Zone', 'Factory Reset → "Factory Reset?" → Welcome.', 'Welcome']
      ]},
      { title: 'Import, Export, Backup', rows: [
        ['Import', 'Text area or Choose a file; Import settings (separator, line break, date order, decimal, multiply, quotes); Check.', 'Review import (ledger / QIF / backup) or Map Columns (bank statement)'],
        ['Map Columns', 'Date / Description / Amount (or Debit / Credit) / Bank reference, amount and date formats, decimal, Import into account, live Preview; Continue.', 'Review & Import'],
        ['Review & Import', 'Statement details and balance check; rows with a category pill ("Remember for …" makes a rule), Already imported / Unreadable badges, Link to existing / Import as new / Pair as transfer; Select all; Import n → Import complete (View transactions).', 'History'],
        ['Review import', 'Format, Accounts (existing / new, balances), Transfers paired, Categories (Keep name / map), planned rows, look-alikes, rows not imported; Import n / Restore backup.', '—'],
        ['Export', 'Format CSV / Text, Export settings, Period, File preview, Copy text, Export file; Receipts PDF; Open Backup.', '—'],
        ['Backup', 'Automatic backup, Back up now (destination), Recent backups (Restore · Share), Restore from a file, Export individual files (6 CSVs).', '—']
      ]}
    ]
  },

  coverage: {
    title: 'Coverage',
    lead: 'Every journey step was turned into an automated Playwright test that drives the real interface on a phone-sized viewport (taps, forms, sheets; real touch for swipes and long presses). The three journey specs run with the existing end-to-end suite and the unit suite on every change.',
    kpis: [['3', 'journey specs (one per persona)'], ['23', 'journey tests'], ['181', 'end-to-end tests in total'], ['2,401', 'unit tests']],
    byStep: Object.assign({},
      ...['N1', 'N2', 'N3', 'N4', 'N5'].map(id => ({ [id]: { spec: P.nora.spec, test: 'N1–N5', also: 'welcome_modal, user_flow' } })),
      ...['N6', 'N8', 'N9'].map(id => ({ [id]: { spec: P.nora.spec, test: 'N6–N9', also: 'user_flow, amount_input' } })),
      { N7: { spec: P.nora.spec, test: 'N6–N9 + N7 (figures)', also: 'history_rows, opening_balance_panel' } },
      ...['N10', 'N11'].map(id => ({ [id]: { spec: P.nora.spec, test: 'N10–N11', also: 'budget_backup, accounts_lifecycle' } })),
      ...['N12', 'N13', 'N15'].map(id => ({ [id]: { spec: P.nora.spec, test: 'N12–N13, N15', also: 'pro_paywall' } })),
      { N14: { spec: P.nora.spec, test: 'N14 + N14 (count)', also: 'insights' } },
      ...['M1', 'M2', 'M3', 'M4'].map(id => ({ [id]: { spec: P.marco.spec, test: 'M1–M4', also: 'home_graph, home_graph_scrub, wallet_account_filter' } })),
      ...['M5', 'M6'].map(id => ({ [id]: { spec: P.marco.spec, test: 'M5–M7', also: 'tag_picker, cross_currency_transfer' } })),
      { M7: { spec: P.marco.spec, test: 'M5–M7 + M7 (members)', also: 'recurring_edit_scope' } },
      ...['M8', 'M9', 'M10'].map(id => ({ [id]: { spec: P.marco.spec, test: 'M8–M10', also: 'history_rows, history_scroll, recurring_edit_scope' } })),
      { M11: { spec: P.marco.spec, test: 'M11', also: 'period_picker' } },
      { M12: { spec: P.marco.spec, test: 'M12 + M12 (over budget)', also: 'ring_focus' } },
      { M13: { spec: P.marco.spec, test: 'M13–M14 + M13 (projection)', also: 'local_dates, mixed_currency_totals' } },
      { M14: { spec: P.marco.spec, test: 'M13–M14', also: 'category_tag_drilldown' } },
      { M15: { spec: P.marco.spec, test: 'M15', also: 'insights, insights_destinations' } },
      { M16: { spec: P.marco.spec, test: 'M16', also: 'home_widgets' } },
      ...['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'].map(id => ({ [id]: { spec: P.lea.spec, test: 'L1–L8', also: 'import_export, bank_import, import_rules, backup_page, full_restore' } })),
      ...['L9', 'L10', 'L11', 'L12', 'L13'].map(id => ({ [id]: { spec: P.lea.spec, test: 'L9–L13', also: 'debt_simulator, loan_restore' } })),
      ...['L14', 'L15'].map(id => ({ [id]: { spec: P.lea.spec, test: 'L14–L15', also: 'home_account_order' } })),
      ...['L16', 'L17', 'L18', 'L19', 'L20'].map(id => ({ [id]: { spec: P.lea.spec, test: 'L16–L20', also: 'nav_order, hidden_balances, i18n_core, period_picker' } })),
      ...['L21', 'L22', 'L23', 'L24', 'L25'].map(id => ({ [id]: { spec: P.lea.spec, test: 'L21–L25', also: 'category_tag_drilldown, opening_date_conflicts, accounts_lifecycle, welcome_modal' } }))
    ),
    notes: [
      'Not automatable: the camera path of Attachments (M5) and the native share sheets; the attachment file path is covered by the existing `attachments` spec.',
      'The journey specs live in `tests/e2e/journey_first_time.spec.js`, `journey_daily.spec.js` and `journey_power.spec.js`; the screenshots on this page come from `tools/journey/capture.cjs`, which drives the same screens with the same example data.'
    ]
  },

  findings: {
    title: 'Findings and questions',
    lead: 'What the journey tests and the walk-through turned up. Bugs were fixed as they were found; the rest are design questions for the review.',
    items: [
      { kind: 'Fixed', what: 'The third tab is named **Goals** everywhere (bar, manual, insights) but its page was titled **Budget** (Presupuesto / Orçamento in Spanish and Portuguese).', outcome: 'The page is now titled like its tab in all five languages.' },
      { kind: 'Design question', what: 'An account\'s opening balance is a transaction row in History ("Adjustment +€1,200.00", dated the day the account was created). On the first day it dominates the day sum and the Net Change (N7).', outcome: 'Kept as designed; see question 2 below.' },
      { kind: 'Design question', what: 'Future occurrences of a recurring payment are real rows dated ahead; they are not counted in today\'s balance, but they look like any other row when you step to a later month (M7).', outcome: 'Kept as designed; see question 4 below.' },
      { kind: 'Observation', what: 'Two names for one place: the + menu says **Debt**, the page says **Loans**; the menu says **Others & Settings**, the page says **Others**.', outcome: 'Not changed; question 1 below.' },
      { kind: 'Observation', what: 'In the test browser, a flung sideways swipe on the Home graph pager can leave it between panes and swallow the next tap; a swipe that pauses before lifting snaps correctly. Not reproduced by hand on a phone.', outcome: 'Noted for the engineering backlog; no change.' },
      { kind: 'Observation', what: 'Closing a sheet starts a 300 ms clean-up; a second sheet opened inside that window (possible only in automation) can be swept away.', outcome: 'Noted for the engineering backlog; no change.' }
    ],
    questionsTitle: 'Questions for the designer',
    questions: [
      '**Naming.** Debt vs Loans, Others vs Others & Settings, Dashboard vs Home: one name per place?',
      '**Opening balance.** Should it be a row in History at all; if so, named and styled as what it is and left out of the day sum and Net Change?',
      '**First run.** Should Welcome say what the app is and offer "Start fresh" / "Bring my data"; and should an empty Home show one call to action instead of three empty states?',
      '**Future rows.** How should upcoming recurring payments look in History, and should Paid default to off for a date in the future?',
      '**New Log.** Amount and category first, the rest behind "More"? A visual category picker instead of a dropdown?',
      '**Home hierarchy.** Which one question should Home answer first — total, this month\'s net, or on-track — and do both deltas earn their place?',
      '**Discoverability.** Row swipes, the graph pager, the card tap, hold-to-drag: which deserve a hint, and how?',
      '**Density.** Insights cards, the recurring scope sheet, the currency switch sheet, Goals rows (ring + percentage + bar): where to cut?',
      '**Data screens.** Should Import / Export / Backup be a top-level destination rather than cards in Others; can Map Columns show sample values and Review group identical descriptions?',
      '**Free plan.** Show "2 of 2 accounts" before the wall; hide the empty Subscriptions tab?'
    ]
  },

  footer: 'Stack\'d user journey · build 1.2 (10202 round) · 8 November 2026 · generated by tools/journey/build.cjs from tools/journey/content.cjs and the screenshots in docs/user-journey/img. Every figure on the screenshots is invented example data.'
};
