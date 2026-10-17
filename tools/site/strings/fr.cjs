// Marketing-site copy, French. Same keys as en.cjs (see its header).
// UI names follow src/i18n/fr.js: Autres et réglages, Ajouter une opération,
// Historique, Objectifs, Dettes, tableau de bord, vous.
module.exports = {
  name: 'Français',
  ogLocale: 'fr_FR',
  menu: { label: 'Langue' },
  brandLabel: "Stack'd Development Studio, accueil",
  nav: { label: 'Site', app: "L'application", privacy: 'Confidentialité', studio: 'Le studio', support: 'Assistance', get: 'Télécharger' },
  footer: {
    label: 'Mentions légales', privacy: 'Politique de confidentialité', terms: "Conditions d'utilisation", support: 'Assistance', contact: 'Contact',
    trademark: "Google Play et le logo Google Play sont des marques de Google LLC. Stack'd n'est affilié à aucune banque ni institution financière, ni approuvé ou certifié par l'une d'elles."
  },
  ogAlt: "Stack'd sur un téléphone, avec un solde total et des cartes de comptes, à côté du titre (en anglais) : le suivi de votre argent qui ne quitte jamais votre téléphone.",

  home: {
    title: "Stack'd Development Studio",
    description: "Stack'd Development Studio crée Stack'd, un gestionnaire de finances personnelles qui protège votre vie privée. Ni compte ni pistage : chaque compte, opération et budget reste sur votre appareil, et la seule chose qui passe en ligne est le lien bancaire que vous pouvez choisir d'activer.",
    hero: {
      eyebrow: "Stack'd · finances personnelles",
      h1: 'Vos comptes, gardés <em>sur votre téléphone</em>.',
      lede: "Stack'd garde chaque compte, chaque opération et chaque budget sur votre appareil. Aucun compte utilisateur à créer, aucun cloud à synchroniser. La seule chose qui passe en ligne est le lien bancaire que vous pouvez choisir d'activer, et il vous montre chaque opération avant de l'enregistrer.",
      play: 'Disponible sur Google Play',
      ios: 'Version iPhone en préparation',
      facts: ['<b>0</b> compte utilisateur ni traceur', '<b>5</b> langues', '<b>CSV</b> en entrée et en sortie, toujours'],
      imgAlt: "Tableau de bord de Stack'd : solde total de €28 088,91, graphique du solde, cartes des comptes Banque principale et Épargne, et smart insights."
    },
    app: {
      eyebrow: 'Ce qu’elle contient',
      h2: 'Construite à partir du registre.',
      intro: "Dans Stack'd, un solde n'est jamais un chiffre saisi à la main. C'est la somme des opérations qui le composent, recalculée à chaque fois : ce que vous voyez correspond toujours à ce que vous avez enregistré.",
      items: [
        { h: 'Comptes et opérations', p: "Banque, carte, espèces, épargne, carte de crédit, investissement : deux comptes avec l'offre gratuite, autant que dans la vraie vie avec Stack'd Pro, chacun dans sa propre devise. Enregistrez une dépense, un revenu ou un virement entre deux comptes en quelques touches, avec une note et des tags." },
        { h: 'Opérations récurrentes', p: "Loyer, salaire, abonnements : définissez un calendrier une fois et toute la série est inscrite à l'avance. Modifiez une seule échéance, celle-ci et les suivantes, ou toute la série." },
        { h: 'Objectifs', p: "Un budget mensuel par catégorie. L'onglet Objectifs montre ce qui est déjà dépensé, ce qui reste engagé par les opérations récurrentes et comment le mois va se terminer, pas seulement où il en est aujourd'hui." },
        { h: 'Simulateur de prêt', p: "Saisissez un montant, un taux et une durée et lisez le tableau d'amortissement complet : chaque échéance, sa part d'intérêts et le capital restant. Reliez un prêt à son paiement récurrent et la progression se suit toute seule." },
        { h: 'Import de relevés bancaires', p: "Déposez un relevé au format <code>CSV</code>, <code>camt.053</code> ou <code>MT940</code>. Stack'd associe les colonnes, ignore ce que vous avez déjà saisi, apparie les virements entre vos propres comptes et affiche un récapitulatif avant tout enregistrement. Le fichier lui-même n'est jamais conservé." },
        { h: 'Widgets et smart insights', p: "Composez le tableau de bord avec huit types de widgets : dernières opérations, revenus et dépenses, principales catégories, budgets, taux d'épargne, 50/30/20 et plus. Les smart insights signalent ce qui a changé ce mois-ci, en une ligne chacun." }
      ]
    },
    pricing: {
      eyebrow: 'Ce que ça coûte',
      h2: 'Gratuite, avec deux achats possibles.',
      intro: "Rien n'est loué, rien n'expire. L'offre gratuite, c'est toute l'application à plus petite échelle ; les deux produits payants sont présentés, avec leur prix, dans l'application avant l'achat.",
      items: [
        { h: 'Gratuit', p: "Jusqu'à deux comptes et les catégories fournies avec l'application. Tout le reste est inclus : opérations récurrentes, objectifs, simulateur de prêt, import de relevés, widgets, export et import CSV, cinq langues, thème clair et sombre." },
        { h: "Stack'd Pro", p: "Un achat unique, facturé une seule fois par Google ou Apple au prix affiché dans l'application. Il lève définitivement les deux limites de l'offre gratuite : autant de comptes que nécessaire, et vos propres catégories. Ce n'est pas un abonnement, il ne se renouvelle jamais, et vous pouvez le restaurer sur tout appareil connecté au même compte de la boutique." },
        { h: 'Bank Connect', p: "Le lien bancaire facultatif est un abonnement, facturé par la boutique au prix affiché dans l'application et résiliable à tout moment dans les réglages d'abonnement de votre boutique. Tout le reste de Stack'd fonctionne sans lui, et les relevés importés par fichier fonctionneront toujours." }
      ]
    },
    screens: {
      eyebrow: 'Les écrans',
      h2: 'Sobre par principe.',
      intro: 'Peu de couleurs, de grands chiffres, une chose par écran. Thème clair et sombre, et une interface en anglais, français, italien, espagnol ou portugais.',
      items: [
        { alt: "Écran Historique listant les opérations regroupées par jour, avec montants, catégories et comptes.", title: 'Historique', caption: 'Chaque opération, filtrable par compte, catégorie, tag et période.' },
        { alt: "Résultat d'un prêt : €18 000 à 4,05 % sur 5 ans donnent une mensualité de €331,90, €1 914,23 d'intérêts au total, 60 échéances.", title: 'Dettes', caption: 'Simulez un prêt avant de le signer, puis suivez le vrai.' },
        { alt: 'Le même tableau de bord en thème clair.', title: 'Clair et sombre', caption: 'Choisissez un thème, ou laissez-le suivre le système.' }
      ]
    },
    privacy: {
      eyebrow: 'Confidentialité',
      h2: 'Rien ne sort, sauf si vous le décidez.',
      intro: 'L\'application fonctionne hors ligne et la seule copie de vos données est celle de votre appareil. L\'unique exception est le lien bancaire que vous activez vous-même, et il vous montre chaque opération avant de l\'enregistrer. Voici la liste tirée de notre <a href="{privacy}">politique de confidentialité</a>.',
      listLabel: "Ce que l'application ne fait pas",
      nots: [
        "Aucun compte utilisateur ni inscription",
        'Aucune synchronisation cloud de vos données',
        'Aucun envoi des fichiers importés',
        "Aucune analyse d'audience ni suivi d'utilisation",
        'Aucune publicité ni identifiant publicitaire',
        'Aucun partage de données hors du lien bancaire facultatif'
      ],
      rights: [
        { eyebrow: 'Accès et portabilité', h: 'Tout exporter en CSV', p: "Comptes, catégories, opérations et prêts sortent de l'application en fichiers CSV simples, lisibles par n'importe quel tableur. Les mêmes fichiers se réimportent : une sauvegarde est une restauration complète." },
        { eyebrow: 'Rectification', h: 'Modifier tout, à tout moment', p: "Rien n'est verrouillé après l'enregistrement. Modifiez une opération, un compte ou un budget et chaque chiffre qui en dépend suit." },
        { eyebrow: 'Effacement', h: 'Une réinitialisation, et tout disparaît', p: "Supprimez un élément ou effacez tout depuis les réglages. Comme aucune copie n'existe ailleurs, personne, nous compris, ne peut le récupérer. Gardez vos sauvegardes CSV en lieu sûr." }
      ]
    },
    studio: {
      eyebrow: 'Le studio',
      body: [
        "Stack'd Development Studio est un studio de logiciels indépendant. Nous faisons Stack'd, et nous le construisons comme nous voudrions que nos propres outils le soient : calculé sur l'appareil, exporté dans des formats lisibles partout, et soigné jusqu'à la typographie.",
        "La plupart des applications de finances demandent vos identifiants bancaires dès le premier jour et se financent avec vos données. Pour nous, un gestionnaire de budget doit être un carnet privé doté d'une très bonne arithmétique : c'est ce que nous faisons."
      ],
      principles: [
        { b: "Local d'abord", p: "Chaque fonction, import de relevés et tableaux d'amortissement compris, tourne sur le téléphone, hors ligne. Le lien bancaire facultatif relaie les opérations via un serveur dans l'UE qui n'en conserve aucune." },
        { b: 'Des chiffres honnêtes', p: "Les soldes sont calculés à partir des opérations, jamais stockés. Les calculs de prêt se font en centimes entiers : un tableau d'amortissement tombe juste au centime près." },
        { b: 'Des formats ouverts', p: "Export et import CSV de tout, plus les standards bancaires camt.053 et MT940. Vos données ne sont jamais prisonnières." },
        { b: 'Du travail fini', p: "Cinq langues, clair et sombre, Android et iOS en natif. Les petits détails, comme la zone de sécurité de l'écran et la position de défilement, reçoivent le même soin que les grands." }
      ]
    },
    contact: { h: 'Une question, une idée, un bug ?', p: "Écrivez-nous. Votre adresse e-mail sert uniquement à vous répondre et n'est jamais ajoutée à une liste." }
  },

  support: {
    title: "Assistance · Stack'd",
    description: "Aide pour Stack'd : premiers pas, sauvegardes, import de relevés bancaires, achats et Bank Connect, et comment joindre le studio.",
    eyebrow: "Stack'd · Assistance",
    h1: 'Comment pouvons-nous vous aider ?',
    lede: "L'application contient son propre Manuel d'utilisation et sa FAQ : touchez le bouton +, puis Autres et réglages. Les questions les plus courantes ont leur réponse ci-dessous. Pour tout le reste, écrivez à {email} et une personne vous répondra.",
    status: {
      h: 'État du service',
      p: "Tout fonctionne normalement. Stack'd marche hors ligne : l'application continue de fonctionner quoi qu'il arrive ici ; seule la Banque en ligne dépend de notre serveur. En cas de problème, nous l'indiquons sur cette ligne."
    },
    tips: [
      { h: 'Sauvegardez avant de changer de téléphone', p: "Stack'd ne garde aucune copie de vos données ailleurs que sur votre appareil. Avant de désinstaller l'application ou de passer à un nouveau téléphone, exportez vos fichiers CSV depuis Autres et réglages et importez-les sur le nouvel appareil." },
      { h: 'Nous ne pouvons pas récupérer des données perdues', p: "Il n'y a pas de compte utilisateur ni de copie de vos données sur un serveur : nous ne pouvons donc rien restaurer. Si vous avez un export CSV, Importer un CSV dans Autres et réglages remet tout en place, comptes et catégories compris." },
      { h: 'Signaler un bug', p: "Envoyez-nous la version de l'application (affichée dans Autres et réglages), le modèle de votre téléphone et ce que vous attendiez. N'envoyez jamais un vrai relevé bancaire ; décrivez plutôt son format." }
    ],
    faqH: 'Questions fréquentes',
    faq: [
      { q: 'Comment créer un compte ?', a: "Touchez le bouton + dans la barre du bas et choisissez <b>Ajouter un compte</b>, ou utilisez la tuile Ajouter un wallet à la fin de la rangée des comptes sur le tableau de bord. Donnez-lui un nom, une icône et un solde initial. Ensuite, le solde est toujours calculé à partir de vos opérations : il reste donc synchronisé automatiquement." },
      { q: 'Comment ajouter une nouvelle opération ?', a: 'Touchez le bouton + et choisissez <b>Ajouter une opération</b>. Sélectionnez Dépense, Revenu ou Virement, puis saisissez le montant, la date, le compte et la catégorie. Vous pouvez aussi ajouter une note et des tags, ou activer la récurrence (quotidienne, hebdomadaire, mensuelle…).' },
      { q: 'Comment modifier ou supprimer une opération ?', a: "Ouvrez l'<b>Historique</b> (l'icône de liste dans la barre du bas) et touchez une opération pour l'ouvrir dans l'éditeur. Modifiez ce que vous voulez et enregistrez, ou utilisez Supprimer. Si l'opération fait partie d'une série récurrente, il vous sera demandé si le changement s'applique à celle-ci uniquement, à celle-ci et aux suivantes, ou à toute la série." },
      { q: 'Comment importer un relevé bancaire ?', a: "Allez dans Autres et réglages et choisissez <b>Importer un CSV</b>. Stack'd accepte ses propres sauvegardes CSV et tout relevé bancaire au format CSV, camt.053 (ISO 20022) ou MT940. Un écran de vérification montre ce qui sera ajouté, ce qui est déjà saisi et quelles lignes sont des virements entre vos propres comptes, avant tout enregistrement." },
      { q: 'Comment configurer les widgets du tableau de bord ?', a: 'Sur le tableau de bord, faites défiler jusqu’à la section <b>Widgets</b>. Touchez <b>Ajouter</b> pour choisir un widget dans la galerie et sa taille. Touchez <b>Modifier</b> pour réorganiser, redimensionner, configurer ou retirer des widgets, puis touchez Terminé quand la disposition vous convient.' },
      { q: 'Comment créer un prêt ?', a: "Touchez le bouton + et choisissez <b>Dettes</b>. Sélectionnez un type de prêt pour ouvrir le simulateur, saisissez le montant, le taux et la durée, puis consultez le tableau d'amortissement complet. Vous pouvez le garder comme simulation ou le suivre comme prêt actif. Le suivi le relie à une dépense récurrente, donc votre progression se met à jour automatiquement à mesure que les échéances sont enregistrées." },
      { q: 'Comment gérer les catégories ?', a: "Allez dans <b>Autres → Catégories</b> pour voir toutes vos catégories, ou touchez une catégorie pour voir son activité ou modifier son nom, son icône et sa couleur. Stack'd est livré avec un jeu par défaut, celui de l'offre gratuite. Créer vos propres catégories fait partie de Stack'd Pro ; une fois Pro débloqué, cela se fait avec le bouton +, puis <b>Ajouter une catégorie</b>." },
      { q: 'Comment utiliser les tags ?', a: "Les tags sont des libellés libres que vous saisissez dans le champ <b>Tags</b> lors de la création ou de la modification d'une opération. L'autocomplétion suggère ceux que vous utilisez déjà. Parcourez-les dans <b>Autres → Tags</b>, ou filtrez l'Historique par tag pour voir tout ce qui porte ce libellé." },
      { q: 'Puis-je changer la langue ou la devise ?', a: "Oui, les deux se trouvent dans Autres et réglages. L'interface existe en anglais, français, italien, espagnol et portugais et change instantanément. Chaque compte peut avoir sa propre devise ; les comptes dans une devise autre que la principale sont affichés à part, sans conversion." },
      { q: 'Comment supprimer toutes mes données ?', a: "Autres et réglages contient une Réinitialisation, dans la Zone sensible, qui efface définitivement chaque compte, budget et opération. Désinstaller l'application a le même effet. Cela couvre tout ce que vous enregistrez, puisque tout est stocké uniquement sur votre appareil. Si vous avez utilisé Bank Connect, déconnectez d'abord chaque banque liée : cela supprime la trace du lien sur le serveur. Pour tout ce qui concerne ces traces et que l'application ne peut pas faire elle-même, écrivez à {email}." }
    ],
    buyH: 'Achats et Bank Connect',
    buy: [
      { q: "Qu'est-ce qui est gratuit, et qu'est-ce qui est payant ?", a: "Stack'd est gratuit, avec deux achats facultatifs. L'offre gratuite vous donne jusqu'à deux comptes et les catégories fournies avec l'application ; tout le reste, des opérations récurrentes au simulateur de prêt, en passant par l'import de relevés, les widgets et l'export CSV, est inclus. <b>Stack'd Pro</b> est un achat unique qui lève ces deux limites. <b>Bank Connect</b>, le lien bancaire facultatif, est un abonnement. Les deux prix sont affichés dans l'application avant l'achat, dans votre devise." },
      { q: "Que débloque Stack'd Pro ?", a: "Autant de comptes que nécessaire, et vos propres catégories. Il est facturé une seule fois par Google Play ou l'App Store via votre compte de la boutique ; ce n'est pas un abonnement et il ne se renouvelle jamais. Rien de ce que vous avez déjà enregistré n'est jamais masqué ni supprimé avec l'offre gratuite, seule la création de nouveaux éléments est limitée : débloquer Pro plus tard ne change donc rien à vos données." },
      { q: "J'ai acheté Stack'd Pro. Comment le retrouver sur un nouveau téléphone ?", a: "Ouvrez <b>Autres et réglages → Achats intégrés</b> et touchez <b>Restaurer l'achat</b>. Tout appareil connecté au même compte Google ou Apple que celui de l'achat retrouve le déblocage, sans frais supplémentaires. Vos données ne voyagent pas avec l'achat : transférez-les avec un export et un import CSV, comme décrit plus haut." },
      { q: "Comment résilier l'abonnement Bank Connect ?", a: "Dans votre boutique, pas dans Stack'd. Sur Android, Google Play → votre profil → <b>Paiements et abonnements → Abonnements</b>. Sur iPhone, Réglages → votre nom → <b>Abonnements</b>. La période en cours va jusqu'à son terme, et l'actualisation s'arrête à ce moment-là." },
      { q: 'Puis-je obtenir un remboursement ?', a: "Les remboursements des deux produits sont gérés par la boutique qui a encaissé le paiement, selon ses propres règles : Google Play ou l'App Store. Nous ne pouvons pas les émettre nous-mêmes, car l'argent ne passe jamais par nous. Si quelque chose ne va pas dans l'application, écrivez-nous quand même et nous essaierons de le corriger." },
      { q: "Que deviennent mes liens bancaires si j'arrête de payer ?", a: "L'actualisation s'arrête dès la fin de l'abonnement. Vos connexions sont conservées 14 jours pour qu'un renouvellement reprenne là où vous en étiez ; ensuite, elles sont révoquées et leurs traces sur le serveur sont supprimées. Les opérations déjà importées restent dans l'application, sur votre appareil, telles quelles." },
      { q: 'Comment déconnecter une banque ?', a: "Ouvrez <b>Autres et réglages → Banque en ligne</b> et touchez <b>Déconnecter</b> à côté de la banque. Cela révoque l'accès auprès de votre banque et supprime la trace du lien sur le serveur Stack'd. Les opérations déjà importées vous appartiennent et restent dans l'application." }
    ],
    still: { h: 'Toujours bloqué ?', p: "Écrivez-nous. Votre adresse e-mail sert uniquement à vous répondre et n'est jamais ajoutée à une liste." }
  },

  notFound: {
    title: "Page introuvable · Stack'd",
    h1: "Cette page n'est pas dans le registre.",
    lede: "L'adresse est peut-être mal saisie, ou la page a été déplacée.",
    back: "Retour à l'accueil"
  },

  legal: {
    termsTitle: "Conditions d'utilisation", privacyTitle: 'Politique de confidentialité',
    seeTerms: "Voir aussi les Conditions d'utilisation", seePrivacy: 'Voir aussi la Politique de confidentialité',
    metaTerms: "Les conditions sous lesquelles Stack'd, le gestionnaire de finances personnelles axé sur la confidentialité, vous est concédé.",
    metaPrivacy: "Stack'd garde votre argent sur votre téléphone. La seule exception est Bank Connect, une fonctionnalité facultative que vous activez vous-même ; cette politique explique exactement ce qui est transmis et ce qui est conservé.",
    website: {
      h: 'Ce site web',
      d: "Ce site web est un ensemble de pages statiques. Il ne dépose aucun cookie, n'exécute aucune analyse d'audience et n'intègre aucun script tiers. Quand vous arrivez depuis un autre site, il lit la langue demandée par votre navigateur pour ouvrir la page dans cette langue ; rien n'en est conservé. Notre hébergeur peut conserver des journaux serveur standard et de courte durée (adresse IP, page demandée), comme tout hébergeur."
    }
  }
};
