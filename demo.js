/* sagestage.app — the taster flag, its showcase decks, and the deep links.
   Loaded before storage.js/app.js ONLY in the deployed taster (the assembly
   workflow injects the script tag); the product never ships or references this
   file. The app's guarded demo moves key off window.SAGE_DEMO
   (docs/sagestage-app-design.md §2 in the SageStage repo).

   Seeds list widgets as {type, x, y, w, h, props?}: the app builds each from
   the widget's own defaults() at boot, so this file carries positions and a
   few overrides, never frozen prop shapes.

   GEOMETRY. Every screen is authored on a 1280×720 reference canvas with the
   app's chrome respected: content lives in y 72–630 (topbar above, toolbar
   dock below), x 24–1256. fit() then maps the reference to the visitor's real
   window once, at seed time — so the same composition fits a small laptop and
   fills a classroom board. Widgets keep 85–100% of their designed default
   size (WIDGETS[type].w/h in the app repo): a manipulative crushed to half
   its design loses its own controls — the 2026-08-02 review found the
   teaching clock's face rendering at literally 0 height, and four widgets
   per screen meant all four were broken. Fewer, full-size, nothing clipped.

   The landing page's three cards deep-link try/?deck=maths|english|everyday.
   On a fresh browser the chosen deck is the whole first state; on a returning
   visit the app ADDS the deck if it's missing and opens it — nothing existing
   is ever overwritten. No param = the three-screen tour. */
(function () {
  var LISTS = {
    'Demo class': ['Amara', 'Billy', 'Chloe', 'Dev', 'Eesa', 'Freya', 'Grace',
      'Harry', 'Isla', 'Jack', 'Kadie', 'Leo', 'Mia', 'Noah', 'Olive', 'Poppy',
      'Quinn', 'Rosie', 'Sami', 'Tilly'],
  };
  var SEEDS = {
    tour: {
      deckName: 'Try Sage Stage',
      lists: LISTS,
      screens: [
        {
          // two manipulatives at full dignity: beads to tap, hands to drag.
          // The clock ships slim (no game, no quick bar) so the face IS the
          // widget; the maths deck below carries the full-fat version.
          name: 'Maths in your hands',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #eef5f3, #e3efe9)' },
          widgets: [
            { type: 'rekenrek', x: 60, y: 150, w: 620, h: 370 },
            { type: 'teachclock', x: 800, y: 84, w: 440, h: 530,
              props: { h: 9, m: 5, gameOn: false, quick: false } },
          ],
        },
        {
          // the story map is designed near-fullscreen (1180×660) — give it
          // the stage it was drawn for instead of a squeezed corner
          name: 'English on the board',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #f6f2ea, #efe9df)' },
          widgets: [
            { type: 'storymap', x: 50, y: 80, w: 1180, h: 540 },
          ],
        },
        {
          name: 'The everyday',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #eef1f6, #e6ebf3)' },
          widgets: [
            { type: 'timer', x: 70, y: 100, w: 300, h: 230 },
            { type: 'picker', x: 430, y: 100, w: 340, h: 250, props: { list: 'Demo class' } },
            { type: 'traffic', x: 810, y: 95, w: 160, h: 310 },
            { type: 'agenda', x: 70, y: 380, w: 340, h: 240 },
          ],
        },
      ],
    },
    maths: {
      deckName: 'Maths in your hands',
      lists: LISTS,
      screens: [
        {
          // the tour's pair, but the clock keeps its challenge game — this
          // deck is the one the landing card sells as the maths toolkit
          name: 'In your hands',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #eef5f3, #e3efe9)' },
          widgets: [
            { type: 'rekenrek', x: 60, y: 150, w: 620, h: 370 },
            { type: 'teachclock', x: 800, y: 80, w: 440, h: 540,
              props: { h: 9, m: 5, quick: false } },
          ],
        },
        {
          // blocks build the number, the part–whole breaks it apart — the
          // counters variant needs ~760px of width for its chip rows, so it
          // stays in the tray rather than shipping cramped
          name: 'Place value',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #f0f6ef, #e5efe6)' },
          widgets: [
            { type: 'dienes', x: 60, y: 84, w: 700, h: 500 },
            { type: 'partwhole', x: 790, y: 84, w: 440, h: 520 },
          ],
        },
      ],
    },
    english: {
      deckName: 'English on the board',
      lists: LISTS,
      screens: [
        {
          // the word bank rides sidebar-narrow here; its chips reflow, the
          // story map keeps the width its six faces were drawn for
          name: 'Plan the story',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #f6f2ea, #efe9df)' },
          widgets: [
            { type: 'storymap', x: 50, y: 80, w: 780, h: 540 },
            { type: 'wordbank', x: 850, y: 80, w: 400, h: 540 },
          ],
        },
        {
          name: 'Model the writing',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #f4f1ec, #ece7e0)' },
          widgets: [
            { type: 'modelwrite', x: 50, y: 84, w: 640, h: 536 },
            { type: 'sentencebuilder', x: 710, y: 84, w: 540, h: 470 },
          ],
        },
      ],
    },
    everyday: {
      deckName: 'Classroom management',
      lists: LISTS,
      screens: [
        {
          name: 'The running classroom',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #eef1f6, #e6ebf3)' },
          widgets: [
            { type: 'timer', x: 70, y: 100, w: 300, h: 230 },
            { type: 'picker', x: 430, y: 100, w: 340, h: 250, props: { list: 'Demo class' } },
            { type: 'traffic', x: 810, y: 95, w: 160, h: 310 },
            { type: 'symbols', x: 990, y: 90, w: 260, h: 250 },
            { type: 'agenda', x: 70, y: 380, w: 340, h: 240 },
          ],
        },
        {
          name: 'Noise & rewards',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #f1f0f6, #e8e7f0)' },
          widgets: [
            { type: 'sound', x: 60, y: 95, w: 420, h: 250 },
            { type: 'score', x: 540, y: 95, w: 380, h: 250 },
            { type: 'visualtimer', x: 60, y: 375, w: 290, h: 245 },
            { type: 'groups', x: 410, y: 375, w: 430, h: 245 },
          ],
        },
      ],
    },
  };

  // ---- fit the reference canvas to this visitor's window, once, at seed time.
  // Positions scale per-axis so the composition keeps its margins; sizes scale
  // by the smaller factor so no widget outgrows what its controls were designed
  // for. Clamped: below 0.8 we accept clipping (a phone was never going to
  // hold a board), above 1.7 we stop and center the composition instead of
  // inflating buttons to comedy size on a 4K wall. Returning-visitor decks get
  // the same treatment — they are built fresh for whatever window adds them.
  var REF_W = 1280, REF_H = 720;
  var clampScale = function (s) { return Math.min(1.7, Math.max(0.8, s)); };
  var sx = clampScale(window.innerWidth / REF_W);
  var sy = clampScale(window.innerHeight / REF_H);
  var sw = Math.min(sx, sy);
  var ox = Math.max(0, (window.innerWidth - REF_W * sx) / 2);
  var oy = Math.max(0, (window.innerHeight - REF_H * sy) / 2);
  for (var k in SEEDS) {
    SEEDS[k].screens.forEach(function (s) {
      s.widgets.forEach(function (w) {
        w.x = Math.round(w.x * sx + ox);
        w.y = Math.round(w.y * sy + oy);
        w.w = Math.round(w.w * sw);
        w.h = Math.round(w.h * sw);
      });
    });
  }

  var pick = (new URLSearchParams(location.search).get('deck') || '').toLowerCase();
  var requested = Object.prototype.hasOwnProperty.call(SEEDS, pick) ? pick : null;
  window.SAGE_DEMO = {
    requested: requested,
    seed: SEEDS[requested || 'tour'],
  };
}());
