// Marketing-site copy, Portuguese (European, like the app). Same keys as
// en.cjs (see its header). UI names follow src/i18n/pt.js: Outros e
// definições, Adicionar movimento, Histórico, Objetivos, Dívidas, painel.
module.exports = {
  name: 'Português',
  ogLocale: 'pt_PT',
  menu: { label: 'Idioma' },
  brandLabel: "Stack'd Development Studio, início",
  nav: { label: 'Site', app: 'A app', privacy: 'Privacidade', studio: 'O estúdio', support: 'Apoio', get: 'Obter a app' },
  footer: {
    label: 'Informação legal', privacy: 'Política de privacidade', terms: 'Termos de utilização', support: 'Apoio', contact: 'Contacto',
    trademark: "Google Play e o logótipo Google Play são marcas comerciais da Google LLC. O Stack'd não é afiliado, apoiado nem certificado por nenhum banco ou instituição financeira."
  },
  ogAlt: "O Stack'd num telemóvel, com o saldo total e os cartões das contas, ao lado do título (em inglês): o controlo do seu dinheiro que nunca sai do telemóvel.",

  home: {
    title: "Stack'd Development Studio",
    description: "O Stack'd Development Studio faz o Stack'd, uma app de finanças pessoais que põe a privacidade em primeiro lugar. Sem contas de utilizador e sem rastreio: cada conta, movimento e orçamento fica no seu dispositivo, e a única coisa que vai à internet é a ligação bancária que pode optar por ativar.",
    hero: {
      eyebrow: "Stack'd · finanças pessoais",
      h1: 'O seu dinheiro, controlado no seu telemóvel.',
      lede: "O Stack'd guarda cada conta, cada movimento e cada orçamento no seu dispositivo. Não há conta de utilizador para criar nem nuvem com que sincronizar. A única coisa que vai à internet é a ligação bancária que pode optar por ativar, e ela mostra-lhe cada movimento antes de o guardar.",
      play: 'Disponível no Google Play',
      ios: 'Versão para iPhone a caminho',
      facts: ['<b>0</b> contas de utilizador ou rastreadores', '<b>5</b> idiomas', '<b>CSV</b> à entrada e à saída, sempre'],
      imgAlt: "Painel do Stack'd: saldo total de €28 088,91, gráfico do saldo, cartões das contas Banco principal e Poupança, e smart insights."
    },
    app: {
      eyebrow: 'O que tem lá dentro',
      h2: 'Construída a partir do livro de registos.',
      intro: "No Stack'd, um saldo nunca é um número escrito à mão. É a soma dos movimentos que o compõem, recalculada sempre, por isso o que vê corresponde sempre ao que registou.",
      items: [
        { h: 'Contas e movimentos', p: "Banco, cartão, dinheiro, poupança, cartão de crédito, investimento: duas contas no plano gratuito, tantas quantas tiver na vida real com o Stack'd Pro, cada uma na sua moeda. Registe uma despesa, uma receita ou uma transferência entre duas contas em poucos toques, com uma nota e etiquetas." },
        { h: 'Movimentos recorrentes', p: 'Renda, salário, subscrições: defina a periodicidade uma vez e toda a série fica escrita com antecedência. Edite uma só ocorrência, esta e as seguintes, ou a série inteira.' },
        { h: 'Objetivos', p: 'Um orçamento mensal por categoria. O separador Objetivos mostra o que já foi gasto, o que ainda está comprometido pelos movimentos recorrentes e como o mês vai acabar, não apenas como está hoje.' },
        { h: 'Simulador de crédito', p: 'Introduza um montante, uma taxa e uma duração e leia o plano de amortização completo: cada prestação, a sua parte de juros e o capital em dívida. Ligue um crédito ao seu pagamento recorrente e o progresso acompanha-se sozinho.' },
        { h: 'Importação de extratos bancários', p: "Carregue um extrato em <code>CSV</code>, <code>camt.053</code> ou <code>MT940</code>. O Stack'd associa as colunas, ignora o que já registou, emparelha as transferências entre as suas próprias contas e mostra uma revisão antes de guardar o que quer que seja. O ficheiro nunca é guardado." },
        { h: 'Widgets e smart insights', p: 'Componha o painel com oito tipos de widget: últimos movimentos, receitas e despesas, principais categorias, orçamentos, taxa de poupança, 50/30/20 e mais. Os smart insights assinalam o que mudou este mês, numa linha cada um.' }
      ]
    },
    pricing: {
      eyebrow: 'Quanto custa',
      h2: 'Grátis para usar, duas coisas para comprar.',
      intro: 'Nada é alugado e nada expira. O plano gratuito é a app inteira em ponto pequeno; os dois produtos pagos são apresentados, com o respetivo preço, dentro da app antes de comprar.',
      items: [
        { h: 'Grátis', p: 'Até duas contas e as categorias que vêm com a app. Tudo o resto está incluído: movimentos recorrentes, objetivos, simulador de crédito, importação de extratos, widgets, exportação e importação CSV, cinco idiomas, tema claro e escuro.' },
        { h: "Stack'd Pro", p: 'Uma compra única, cobrada uma só vez pela Google ou pela Apple ao preço indicado na app. Elimina de vez os dois limites do plano gratuito: todas as contas de que precisar e categorias suas. Não é uma subscrição, nunca se renova e pode restaurá-la em qualquer dispositivo com a mesma conta da loja.' },
        { h: 'Bank Connect', p: "A ligação bancária opcional é uma subscrição, cobrada pela loja ao preço indicado na app e que pode cancelar a qualquer momento nas definições de subscrições da sua loja. Tudo o resto no Stack'd funciona sem ela, e os extratos que importar por ficheiro vão funcionar sempre." }
      ]
    },
    screens: {
      eyebrow: 'Os ecrãs',
      h2: 'Sóbria por natureza.',
      intro: 'Pouca cor, números grandes, uma coisa por ecrã. Tema claro e escuro, e a interface em inglês, francês, italiano, espanhol ou português.',
      items: [
        { alt: 'Ecrã Histórico com os movimentos agrupados por dia, com montantes, categorias e contas.', title: 'Histórico', caption: 'Cada movimento, filtrável por conta, categoria, etiqueta e período.' },
        { alt: "Resultado de um crédito: €18 000 a 4,05% em 5 anos dão uma prestação mensal de €331,90, €1914,23 de juros totais, 60 prestações.", title: 'Dívidas', caption: 'Simule um crédito antes de o assinar e depois acompanhe o verdadeiro.' },
        { alt: 'O mesmo painel no tema claro.', title: 'Claro e escuro', caption: 'Escolha um tema ou deixe-o seguir o sistema.' }
      ]
    },
    privacy: {
      eyebrow: 'Privacidade',
      h2: 'Nada sai, a não ser que o decida.',
      intro: 'A app funciona offline e a única cópia dos seus dados é a que está no seu dispositivo. A única exceção é a ligação bancária que ativa por si, e ela mostra-lhe cada movimento antes de o guardar. Esta é a lista da nossa <a href="{privacy}">política de privacidade</a>.',
      listLabel: 'O que a app não faz',
      nots: [
        'Sem contas de utilizador nem registo',
        'Sem sincronização na nuvem dos seus dados',
        'Sem envio dos ficheiros importados',
        'Sem análises nem rastreio de utilização',
        'Sem publicidade nem identificadores publicitários',
        'Sem partilha de dados além da ligação bancária opcional'
      ],
      rights: [
        { eyebrow: 'Acesso e portabilidade', h: 'Exporte tudo em CSV', p: 'Contas, categorias, movimentos e créditos saem da app como ficheiros CSV simples, que abrem em qualquer folha de cálculo. Os mesmos ficheiros voltam a importar-se, por isso uma cópia de segurança é uma restauração completa.' },
        { eyebrow: 'Retificação', h: 'Edite qualquer registo, a qualquer momento', p: 'Nada fica bloqueado depois de guardar. Altere um movimento, uma conta ou um orçamento e todos os valores que deles dependem acompanham.' },
        { eyebrow: 'Apagamento', h: 'Reposição de fábrica, e desaparece', p: 'Elimine um registo ou apague tudo nas definições. Como não existe cópia noutro lado, ninguém, nem nós, o consegue recuperar. Guarde bem as suas cópias CSV.' }
      ]
    },
    studio: {
      eyebrow: 'O estúdio',
      body: [
        "O Stack'd Development Studio é um estúdio de software independente. Fazemos o Stack'd e construímo-lo como gostaríamos que as nossas próprias ferramentas fossem construídas: calculado no dispositivo, exportado em formatos que se abrem em qualquer lado e acabado até à tipografia.",
        'A maioria das apps de finanças pede os acessos ao seu banco no primeiro dia e paga-se com os seus dados. Achamos que uma app para controlar as contas deve ser um caderno privado com muito boa aritmética, e é isso que fazemos.'
      ],
      principles: [
        { b: 'Primeiro o local', p: 'Cada funcionalidade, incluindo a importação de extratos e os planos de amortização, corre no telemóvel, offline. A ligação bancária opcional reencaminha os movimentos através de um servidor na UE que não guarda nenhum.' },
        { b: 'Números honestos', p: 'Os saldos são calculados a partir dos movimentos, nunca guardados. As contas dos créditos fazem-se em cêntimos inteiros, por isso um plano de amortização bate certo ao cêntimo.' },
        { b: 'Formatos abertos', p: 'Exportação e importação CSV de tudo, mais as normas bancárias camt.053 e MT940. Os seus dados nunca ficam presos.' },
        { b: 'Trabalho acabado', p: 'Cinco idiomas, claro e escuro, Android e iOS nativos. Os pequenos detalhes, como a área segura do ecrã e a posição do scroll, recebem o mesmo cuidado que os grandes.' }
      ]
    },
    contact: { h: 'Perguntas, ideias, um erro?', p: 'Escreva-nos. O seu email é usado apenas para lhe responder e nunca entra numa lista.' }
  },

  support: {
    title: "Apoio · Stack'd",
    description: "Ajuda para o Stack'd: primeiros passos, cópias de segurança, importação de extratos bancários, compras e Bank Connect, e como contactar o estúdio.",
    eyebrow: "Stack'd · Apoio",
    h1: 'Como podemos ajudar?',
    lede: 'A app tem o seu próprio Manual do utilizador e FAQ: toque no botão + e depois em Outros e definições. As perguntas mais comuns têm resposta abaixo. Para tudo o resto, escreva para {email} e uma pessoa responderá.',
    status: {
      h: 'Estado do serviço',
      p: "Tudo a funcionar normalmente. O Stack'd funciona offline, por isso a app continua a funcionar aconteça o que acontecer aqui; só a Banca online depende do nosso servidor. Se algo correr mal, publicamo-lo nesta linha."
    },
    tips: [
      { h: 'Faça uma cópia antes de mudar de telemóvel', p: "O Stack'd não guarda cópias dos seus dados em lado nenhum além do seu dispositivo. Antes de desinstalar a app ou de mudar para um telemóvel novo, exporte os ficheiros CSV em Outros e definições e importe-os no novo dispositivo." },
      { h: 'Não conseguimos recuperar dados perdidos', p: 'Não há conta de utilizador nem cópia dos seus dados em nenhum servidor, por isso não conseguimos restaurar nada. Se tiver uma exportação CSV, Importar CSV em Outros e definições recupera tudo, incluindo contas e categorias.' },
      { h: 'Comunicar um erro', p: 'Envie-nos a versão da app (indicada em Outros e definições), o modelo do telemóvel e o que esperava que acontecesse. Nunca envie um extrato bancário verdadeiro; descreva antes o formato.' }
    ],
    faqH: 'Perguntas frequentes',
    faq: [
      { q: 'Como crio uma conta?', a: 'Toque no botão + na barra inferior e escolha <b>Adicionar conta</b>, ou use o bloco Adicionar wallet no fim da fila de contas do painel. Dê-lhe um nome, um ícone e um saldo inicial. A partir daí o saldo é sempre calculado a partir dos seus movimentos, por isso mantém-se sincronizado automaticamente.' },
      { q: 'Como adiciono um novo movimento?', a: 'Toque no botão + e escolha <b>Adicionar movimento</b>. Selecione Despesa, Receita ou Transferência e depois introduza o montante, a data, a conta e a categoria. Também pode adicionar uma nota e etiquetas, ou ativar a recorrência (diária, semanal, mensal…).' },
      { q: 'Como edito ou elimino um movimento?', a: 'Abra o <b>Histórico</b> (o ícone de lista na barra inferior) e toque num movimento para o abrir no editor. Altere o que precisar e guarde, ou use Eliminar. Se o movimento fizer parte de uma série recorrente, ser-lhe-á perguntado se a alteração se aplica apenas a este, a este e aos seguintes, ou a toda a série.' },
      { q: 'Como importo um extrato bancário?', a: "Vá a Outros e definições e escolha <b>Importar CSV</b>. O Stack'd aceita as suas próprias cópias CSV e qualquer extrato bancário em formato CSV, camt.053 (ISO 20022) ou MT940. Um ecrã de revisão mostra o que vai ser adicionado, o que já está registado e que linhas são transferências entre as suas próprias contas, antes de guardar o que quer que seja." },
      { q: 'Como configuro os widgets do painel?', a: 'No painel, desça até à secção <b>Widgets</b>. Toque em <b>Adicionar</b> para escolher um widget da galeria e o seu tamanho. Toque em <b>Editar</b> para reordenar, redimensionar, configurar ou remover widgets, e depois toque em Concluído quando a disposição lhe agradar.' },
      { q: 'Como crio um crédito?', a: 'Toque no botão + e escolha <b>Dívidas</b>. Selecione um tipo de crédito para abrir o simulador, introduza o montante, a taxa e a duração, e consulte o plano de amortização completo. Pode mantê-lo como simulação ou acompanhá-lo como crédito ativo. O acompanhamento liga-o a uma despesa recorrente, por isso o progresso atualiza-se automaticamente à medida que regista as prestações.' },
      { q: 'Como faço a gestão das categorias?', a: "Vá a <b>Outros → Categorias</b> para ver todas as suas categorias, ou toque numa categoria para ver a sua atividade ou editar o nome, o ícone e a cor. O Stack'd inclui um conjunto predefinido, que é o do plano gratuito. Criar categorias suas faz parte do Stack'd Pro; com o Pro desbloqueado, faz-se no botão + e depois em <b>Adicionar categoria</b>." },
      { q: 'Como uso as etiquetas?', a: 'As etiquetas são textos livres que escreve no campo <b>Etiquetas</b> ao criar ou editar um movimento. O preenchimento automático sugere as que já usa. Consulte-as em <b>Outros → Etiquetas</b>, ou filtre o Histórico por etiqueta para ver tudo o que a tem.' },
      { q: 'Posso mudar o idioma ou a moeda?', a: 'Sim, ambos estão em Outros e definições. A interface está disponível em inglês, francês, italiano, espanhol e português e muda de imediato. Cada conta pode ter a sua própria moeda; as contas numa moeda diferente da principal são mostradas à parte, sem conversão.' },
      { q: 'Como apago todos os meus dados?', a: 'Em Outros e definições, na Zona de risco, há a Reposição de fábrica, que apaga para sempre todas as contas, orçamentos e movimentos. Desinstalar a app tem o mesmo efeito. Isto abrange tudo o que regista, porque fica guardado apenas no seu dispositivo. Se usou o Bank Connect, desligue primeiro cada banco ligado: isso apaga o registo da ligação no servidor. Para tudo o que diga respeito a esses registos e que a app não consiga fazer sozinha, escreva para {email}.' }
    ],
    buyH: 'Compras e Bank Connect',
    buy: [
      { q: 'O que é grátis e o que é pago?', a: "O Stack'd é grátis, com duas compras opcionais. O plano gratuito dá-lhe até duas contas e as categorias que vêm com a app; tudo o resto, dos movimentos recorrentes ao simulador de crédito, à importação de extratos, aos widgets e à exportação CSV, está incluído. O <b>Stack'd Pro</b> é uma compra única que elimina esses dois limites. O <b>Bank Connect</b>, a ligação bancária opcional, é uma subscrição. Os dois preços são mostrados na app antes de comprar, na sua moeda." },
      { q: "O que desbloqueia o Stack'd Pro?", a: 'Todas as contas de que precisar e categorias suas. É cobrado uma só vez pelo Google Play ou pela App Store através da sua conta da loja; não é uma subscrição e nunca se renova. No plano gratuito nada do que já registou é alguma vez escondido ou apagado, só fica limitado criar mais, por isso desbloquear o Pro mais tarde não muda nada nos seus dados.' },
      { q: "Comprei o Stack'd Pro. Como o recupero num telemóvel novo?", a: 'Abra <b>Outros e definições → Compras na app</b> e toque em <b>Restaurar compra</b>. Qualquer dispositivo com a mesma conta Google ou Apple que fez a compra recupera o desbloqueio, sem custos adicionais. Os seus dados não viajam com a compra: mude-os com uma exportação e uma importação CSV, como descrito acima.' },
      { q: 'Como cancelo a subscrição do Bank Connect?', a: "Na sua loja, não no Stack'd. No Android, Google Play → o seu perfil → <b>Pagamentos e subscrições → Subscrições</b>. No iPhone, Definições → o seu nome → <b>Subscrições</b>. O período em curso vai até ao fim, e as atualizações param nessa altura." },
      { q: 'Posso pedir um reembolso?', a: 'Os reembolsos dos dois produtos são tratados pela loja que recebeu o pagamento, segundo as suas próprias regras: o Google Play ou a App Store. Não os podemos emitir nós, porque o dinheiro nunca passa por nós. Se algo estiver mal na app, escreva-nos na mesma e vamos tentar resolver.' },
      { q: 'O que acontece às minhas ligações bancárias se deixar de pagar?', a: 'As atualizações param assim que a subscrição termina. As suas ligações são mantidas durante 14 dias, para que uma renovação continue onde ficou; depois são revogadas e os respetivos registos no servidor são apagados. Os movimentos já importados ficam na app, no seu dispositivo, tal como estavam.' },
      { q: 'Como desligo um banco?', a: "Abra <b>Outros e definições → Banca online</b> e toque em <b>Desligar</b> ao lado do banco. Isso revoga o acesso no seu banco e apaga o registo da ligação no servidor do Stack'd. Os movimentos já importados são seus e ficam na app." }
    ],
    still: { h: 'Ainda com dúvidas?', p: 'Escreva-nos. O seu email é usado apenas para lhe responder e nunca entra numa lista.' }
  },

  notFound: {
    title: "Página não encontrada · Stack'd",
    h1: 'Esta página não está no livro de registos.',
    lede: 'O endereço pode ter um erro, ou a página mudou de sítio.',
    back: 'Voltar ao início'
  },

  legal: {
    termsTitle: 'Termos de utilização', privacyTitle: 'Política de privacidade',
    seeTerms: 'Ver também os Termos de utilização', seePrivacy: 'Ver também a Política de privacidade',
    metaTerms: "Os termos ao abrigo dos quais lhe é licenciado o Stack'd, o gestor de finanças pessoais que põe a privacidade em primeiro lugar.",
    metaPrivacy: "O Stack'd guarda o seu dinheiro no seu telemóvel. A única exceção é o Bank Connect, uma funcionalidade opcional que ativa por si; esta política explica exatamente o que é enviado e o que é conservado.",
    website: {
      h: 'Este site',
      d: 'Este site é um conjunto de páginas estáticas. Não usa cookies, não executa análises nem incorpora scripts de terceiros. Quando chega a partir de outro site, lê o idioma pedido pelo seu navegador para abrir a página nesse idioma; nada disso é guardado. O nosso fornecedor de alojamento pode manter registos de servidor normais e de curta duração (endereço IP, página pedida), como qualquer alojamento web.'
    }
  }
};
