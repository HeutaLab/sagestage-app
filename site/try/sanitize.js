/* Sage Stage — one sanitizer for stored rich text.
   The Text widget's content is real HTML, and it arrives from three places:
   the teacher typing into a contenteditable, a .pptx import, and a shared
   template or a restored backup — which is a stranger's file. `innerHTML`
   runs an `onerror` handler without needing a <script> tag, and this app's
   one origin holds every deck and every class list of children's names, so
   every path that puts stored html on a screen comes through here. */
(function () {
  'use strict';

  // What a text widget's content can legitimately hold: the tags the
  // formatting toolbar's execCommands emit (b/i/u/strike, font, span, lists,
  // a), the ones the built-in templates use (b, div), and the ones a .pptx
  // import builds (div/span/a/br carrying inline styles).
  const OK_TAGS = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'DIV', 'EM', 'FONT',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'I', 'LI', 'MARK', 'OL',
    'P', 'PRE', 'S', 'SMALL', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP',
    'U', 'UL',
  ]);

  // Removed with everything inside them. Anything else unrecognised is
  // unwrapped instead — a stranger's <foo>word</foo> should cost the tag and
  // keep the word — but these hold code, CSS or a network request, and
  // unwrapping one would paint its source on the board as text.
  const KILL_TAGS = new Set([
    'APPLET', 'AREA', 'AUDIO', 'BASE', 'BUTTON', 'CANVAS', 'DIALOG', 'EMBED',
    'FORM', 'FRAME', 'FRAMESET', 'IFRAME', 'IMG', 'INPUT', 'LINK', 'MAP',
    'MARQUEE', 'MATH', 'META', 'NOSCRIPT', 'OBJECT', 'OPTION', 'PICTURE',
    'PORTAL', 'SCRIPT', 'SELECT', 'SOURCE', 'STYLE', 'SVG', 'TEMPLATE',
    'TEXTAREA', 'TITLE', 'VIDEO',
  ]);

  // Per-tag attribute allow-list. `style` is allowed on everything and
  // filtered by property below; every event handler is absent from every
  // list, which is the whole point — `onerror` is the attack, not <script>.
  const OK_ATTRS = {
    A: ['href', 'target', 'rel', 'title'],
    FONT: ['color', 'face', 'size'],
    OL: ['start'],
  };

  // Formatting properties only. Nothing here can position an element over the
  // app's own chrome, and nothing here takes a url().
  const OK_CSS = new Set([
    'background-color', 'color', 'font-family', 'font-size', 'font-style',
    'font-variant', 'font-weight', 'letter-spacing', 'line-height',
    'margin-left', 'padding-left', 'text-align', 'text-decoration',
    'text-decoration-color', 'text-decoration-line', 'text-indent',
    'text-transform', 'vertical-align', 'white-space', 'word-spacing',
  ]);

  const SAFE_SCHEME = /^(?:https?:|mailto:)/i;

  // A URL the app is willing to follow, or '' — used for hrefs inside stored
  // html and by the widgets that take a URL from a teacher or a template.
  // The scheme is tested against a stripped copy, because a scheme can hide
  // behind whitespace and control characters: "java\tscript:" is one the
  // parser accepts and a naive regex walks straight past.
  function url(raw) {
    const s = String(raw == null ? '' : raw);
    const bare = s.replace(/[\u0000-\u0020\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g, '');
    return SAFE_SCHEME.test(bare) ? s.trim() : '';
  }

  // A style attribute, reduced to the declarations that only change how words
  // look. url() is how a style attribute reaches the network and a backslash
  // is how a value hides one; braces and angle brackets are how a value tries
  // to leave the attribute. Parentheses stay legal — foreColor writes
  // `color: rgb(15, 23, 42)`.
  function style(css) {
    const out = [];
    for (const decl of String(css == null ? '' : css).split(';')) {
      const i = decl.indexOf(':');
      if (i < 1) continue;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).trim();
      if (!val || !OK_CSS.has(prop)) continue;
      if (/url\(|expression|@import|\\|\/\*|[<>{}]/i.test(val)) continue;
      out.push(prop + ':' + val);
    }
    return out.join(';');
  }

  function unwrap(node) {
    const parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
  }

  // Stored html, cleaned for a live document. DOMParser is what makes this
  // safe to do at all: the document it returns is inert, so the <img> in
  // `<img src=x onerror=…>` is examined without ever being loaded. A detached
  // div + innerHTML — the obvious way to write this — fires the handler.
  function html(dirty) {
    const src = String(dirty == null ? '' : dirty);
    if (!src) return '';
    const body = new DOMParser().parseFromString(src, 'text/html').body;
    if (!body) return '';
    for (const node of Array.from(body.querySelectorAll('*'))) {
      if (!body.contains(node)) continue; // an ancestor already took it
      const tag = node.tagName;
      if (KILL_TAGS.has(tag)) { node.remove(); continue; }
      if (!OK_TAGS.has(tag)) { unwrap(node); continue; }
      const allowed = OK_ATTRS[tag];
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (name === 'style') {
          const s = style(attr.value);
          if (s) node.setAttribute('style', s);
          else node.removeAttribute('style');
          continue;
        }
        if (!allowed || allowed.indexOf(name) < 0) { node.removeAttribute(name); continue; }
        if (name === 'href') {
          const u = url(attr.value);
          if (u) node.setAttribute('href', u);
          else node.removeAttribute('href');
        }
      }
      // a link tapped on the board opens away from the app, and cannot hold a
      // handle back to the window it came from
      if (tag === 'A' && node.hasAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    return body.innerHTML;
  }

  // The words only, for the two readers that never wanted markup: a deck
  // thumbnail's preview line and a PPTX speaker note.
  function text(dirty) {
    const src = String(dirty == null ? '' : dirty);
    if (!src || (src.indexOf('<') < 0 && src.indexOf('&') < 0)) return src;
    const body = new DOMParser().parseFromString(src, 'text/html').body;
    return body ? (body.textContent || '') : '';
  }

  window.SageSanitize = { html, text, url, style };
})();
