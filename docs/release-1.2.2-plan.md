# Release 1.2.2 — Google Play and App Store (plan, 2026-11-10)

One version on both stores, from one commit (unified release policy). The
1.2.2 round (HG-1 … HG-15) ships as **1.2.2**:

| Store | Live today | Ships now |
|---|---|---|
| Google Play | 1.2 · versionCode 10200 (production since 2026-11-06) | **1.2.2 · versionCode 10202** (10202 was built on 2026-11-08 but never uploaded, owner 2026-11-10) |
| App Store | 1.2 · build 10201 | **1.2.2 · build 10210** (TestFlight 10203–10209 were test builds of the same version) |

`docs/release-checklist.md` is the mechanical list for the builds; this file
is what is specific to 1.2.2 and who does what.

**Status 2026-11-10:**

- **Done (§4 A1–A4):** the builds from commit `7a08aba`.
  - Gates: lint, 2,437 unit, 209 e2e.
  - AAB 10202 on the Desktop.
  - iOS 10210 uploaded (CI run 42794702738).
  - Assets on the Desktop.
- **Submitted 2026-11-10:**
  - Play: 10202 and the screenshots for 5 languages in review, full
    rollout, **managed publishing OFF** (owner's choice: live on approval).
  - App Store: 1.2.2 (10210) "A aguardar revisão" (submission
    824e70b8-…), with the header and search artwork.
  - Tag `v1.2.2` on `7a08aba` pushed.

**Console lessons for the next release** (the owner found the first
guide too vague):

- **Play release notes** live inside the draft release (Production →
  Releases → Edit release → Release notes). The listing's English is
  **en-GB**, so the tags are `<en-GB>`, `<fr-FR>`, `<it-IT>`, `<es-ES>`,
  `<pt-PT>`. "Draft release" on the track means nothing is sent yet;
  Publishing overview → "Submit N changes for review" sends it.
- **App Store screenshots:** the console now has one iPhone slot, "iPhone
  com Dynamic Island (ecrã médio)". It takes 1206×2622 or 1179×2556 and
  refuses 6.5" and 6.9". Use `apple-6.3`.
- **App Store "Cabeçalho e resultados de pesquisa"** (optional):
  - header 3840×1646, cropped about 300 px per side, with buttons over the
    top corners (keep content in the centre);
  - search 3840×2560;
  - both from `tools/store/apple-banners.cjs`.
- **Portuguese console labels:** "Novidades desta versão",
  "Compilação", "Lançamento da versão", "Adicionar para revisão" →
  "Submeter para revisão".

---

## 1. What ships (the 1.2.2 round)

- **Home Screen widgets (HG-15), iOS and Android:**
  - Account balances (large lists every account);
  - Income vs Expenses, Categories, Budget goals, Upcoming;
  - Balance curve, and Quick add (− + ⇄).
  - iOS also gets a Lock Screen +.
  - Hidden balances mask them, and a locked iPhone blanks the amounts.
- **The 1.2.2 round's other work:**
  - Smart Insights tab;
  - drag-to-read Home charts;
  - hidden balances (shake);
  - ring focus;
  - period picker ‹ ›;
  - account order;
  - History long-press;
  - Tags page add / edit / merge.

Nothing changes in the data the app collects: the widgets read a file the app
writes on the phone. Apple App Privacy and Play Data safety stay as filed
(`store-listing.md` §2a / §3a).

---

## 2. Release notes (paste into both stores)

The source is `docs/store-listing.md` §1e. Each text is under Play's 500
characters.

**English (en-US, en-GB)**
> New Home Screen widgets: account balances, income vs expenses, categories, budgets, upcoming payments, your balance curve and a quick add. New Smart Insights tab: tips from your own entries. Drag along the Home charts to read any day or month. Hide the amounts on Home with a shake. Tap a ring slice to see its category. A simpler period picker. Order your accounts with a long press. Add, rename and merge tags in Settings.

**Français (fr-FR)**
> Nouveaux widgets pour l'écran d'accueil : soldes des comptes, revenus et dépenses, catégories, budgets, paiements à venir, courbe du solde et ajout rapide. Nouvel onglet Astuces intelligentes, tirées de vos saisies. Faites glisser le doigt sur les graphiques pour lire chaque jour. Masquez les montants en secouant le téléphone. Un sélecteur de période plus simple. Classez vos comptes d'un appui prolongé. Ajoutez et renommez vos tags.

**Italiano (it-IT)**
> Nuovi widget per la schermata Home: saldi dei conti, entrate e uscite, categorie, budget, pagamenti in arrivo, andamento del saldo e aggiunta rapida. Nuova scheda Approfondimenti smart, ricavati dalle tue registrazioni. Trascina il dito sui grafici per leggere ogni giorno. Nascondi gli importi scuotendo il telefono. Un selettore del periodo più semplice. Ordina i conti tenendo premuto. Aggiungi, rinomina e unisci i tag.

**Español (es-ES)**
> Nuevos widgets para la pantalla de inicio: saldos de las cuentas, ingresos y gastos, categorías, presupuestos, próximos pagos, curva del saldo y añadir rápido. Nueva pestaña Consejos inteligentes, sacados de tus registros. Desliza el dedo por los gráficos para leer cada día. Oculta los importes agitando el teléfono. Un selector de periodo más sencillo. Ordena tus cuentas manteniendo pulsado. Añade, renombra y une etiquetas.

**Português (pt-PT)**
> Novos widgets para o ecrã principal: saldos das contas, receitas e despesas, categorias, orçamentos, próximos pagamentos, curva do saldo e adição rápida. Novo separador Dicas Inteligentes, tiradas dos seus registos. Deslize o dedo pelos gráficos para ler cada dia. Oculte os valores agitando o telemóvel. Um seletor de período mais simples. Ordene as suas contas mantendo premido. Adicione, renomeie e junte etiquetas.

**Play format.** Play takes all languages in one box, each wrapped in its tag:

```
<en-US>
New Home Screen widgets: …
</en-US>
<fr-FR>
Nouveaux widgets pour l'écran d'accueil : …
</fr-FR>
<it-IT>
…
</it-IT>
<es-ES>
…
</es-ES>
<pt-PT>
…
</pt-PT>
```

Use the full texts above in place of "…". `en-GB` takes the English text if
the listing has that language.

---

## 3. Assets

Everything is in **`Desktop\Stackd-1.2.2-store-assets\`**, copied from
`tools/store/out/` (gitignored; regenerate with `node tools/store/screens.cjs`
+ `node tools/store/play-graphics.cjs`). It was captured on 2026-11-10 from
1.2.2, in the dark theme, with the invented demo data of `tools/seed.cjs`.

| Folder | Size | Images | Goes to |
|---|---|---|---|
| `play/<lang>/` | 1080×2160 (widgets) and 1080×1920 | **7 per language**, upload in name order: `00-widgets` (new: the Android home screen with Account balances, Income vs Expenses and Quick add), `01-home`, `02-history`, `03-goals`, `04-analytics`, `05-insights`, `06-debt` | Play → Main store listing → Phone screenshots, per language |
| **`apple-6.3/<lang>/`** | **1206×2622** | **6 per language** | **App Store Connect → 1.2.2 → "iPhone com Dynamic Island (ecrã médio)"**, the slot the console offered on 2026-11-10. It refused 6.5" and 6.9". |
| **`apple-banners/<lang>/header.png`** | **3840×1646** | 1 per language | App Store Connect → 1.2.2 → "Cabeçalho e resultados de pesquisa" → **Cabeçalho**. Optional; made by `tools/store/apple-banners.cjs`. |
| **`apple-banners/<lang>/search.png`** | **3840×2560** | 1 per language | the same section → **Resultados da pesquisa**. Optional; without it Apple shows the first screenshots. |
| `apple-6.5/<lang>/` | 1284×2778 | **6 per language** (`01-home` … `06-debt`) | App Store Connect → 1.2.2 → iPhone 6.5" display, per localization |
| `apple-6.9/<lang>/` | 1290×2796 | 6 per language | Spare: only if the console offers a 6.9" slot |
| `play/feature-graphic.png`, `play/icon-512.png` | 1024×500, 512×512 | unchanged design | Already on the Play listing; replace only if Play asks |

- **No alpha.** Every image has no alpha channel (both stores refuse one).
- **No App Store widget screenshot.** iOS widgets can only be captured on an
  iPhone. Yours shows your real finances, which must never be published.
  The listing is complete without one; adding one later needs a phone that
  holds only demo data.

---

## 4. Who does what, in order

### A. Me — builds (from ONE commit)

1. Gates on the release commit: lint, all unit tests, all e2e
   (`release-checklist.md` §3).
2. Android: `npm run build` → `npx cap sync android` → `bundleRelease`.
   - Check `com.stackd.finance`, versionCode **10202**, versionName
     **1.2.2**, and upload key `56:CC:…:5C:6E`.
   - Copy to `Desktop\Stackd-1.2.2-10202.aab`. The never-uploaded
     2026-11-08 file is kept, renamed `…-stale-2026-11-08.aab`.
3. iOS: the "iOS to TestFlight" workflow with upload and build number
   **10210**, from the same commit.
4. The assets folder (§3).
5. After both submissions: tag **`v1.2.2`** on that commit and push it.

### B. You — Google Play Console

1. **Managed publishing ON:** Publishing overview → Managed publishing. The
   approved release then waits for your "Publish" instead of going live by
   itself, so it can go out on the same day as iOS.
2. **Test and release → Production → Create new release.** Upload
   `Stackd-1.2.2-10202.aab`, release name `1.2.2`, and the release notes
   (§2, Play format).
3. **Grow → Store presence → Main store listing**, for each language:
   delete the old phone screenshots and upload the 7 from `play/<lang>/` in
   order. Then save.
4. **App content:** nothing to change (Data safety unchanged).
5. **Rollout:** 100 % (the user base is small; a staged rollout only delays
   the unified release). Send for review.

### C. You — App Store Connect

1. **Apps → Stack'd Finance → + (Add version) → iOS → `1.2.2`.**
2. **Build:** wait until 10210 has finished processing (an e-mail arrives,
   or TestFlight shows it), then select **1.2.2 (10210)**.
3. **What's New in This Version:** paste each language (§2) into its
   localization (English, French, Italian, Spanish, Portuguese (Portugal)).
4. **Screenshots → "iPhone com Dynamic Island (ecrã médio)"** (6.1"/6.3"):
   for each localization, remove the old ones and upload
   `apple-6.3/<lang>/01…06` (1206×2622). On 2026-11-10 the console refused
   both the 6.5" and the 6.9" sets.
5. **App Review Information → Notes**, optional: add one line.
   > 1.2.2 adds Home Screen and Lock Screen widgets. They show figures the
   > app writes to a shared App Group file on the device; nothing is sent
   > anywhere.
6. **Version Release: "Manually release this version"**, so both stores go
   live together.
7. **Add for Review → Submit.**

### D. Release day (both approved)

1. **App Store:** 1.2.2 shows "Pending Developer Release". Click **Release
   This Version**.
2. **Play:** Publishing overview → **Publish changes**.
3. Same hour, if possible.

### E. After release (both)

- **Store pages:** each shows **1.2.2**, the new What's new, the new
  screenshots, and "Get / Install" (not a price).
- **Your phones:** update from the store, open Stack'd once, then:
  - the widgets appear in the widget gallery;
  - Quick add opens New log;
  - hidden balances mask the widgets.
- **Me:** I record the release in memory and on the round's notes.

---

## 5. Timing and risks

| | Expect | If it goes wrong |
|---|---|---|
| Apple review | usually 24–48 h | A widget question: the review note (C.5) answers it. A rejection is fixed and re-uploaded as build 10211+ (same version). |
| Play review | hours to ~3 days | A fix means a new AAB, which needs **1.2.3 / 10203** (Play never takes 10202 twice), and then iOS moves to 1.2.3 as well. |
| Screenshot slots | 6.5" on Apple (as in 1.0–1.2) | If the console wants 6.9": `apple-6.9/<lang>/`. |
| Widgets after the update | they appear after the app is opened once | Android: placed widgets fill in on the first open. iOS: the gallery lists them right away. |

The builds already carry the CI signing change, so a re-upload creates no
new development certificate.
