# Store listing, privacy labels and products

> The copy and the form answers to enter in Play Console and App Store
> Connect. Written 2026-09-07 with the Bank Connect legal rework
> (docs/bank-connect-ux-plan.md §15), updated through v1.17.
>
> The in-app Terms & Privacy (`src/i18n/*.js` `terms.*`) are canonical. The
> public copies are at <https://stackdplatform.com/privacy> and `/terms`,
> plus `/fr`, `/it`, `/es` and `/pt` of each (generated —
> `tools/site/legal.cjs`). Use the extensionless URLs: Cloudflare Pages
> 308-redirects the `.html` form. Both stores require those two links.

**How to read this file — three states, not two:**

| Marker | Means |
|---|---|
| ~~struck through~~ + **READY** | the text or asset exists and has been checked. **It is NOT in the console yet** — pasting it is still your job. |
| upright | you have something to do here |
| **NOT FOR THIS RELEASE** | correct, but for the release that ships Bank Connect. Do not paste it now; it would advertise a feature the build does not contain (D1). |

⚠️ **The single most dangerous mistake in this file:** §1 below is the
Bank-Connect-ON copy. **The copy to actually paste is §1b.** §1's short
description alone ("or link a bank, if you choose") would advertise a feature
this build does not ship.

## 1. Listing copy — **NOT FOR THIS RELEASE** (Bank-Connect-ON version)

> Keep for the release that ships Online banking. **For the first submission
> use §1b**, which is the same product without the bank paragraph and in all
> five languages.

**Short description (Play, 80 chars):** Private money tracking. Your data
stays on your phone — or link a bank, if you choose.

**Subtitle (App Store, 30 chars):** Local-first money tracker

**Description (both stores):**

Stack'd is a personal finance tracker that keeps your money on your phone.
Wallets, transactions, budgets, loans and tags live in the app's own
storage — no account to create, no cloud, no tracking, no ads.

- Track balances, budgets and recurring payments, in five languages.
- Import bank statements (CSV, camt.053, MT940) and review every row before
  it is saved. Balances reconcile against your bank's closing figure.
- Loan simulator and tracker with cent-exact schedules.
- Export all your data as CSV any time; a backup is a full restore.

> **v1.15 / decision D1 — the FIRST release ships with Bank Connect switched
> off** (`BankConnect.FEATURE_ENABLED = false`). For that submission, OMIT the
> "Online banking" paragraph and the subscription sentence below, create only
> the `stackd_pro` product, and answer the privacy forms for the local-only
> app (§2a / §3a). The Terms and Privacy keep their Bank Connect clauses:
> they are written as conditional on a feature the user turns on, they are
> accurate for a build where nobody can, and rewriting them per release would
> desync the app from the site. Restore the paragraphs below when the feature
> ships.

**Online banking (optional, subscription).** Link your bank through a
licensed open-banking provider and import booked transactions with one tap.
You log in on your bank's own page; your credentials never touch Stack'd.
Every fetch is shown for review before anything is saved. Access lasts up
to 180 days and is renewed with your bank; banks allow a few refreshes a
day. Available for banks in the EEA and the UK.

Bank Connect is billed as an auto-renewing subscription through your store
account (monthly or yearly; price shown in the app). Cancel any time in
your store's subscription settings.

**What's free, and what isn't.** Everything above is free with up to two
wallets and the categories the app ships with. Stack'd Pro is a one-time
purchase that lifts both limits for good — no subscription. Online banking
is the only part billed monthly or yearly. Anything you have already
recorded always stays visible and editable.

Terms of Use: https://stackdplatform.com/terms.html ·
Privacy Policy: https://stackdplatform.com/privacy.html

**What's new (v1.10):** Online banking — link your bank and import booked
transactions automatically (optional subscription). Updated Terms & Privacy.
*(For the FIRST release there is no "what's new" — both stores use the
description instead. This line belongs to the update that turns the feature
on.)*

Phrasing rule: "local by default" / "stays on your phone", never "100%
local" or "nothing ever leaves your device" without the Bank Connect
qualifier (the marketing site's hero was changed the same way).

## ~~1b. Localized listing copy~~ · **READY — this is the copy to paste**

Ready to paste. **The backup claim, 2026-09-27:** every locale said "export
everything" and "a backup is a full restore", and neither was true — budgets
were not in the backup, and a restore onto a new phone lost every opening
balance and every non-primary currency. The claim was withdrawn the same
morning, then **restored once A-16 and A-17 made it true** (launch-plan §4),
as "all your data" rather than "everything": app preferences and the
home-screen layout are deliberately not in the backup. Written for the
FIRST release, so nothing here mentions Online banking; when that feature ships, the paragraph in §1 needs
translating and adding to each language. Every string below was checked
against the store limits (App Store subtitle 30, keywords 100,
promotional text 170; Play short description 80, full description 4000).

**The app NAME is settled, and it is not what D5 assumed.** ~~Stack'd~~ was
**refused as unavailable on 2026-09-27**, and neither is it the documented
fallback: the App Store record was created as **Stack'd Finance**
(Apple ID 6816636640, bundle `com.stackd.finance`). The name is the same in
every language — it is a brand, not a phrase, so it is never translated.

Two consequences, both still open:

- **Play should almost certainly use "Stack'd Finance" too.** Nothing forces
  it — the Play name is independent and "Stack'd" may well be free there —
  but one product under two names splits reviews, search and word of mouth,
  and the website has to link both. Align unless you have a reason not to.
- **The device name stays "Stack'd"** (`capacitor.config.json` `appName`).
  That is deliberate: a home-screen label truncates at roughly 12 characters,
  and a store name that extends the device name is ordinary practice rather
  than the mismatch Apple's 2.3.8 metadata rule is aimed at. Change it only
  if you would rather both read identically.

The two legal URLs are NOT part of the description for this release: they go
in the consoles' own fields (Play: Privacy policy; App Store Connect: Privacy
Policy URL). Use <https://stackdplatform.com/privacy> and `/terms` — the
extensionless form, because Pages redirects `.html`. Apple's rule about a
Terms of Use link *in the description* applies to subscription apps, and this
release ships none. Each language also has its own pages (`/fr/privacy` and
so on) if a localized listing wants them.

### English (en-US / en-GB) — default listing

| Field | Value |
|---|---|
| Subtitle (App Store, ≤30) | Local-first money tracker |
| Short description (Play, ≤80) | Private money tracking. Every wallet, budget and log stays on your phone. |
| Keywords (App Store, ≤100) | `budget,expense,tracker,planner,money,spending,savings,offline,privacy,loan,csv,wallet` (85). **Changed 2026-09-27:** `finance` → `planner`, because the App Store name became "Stack'd Finance" and Apple already indexes every word of the name, so a keyword repeating it buys nothing. The other four locales keep their word (`finances`, `finanze`, `finanzas`, `finanças`) — a different token from the English name. |
| Promotional text (App Store, ≤170) | No account, no cloud, no ads. Stack'd keeps your wallets, budgets and loans on your phone, and exports all your data as CSV whenever you want. (142) |

**Full description (both stores):**

```text
Stack'd is a personal finance tracker that keeps your money on your phone. Wallets, transactions, budgets, loans and tags live in the app's own storage: no account to create, no cloud, no tracking, no ads.

WHAT IT DOES

- Wallets for the accounts you actually keep: bank, card, cash, savings, credit card, each in its own currency.
- Log an expense, an income or a transfer in a few taps, with a note and tags.
- Repeating logs: set rent or a salary once and the whole series is written out ahead of time. Edit one occurrence, this and the following ones, or the entire series.
- Goals: a monthly budget per category, showing what is spent, what is still committed by repeating logs, and how the month will actually end.
- Debt simulator: enter an amount, a rate and a duration and read the full schedule, instalment by instalment. Track a real loan and progress follows your payments.
- Import a bank statement as CSV, camt.053 or MT940. Stack'd maps the columns, skips what you already logged, pairs transfers between your own wallets, and shows a review before anything is saved. The file itself is never kept.
- A home screen you compose yourself from eight widget types, plus Smart Insights that point out what changed this month.
- Light and dark, in English, French, Italian, Spanish and Portuguese.

HONEST NUMBERS

A balance is never a number someone typed in. It is the sum of the logs behind it, recomputed every time, so what you see always matches what you recorded. Loan maths runs in whole cents, so a schedule adds up to the cent.

YOUR DATA STAYS YOURS

No user accounts. No cloud sync. No analytics, no advertising identifiers, nothing sold or shared. Export all your data as CSV any time, and import it back: a backup is a full restore.

WHAT IT COSTS

Free with up to two wallets and the categories the app ships with. Stack'd Pro is a one-time purchase that lifts both limits for good, with no subscription. Anything you have already recorded always stays visible and editable.
```

### French (fr-FR)

| Field | Value |
|---|---|
| Subtitle (App Store, ≤30) | Finances privées, hors ligne |
| Short description (Play, ≤80) | Suivi d'argent privé. Vos portefeuilles et budgets restent sur votre téléphone. |
| Keywords (App Store, ≤100) | `budget,dépenses,finances,argent,épargne,suivi,prêt,csv,portefeuille,privé,hors ligne` |
| Promotional text (App Store, ≤170) | Sans compte, sans cloud, sans publicité. Stack'd garde vos portefeuilles, budgets et prêts sur votre téléphone et exporte toutes vos données en CSV quand vous voulez. (166) |

**Full description (both stores):**

```text
Stack'd est un gestionnaire de finances personnelles qui garde votre argent sur votre téléphone. Portefeuilles, transactions, budgets, prêts et tags vivent dans le stockage de l'application : aucun compte à créer, pas de cloud, pas de suivi, pas de publicité.

CE QU'IL FAIT

- Des portefeuilles pour les comptes que vous tenez vraiment : banque, carte, espèces, épargne, carte de crédit, chacun dans sa devise.
- Enregistrez une dépense, un revenu ou un virement en quelques touches, avec une note et des tags.
- Écritures récurrentes : réglez un loyer ou un salaire une fois et toute la série est écrite à l'avance. Modifiez une occurrence, celle-ci et les suivantes, ou la série entière.
- Objectifs : un budget mensuel par catégorie, qui montre ce qui est dépensé, ce qui est déjà engagé par les écritures récurrentes, et comment le mois va réellement se terminer.
- Simulateur de prêt : saisissez un montant, un taux et une durée, et lisez tout l'échéancier, mensualité par mensualité. Suivez un prêt réel et la progression suit vos paiements.
- Importez un relevé bancaire en CSV, camt.053 ou MT940. Stack'd associe les colonnes, ignore ce que vous avez déjà saisi, apparie les virements entre vos propres portefeuilles et affiche une revue avant tout enregistrement. Le fichier lui-même n'est jamais conservé.
- Un écran d'accueil que vous composez vous-même à partir de huit types de widgets, avec des analyses qui pointent ce qui a changé ce mois-ci.
- Thème clair et sombre, en anglais, français, italien, espagnol et portugais.

DES CHIFFRES HONNÊTES

Un solde n'est jamais un nombre saisi à la main. C'est la somme des écritures qui le composent, recalculée à chaque fois : ce que vous voyez correspond toujours à ce que vous avez enregistré. Les calculs de prêt se font en centimes entiers, donc un échéancier tombe juste au centime près.

VOS DONNÉES RESTENT LES VÔTRES

Aucun compte utilisateur. Aucune synchronisation cloud. Aucune analyse d'usage, aucun identifiant publicitaire, rien de vendu ni de partagé. Exportez toutes vos données en CSV quand vous voulez, et réimportez-les : une sauvegarde est une restauration complète.

CE QUE ÇA COÛTE

Gratuit avec jusqu'à deux portefeuilles et les catégories fournies avec l'application. Stack'd Pro est un achat unique qui lève définitivement ces deux limites, sans abonnement. Ce que vous avez déjà enregistré reste toujours visible et modifiable.
```

### Italian (it-IT)

| Field | Value |
|---|---|
| Subtitle (App Store, ≤30) | Finanze private, offline |
| Short description (Play, ≤80) | Traccia i soldi in privato. Portafogli, budget e note restano sul telefono. |
| Keywords (App Store, ≤100) | `budget,spese,finanze,soldi,risparmi,traccia,prestito,csv,portafoglio,privato,offline` |
| Promotional text (App Store, ≤170) | Senza account, senza cloud, senza pubblicità. Stack'd tiene portafogli, budget e prestiti sul telefono ed esporta tutti i tuoi dati in CSV quando vuoi. (151) |

**Full description (both stores):**

```text
Stack'd è un gestore di finanze personali che tiene i tuoi soldi sul telefono. Portafogli, transazioni, budget, prestiti e tag vivono nella memoria dell'app: nessun account da creare, niente cloud, nessun tracciamento, nessuna pubblicità.

COSA FA

- Portafogli per i conti che tieni davvero: banca, carta, contanti, risparmi, carta di credito, ciascuno nella sua valuta.
- Registra una spesa, un'entrata o un trasferimento in pochi tocchi, con una nota e dei tag.
- Voci ricorrenti: imposta l'affitto o lo stipendio una volta e l'intera serie viene scritta in anticipo. Modifica una singola occorrenza, questa e le successive, o tutta la serie.
- Obiettivi: un budget mensile per categoria, che mostra quanto è già speso, quanto è impegnato dalle voci ricorrenti e come finirà davvero il mese.
- Simulatore di prestito: inserisci importo, tasso e durata e leggi tutto il piano di ammortamento, rata per rata. Segui un prestito reale e l'avanzamento segue i tuoi pagamenti.
- Importa un estratto conto in CSV, camt.053 o MT940. Stack'd associa le colonne, salta ciò che hai già registrato, abbina i trasferimenti tra i tuoi portafogli e mostra una revisione prima di salvare. Il file non viene mai conservato.
- Una schermata iniziale che componi tu, con otto tipi di widget, più gli spunti che segnalano cosa è cambiato questo mese.
- Tema chiaro e scuro, in inglese, francese, italiano, spagnolo e portoghese.

NUMERI ONESTI

Un saldo non è mai un numero digitato a mano. È la somma delle voci che lo compongono, ricalcolata ogni volta: quello che vedi corrisponde sempre a quello che hai registrato. I calcoli dei prestiti girano in centesimi interi, così un piano torna al centesimo.

I TUOI DATI RESTANO TUOI

Nessun account utente. Nessuna sincronizzazione cloud. Nessuna analisi d'uso, nessun identificativo pubblicitario, niente venduto o condiviso. Esporta tutti i tuoi dati in CSV quando vuoi e reimportali: un backup è un ripristino completo.

QUANTO COSTA

Gratis con un massimo di due portafogli e le categorie predefinite dell'app. Stack'd Pro è un acquisto una tantum che rimuove per sempre entrambi i limiti, senza abbonamento. Quello che hai già registrato resta sempre visibile e modificabile.
```

### Spanish (es-ES)

| Field | Value |
|---|---|
| Subtitle (App Store, ≤30) | Finanzas privadas, sin nube |
| Short description (Play, ≤80) | Controla tu dinero en privado. Carteras, presupuestos y notas en tu teléfono. |
| Keywords (App Store, ≤100) | `presupuesto,gastos,finanzas,dinero,ahorro,control,préstamo,csv,cartera,privado,offline` |
| Promotional text (App Store, ≤170) | Sin cuenta, sin nube y sin anuncios. Stack'd guarda tus carteras, presupuestos y préstamos en tu teléfono y exporta todos tus datos en CSV cuando quieras. (154) |

**Full description (both stores):**

```text
Stack'd es un gestor de finanzas personales que guarda tu dinero en tu teléfono. Carteras, transacciones, presupuestos, préstamos y etiquetas viven en el almacenamiento de la app: sin cuenta que crear, sin nube, sin rastreo y sin anuncios.

QUÉ HACE

- Carteras para las cuentas que de verdad tienes: banco, tarjeta, efectivo, ahorro, tarjeta de crédito, cada una en su moneda.
- Registra un gasto, un ingreso o una transferencia en unos toques, con una nota y etiquetas.
- Registros periódicos: configura el alquiler o la nómina una vez y toda la serie queda escrita por adelantado. Edita una sola vez, esta y las siguientes, o toda la serie.
- Objetivos: un presupuesto mensual por categoría que muestra lo ya gastado, lo que comprometen los registros periódicos y cómo va a terminar el mes de verdad.
- Simulador de préstamos: introduce importe, tipo y plazo y lee el cuadro de amortización completo, cuota a cuota. Sigue un préstamo real y el avance acompaña a tus pagos.
- Importa un extracto bancario en CSV, camt.053 o MT940. Stack'd asigna las columnas, omite lo que ya registraste, empareja las transferencias entre tus carteras y muestra una revisión antes de guardar nada. El archivo nunca se conserva.
- Una pantalla de inicio que compones tú con ocho tipos de widgets, más ideas que señalan qué ha cambiado este mes.
- Tema claro y oscuro, en inglés, francés, italiano, español y portugués.

NÚMEROS HONESTOS

Un saldo nunca es un número escrito a mano. Es la suma de los registros que hay detrás, recalculada cada vez: lo que ves siempre coincide con lo que anotaste. Las cuentas de los préstamos van en céntimos enteros, así que un cuadro cuadra al céntimo.

TUS DATOS SIGUEN SIENDO TUYOS

Sin cuentas de usuario. Sin sincronización en la nube. Sin analíticas, sin identificadores publicitarios, nada vendido ni cedido. Exporta todos tus datos en CSV cuando quieras y vuelve a importarlos: una copia de seguridad es una restauración completa.

CUÁNTO CUESTA

Gratis con hasta dos carteras y las categorías que trae la app. Stack'd Pro es una compra única que elimina para siempre ambos límites, sin suscripción. Lo que ya has registrado sigue siempre visible y editable.
```

### Portuguese (pt-PT)

| Field | Value |
|---|---|
| Subtitle (App Store, ≤30) | Finanças privadas, offline |
| Short description (Play, ≤80) | Controle o seu dinheiro em privado. Carteiras e orçamentos ficam no telemóvel. |
| Keywords (App Store, ≤100) | `orçamento,despesas,finanças,dinheiro,poupança,controlo,empréstimo,csv,carteira,privado` |
| Promotional text (App Store, ≤170) | Sem conta, sem nuvem e sem anúncios. O Stack'd guarda carteiras, orçamentos e empréstimos no seu telemóvel e exporta todos os seus dados em CSV quando quiser. (158) |

**Full description (both stores):**

```text
O Stack'd é um gestor de finanças pessoais que guarda o seu dinheiro no seu telemóvel. Carteiras, transações, orçamentos, empréstimos e etiquetas vivem no armazenamento da app: sem conta para criar, sem nuvem, sem rastreio e sem anúncios.

O QUE FAZ

- Carteiras para as contas que tem mesmo: banco, cartão, dinheiro, poupança, cartão de crédito, cada uma na sua moeda.
- Registe uma despesa, um rendimento ou uma transferência em poucos toques, com uma nota e etiquetas.
- Registos recorrentes: defina a renda ou o salário uma vez e toda a série fica escrita com antecedência. Edite uma ocorrência, esta e as seguintes, ou a série inteira.
- Objetivos: um orçamento mensal por categoria, que mostra o que já gastou, o que está comprometido pelos registos recorrentes e como o mês vai realmente acabar.
- Simulador de empréstimos: introduza um valor, uma taxa e um prazo e leia todo o plano de pagamentos, prestação a prestação. Acompanhe um empréstimo real e o progresso segue os seus pagamentos.
- Importe um extrato bancário em CSV, camt.053 ou MT940. O Stack'd associa as colunas, ignora o que já registou, emparelha transferências entre as suas carteiras e mostra uma revisão antes de guardar. O ficheiro nunca é conservado.
- Um ecrã inicial que compõe a seu gosto com oito tipos de widgets, além de sugestões que apontam o que mudou este mês.
- Tema claro e escuro, em inglês, francês, italiano, espanhol e português.

NÚMEROS HONESTOS

Um saldo nunca é um número escrito à mão. É a soma dos registos que estão por trás, recalculada de cada vez: o que vê corresponde sempre ao que registou. As contas dos empréstimos correm em cêntimos inteiros, por isso um plano fecha ao cêntimo.

OS SEUS DADOS CONTINUAM SEUS

Sem contas de utilizador. Sem sincronização na nuvem. Sem análises, sem identificadores publicitários, nada vendido nem partilhado. Exporte todos os seus dados em CSV quando quiser e volte a importá-los: uma cópia de segurança é um restauro completo.

QUANTO CUSTA

Gratuito com até duas carteiras e as categorias que a app traz. O Stack'd Pro é uma compra única que elimina para sempre os dois limites, sem subscrição. O que já registou continua sempre visível e editável.
```

## 2a. Apple — App Privacy for THIS release · answers ready, you enter them

With the feature switched off at build time the app makes no network calls of
its own and keeps nothing on a server. The only product is the one-time
unlock, and Apple handles that payment:

| Data type | Collected? |
|---|---|
| Purchases → Purchase History | **No.** The Stack'd Pro transaction id never leaves the device (`stackd_v1_pro`); Apple sees the purchase because Apple processes it. |
| Everything else | No |

So the answer for the first submission is **Data Not Collected**, which is
also what the marketing site says. §2 below is what it becomes the moment
Bank Connect ships — do not use it before then.

## 2. Apple — App Privacy — **NOT FOR THIS RELEASE** (once Bank Connect ships)

Before Bank Connect the answer was **Data Not Collected**. With Bank
Connect it is not, because transactions transit the developer's server and
the server keeps a link + subscription record. Recommended answers (confirm
against the current App Store Connect questionnaire at submission):

| Data type | Collected? | Linked to the user? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Financial Info → Other Financial Info (bank transactions, balances) | Yes (transit only, not retained) | No — tied to an opaque device/owner id, not to a name or Apple ID | No | App Functionality |
| Financial Info → Payment Info | No (Apple handles the subscription; the app only receives the transaction id) | — | — | — |
| Purchases → Purchase History (subscription status and original transaction id; the Stack'd Pro transaction id, kept on the device only) | Yes | No (opaque id) | No | App Functionality |
| Identifiers → Device ID (the opaque device token) | Yes | No | No | App Functionality |
| Contact Info, Location, Contacts, Usage Data, Diagnostics | No | — | — | — |

The broker also sees the request's IP address and User-Agent while Bank
Connect is in use — it rate-limits with them and forwards them to Enable
Banking and the bank because the payment-services rules require it for
online access, and stores neither. Apple's questionnaire has no IP data
type and exempts data used solely for security and fraud prevention, so
nothing is declared for it; Privacy clause 3 discloses it in words.

Notes for the reviewer field: "Bank Connect is opt-in. Bank data is
fetched via a licensed AISP (Enable Banking Oy, Finland) and relayed by our
EU-hosted server to the device without being stored or logged. The server
retains only an opaque device id, connection references (bank name, IBAN
last-4, currency) and the subscription status. Disconnecting deletes them."

The "linked to you" column is the judgement call: the ids are opaque and
the app has no account, but Apple treats persistent device identifiers as
linkable in some reviews. If review pushes back, flip Financial Info,
Purchases and Identifiers to "Linked to you" — the purposes stay the same.

## 3a. Google Play — Data safety for THIS release · answers ready, you enter them

- **Does your app collect or share any of the required user data types?** No.
- Data deletion: no account exists; Factory Reset in the app erases
  everything. The support page carries the contact address.

§3 below applies from the release that ships Bank Connect.

## 3. Google Play — Data safety — **NOT FOR THIS RELEASE** (once Bank Connect ships)

- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes.
- **Do you provide a way for users to request that their data is deleted?**
  Yes — Disconnect (per bank) and Factory Reset in the app; email for the rest.
- **Financial info → Other financial info:** Collected, not shared. Optional
  (only if the user enables Bank Connect). Ephemeral processing: the data is
  relayed and not stored. Purpose: App functionality.
- **Financial info → Purchase history:** Collected, not shared. Optional.
  Purpose: App functionality (subscription status, and the Stack'd Pro
  unlock — that one never leaves the device).
- **Device or other IDs:** Collected, not shared. Optional. Purpose: App
  functionality (the opaque device token).
- **Personal info, Location, Messages, Photos, Contacts, App activity, App
  info and performance:** Not collected.
- **Shared with third parties:** No — data is *received from* Enable Banking
  (a service provider acting on the user's consent), not shared with it.
  Payment goes to Google.

## 4. Products

For this release there is exactly ONE product to create: `stackd_pro` in §4a.
§4b is deferred with the feature.

Both listings must declare that the app contains in-app purchases, and the
description must name what is free: **two wallets and the built-in
categories** — §1b already does. Do not print the Pro price in the
description: the store shows the local price, and a hard-coded "€4.99" is
wrong in every other currency.

### 4a. One-time product · **the only one to create now** (you)

| Field | Value |
|---|---|
| Product id | `stackd_pro` (`Pro.PRODUCT_ID`) — identical on both stores, case-sensitive |
| Type | Play: in-app product, one-time. App Store Connect: Non-Consumable |
| Price | €4.99 in the base storefront; review the generated per-country prices |
| What it unlocks | unlimited wallets (free plan = `Pro.FREE_ACCOUNT_LIMIT`, 2) and custom categories, forever, on any device signed in to the same store account |
| Display name | "Stack'd Pro" in all five locales (11 chars; Apple allows 35, Play 55) |
| Description — **App Store** | **Max 45 characters**, so `pro.desc` (110–126) does NOT fit. Paste these, measured 2026-09-27: en `Unlimited accounts and your own categories.` (43) · fr `Comptes illimités et vos propres catégories.` (44) · it `Conti illimitati e categorie personalizzate.` (44) · es `Cuentas ilimitadas y categorías propias.` (40) · pt `Contas ilimitadas e categorias próprias.` (40). They say "accounts" because the in-app lock page and purchase screen do. |
| Description — **Play** | `pro.desc` as-is — Play allows 200 characters, and it fits in all five |
| Restore | required and present: *Restore purchase* on the One-time tab (`#pro-restore-btn`) |
| Apple review | the first non-consumable is submitted WITH a binary. **Screenshot:** `node tools/store/iap-review.cjs` → `tools/store/out/iap-review/stackd_pro-en.png` (1290×2796, no alpha; generated 2026-09-27). **Review notes** — paste as-is: *"Stack'd Pro is a one-time, non-consumable unlock. The free plan allows 2 accounts and the default categories; Pro removes both limits. To reach it: Settings → In-app purchases. It is also offered when adding a third account or creating a custom category. Restore purchase is on the same screen. No sign-in is required; all data stays on the device."* |
| Entitlement | local to the device (`stackd_v1_pro`); no server check, no receipt upload |

### 4b. Subscription products — **NOT FOR THIS RELEASE** (do not create these yet)

| Field | Value |
|---|---|
| Product ids | `stackd_bank_connect_monthly`, `stackd_bank_connect_yearly` |
| Group / base plan | One product "Bank Connect", up to 3 banks (D-C9) |
| Price | set after the Enable Banking commercial terms are known; the reference app charges €2.99 / €4.99 a month |
| Free trial / intro offer | none (D-C3) |
| Grace period | store default; the broker keeps connections 14 days after lapse (Terms clause 6) |
| Required links | Terms of Use + Privacy Policy on the listing AND in the paywall (already in-app) |
| Localizations | en, fr, it, es, pt — display names: Bank Connect · monthly / yearly |

## ~~5. Enable Banking production access~~ · **SETTLED (D1)** — not needed for this release

Sandbox is enough for everything up to TestFlight/internal testing. Public
availability requires either:

1. **Enable Banking production application** — signed contract + company
   KYB (Stack'd Development Studio as the customer; pricing is volume-based
   with a monthly minimum, quote-only since 2026), or
2. **Restricted mode** ("Activate by linking accounts") — only the
   developer's own bank accounts work, which is fine for a personal build
   or a soft launch to yourself, not for public users.

**Settled (D1, v1.15):** the first release ships with the feature off at
build time — `BankConnect.FEATURE_ENABLED = false`, so there is no Settings
row, no routes, no subscription products and no "coming soon" card (which
would itself be dormant functionality under Apple 2.3.1). Nothing about it
reaches the network, so the privacy answers stay at "Data Not Collected"
(§2a / §3a). Turning it on is a one-line change plus a new build, which both
stores require anyway: the first subscription product is reviewed WITH a
binary. `tests/unit/bankConnectHidden.test.js` pins the shipped default.

## ~~6. Screenshots~~ · **READY — 50 images generated**

Generated, not hand-taken: `node tools/store/screens.cjs` (the dev server must
be running on :3000) writes `tools/store/out/<platform>/<lang>/NN-name.png`,
numbered in upload order. The folder is gitignored — regenerate rather than
commit. `--lang fr` / `--platform apple-6.5` narrow a run.

| | Size | Why |
|---|---|---|
| **App Store — upload this** | **1284×2778** | iPhone 6.5" portrait, `out/apple-6.5/`. The live record offers ONLY a 6.5" slot (2026-09-27), so this is the set to upload. |
| App Store — spare | 1290×2796 | iPhone 6.9" portrait, `out/apple-6.9/`. Kept for a 6.9" slot if the console ever offers one. ~~The only REQUIRED size~~ — the spec page implies it, the console disagreed. |
| Play | 1080×1920 | Play caps the longest side at twice the shortest, which 1290×2796 (2.17) fails — Play cannot reuse Apple's images. |

Five screens per language, in all five languages: home, history, goals,
analytics, debt. Dark theme, to match the marketing site's hero and the
link-preview image (`STACKD_SHOT_THEME=light` switches). All alpha is
stripped, because both stores refuse an alpha channel and a Playwright PNG
carries one even when every pixel is opaque.

The purchases screen is deliberately NOT captured: Apple 2.3.2 asks the
DESCRIPTION to make the free/paid split clear (§1 and §1b do), and a
screenshot with a price baked in is wrong in every other storefront.

Example data comes from `tools/seed.cjs`, shared with the marketing-site
capture script. It is entirely invented — never seed a real bank name, IBAN
or amount, because these images are published and review looks for it.

When Bank Connect ships, add the Online banking hub with a linked bank and
the review sheet ("Import complete — balances match your bank").

## 7. App Store Connect — the app page, field by field (first submission)

Written 2026-09-27 against the live record: **"Stack'd Finance"**, Apple ID
`6816636640`, bundle `com.stackd.finance`, primary language English (U.S.).
The long copy (description, promotional text) is in §1b and is not repeated
here. Everything below is for THIS release, with Bank Connect off.

### 7a. App Information (*Informações da app*)

| Field | Value |
|---|---|
| Name | `Stack'd Finance` in every localisation — a brand, never translated |
| Subtitle | per locale, from §1b: en `Local-first money tracker` · fr `Finances privées, hors ligne` · it `Finanze private, offline` · es `Finanzas privadas, sin nube` · pt `Finanças privadas, offline` |
| Localisations | add French (France), Italian, Spanish (Spain), Portuguese (Portugal) next to English (U.S.) |
| Category | Primary **Finance**. Secondary: leave empty (optional; nothing else is a clear fit) |
| Content rights | **No** — the app contains no third-party content |
| Age rating | answer **None / No to every question** → **4+**. No violence, sexual content, profanity, mature themes, horror, substances, medical content, gambling (real or simulated), contests, loot boxes, advertising, user-generated content, messaging, or unrestricted web access. The in-app links open our own legal pages, which is not unrestricted web access |
| License agreement | **Apple's standard EULA** (O-22). The in-app Terms remain the app's terms; a custom EULA would need a plain-text copy of them kept in sync forever |

### 7b. Pricing and Availability (*Preços e disponibilidade*)

| Field | Value |
|---|---|
| Price | **Free** — the app is free; Stack'd Pro is the in-app purchase |
| Availability | **The EEA + UK — D7, decided 2026-09-27.** The EU 27, Iceland, Liechtenstein (if Apple lists it), Norway and the United Kingdom. Turn OFF automatic availability in new countries, or Apple will add storefronts outside the list as it opens them. Set `stackd_pro`'s availability to the same list. |
| Distribution | Public |
| Pre-orders | No |

### 7c. App Privacy (*Privacidade da app*)

| Field | Value |
|---|---|
| Privacy Policy URL | en `https://stackdplatform.com/privacy` · fr `/fr/privacy` · it `/it/privacy` · es `/es/privacy` · pt `/pt/privacy` (all on `https://stackdplatform.com`, all verified 200 on 2026-09-27). Extensionless — Pages redirects `.html` |
| Data collection | **"No, we do not collect data from this app"** → *Data Not Collected*. Reasoning in §2a. The *Send feedback* email is user-initiated through the user's own mail app and is not collection by the app |

### 7d. The version page (iOS app, first version)

| Field | Value |
|---|---|
| **Version number** | **`1.0`** — the public version chosen on 2026-09-27. App Store Connect created the record as `1.0`; if it was changed to `1.19.0`, **change it back to `1.0`**. It must match the build's `MARKETING_VERSION` exactly, and `npm run version:sync` now writes `1.0` there (a zero patch is dropped; `package.json` stays `1.0.0`). |
| Screenshots | **Upload the 6.5" set**: `tools/store/out/apple-6.5/<lang>/01-home` … `05-debt` (**1284×2778**, no alpha), per locale, in numbered order. **Corrected 2026-09-27:** the live record showed ONLY a 6.5" slot and rejected the 6.9" set (1290×2796) as the wrong size, despite the spec page reading as if 6.9" alone suffices. The 6.9" set (`tools/store/out/apple-6.9/`, renamed from `apple/` so the two folders differ by more than a suffix) is kept for a 6.9" slot if the console ever offers one. iPad is not needed (iPhone-only app, D4). Regenerate with `node tools/store/screens.cjs --platform apple-6.5` |
| Promotional text | per locale, §1b |
| Description | per locale, §1b (the Bank-Connect-OFF copy — not §1) |
| Keywords | per locale, §1b (English revised 2026-09-27, see above) |
| Support URL | `https://stackdplatform.com/support` (English page; same URL in every locale) |
| Marketing URL | `https://stackdplatform.com` (optional) |
| Copyright | `2026 Eugenio Maria Calvaresi` — Apple adds the ©. The rights holder is you as an individual (D2); "Stack'd Development Studio" is a trading name, not an entity |
| In-app purchases | add **Stack'd Pro** to this version, so it is reviewed with the build |
| Build | attached after the Mac upload (O-26) |
| What's New | not shown for a first version |
| Version release | **Manually release this version** — so approval does not publish it before you are ready, and so the website badge (A-08) goes live the same day |

### 7e. App Review Information (private to Apple)

| Field | Value |
|---|---|
| Sign-in required | **No** — there are no accounts |
| Contact | your name, a phone number Apple can reach, and an email. Seen only by App Review, never published |
| Notes | paste as-is, below (Apple caps it at 4,000 characters; keep it under) |
| Attachment | none in the Notes field; the screen recording goes in the Resolution Center reply |

**Revised 2026-09-29** after the first submission came back with *Guideline
2.1 – Information Needed* ("developer account that has a limited App Review
history"). Apple asked for seven items and wants them both in the reply
and in this Notes field for future submissions. Point 1 is the screen
recording itself (a physical iPhone on the latest iOS, starting at launch,
showing the Pro purchase and Restore); points 2–7 are below. The short note
this replaced was not enough on its own.

**Keep it in sync.** When Bank Connect ships, rewrite points 4 and 6:
Enable Banking Oy becomes an external service and the licensed AISP
performing the account access (see `docs/launch-plan.md` §6, the 3.2.1(viii)
answer), and point 7 gains the two subscriptions. The UI labels below are
the English strings in `src/i18n/en.js`; if they change, update them here.

```text
1. SCREEN RECORDING
Attached. It was recorded on a physical iPhone running the latest iOS. It starts at app launch and shows the typical flow, including the Stack'd Pro purchase and restore. Stack'd has no account registration, login or account deletion, because the app has no user accounts at all. There is no user-generated content.

2. PURPOSE AND TARGET AUDIENCE
Stack'd Finance is a personal finance tracker for adults who want to see where their money goes without handing their financial data to a cloud service. Users record their accounts (bank, card, cash, savings), expenses, income and transfers. They can set monthly budgets per category, schedule repeating items such as rent or salary, simulate a loan's repayment schedule, and import statements they downloaded from their own bank (CSV, camt.053, MT940). The problem it solves is that most budgeting apps require an account and store personal financial data on their servers. Stack'd keeps everything on the device: no sign-up, no cloud, no ads, no tracking.

3. SETUP AND ACCESS
No login, credentials or sample files are needed. The app works fully offline.
- First launch: a Welcome sheet asks for currency and language. Tap Get started.
- Create an account: tap the central + button, then Add Account, enter a name, type and opening balance, and Save.
- Record a transaction: + then Add Log. Choose expense, income or transfer, then set the amount, category and date. Optionally make it repeating.
- The bottom bar opens Dashboard, History, Goals (monthly budgets) and Analytics.
- Loan simulator: + then Debt.
- Settings: the Others screen holds region, theme, data export and import, FAQ, user manual, Terms of Use, Privacy Policy and In-app purchases.
- Optional file test: in Others, export Transactions as CSV, then use Import CSV to load it back.

4. EXTERNAL SERVICES
The app's core functionality uses no external services. There are no servers, authentication services, data providers, analytics, advertising or AI services. All data is stored locally on the device.
- Apple In-App Purchase (StoreKit) processes the single Stack'd Pro purchase. Entitlement is checked on the device, with no receipt server of our own.
- The Terms of Use, Privacy Policy and Support pages are static pages on our website, stackdplatform.com.
- "Send a Feedback" opens the user's own mail app, addressed to hi@stackdplatform.com.
- The app bundles open-source libraries: Capacitor, cordova-plugin-purchase, Chart.js (MIT), Lucide icons (ISC), and the Inter and Manrope fonts (SIL OFL).

5. REGIONAL DIFFERENCES
The app is distributed in the EU, EEA and UK storefronts. It works the same in every region: there is no region-specific content or feature. The interface is available in English, French, Italian, Spanish and Portuguese, and users can choose any currency. The Stack'd Pro price is set per storefront by Apple.

6. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Stack'd is a record-keeping and budgeting tool, not a financial service. It does not connect to bank accounts, hold or move money, process payments, offer or broker credit, or give investment or financial advice. All figures are entered or imported by the user. The loan simulator is a calculator that works only on numbers the user types in. Because no licensed activity is performed, no licence applies. The app contains no protected third-party material.

7. IN-APP PURCHASE
There is one product: Stack'd Pro (product ID stackd_pro). It is a one-time, non-consumable purchase, not a subscription. The free plan allows 2 accounts and the built-in categories. Stack'd Pro removes both limits permanently.
How to reach it:
- Others, then In-app purchases, then "Unlock for <price>".
- It is also offered when trying to add a third account (+ then Add Account) or to create a custom category.
"Restore purchase" is on the same In-app purchases screen. The Terms of Use and Privacy Policy links are shown next to the price.
```

Before replying, confirm the **Paid Apps agreement is Active** and
`stackd_pro` is attached to the version — a purchase the reviewer cannot
complete is the likeliest next rejection (`docs/launch-plan.md` §6).

The build already answers export compliance: `ITSAppUsesNonExemptEncryption`
is `false` in `Info.plist`, so no encryption questionnaire appears.
