// Marketing-site copy, Italian. Same keys as en.cjs (see its header).
// UI names follow src/i18n/it.js: Altro e impostazioni, Aggiungi movimento,
// Cronologia, Obiettivi, Debiti, dashboard, tu.
module.exports = {
  name: 'Italiano',
  ogLocale: 'it_IT',
  menu: { label: 'Lingua' },
  brandLabel: "Stack'd Development Studio, home",
  nav: { label: 'Sito', app: "L'app", privacy: 'Privacy', studio: 'Lo studio', support: 'Assistenza', get: "Scarica l'app" },
  footer: {
    label: 'Note legali', privacy: 'Informativa sulla privacy', terms: 'Termini di utilizzo', support: 'Assistenza', contact: 'Contatti',
    trademark: "Google Play e il logo Google Play sono marchi di Google LLC. Stack'd non è affiliato, approvato o certificato da alcuna banca o istituto finanziario."
  },
  ogAlt: "Stack'd su un telefono, con il saldo totale e le schede dei conti, accanto al titolo (in inglese): i tuoi soldi, tracciati senza mai lasciare il telefono.",

  home: {
    title: "Stack'd Development Studio",
    description: "Stack'd Development Studio crea Stack'd, un'app per le finanze personali che mette la privacy al primo posto. Niente account e niente tracciamento: ogni conto, movimento e budget resta sul tuo dispositivo, e l'unica cosa che va online è il collegamento bancario che puoi scegliere di attivare.",
    hero: {
      eyebrow: "Stack'd · finanze personali",
      h1: 'I tuoi soldi, tracciati <em>sul tuo telefono</em>.',
      lede: "Stack'd tiene ogni conto, ogni movimento e ogni budget sul tuo dispositivo. Non c'è un account da creare né un cloud con cui sincronizzarsi. L'unica cosa che va online è il collegamento bancario che puoi scegliere di attivare, e ti mostra ogni movimento prima di salvarlo.",
      play: 'Disponibile su Google Play',
      ios: 'Versione per iPhone in arrivo',
      facts: ['<b>0</b> account o tracker', '<b>5</b> lingue', '<b>CSV</b> in entrata e in uscita, sempre'],
      imgAlt: "Dashboard di Stack'd: saldo totale di €28.088,91, grafico del saldo, schede dei conti Banca principale e Risparmi, e smart insights."
    },
    app: {
      eyebrow: "Cosa c'è dentro",
      h2: 'Costruita a partire dal registro.',
      intro: "In Stack'd un saldo non è mai un numero scritto a mano. È la somma dei movimenti che lo compongono, ricalcolata ogni volta, così quello che vedi corrisponde sempre a quello che hai registrato.",
      items: [
        { h: 'Conti e movimenti', p: "Banca, carta, contanti, risparmi, carta di credito, investimenti: due conti con il piano gratuito, tutti quelli che hai nella vita reale con Stack'd Pro, ognuno nella sua valuta. Registra una spesa, un'entrata o un trasferimento tra due conti in pochi tocchi, con una nota e dei tag." },
        { h: 'Movimenti ricorrenti', p: "Affitto, stipendio, abbonamenti: imposta la cadenza una volta e l'intera serie viene scritta in anticipo. Modifica una sola occorrenza, questa e le successive, o tutta la serie." },
        { h: 'Obiettivi', p: "Un budget mensile per categoria. La scheda Obiettivi mostra quanto è già speso, quanto è ancora impegnato dai movimenti ricorrenti e come finirà il mese, non solo com'è oggi." },
        { h: 'Simulatore di prestiti', p: "Inserisci importo, tasso e durata e leggi il piano di ammortamento completo: ogni rata, la sua quota di interessi e il capitale residuo. Collega un prestito al suo pagamento ricorrente e l'avanzamento si aggiorna da solo." },
        { h: 'Importazione degli estratti conto', p: "Carica un estratto conto in <code>CSV</code>, <code>camt.053</code> o <code>MT940</code>. Stack'd abbina le colonne, salta quello che hai già registrato, accoppia i trasferimenti tra i tuoi conti e mostra un riepilogo prima di salvare qualcosa. Il file non viene mai conservato." },
        { h: 'Widget e smart insights', p: "Componi la dashboard con otto tipi di widget: ultimi movimenti, entrate e spese, categorie principali, budget, tasso di risparmio, 50/30/20 e altro. Gli smart insights segnalano cosa è cambiato questo mese, con una riga ciascuno." }
      ]
    },
    pricing: {
      eyebrow: 'Quanto costa',
      h2: 'Gratis da usare, due cose da acquistare.',
      intro: "Niente è in affitto e niente scade. Il piano gratuito è l'intera app in scala ridotta; i due prodotti a pagamento sono mostrati, con il loro prezzo, nell'app prima dell'acquisto.",
      items: [
        { h: 'Gratis', p: "Fino a due conti e le categorie incluse nell'app. Tutto il resto c'è: movimenti ricorrenti, obiettivi, simulatore di prestiti, importazione degli estratti conto, widget, esportazione e importazione CSV, cinque lingue, tema chiaro e scuro." },
        { h: "Stack'd Pro", p: "Un acquisto una tantum, addebitato una sola volta da Google o Apple al prezzo indicato nell'app. Toglie per sempre entrambi i limiti del piano gratuito: tutti i conti che ti servono e categorie tutte tue. Non è un abbonamento, non si rinnova mai e puoi ripristinarlo su qualsiasi dispositivo collegato allo stesso account dello store." },
        { h: 'Bank Connect', p: "Il collegamento bancario facoltativo è un abbonamento, addebitato dallo store al prezzo indicato nell'app e annullabile in qualsiasi momento dalle impostazioni degli abbonamenti del tuo store. Tutto il resto di Stack'd funziona senza, e gli estratti conto importati da file funzioneranno sempre." }
      ]
    },
    screens: {
      eyebrow: 'Le schermate',
      h2: 'Sobria per scelta.',
      intro: "Pochi colori, numeri grandi, una cosa per schermata. Tema chiaro e scuro, e l'interfaccia in inglese, francese, italiano, spagnolo o portoghese.",
      items: [
        { alt: 'Schermata Cronologia con i movimenti raggruppati per giorno, con importi, categorie e conti.', title: 'Cronologia', caption: 'Ogni movimento, filtrabile per conto, categoria, tag e periodo.' },
        { alt: "Risultato di un prestito: €18.000 al 4,05% in 5 anni danno una rata mensile di €331,90, €1914,23 di interessi totali, 60 rate.", title: 'Debiti', caption: 'Simula un prestito prima di firmarlo, poi segui quello vero.' },
        { alt: 'La stessa dashboard con il tema chiaro.', title: 'Chiaro e scuro', caption: 'Scegli un tema, o lascia che segua il sistema.' }
      ]
    },
    privacy: {
      eyebrow: 'Privacy',
      h2: 'Non esce niente, a meno che tu non lo voglia.',
      intro: "L'app funziona offline e l'unica copia dei tuoi dati è quella sul tuo dispositivo. L'unica eccezione è il collegamento bancario che attivi tu, e ti mostra ogni movimento prima di salvarlo. Questo è l'elenco della nostra <a href=\"{privacy}\">informativa sulla privacy</a>.",
      listLabel: "Cosa l'app non fa",
      nots: [
        'Nessun account o registrazione',
        'Nessuna sincronizzazione cloud dei tuoi dati',
        'Nessun caricamento dei file importati',
        'Nessuna analisi o tracciamento dell’uso',
        'Nessuna pubblicità o identificativo pubblicitario',
        'Nessuna condivisione di dati oltre al collegamento bancario facoltativo'
      ],
      rights: [
        { eyebrow: 'Accesso e portabilità', h: 'Esporta tutto in CSV', p: "Conti, categorie, movimenti e prestiti escono dall'app come semplici file CSV che si aprono in qualsiasi foglio di calcolo. Gli stessi file si reimportano, quindi un backup è un ripristino completo." },
        { eyebrow: 'Rettifica', h: 'Modifica tutto, in qualsiasi momento', p: 'Niente resta bloccato dopo il salvataggio. Cambia un movimento, un conto o un budget e ogni cifra che ne dipende si aggiorna.' },
        { eyebrow: 'Cancellazione', h: 'Un ripristino, e non c’è più', p: "Elimina un singolo elemento o cancella tutto dalle impostazioni. Dato che non esiste una copia altrove, nessuno, noi compresi, può recuperarlo. Tieni al sicuro i tuoi backup CSV." }
      ]
    },
    studio: {
      eyebrow: 'Lo studio',
      body: [
        "Stack'd Development Studio è uno studio software indipendente. Facciamo Stack'd e lo costruiamo come vorremmo fossero costruiti i nostri strumenti: calcolato sul dispositivo, esportato in formati che si aprono ovunque e rifinito fino alla tipografia.",
        "La maggior parte delle app di finanza chiede le credenziali della banca il primo giorno e si ripaga con i tuoi dati. Per noi un'app per tenere i conti dovrebbe essere un taccuino privato con un'ottima aritmetica, ed è questo che facciamo."
      ],
      principles: [
        { b: 'Prima il locale', p: "Ogni funzione, compresi l'importazione degli estratti conto e i piani di ammortamento, gira sul telefono, offline. Il collegamento bancario facoltativo inoltra i movimenti tramite un server nell'UE che non ne conserva nessuno." },
        { b: 'Numeri onesti', p: 'I saldi sono calcolati dai movimenti, mai memorizzati. I calcoli dei prestiti usano centesimi interi, così un piano di ammortamento torna al centesimo.' },
        { b: 'Formati aperti', p: 'Esportazione e importazione CSV di tutto, più gli standard bancari camt.053 e MT940. I tuoi dati non restano mai intrappolati.' },
        { b: 'Lavoro finito', p: "Cinque lingue, chiaro e scuro, Android e iOS nativi. I dettagli piccoli, come i margini di sicurezza dello schermo e la posizione di scorrimento, ricevono la stessa cura di quelli grandi." }
      ]
    },
    contact: { h: 'Domande, idee, un bug?', p: 'Scrivici. La tua email serve solo per risponderti e non finisce mai in una lista.' }
  },

  support: {
    title: "Assistenza · Stack'd",
    description: "Aiuto per Stack'd: primi passi, backup, importazione degli estratti conto, acquisti e Bank Connect, e come contattare lo studio.",
    eyebrow: "Stack'd · Assistenza",
    h1: 'Come possiamo aiutarti?',
    lede: "L'app ha il suo Manuale utente e le sue FAQ: tocca il pulsante +, poi Altro e impostazioni. Qui sotto trovi le risposte alle domande più comuni. Per tutto il resto, scrivi a {email} e ti risponderà una persona.",
    status: {
      h: 'Stato del servizio',
      p: "Tutto funziona normalmente. Stack'd funziona offline, quindi l'app continua a funzionare qualunque cosa succeda qui; solo la Banca online dipende dal nostro server. Se qualcosa non va, lo scriviamo su questa riga."
    },
    tips: [
      { h: 'Fai un backup prima di cambiare telefono', p: "Stack'd non tiene copie dei tuoi dati da nessuna parte se non sul tuo dispositivo. Prima di disinstallare l'app o passare a un nuovo telefono, esporta i file CSV da Altro e impostazioni e importali sul nuovo dispositivo." },
      { h: 'Non possiamo recuperare dati persi', p: "Non c'è un account né una copia dei tuoi dati su un server, quindi non possiamo ripristinare nulla. Se hai un'esportazione CSV, Importa CSV in Altro e impostazioni rimette tutto a posto, conti e categorie compresi." },
      { h: 'Segnalare un bug', p: "Mandaci la versione dell'app (indicata in Altro e impostazioni), il modello del telefono e cosa ti aspettavi che succedesse. Non inviare mai un vero estratto conto; descrivine piuttosto il formato." }
    ],
    faqH: 'Domande frequenti',
    faq: [
      { q: 'Come creo un conto?', a: "Tocca il pulsante + nella barra in basso e scegli <b>Aggiungi conto</b>, oppure usa il riquadro Aggiungi wallet alla fine della fila dei conti nella dashboard. Dagli un nome, un'icona e un saldo iniziale. Da quel momento il saldo è sempre calcolato dai tuoi movimenti, quindi resta sincronizzato automaticamente." },
      { q: 'Come aggiungo un nuovo movimento?', a: 'Tocca il pulsante + e scegli <b>Aggiungi movimento</b>. Seleziona Spesa, Entrata o Trasferimento, poi inserisci importo, data, conto e categoria. Puoi anche aggiungere una nota e dei tag, o attivare la ricorrenza (giornaliera, settimanale, mensile…).' },
      { q: 'Come modifico o elimino un movimento?', a: "Apri la <b>Cronologia</b> (l'icona a elenco nella barra in basso) e tocca un movimento per aprirlo nell'editor. Cambia quello che serve e salva, oppure usa Elimina. Se il movimento fa parte di una serie ricorrente, ti verrà chiesto se la modifica vale solo per questo, per questo e i successivi, o per l'intera serie." },
      { q: 'Come importo un estratto conto?', a: "Vai in Altro e impostazioni e scegli <b>Importa CSV</b>. Stack'd accetta i propri backup CSV e qualsiasi estratto conto in formato CSV, camt.053 (ISO 20022) o MT940. Una schermata di riepilogo mostra cosa verrà aggiunto, cosa è già registrato e quali righe sono trasferimenti tra i tuoi conti, prima di salvare qualcosa." },
      { q: 'Come configuro i widget nella dashboard?', a: 'Nella dashboard, scorri fino alla sezione <b>Widget</b>. Tocca <b>Aggiungi</b> per scegliere un widget dalla galleria e la sua dimensione. Tocca <b>Modifica</b> per riordinare, ridimensionare, configurare o rimuovere i widget, poi tocca Fatto quando la disposizione ti soddisfa.' },
      { q: 'Come creo un prestito?', a: "Tocca il pulsante + e scegli <b>Debiti</b>. Seleziona un tipo di prestito per aprire il simulatore, inserisci importo, tasso e durata, e consulta il piano di ammortamento completo. Puoi tenerlo come simulazione o monitorarlo come prestito attivo. Il monitoraggio lo collega a una spesa ricorrente, così l'avanzamento si aggiorna automaticamente man mano che registri le rate." },
      { q: 'Come gestisco le categorie?', a: "Vai su <b>Altro → Categorie</b> per vedere tutte le tue categorie, oppure tocca una categoria per vederne l'attività o modificarne nome, icona e colore. Stack'd include un set predefinito, che è quello del piano gratuito. Creare categorie tue fa parte di Stack'd Pro; una volta sbloccato Pro, lo fai dal pulsante +, poi <b>Aggiungi categoria</b>." },
      { q: 'Come uso i tag?', a: "I tag sono etichette libere che scrivi nel campo <b>Tag</b> quando crei o modifichi un movimento. Il completamento automatico suggerisce quelli che usi già. Sfogliali in <b>Altro → Tag</b>, oppure filtra la Cronologia per tag per vedere tutto ciò che porta quell'etichetta." },
      { q: 'Posso cambiare lingua o valuta?', a: "Sì, entrambe sono in Altro e impostazioni. L'interfaccia è disponibile in inglese, francese, italiano, spagnolo e portoghese e cambia all'istante. Ogni conto può avere la sua valuta; i conti in una valuta diversa da quella principale vengono mostrati a parte, senza conversione." },
      { q: 'Come elimino tutti i miei dati?', a: "In Altro e impostazioni, nella Zona pericolosa, c'è il Ripristino totale, che cancella per sempre ogni conto, budget e movimento. Disinstallare l'app ha lo stesso effetto. Questo copre tutto ciò che registri, perché è salvato solo sul tuo dispositivo. Se hai usato Bank Connect, scollega prima ogni banca collegata: così viene eliminata la traccia del collegamento sul server. Per tutto ciò che riguarda queste tracce e che l'app non può fare da sola, scrivi a {email}." }
    ],
    buyH: 'Acquisti e Bank Connect',
    buy: [
      { q: "Cosa è gratis e cosa è a pagamento?", a: "Stack'd è gratis, con due acquisti facoltativi. Il piano gratuito ti dà fino a due conti e le categorie incluse nell'app; tutto il resto, dai movimenti ricorrenti al simulatore di prestiti, all'importazione degli estratti conto, ai widget e all'esportazione CSV, è incluso. <b>Stack'd Pro</b> è un acquisto una tantum che toglie entrambi i limiti. <b>Bank Connect</b>, il collegamento bancario facoltativo, è un abbonamento. Entrambi i prezzi sono mostrati nell'app prima dell'acquisto, nella tua valuta." },
      { q: "Cosa sblocca Stack'd Pro?", a: "Tutti i conti che ti servono e categorie tutte tue. Viene addebitato una sola volta da Google Play o dall'App Store tramite il tuo account dello store; non è un abbonamento e non si rinnova mai. Con il piano gratuito niente di ciò che hai già registrato viene mai nascosto o eliminato, è limitata solo la creazione di nuovi elementi, quindi sbloccare Pro più avanti non cambia nulla dei tuoi dati." },
      { q: "Ho acquistato Stack'd Pro. Come lo ritrovo su un nuovo telefono?", a: "Apri <b>Altro e impostazioni → Acquisti in-app</b> e tocca <b>Ripristina l'acquisto</b>. Qualsiasi dispositivo collegato allo stesso account Google o Apple che l'ha acquistato riottiene lo sblocco, senza altri costi. I tuoi dati non viaggiano con l'acquisto: spostali con un'esportazione e un'importazione CSV, come descritto sopra." },
      { q: "Come annullo l'abbonamento a Bank Connect?", a: "Dallo store, non da Stack'd. Su Android, Google Play → il tuo profilo → <b>Pagamenti e abbonamenti → Abbonamenti</b>. Su iPhone, Impostazioni → il tuo nome → <b>Abbonamenti</b>. Il periodo in corso arriva alla sua scadenza, e gli aggiornamenti si fermano a quel punto." },
      { q: 'Posso avere un rimborso?', a: "I rimborsi di entrambi i prodotti sono gestiti dallo store che ha ricevuto il pagamento, secondo le sue regole: Google Play o l'App Store. Non possiamo emetterli noi, perché il denaro non passa mai da noi. Se qualcosa non va nell'app, scrivici comunque e proveremo a sistemarlo." },
      { q: 'Cosa succede ai miei collegamenti bancari se smetto di pagare?', a: "Gli aggiornamenti si fermano appena finisce l'abbonamento. Le connessioni vengono mantenute per 14 giorni, così un rinnovo riprende da dove eri rimasto; dopo vengono revocate e le loro tracce sul server vengono eliminate. I movimenti già importati restano nell'app, sul tuo dispositivo, così come sono." },
      { q: 'Come scollego una banca?', a: "Apri <b>Altro e impostazioni → Banca online</b> e tocca <b>Scollega</b> accanto alla banca. In questo modo l'accesso viene revocato presso la tua banca e la traccia del collegamento viene eliminata dal server di Stack'd. I movimenti già importati sono tuoi e restano nell'app." }
    ],
    still: { h: 'Ancora bloccato?', p: 'Scrivici. La tua email serve solo per risponderti e non finisce mai in una lista.' }
  },

  notFound: {
    title: "Pagina non trovata · Stack'd",
    h1: 'Questa pagina non è nel registro.',
    lede: "L'indirizzo potrebbe essere sbagliato, oppure la pagina è stata spostata.",
    back: 'Torna alla home'
  },

  legal: {
    termsTitle: 'Termini di utilizzo', privacyTitle: 'Informativa sulla privacy',
    seeTerms: 'Vedi anche i Termini di utilizzo', seePrivacy: "Vedi anche l'Informativa sulla privacy",
    metaTerms: "I termini con cui ti viene concesso Stack'd, il gestore di finanze personali che mette la privacy al primo posto.",
    metaPrivacy: "Stack'd tiene i tuoi soldi sul telefono. L'unica eccezione è Bank Connect, una funzione facoltativa che attivi tu; questa informativa spiega esattamente cosa viene inviato e cosa viene conservato.",
    website: {
      h: 'Questo sito web',
      d: "Questo sito è un insieme di pagine statiche. Non imposta cookie, non esegue analisi e non incorpora script di terze parti. Quando arrivi da un altro sito, legge la lingua richiesta dal tuo browser per aprire la pagina in quella lingua; non ne conserva nulla. Il nostro fornitore di hosting può conservare log del server standard e di breve durata (indirizzo IP, pagina richiesta), come qualsiasi host."
    }
  }
};
