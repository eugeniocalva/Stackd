# Release 1.3.1 — Google Play and the App Store (plan, 2026-11-23)

One version on both stores, from one commit (unified release policy). Both
stores carry **1.2.2**; 1.3.0 was never released, so 1.3.1 ships everything
since then:

| Store | Live today | Ships now |
|---|---|---|
| Google Play | 1.2.2 · versionCode 10202 | **1.3.1 · versionCode 10301** (10300 was built on 2026-11-20 and never uploaded) |
| App Store | 1.2.2 · build 10210 | **1.3.1 · build 10305** (TestFlight 10301–10304 were test builds of the same version) |

`docs/release-checklist.md` is the mechanical list; `docs/release-1.2.2-plan.md`
has the console lessons (where the notes box is, which screenshot slot Apple
offers, the Portuguese labels). This file is what is specific to 1.3.1.

**Status 2026-11-23 — builds done, from commit `5221517`:**

- Gates: lint clean, 2,548 unit tests, 229 e2e, `check-bundle` OK.
- Security review of 0538ae6..5221517: no findings (earlier ranges were
  reviewed at their TestFlight uploads).
- Android: `Desktop\Stackd-1.3.1-10301.aab` — `com.stackd.finance`,
  versionCode 10301, versionName 1.3.1, upload key `56:CC:…:5C:6E`.
- iOS: build **10305** uploaded by CI run 45198424988 (Xcode 27.2, iOS 27.2
  SDK — no ITMS-90725 warning), checked on the owner's iPhone.
- Screenshots: `Desktop\Stackd-1.3.1-store-assets\` (see §3).

---

## 1. What ships

- **1.3.0:** App lock (4-digit PIN, Face ID / fingerprint shortcut, lock
  delay); every ISO currency (searchable list); Shake to hide works right
  after launch (native iPhone detection); Receipts PDF export works in the
  phone builds again.
- **1.3.1:** the ten gate bugs of the 1.3 deep test and five leftovers —
  scoped series edits spread only what changed, receipts survive a rebuild,
  restore asks Add / Replace after a safety copy, the opening balance can't
  be deleted from History, the loan Track form, accented tags from files.
- **Analytics breakdown:** every category on the ring with its share, a
  category row opens Tags / Transactions, sheets that open the form.
- **iOS:** built with the iOS 27 SDK; the status-bar strip it introduced is
  hidden (`5221517`).

Data collected: unchanged (*Data Not Collected* on Apple, nothing on Play's
Data safety). App lock's biometric check runs in the operating system and
the PIN is a salted hash on the device (`store-listing.md` §2a).

---

## 2. Release notes (paste into both stores)

Source: `docs/store-listing.md` §1f. Each is under Play's 500 characters.

**English (en-US, en-GB)** (428)
> New App lock: protect Stack'd with a PIN, and unlock with your face or fingerprint. Every currency is now available. Analytics shows every category on the ring with its share; tap a category to see its tags and transactions. Restoring a backup now asks whether to add to your data or replace it, and saves a copy first. Shake to hide works as soon as the app opens. Fixes for recurring payments, loans, imports and PDF receipts.

**Français (fr-FR)** (493)
> Nouveau verrouillage de l'app : protégez Stack'd par un code, et déverrouillez avec votre visage ou votre empreinte. Toutes les devises sont disponibles. Statistiques montre chaque catégorie sur l'anneau avec sa part ; touchez une catégorie pour voir ses étiquettes et ses transactions. La restauration d'une sauvegarde demande d'ajouter ou de remplacer, après une copie préalable. Secouer pour masquer marche dès l'ouverture. Corrections des paiements récurrents, prêts, imports et reçus PDF.

**Italiano (it-IT)** (459)
> Nuovo Blocco app: proteggi Stack'd con un PIN e sblocca con il volto o l'impronta. Tutte le valute sono disponibili. Statistiche mostra ogni categoria sull'anello con la sua quota; tocca una categoria per vederne etichette e transazioni. Il ripristino di un backup chiede se aggiungere o sostituire i dati, dopo una copia di sicurezza. Scuoti per nascondere funziona appena apri l'app. Correzioni a pagamenti ricorrenti, prestiti, importazioni e ricevute PDF.

**Español (es-ES)** (477)
> Nuevo bloqueo de la app: protege Stack'd con un PIN y desbloquea con tu cara o tu huella. Ya están disponibles todas las monedas. Estadísticas muestra cada categoría en el anillo con su parte; toca una categoría para ver sus etiquetas y transacciones. Restaurar una copia de seguridad pregunta si añadir o reemplazar los datos, tras una copia previa. Agitar para ocultar funciona nada más abrir la app. Correcciones en pagos recurrentes, préstamos, importaciones y recibos PDF.

**Português (pt-PT)** (491)
> Novo bloqueio da app: proteja o Stack'd com um PIN e desbloqueie com o rosto ou a impressão digital. Todas as moedas estão disponíveis. Estatísticas mostra cada categoria no anel com a sua parte; toque numa categoria para ver as etiquetas e as transações. Restaurar uma cópia de segurança pergunta se quer juntar ou substituir os dados, depois de uma cópia prévia. Agitar para ocultar funciona logo ao abrir a app. Correções em pagamentos recorrentes, empréstimos, importações e recibos PDF.

**Play format** — one box, every language in its tag (the listing's English
is en-GB):

```
<en-GB>
New App lock: protect Stack'd with a PIN, and unlock with your face or fingerprint. Every currency is now available. Analytics shows every category on the ring with its share; tap a category to see its tags and transactions. Restoring a backup now asks whether to add to your data or replace it, and saves a copy first. Shake to hide works as soon as the app opens. Fixes for recurring payments, loans, imports and PDF receipts.
</en-GB>
<fr-FR>
Nouveau verrouillage de l'app : protégez Stack'd par un code, et déverrouillez avec votre visage ou votre empreinte. Toutes les devises sont disponibles. Statistiques montre chaque catégorie sur l'anneau avec sa part ; touchez une catégorie pour voir ses étiquettes et ses transactions. La restauration d'une sauvegarde demande d'ajouter ou de remplacer, après une copie préalable. Secouer pour masquer marche dès l'ouverture. Corrections des paiements récurrents, prêts, imports et reçus PDF.
</fr-FR>
<it-IT>
Nuovo Blocco app: proteggi Stack'd con un PIN e sblocca con il volto o l'impronta. Tutte le valute sono disponibili. Statistiche mostra ogni categoria sull'anello con la sua quota; tocca una categoria per vederne etichette e transazioni. Il ripristino di un backup chiede se aggiungere o sostituire i dati, dopo una copia di sicurezza. Scuoti per nascondere funziona appena apri l'app. Correzioni a pagamenti ricorrenti, prestiti, importazioni e ricevute PDF.
</it-IT>
<es-ES>
Nuevo bloqueo de la app: protege Stack'd con un PIN y desbloquea con tu cara o tu huella. Ya están disponibles todas las monedas. Estadísticas muestra cada categoría en el anillo con su parte; toca una categoría para ver sus etiquetas y transacciones. Restaurar una copia de seguridad pregunta si añadir o reemplazar los datos, tras una copia previa. Agitar para ocultar funciona nada más abrir la app. Correcciones en pagos recurrentes, préstamos, importaciones y recibos PDF.
</es-ES>
<pt-PT>
Novo bloqueio da app: proteja o Stack'd com um PIN e desbloqueie com o rosto ou a impressão digital. Todas as moedas estão disponíveis. Estatísticas mostra cada categoria no anel com a sua parte; toque numa categoria para ver as etiquetas e as transações. Restaurar uma cópia de segurança pergunta se quer juntar ou substituir os dados, depois de uma cópia prévia. Agitar para ocultar funciona logo ao abrir a app. Correções em pagamentos recorrentes, empréstimos, importações e recibos PDF.
</pt-PT>
```

---

## 3. Screenshots

`Desktop\Stackd-1.3.1-store-assets\`, captured 2026-11-23 from 1.3.1 (dark
theme, invented demo data of `tools/seed.cjs`). **Only `04-analytics` is
new in substance** — it is now framed on the category ring and list (the
Analytics breakdown); the others are re-captures of unchanged screens. If
time is short, replacing only `04-analytics` in each language is enough.

| Folder | Size | Goes to |
|---|---|---|
| `play/<lang>/` | 7 per language (`00-widgets` … `06-debt`), 1080×2160 / 1080×1920 | Play → Main store listing → Phone screenshots |
| `apple-6.3/<lang>/` | 6 per language, 1206×2622 | App Store Connect → 1.3.1 → *iPhone com Dynamic Island (ecrã médio)* |

Default category names are English in every language (stored data), as in
1.2.2's shots. No alpha channel anywhere.

---

## 4. Who does what

### A. Me — done

Builds, notes, screenshots (above). After both submissions: tag **`v1.3.1`**
on `5221517` and push it.

### B. You — Google Play Console

1. *(Optional)* Publishing overview → **Managed publishing ON**, so the
   approved release waits for your *Publish* and goes out with iOS.
2. **Test and release → Production → Create new release.** Upload
   `Stackd-1.3.1-10301.aab`, release name `1.3.1`, paste the Play-format
   notes (§2).
3. *(Optional)* **Main store listing:** replace `04-analytics` (or all 7)
   per language from `play/<lang>/`.
4. **App content:** nothing changes.
5. Rollout: 100 %, or staged 20 % (`release-checklist.md` §10). Publishing
   overview → **Submit changes for review**.

### C. You — App Store Connect

1. **Apps → Stack'd Finance → + → iOS → `1.3.1`.**
2. **Build:** select **1.3.1 (10305)**.
3. **What's New in This Version:** each localization from §2.
4. *(Optional)* **Screenshots:** replace `04-analytics` (or all 6) per
   localization from `apple-6.3/<lang>/`.
5. **App Review Information → Notes** (suggested):
   > 1.3.1 adds an optional App lock (Settings → Privacy): a 4-digit PIN
   > kept on the device, with Face ID as a shortcut. No data leaves the
   > device.
6. **Version Release:** *Manually release this version* if Play uses
   managed publishing; otherwise automatic. Phased release is optional.
7. **Add for Review → Submit for Review.**

### D. After release

- Both store pages show **1.3.1**, the new What's new, and *Get / Install*
  (not a price).
- Update from the store on your phones, open once: App lock rows in
  Settings → Privacy, the status bar clear on iPhone.
- A fix after submission: iOS re-uploads as build **10306+** (same version);
  a new Play bundle needs **1.3.2 / 10302** and then iOS moves to 1.3.2 too.
