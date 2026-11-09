// Writes res/values{,-fr,-it,-es,-pt}/stackd_widget_strings.xml (1.2.2 HG-15 WG-4).
// Run: node tools/widgets/android-strings.cjs plugins/stackd-widgets/android/src/main/res
const fs = require('fs');
const path = require('path');
const res = process.argv[2];
const T = {
  en: {
    open: "Open Stack'd",
    balances_name: 'Account balances', balances_desc: "Your total and each account's balance.",
    flow_name: 'Income vs Expenses', flow_desc: "This month's income, expenses and net, to the end of the month.",
    categories_name: 'Categories', categories_desc: 'Where your money went this month.',
    budgets_name: 'Budget goals', budgets_desc: "This month's spending against your limits.",
    upcoming_name: 'Upcoming', upcoming_desc: 'Your next scheduled payments.',
    curve_name: 'Balance curve', curve_desc: 'Your total balance over the last month.',
    quick_name: 'Quick add', quick_desc: 'Log an expense, an income or a transfer in one tap.',
    expense: 'Expense', income: 'Income', transfer: 'Transfer'
  },
  fr: {
    open: 'Ouvrir Stack\'d',
    balances_name: 'Soldes des comptes', balances_desc: 'Votre total et le solde de chaque compte.',
    flow_name: 'Revenus et dépenses', flow_desc: 'Les revenus, dépenses et le net de ce mois, jusqu\'à la fin du mois.',
    categories_name: 'Catégories', categories_desc: 'Où est passé votre argent ce mois-ci.',
    budgets_name: 'Objectifs de budget', budgets_desc: 'Les dépenses de ce mois face à vos limites.',
    upcoming_name: 'À venir', upcoming_desc: 'Vos prochains paiements programmés.',
    curve_name: 'Courbe du solde', curve_desc: 'Votre solde total sur le dernier mois.',
    quick_name: 'Ajout rapide', quick_desc: 'Saisissez une dépense, un revenu ou un virement en un geste.',
    expense: 'Dépense', income: 'Revenu', transfer: 'Virement'
  },
  it: {
    open: 'Apri Stack\'d',
    balances_name: 'Saldi dei conti', balances_desc: 'Il totale e il saldo di ogni conto.',
    flow_name: 'Entrate e uscite', flow_desc: 'Entrate, uscite e netto di questo mese, fino a fine mese.',
    categories_name: 'Categorie', categories_desc: 'Dove sono andati i tuoi soldi questo mese.',
    budgets_name: 'Obiettivi di budget', budgets_desc: 'Le spese di questo mese rispetto ai tuoi limiti.',
    upcoming_name: 'In arrivo', upcoming_desc: 'I tuoi prossimi pagamenti programmati.',
    curve_name: 'Andamento del saldo', curve_desc: 'Il saldo totale nell\'ultimo mese.',
    quick_name: 'Aggiunta rapida', quick_desc: 'Registra una spesa, un\'entrata o un trasferimento con un tocco.',
    expense: 'Spesa', income: 'Entrata', transfer: 'Trasferimento'
  },
  es: {
    open: 'Abrir Stack\'d',
    balances_name: 'Saldos de las cuentas', balances_desc: 'Tu total y el saldo de cada cuenta.',
    flow_name: 'Ingresos y gastos', flow_desc: 'Ingresos, gastos y neto de este mes, hasta fin de mes.',
    categories_name: 'Categorías', categories_desc: 'En qué se fue tu dinero este mes.',
    budgets_name: 'Objetivos de presupuesto', budgets_desc: 'El gasto de este mes frente a tus límites.',
    upcoming_name: 'Próximos', upcoming_desc: 'Tus próximos pagos programados.',
    curve_name: 'Curva del saldo', curve_desc: 'Tu saldo total durante el último mes.',
    quick_name: 'Añadir rápido', quick_desc: 'Registra un gasto, un ingreso o una transferencia con un toque.',
    expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia'
  },
  pt: {
    open: 'Abrir o Stack\'d',
    balances_name: 'Saldos das contas', balances_desc: 'O seu total e o saldo de cada conta.',
    flow_name: 'Receitas e despesas', flow_desc: 'Receitas, despesas e líquido deste mês, até ao fim do mês.',
    categories_name: 'Categorias', categories_desc: 'Para onde foi o seu dinheiro este mês.',
    budgets_name: 'Metas de orçamento', budgets_desc: 'Os gastos deste mês face aos seus limites.',
    upcoming_name: 'Próximos', upcoming_desc: 'Os seus próximos pagamentos agendados.',
    curve_name: 'Curva do saldo', curve_desc: 'O seu saldo total no último mês.',
    quick_name: 'Adição rápida', quick_desc: 'Registe uma despesa, uma receita ou uma transferência num toque.',
    expense: 'Despesa', income: 'Receita', transfer: 'Transferência'
  }
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, "\\'").replace(/"/g, '\\"');
const keys = Object.keys(T.en);
for (const [lang, d] of Object.entries(T)) {
  const missing = keys.filter(k => !d[k]);
  if (missing.length) throw new Error(lang + ' missing ' + missing);
  const dir = path.join(res, lang === 'en' ? 'values' : 'values-' + lang);
  fs.mkdirSync(dir, { recursive: true });
  const body = keys.map(k => `    <string name="stackd_widget_${k}">${esc(d[k])}</string>`).join('\n');
  fs.writeFileSync(path.join(dir, 'stackd_widget_strings.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<!-- 1.2.2 (HG-15 WG-4): widget picker names; every other widget text comes from the app's snapshot -->\n<resources>\n${body}\n</resources>\n`);
}
console.log('strings ok');
