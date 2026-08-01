/* sagestage.app — the taster flag, its showcase decks, and the deep links.
   Loaded before storage.js/app.js ONLY in the deployed taster (the assembly
   workflow injects the script tag); the product never ships or references this
   file. The app's guarded demo moves key off window.SAGE_DEMO
   (docs/sagestage-app-design.md §2 in the SageStage repo).

   Seeds list widgets as {type, x, y, w, h, props?}: the app builds each from
   the widget's own defaults() at boot, so this file carries positions and a
   few overrides, never frozen prop shapes.

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
          name: 'Maths in your hands',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #eef5f3, #e3efe9)' },
          widgets: [
            { type: 'rekenrek', x: 60, y: 100, w: 500, h: 290 },
            { type: 'dienes', x: 620, y: 100, w: 580, h: 370 },
            { type: 'partwhole', x: 60, y: 440, w: 390, h: 290 },
            { type: 'teachclock', x: 500, y: 500, w: 340, h: 270 },
          ],
        },
        {
          name: 'English on the board',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #f6f2ea, #efe9df)' },
          widgets: [
            { type: 'storymap', x: 40, y: 90, w: 780, h: 620 },
            { type: 'wordbank', x: 850, y: 90, w: 390, h: 430 },
          ],
        },
        {
          name: 'The everyday',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #eef1f6, #e6ebf3)' },
          widgets: [
            { type: 'timer', x: 60, y: 100, w: 320, h: 240 },
            { type: 'picker', x: 430, y: 100, w: 360, h: 260, props: { list: 'Demo class' } },
            { type: 'traffic', x: 850, y: 100, w: 170, h: 300 },
            { type: 'agenda', x: 60, y: 400, w: 430, h: 300 },
          ],
        },
      ],
    },
    maths: {
      deckName: 'Maths in your hands',
      lists: LISTS,
      screens: [
        {
          name: 'In your hands',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #eef5f3, #e3efe9)' },
          widgets: [
            { type: 'rekenrek', x: 70, y: 110, w: 540, h: 310 },
            { type: 'partwhole', x: 70, y: 460, w: 400, h: 290 },
            { type: 'teachclock', x: 700, y: 130, w: 400, h: 320 },
            { type: 'frametiles', x: 540, y: 490, w: 420, h: 260 },
          ],
        },
        {
          name: 'Place value',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #f0f6ef, #e5efe6)' },
          widgets: [
            { type: 'dienes', x: 70, y: 110, w: 640, h: 420 },
            { type: 'numberline', x: 70, y: 570, w: 900, h: 180 },
            { type: 'pvcounters', x: 760, y: 110, w: 460, h: 400 },
          ],
        },
      ],
    },
    english: {
      deckName: 'English on the board',
      lists: LISTS,
      screens: [
        {
          name: 'Plan the story',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #f6f2ea, #efe9df)' },
          widgets: [
            { type: 'storymap', x: 40, y: 90, w: 780, h: 630 },
            { type: 'wordbank', x: 850, y: 90, w: 390, h: 440 },
          ],
        },
        {
          name: 'Model the writing',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #f4f1ec, #ece7e0)' },
          widgets: [
            { type: 'modelwrite', x: 40, y: 90, w: 720, h: 620 },
            { type: 'sentencebuilder', x: 790, y: 90, w: 450, h: 420 },
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
            { type: 'timer', x: 60, y: 100, w: 330, h: 250 },
            { type: 'picker', x: 440, y: 100, w: 370, h: 270, props: { list: 'Demo class' } },
            { type: 'traffic', x: 860, y: 100, w: 170, h: 310 },
            { type: 'agenda', x: 60, y: 410, w: 440, h: 310 },
            { type: 'symbols', x: 550, y: 430, w: 300, h: 240 },
          ],
        },
        {
          name: 'Noise & rewards',
          background: { type: 'gradient', value: 'linear-gradient(160deg, #f1f0f6, #e8e7f0)' },
          widgets: [
            { type: 'sound', x: 60, y: 110, w: 460, h: 260 },
            { type: 'score', x: 580, y: 110, w: 380, h: 280 },
            { type: 'visualtimer', x: 60, y: 430, w: 300, h: 300 },
            { type: 'groups', x: 420, y: 440, w: 420, h: 290, props: { list: 'Demo class' } },
          ],
        },
      ],
    },
  };
  var pick = (new URLSearchParams(location.search).get('deck') || '').toLowerCase();
  var requested = Object.prototype.hasOwnProperty.call(SEEDS, pick) ? pick : null;
  window.SAGE_DEMO = {
    requested: requested,
    seed: SEEDS[requested || 'tour'],
  };
}());
