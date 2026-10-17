// The animated home-page title (docs/site-hero-animation-plan.md), shared by
// pages.cjs (the site) and hero-render.cjs (the scene and its frames).
//
// heroTitle(h1) turns a title string from strings/<lang>.cjs, where an <em>
// marks the accent phrase, into the <h1> the motion CSS animates:
//
//   <h1 aria-label="Money tracking that stays on your phone." style="--n:7">
//     <span aria-hidden="true">
//       <span class="w" style="--i:0">Money</span> … <em>… <span class="w" style="--i:6">phone</span></em>⁠<span class="w" style="--i:6">.</span>
//     </span>
//   </h1>
//
// - One span per word, never per letter: Manrope's kerning and the accents
//   stay intact. --i is the word's place in the stagger, --n the word count.
// - Punctuation glued to a word across the </em> ("phone</em>.") gets its own
//   span with the same --i, so it rises with its word, and a WORD JOINER
//   (U+2060) in front, so a line can never break before it.
// - The heading is named by aria-label and the spans are aria-hidden: a
//   screen reader hears one sentence, and the text stays in the page.
const { attr } = require('./layout.cjs');

const WJ = '&#8288;';

function heroTitle(h1) {
  const m = /^([^<]*)(?:<em>([^<]*)<\/em>([^<]*))?$/.exec(h1);
  if (!m) throw new Error(`hero title: only one <em>…</em> is allowed, and no other markup: ${h1}`);
  const parts = [{ text: m[1], em: false }];
  if (m[2] !== undefined) parts.push({ text: m[2], em: true }, { text: m[3], em: false });

  let i = -1;
  let out = '';
  let pending = ''; // whitespace waiting to be written before the next word
  let glue = false; // the next word follows the previous one with no space
  for (const part of parts) {
    let first = true;
    for (const tok of part.text.split(/(\s+)/)) {
      if (!tok) continue;
      if (/^\s+$/.test(tok)) { pending = ' '; glue = false; continue; }
      if (pending || i < 0) i++;
      out += pending + (glue && !pending ? WJ : '');
      if (part.em && first) out += '<em>';
      out += `<span class="w" style="--i:${i}">${tok}</span>`;
      pending = '';
      glue = true;
      first = false;
    }
    if (part.em && !first) out += '</em>';
  }
  const plain = h1.replace(/<[^>]+>/g, '');
  return `<h1 aria-label="${attr(plain)}" style="--n:${i + 1}"><span aria-hidden="true">${out}</span></h1>`;
}

module.exports = { heroTitle };
