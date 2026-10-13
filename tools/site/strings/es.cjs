// Marketing-site copy, Spanish. Same keys as en.cjs (see its header).
// UI names follow src/i18n/es.js: Otros y ajustes, Añadir movimiento,
// Historial, Objetivos, Deudas, panel, tú.
module.exports = {
  name: 'Español',
  ogLocale: 'es_ES',
  menu: { label: 'Idioma' },
  brandLabel: "Stack'd Development Studio, inicio",
  nav: { label: 'Sitio', app: 'La app', privacy: 'Privacidad', studio: 'El estudio', support: 'Soporte', get: 'Descargar' },
  footer: {
    label: 'Legal', privacy: 'Política de privacidad', terms: 'Términos de uso', support: 'Soporte', contact: 'Contacto',
    trademark: "Google Play y el logotipo de Google Play son marcas de Google LLC. Stack'd no está afiliado, respaldado ni certificado por ningún banco ni entidad financiera."
  },
  ogAlt: "Stack'd en un teléfono, con el saldo total y las tarjetas de las cuentas, junto al titular (en inglés): el control de tu dinero que nunca sale de tu teléfono.",

  home: {
    title: "Stack'd Development Studio",
    description: "Stack'd Development Studio crea Stack'd, una app de finanzas personales que pone la privacidad primero. Sin cuentas de usuario y sin rastreo: cada cuenta, movimiento y presupuesto se queda en tu dispositivo, y lo único que se conecta a internet es el enlace bancario que puedes decidir activar.",
    hero: {
      eyebrow: "Stack'd · finanzas personales",
      h1: 'Tu dinero bajo control, sin salir de tu teléfono.',
      lede: "Stack'd guarda cada cuenta, cada movimiento y cada presupuesto en tu dispositivo. No hay cuenta de usuario que crear ni nube con la que sincronizar. Lo único que se conecta a internet es el enlace bancario que puedes decidir activar, y te muestra cada movimiento antes de guardarlo.",
      play: 'Disponible en Google Play',
      ios: 'Versión para iPhone en camino',
      facts: ['<b>0</b> cuentas de usuario o rastreadores', '<b>5</b> idiomas', '<b>CSV</b> de entrada y salida, siempre'],
      imgAlt: "Panel de Stack'd: saldo total de €28.088,91, gráfico del saldo, tarjetas de las cuentas Banco principal y Ahorros, y smart insights."
    },
    app: {
      eyebrow: 'Qué incluye',
      h2: 'Construida desde el libro de cuentas.',
      intro: "En Stack'd, un saldo nunca es un número que alguien escribió. Es la suma de los movimientos que lo forman, recalculada cada vez, así que lo que ves siempre coincide con lo que registraste.",
      items: [
        { h: 'Cuentas y movimientos', p: "Banco, tarjeta, efectivo, ahorros, tarjeta de crédito, inversión: dos cuentas con el plan gratuito, tantas como tengas en la vida real con Stack'd Pro, cada una en su propia moneda. Registra un gasto, un ingreso o una transferencia entre dos cuentas en pocos toques, con una nota y etiquetas." },
        { h: 'Movimientos recurrentes', p: 'Alquiler, nómina, suscripciones: define la frecuencia una vez y toda la serie queda escrita de antemano. Edita una sola repetición, esta y las siguientes, o la serie entera.' },
        { h: 'Objetivos', p: 'Un presupuesto mensual por categoría. La pestaña Objetivos muestra lo que ya has gastado, lo que aún comprometen los movimientos recurrentes y cómo acabará el mes, no solo cómo va hoy.' },
        { h: 'Simulador de préstamos', p: 'Introduce un importe, un tipo de interés y una duración y consulta el cuadro de amortización completo: cada cuota, su parte de intereses y el capital pendiente. Vincula un préstamo a su pago recurrente y el progreso se sigue solo.' },
        { h: 'Importación de extractos bancarios', p: "Sube un extracto en <code>CSV</code>, <code>camt.053</code> o <code>MT940</code>. Stack'd asigna las columnas, omite lo que ya registraste, empareja las transferencias entre tus propias cuentas y muestra una revisión antes de guardar nada. El archivo nunca se conserva." },
        { h: 'Widgets y smart insights', p: 'Compón el panel con ocho tipos de widget: últimos movimientos, ingresos frente a gastos, categorías principales, presupuestos, tasa de ahorro, 50/30/20 y más. Los smart insights señalan qué ha cambiado este mes, con una línea cada uno.' }
      ]
    },
    pricing: {
      eyebrow: 'Lo que cuesta',
      h2: 'Gratis para usar, dos cosas para comprar.',
      intro: 'No alquilamos nada y nada caduca. El plan gratuito es la app completa a menor escala; los dos productos de pago se muestran, con su precio, dentro de la app antes de comprar.',
      items: [
        { h: 'Gratis', p: 'Hasta dos cuentas y las categorías que trae la app. Todo lo demás está incluido: movimientos recurrentes, objetivos, simulador de préstamos, importación de extractos, widgets, exportación e importación CSV, cinco idiomas, tema claro y oscuro.' },
        { h: "Stack'd Pro", p: "Una compra única, cobrada una sola vez por Google o Apple al precio que muestra la app. Quita para siempre los dos límites del plan gratuito: todas las cuentas que necesites y tus propias categorías. No es una suscripción, nunca se renueva y puedes restaurarla en cualquier dispositivo con la misma cuenta de la tienda." },
        { h: 'Bank Connect', p: "El enlace bancario opcional es una suscripción, cobrada por la tienda al precio que muestra la app y cancelable en cualquier momento desde los ajustes de suscripciones de tu tienda. Todo lo demás en Stack'd funciona sin él, y los extractos que importes por archivo siempre funcionarán." }
      ]
    },
    screens: {
      eyebrow: 'Las pantallas',
      h2: 'Tranquila por diseño.',
      intro: 'Poco color, números grandes, una cosa por pantalla. Tema claro y oscuro, y la interfaz en inglés, francés, italiano, español o portugués.',
      items: [
        { alt: 'Pantalla Historial con los movimientos agrupados por día, con importes, categorías y cuentas.', title: 'Historial', caption: 'Cada movimiento, filtrable por cuenta, categoría, etiqueta y periodo.' },
        { alt: "Resultado de un préstamo: €18.000 al 4,05 % a 5 años dan una cuota mensual de €331,90, €1914,23 de intereses totales, 60 cuotas.", title: 'Deudas', caption: 'Simula un préstamo antes de firmarlo y luego sigue el real.' },
        { alt: 'El mismo panel con el tema claro.', title: 'Claro y oscuro', caption: 'Elige un tema o deja que siga al sistema.' }
      ]
    },
    privacy: {
      eyebrow: 'Privacidad',
      h2: 'No sale nada, salvo que tú lo decidas.',
      intro: 'La app funciona sin conexión y la única copia de tus datos es la de tu dispositivo. La única excepción es el enlace bancario que activas tú, y te muestra cada movimiento antes de guardarlo. Esta es la lista de nuestra <a href="{privacy}">política de privacidad</a>.',
      listLabel: 'Lo que la app no hace',
      nots: [
        'Sin cuentas de usuario ni registro',
        'Sin sincronización en la nube de tus datos',
        'Sin subir los archivos importados',
        'Sin analíticas ni seguimiento de uso',
        'Sin publicidad ni identificadores publicitarios',
        'Sin compartir datos más allá del enlace bancario opcional'
      ],
      rights: [
        { eyebrow: 'Acceso y portabilidad', h: 'Exporta todo en CSV', p: 'Cuentas, categorías, movimientos y préstamos salen de la app como archivos CSV sencillos que se abren en cualquier hoja de cálculo. Los mismos archivos se vuelven a importar, así que una copia de seguridad es una restauración completa.' },
        { eyebrow: 'Rectificación', h: 'Edita cualquier registro, cuando quieras', p: 'Nada queda bloqueado después de guardar. Cambia un movimiento, una cuenta o un presupuesto y cada cifra que depende de ellos se actualiza.' },
        { eyebrow: 'Supresión', h: 'Restablece y desaparece', p: 'Elimina un registro o bórralo todo desde los ajustes. Como no existe ninguna copia en otro sitio, nadie, ni siquiera nosotros, puede recuperarlo. Guarda bien tus copias CSV.' }
      ]
    },
    studio: {
      eyebrow: 'El estudio',
      body: [
        "Stack'd Development Studio es un estudio de software independiente. Hacemos Stack'd y lo construimos como querríamos que se construyeran nuestras propias herramientas: calculado en el dispositivo, exportado en formatos que se abren en cualquier parte y cuidado hasta la tipografía.",
        'La mayoría de las apps de finanzas te piden el acceso a tu banco el primer día y se pagan con tus datos. Creemos que una app para llevar las cuentas debería ser una libreta privada con muy buena aritmética, y eso es lo que hacemos.'
      ],
      principles: [
        { b: 'Primero lo local', p: 'Cada función, incluida la importación de extractos y los cuadros de amortización, se ejecuta en el teléfono, sin conexión. El enlace bancario opcional reenvía los movimientos a través de un servidor en la UE que no guarda ninguno.' },
        { b: 'Números honestos', p: 'Los saldos se calculan a partir de los movimientos, nunca se guardan. Los cálculos de préstamos se hacen en céntimos enteros, así que un cuadro de amortización cuadra al céntimo.' },
        { b: 'Formatos abiertos', p: 'Exportación e importación CSV de todo, más los estándares bancarios camt.053 y MT940. Tus datos nunca quedan atrapados.' },
        { b: 'Trabajo acabado', p: 'Cinco idiomas, claro y oscuro, Android e iOS nativos. Los detalles pequeños, como el área segura de la pantalla y la posición del desplazamiento, reciben el mismo cuidado que los grandes.' }
      ]
    },
    contact: { h: '¿Preguntas, ideas, un error?', p: 'Escríbenos. Tu correo solo se usa para responderte y nunca entra en una lista.' }
  },

  support: {
    title: "Soporte · Stack'd",
    description: "Ayuda para Stack'd: primeros pasos, copias de seguridad, importación de extractos bancarios, compras y Bank Connect, y cómo contactar con el estudio.",
    eyebrow: "Stack'd · Soporte",
    h1: '¿En qué podemos ayudarte?',
    lede: 'La app incluye su propio Manual de usuario y sus Preguntas frecuentes: toca el botón + y luego Otros y ajustes. Abajo respondemos las dudas más comunes. Para cualquier otra cosa, escribe a {email} y te responderá una persona.',
    status: {
      h: 'Estado del servicio',
      p: "Todo funciona con normalidad. Stack'd funciona sin conexión, así que la app sigue funcionando pase lo que pase aquí; solo la Banca en línea depende de nuestro servidor. Si algo falla, lo publicamos en esta línea."
    },
    tips: [
      { h: 'Haz una copia antes de cambiar de teléfono', p: "Stack'd no guarda ninguna copia de tus datos fuera de tu dispositivo. Antes de desinstalar la app o pasarte a un teléfono nuevo, exporta tus archivos CSV desde Otros y ajustes e impórtalos en el nuevo dispositivo." },
      { h: 'No podemos recuperar datos perdidos', p: 'No hay cuenta de usuario ni copia de tus datos en ningún servidor, así que no podemos restaurar nada. Si tienes una exportación CSV, Importar CSV en Otros y ajustes lo recupera todo, cuentas y categorías incluidas.' },
      { h: 'Informar de un error', p: 'Envíanos la versión de la app (aparece en Otros y ajustes), el modelo de tu teléfono y lo que esperabas que pasara. Nunca envíes un extracto bancario real; describe su formato.' }
    ],
    faqH: 'Preguntas frecuentes',
    faq: [
      { q: '¿Cómo creo una cuenta?', a: 'Toca el botón + en la barra inferior y elige <b>Añadir cuenta</b>, o usa el bloque Añadir wallet al final de la fila de cuentas del panel. Dale un nombre, un icono y un saldo inicial. A partir de ahí el saldo siempre se calcula a partir de tus movimientos, así que se mantiene sincronizado automáticamente.' },
      { q: '¿Cómo añado un movimiento nuevo?', a: 'Toca el botón + y elige <b>Añadir movimiento</b>. Selecciona Gasto, Ingreso o Transferencia, y luego introduce el importe, la fecha, la cuenta y la categoría. También puedes añadir una nota y etiquetas, o activar la recurrencia (diaria, semanal, mensual…).' },
      { q: '¿Cómo edito o elimino un movimiento?', a: 'Abre el <b>Historial</b> (el icono de lista en la barra inferior) y toca cualquier movimiento para abrirlo en el editor. Cambia lo que necesites y guarda, o usa Eliminar. Si el movimiento forma parte de una serie recurrente, se te preguntará si el cambio se aplica solo a este, a este y a los siguientes, o a toda la serie.' },
      { q: '¿Cómo importo un extracto bancario?', a: "Ve a Otros y ajustes y elige <b>Importar CSV</b>. Stack'd acepta sus propias copias CSV y cualquier extracto bancario en formato CSV, camt.053 (ISO 20022) o MT940. Una pantalla de revisión muestra lo que se añadirá, lo que ya está registrado y qué filas son transferencias entre tus propias cuentas, antes de guardar nada." },
      { q: '¿Cómo configuro los widgets del panel?', a: 'En el panel, baja hasta la sección <b>Widgets</b>. Toca <b>Añadir</b> para elegir un widget de la galería y su tamaño. Toca <b>Editar</b> para reordenar, redimensionar, configurar o quitar widgets, y luego toca Listo cuando la disposición te convenza.' },
      { q: '¿Cómo creo un préstamo?', a: 'Toca el botón + y elige <b>Deudas</b>. Selecciona un tipo de préstamo para abrir el simulador, introduce el importe, el tipo de interés y la duración, y revisa el cuadro de amortización completo. Puedes dejarlo como simulación o hacerle seguimiento como préstamo activo. El seguimiento lo vincula a un gasto recurrente, así que tu progreso se actualiza automáticamente según registras las cuotas.' },
      { q: '¿Cómo gestiono las categorías?', a: "Ve a <b>Otros → Categorías</b> para ver todas tus categorías, o toca una categoría para ver su actividad o editar su nombre, icono y color. Stack'd incluye un conjunto por defecto, que es el del plan gratuito. Crear tus propias categorías forma parte de Stack'd Pro; con Pro desbloqueado, se hace desde el botón + y luego <b>Añadir categoría</b>." },
      { q: '¿Cómo uso las etiquetas?', a: 'Las etiquetas son textos libres que escribes en el campo <b>Etiquetas</b> al crear o editar un movimiento. El autocompletado sugiere las que ya usas. Explóralas en <b>Otros → Etiquetas</b>, o filtra el Historial por etiqueta para ver todo lo que la lleva.' },
      { q: '¿Puedo cambiar el idioma o la moneda?', a: 'Sí, ambos están en Otros y ajustes. La interfaz está disponible en inglés, francés, italiano, español y portugués y cambia al instante. Cada cuenta puede tener su propia moneda; las cuentas en una moneda distinta de la principal se muestran aparte, sin convertir.' },
      { q: '¿Cómo borro todos mis datos?', a: 'En Otros y ajustes, dentro de la Zona de riesgo, está Restablecer de fábrica, que borra para siempre cada cuenta, presupuesto y movimiento. Desinstalar la app hace lo mismo. Eso cubre todo lo que registras, porque solo se guarda en tu dispositivo. Si has usado Bank Connect, desconecta antes cada banco vinculado: así se borra el registro del enlace en el servidor. Para cualquier cosa sobre esos registros que la app no pueda hacer por sí misma, escribe a {email}.' }
    ],
    buyH: 'Compras y Bank Connect',
    buy: [
      { q: '¿Qué es gratis y qué es de pago?', a: "Stack'd es gratis, con dos compras opcionales. El plan gratuito te da hasta dos cuentas y las categorías que trae la app; todo lo demás, desde los movimientos recurrentes hasta el simulador de préstamos, la importación de extractos, los widgets y la exportación CSV, está incluido. <b>Stack'd Pro</b> es una compra única que quita esos dos límites. <b>Bank Connect</b>, el enlace bancario opcional, es una suscripción. Ambos precios se muestran en la app antes de comprar, en tu moneda." },
      { q: "¿Qué desbloquea Stack'd Pro?", a: 'Todas las cuentas que necesites y tus propias categorías. Se cobra una sola vez a través de Google Play o el App Store con tu cuenta de la tienda; no es una suscripción y nunca se renueva. Con el plan gratuito nunca se oculta ni se borra nada de lo que ya has registrado, solo se limita crear más, así que desbloquear Pro más adelante no cambia nada de tus datos.' },
      { q: "Compré Stack'd Pro. ¿Cómo lo recupero en un teléfono nuevo?", a: 'Abre <b>Otros y ajustes → Compras en la app</b> y toca <b>Restaurar compra</b>. Cualquier dispositivo con la misma cuenta de Google o Apple que hizo la compra recupera el desbloqueo, sin coste adicional. Tus datos no viajan con la compra: muévelos con una exportación y una importación CSV, como se explica arriba.' },
      { q: '¿Cómo cancelo la suscripción a Bank Connect?', a: "En tu tienda, no en Stack'd. En Android, Google Play → tu perfil → <b>Pagos y suscripciones → Suscripciones</b>. En iPhone, Ajustes → tu nombre → <b>Suscripciones</b>. El periodo en curso dura hasta su final, y las actualizaciones se detienen entonces." },
      { q: '¿Puedo pedir un reembolso?', a: 'Los reembolsos de ambos productos los gestiona la tienda que cobró el pago, según sus propias normas: Google Play o el App Store. No podemos emitirlos nosotros, porque el dinero nunca pasa por nosotros. Si algo va mal en la app, escríbenos igualmente e intentaremos arreglarlo.' },
      { q: '¿Qué pasa con mis enlaces bancarios si dejo de pagar?', a: 'Las actualizaciones se detienen en cuanto termina la suscripción. Tus conexiones se conservan 14 días para que, si renuevas, sigas donde lo dejaste; después se revocan y se borran sus registros en el servidor. Los movimientos ya importados se quedan en la app, en tu dispositivo, tal como estaban.' },
      { q: '¿Cómo desconecto un banco?', a: "Abre <b>Otros y ajustes → Banca en línea</b> y toca <b>Desconectar</b> junto al banco. Así se revoca el acceso en tu banco y se borra el registro del enlace en el servidor de Stack'd. Los movimientos ya importados son tuyos y se quedan en la app." }
    ],
    still: { h: '¿Sigues atascado?', p: 'Escríbenos. Tu correo solo se usa para responderte y nunca entra en una lista.' }
  },

  notFound: {
    title: "Página no encontrada · Stack'd",
    h1: 'Esta página no está en el libro de cuentas.',
    lede: 'Puede que la dirección esté mal escrita o que la página se haya movido.',
    back: 'Volver al inicio'
  },

  legal: {
    termsTitle: 'Términos de uso', privacyTitle: 'Política de privacidad',
    seeTerms: 'Consulta también los Términos de uso', seePrivacy: 'Consulta también la Política de privacidad',
    metaTerms: "Los términos bajo los que se te licencia Stack'd, el gestor de finanzas personales centrado en la privacidad.",
    metaPrivacy: "Stack'd guarda tu dinero en tu teléfono. La única excepción es Bank Connect, una función opcional que activas tú; esta política explica exactamente qué se envía y qué se conserva.",
    website: {
      h: 'Este sitio web',
      d: 'Este sitio web es un conjunto de páginas estáticas. No usa cookies, no ejecuta analíticas ni incrusta scripts de terceros. Cuando llegas desde otro sitio, lee el idioma que pide tu navegador para abrir la página en ese idioma; no se guarda nada de ello. Nuestro proveedor de alojamiento puede conservar registros de servidor estándar y de corta duración (dirección IP, página solicitada), como cualquier alojamiento web.'
    }
  }
};
