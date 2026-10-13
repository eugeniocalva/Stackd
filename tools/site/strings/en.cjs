// Marketing-site copy, English. One file per language, same keys in each;
// tools/site/pages.cjs refuses to write a page while any language is missing
// a key the English table has.
//
// Values are HTML (they may carry <b>, <code>, &amp;). {email} becomes the
// contact mailto, wrapped for Cloudflare; {privacy} on Home is the policy URL.
// Attribute values (title, description, alt) are plain text and escaped on
// output.
//
// Button and screen names quoted here must match the app's own dictionary
// (src/i18n/<lang>.js), so the instructions read like the screen.
module.exports = {
  name: 'English',
  ogLocale: 'en_GB',
  menu: { label: 'Language' },
  brandLabel: "Stack'd Development Studio, home",
  nav: { label: 'Site', app: 'The app', privacy: 'Privacy', studio: 'Studio', support: 'Support', get: 'Get the app' },
  footer: {
    label: 'Legal', privacy: 'Privacy Policy', terms: 'Terms of Use', support: 'Support', contact: 'Contact',
    trademark: "Google Play and the Google Play logo are trademarks of Google LLC. Stack'd is not affiliated with, endorsed by, or certified by any bank or financial institution."
  },
  ogAlt: "Stack'd on a phone, showing a total balance and wallet cards, beside the headline: money tracking that never leaves your phone.",

  home: {
    title: "Stack'd Development Studio",
    description: "Stack'd Development Studio makes Stack'd, a privacy-first personal finance tracker. No accounts and no tracking: every wallet, log and budget stays on your device, and the only thing that goes online is the bank link you can choose to turn on.",
    hero: {
      eyebrow: "Stack'd · personal finance tracker",
      h1: 'Money tracking that stays on your phone.',
      lede: "Stack'd keeps every wallet, every log and every budget on your device. There is no account to create and no cloud to sync with. The only thing that ever goes online is the bank link you can choose to turn on, and it shows you every transaction before saving it.",
      play: 'Get it on Google Play',
      ios: 'iPhone version in progress',
      facts: ['<b>0</b> accounts or trackers', '<b>5</b> languages', '<b>CSV</b> in and out, always'],
      imgAlt: "Stack'd home screen: total balance of €28,088.91, a balance chart, wallet cards for Main Bank and Savings, and smart insights."
    },
    app: {
      eyebrow: "What's inside",
      h2: 'Built from the ledger up.',
      intro: "A balance in Stack'd is never a number someone typed in. It is the sum of the logs behind it, recomputed every time, so what you see always matches what you recorded.",
      items: [
        { h: 'Wallets and logs', p: "Bank, card, cash, savings, credit card, investment: two wallets on the free plan, as many as you keep in real life with Stack'd Pro, each in its own currency. Log an expense, an income or a transfer between two wallets in a few taps, with a note and tags." },
        { h: 'Repeating logs', p: 'Rent, salary, subscriptions: set a schedule once and the whole series is written out ahead of time. Edit one occurrence, this and future ones, or the entire series.' },
        { h: 'Goals', p: 'A monthly budget per category. The Goals tab shows what is already spent, what is still committed by repeating logs, and how the month will end up, not only how it looks today.' },
        { h: 'Debt simulator', p: 'Enter an amount, a rate and a duration and read the full amortization schedule: every instalment, its interest share and the remaining principal. Link a loan to its repeating payment and progress tracks itself.' },
        { h: 'Bank statement import', p: "Drop in a statement as <code>CSV</code>, <code>camt.053</code> or <code>MT940</code>. Stack'd maps the columns, skips what you already logged, pairs transfers between your own wallets and shows a review before anything is saved. The file itself is never kept." },
        { h: 'Home widgets and insights', p: 'Compose the Home screen from eight widget types: latest logs, income versus expense, top categories, budgets, savings rate, 50/30/20 and more. Smart Insights point out what changed this month in one line each.' }
      ]
    },
    pricing: {
      eyebrow: 'What it costs',
      h2: 'Free to use, two things to buy.',
      intro: 'Nothing is rented from us and nothing expires. The free plan is the whole app on a smaller scale; the two paid products are shown, with their price, inside the app before you buy.',
      items: [
        { h: 'Free', p: 'Up to two wallets and the categories the app ships with. Everything else is there: repeating logs, goals, the debt simulator, statement import, widgets, CSV export and import, five languages, light and dark.' },
        { h: "Stack'd Pro", p: 'A one-time purchase, billed once by Google or Apple at the price shown in the app. It lifts both free limits for good: as many wallets as you need, and categories of your own. It is not a subscription and never renews, and you can restore it on any device signed in to the same store account.' },
        { h: 'Bank Connect', p: "The optional bank link is a subscription, billed by the store at the price shown in the app, and cancellable any time in your store's subscription settings. Everything else in Stack'd works without it, and statements you import by file always will." }
      ]
    },
    screens: {
      eyebrow: 'The screens',
      h2: 'Quiet by design.',
      intro: 'Low colour, large numbers, one thing per screen. Light and dark themes, and the interface in English, French, Italian, Spanish or Portuguese.',
      items: [
        { alt: 'History screen listing transactions grouped by day, with amounts, categories and wallets.', title: 'History', caption: 'Every log, filterable by wallet, category, tag and period.' },
        { alt: 'Loan result screen: €18,000 at 4.05% over 5 years gives a €331.90 monthly payment, €1,914.23 total interest, 60 instalments.', title: 'Debt', caption: 'Simulate a loan before signing it, then track the real one.' },
        { alt: 'The same home screen in the light theme.', title: 'Light and dark', caption: 'Pick a theme, or let it follow the system.' }
      ]
    },
    privacy: {
      eyebrow: 'Privacy',
      h2: 'Nothing leaves, unless you say so.',
      intro: 'The app works offline and the only copy of your data is the one on your device. The single exception is the bank link you turn on yourself, and it shows you every transaction before saving it. This is the list from our <a href="{privacy}">privacy policy</a>.',
      listLabel: 'What the app does not do',
      nots: [
        'No user accounts or registration',
        'No cloud sync of your own data',
        'No uploading of imported files',
        'No analytics or usage tracking',
        'No advertising or ad identifiers',
        'No data sharing beyond the optional bank link'
      ],
      rights: [
        { eyebrow: 'Access and portability', h: 'Export everything as CSV', p: 'Accounts, categories, transactions and loans leave the app as plain CSV files that open in any spreadsheet. The same files import back, so a backup is a full restore.' },
        { eyebrow: 'Rectification', h: 'Edit any record, any time', p: 'Nothing is locked after saving. Change a log, an account or a budget and every derived figure follows.' },
        { eyebrow: 'Erasure', h: 'Factory reset, and it is gone', p: 'Delete one record or erase everything from Settings. Since no copy exists elsewhere, no one, including us, can bring it back. Keep your CSV backups safe.' }
      ]
    },
    studio: {
      eyebrow: 'The studio',
      body: [
        "Stack'd Development Studio is an independent software studio. We make Stack'd, and we build it the way we would want our own tools built: computed on the device, exported in formats we can open anywhere, and finished down to the typography.",
        'Most finance apps ask for your bank login on day one and pay for themselves with your data. We think a tracker should be a private notebook with very good arithmetic, so that is what we make.'
      ],
      principles: [
        { b: 'Local first', p: 'Every feature, including statement import and loan schedules, runs on the phone, offline. The optional bank link relays transactions through an EU server that stores none of them.' },
        { b: 'Honest numbers', p: 'Balances are computed from logs, never stored. Loan maths runs in whole cents, so a schedule adds up to the cent.' },
        { b: 'Open formats', p: 'CSV export and import of everything, plus the bank standards camt.053 and MT940. Your data is never trapped.' },
        { b: 'Finished work', p: 'Five languages, light and dark, native Android and iOS. Small details, like the safe area and the scroll position, get the same care as the big ones.' }
      ]
    },
    contact: { h: 'Questions, ideas, a bug?', p: 'Write to us. Your email is used only to reply and never joins a list.' }
  },

  support: {
    title: "Support · Stack'd",
    description: 'Help for Stack\'d: getting started, backups, bank statement import, purchases and Bank Connect, and how to reach the studio.',
    eyebrow: "Stack'd · Support",
    h1: 'How can we help?',
    lede: 'The app carries its own User Manual and FAQ under the + button, then Others &amp; Settings. The most common questions are answered below. For anything else, write to {email} and a person will reply.',
    // Service status. Normally the "all running normally" text. During an
    // incident, replace `p` with a dated notice IN EVERY LANGUAGE, re-run
    // tools/site/pages.cjs and push — this is the only channel the app has,
    // because there are no accounts and no mailing list. See
    // docs/broker-runbook.md step 6.
    status: {
      h: 'Service status',
      p: 'All running normally. Stack\'d works offline, so the app itself keeps working whatever happens here; only Online banking depends on our server. If something is wrong, we post it on this line.'
    },
    tips: [
      { h: 'Back up before you switch phones', p: "Stack'd keeps no copy of your data anywhere but your device. Before uninstalling or moving to a new phone, export your CSV files from Others &amp; Settings and import them on the new device." },
      { h: 'Lost data cannot be recovered by us', p: 'There is no account, and no copy of your data on any server, so we cannot restore anything. If you have a CSV export, Import CSV in Others &amp; Settings brings it all back, accounts and categories included.' },
      { h: 'Reporting a bug', p: 'Email us the app version (shown in Others &amp; Settings), your phone model and what you expected to happen. Never send a real bank statement; describe the format instead.' }
    ],
    faqH: 'Frequently asked',
    faq: [
      { q: 'How do I set up an account?', a: 'Tap the + button in the bottom bar and choose <b>Add Account</b>, or use the Add Account tile at the end of the accounts row on Home. Give it a name, an icon and an opening balance. From then on the balance is always computed from your transactions, so it stays in sync automatically.' },
      { q: 'How do I add a new transaction?', a: 'Tap the + button and choose <b>Add Log</b>. Pick Expense, Income or Transfer, then enter the amount, date, account and category. You can also add a note and tags, or turn on the repeat option to make it recurring (daily, weekly, monthly…).' },
      { q: 'How do I edit or delete a transaction?', a: 'Open <b>History</b> (the list icon in the bottom bar) and tap any transaction to open it in the editor. Change what you need and save, or use Delete. If the transaction is part of a recurring series, you will be asked whether the change should apply to only this one, this and future ones, or the whole series.' },
      { q: 'How do I import a bank statement?', a: "Go to Others &amp; Settings and choose <b>Import CSV</b>. Stack'd accepts its own CSV backups and any bank statement in CSV, camt.053 (ISO 20022) or MT940 format. A review screen shows what will be added, what is already logged, and which rows are transfers between your own accounts, before anything is saved." },
      { q: 'How do I set up widgets on my Home screen?', a: 'On Home, scroll to the <b>Widgets</b> section. Tap <b>Add</b> to pick a widget from the gallery and choose its size. Tap <b>Edit</b> to reorder, resize, configure or remove widgets, then tap Done when you are happy with the layout.' },
      { q: 'How do I set up a loan?', a: 'Tap the + button and choose <b>Debt</b>. Pick a loan type to open the simulator, enter the amount, interest rate and duration, and review the full payment schedule. You can keep it as a simulation or track it as an active loan. Tracking links it to a recurring expense so your progress updates automatically as payments are logged.' },
      { q: 'How do I manage categories?', a: "Go to <b>Others → Categories</b> to see all your categories, or tap a category to see its activity or edit its name, icon and color. Stack'd ships with a default set, which is what the free plan uses. Creating categories of your own is part of Stack'd Pro; the + button, then <b>Add Category</b>, is where you do it once Pro is unlocked." },
      { q: 'How do I use tags?', a: 'Tags are free-form labels you type in the <b>Tags</b> field when creating or editing a transaction. Autocomplete suggests the ones you already use. Browse them under <b>Others → Tags</b>, or filter History by tag to see everything with that label.' },
      { q: 'Can I change the language or currency?', a: 'Yes, both are in Others &amp; Settings. The interface is available in English, French, Italian, Spanish and Portuguese and switches instantly. Each account can have its own currency; accounts in a currency other than your main one are shown separately rather than converted.' },
      { q: 'How do I delete all my data?', a: 'Others &amp; Settings has a Factory Reset in the Danger Zone that erases every account, budget and transaction permanently. Uninstalling the app does the same. That covers everything you record, because it is stored only on your device. If you have used Bank Connect, disconnect each linked bank first: that deletes the server-side record of the link. For anything about those records the app cannot do itself, write to {email}.' }
    ],
    buyH: 'Purchases and Bank Connect',
    buy: [
      { q: 'What is free, and what is paid?', a: "Stack'd is free to use, with two optional purchases. The free plan gives you up to two wallets and the categories the app ships with; everything else, from repeating logs to the debt simulator, statement import, widgets and CSV export, is included. <b>Stack'd Pro</b> is a one-time purchase that lifts both of those limits. <b>Bank Connect</b>, the optional bank link, is a subscription. Both prices are shown in the app before you buy, in your own currency." },
      { q: "What does Stack'd Pro unlock?", a: 'As many wallets as you need, and categories of your own. It is billed once by Google Play or the App Store through your store account; it is not a subscription and never renews. Nothing you have already recorded is ever hidden or deleted on the free plan, only creating more is limited, so unlocking Pro later changes nothing about your existing data.' },
      { q: "I bought Stack'd Pro. How do I get it on a new phone?", a: 'Open <b>Others &amp; Settings → In-app purchases</b> and tap <b>Restore purchase</b>. Any device signed in to the same Google or Apple account that bought it gets the unlock back, at no further cost. Your data does not travel with the purchase: move that with a CSV export and import, as described above.' },
      { q: 'How do I cancel the Bank Connect subscription?', a: "In your store, not in Stack'd. On Android, Google Play → your profile → <b>Payments &amp; subscriptions → Subscriptions</b>. On iPhone, Settings → your name → <b>Subscriptions</b>. The current period runs to its end, and refreshing stops when it does." },
      { q: 'Can I get a refund?', a: 'Refunds for both products are handled by the store that took the payment, under its own rules: Google Play or the App Store. We cannot issue them ourselves, because the money never passes through us. If something is wrong with the app, write to us anyway and we will try to fix it.' },
      { q: 'What happens to my bank links if I stop paying?', a: 'Refreshing stops as soon as the subscription ends. Your connections are kept for 14 days so that renewing picks up where you left off; after that they are revoked and the server-side records of them are deleted. Transactions already imported stay in the app, on your device, as they were.' },
      { q: 'How do I disconnect a bank?', a: "Open <b>Others &amp; Settings → Online banking</b> and tap <b>Disconnect</b> next to the bank. That revokes the access at your bank and deletes the record of the link on the Stack'd server. Transactions already imported are yours and stay in the app." }
    ],
    still: { h: 'Still stuck?', p: 'Write to us. Your email is used only to reply and never joins a list.' }
  },

  notFound: {
    title: "Page not found · Stack'd",
    h1: 'That page is not in the ledger.',
    lede: 'The address may be mistyped, or the page has moved.',
    back: 'Back to the studio'
  },

  // Furniture of the legal pages (tools/site/legal.cjs). The clauses
  // themselves come from the app's dictionaries, not from here.
  legal: {
    termsTitle: 'Terms of Use', privacyTitle: 'Privacy Policy',
    seeTerms: 'See also the Terms of Use', seePrivacy: 'See also the Privacy Policy',
    metaTerms: "The terms under which Stack'd, the privacy-first personal finance tracker, is licensed to you.",
    metaPrivacy: "Stack'd keeps your money on your phone. The only exception is Bank Connect, an optional feature you turn on yourself; this policy explains exactly what it sends and what is kept.",
    // The one website-specific privacy clause. The app is not a website, so it
    // has no dictionary key; the hand-written English privacy.html must carry
    // exactly this text (legal.cjs checks).
    website: {
      h: 'This website',
      d: 'This website is a set of static pages. It sets no cookies, runs no analytics and embeds no third-party scripts. When you arrive from another site, it reads the language your browser asks for, to open the page in that language; nothing about it is stored. Our hosting provider may keep standard, short-lived server logs (such as IP address and requested page) for security and capacity purposes, as any web host does.'
    }
  }
};
