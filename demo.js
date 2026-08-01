/* sagestage.app — the taster flag and its showcase deck.
   Loaded before storage.js/app.js ONLY in the deployed taster (the assembly
   workflow injects the script tag); the product never ships or references this
   file. The app's three demo moves key off window.SAGE_DEMO
   (docs/sagestage-app-design.md §2 in the SageStage repo).

   The seed lists widgets as {type, x, y, w, h, props?}: the app builds each
   from the widget's own defaults() at boot, so this file carries positions and
   a few overrides, never frozen prop shapes. It runs only when the browser has
   no Sage Stage state — a returning visitor's work is never overwritten. */
window.SAGE_DEMO = {
  seed: {
    deckName: 'Try Sage Stage',
    lists: {
      'Demo class': ['Amara', 'Billy', 'Chloe', 'Dev', 'Eesa', 'Freya', 'Grace',
        'Harry', 'Isla', 'Jack', 'Kadie', 'Leo', 'Mia', 'Noah', 'Olive', 'Poppy',
        'Quinn', 'Rosie', 'Sami', 'Tilly'],
    },
    screens: [
      {
        name: 'Maths in your hands',
        background: { type: 'color', value: '#eef3f2' },
        widgets: [
          { type: 'rekenrek', x: 60, y: 90, w: 520, h: 300 },
          { type: 'dienes', x: 620, y: 90, w: 560, h: 360 },
          { type: 'partwhole', x: 60, y: 430, w: 400, h: 300 },
          { type: 'teachclock', x: 500, y: 480, w: 340, h: 280 },
        ],
      },
      {
        name: 'English on the board',
        background: { type: 'color', value: '#f3f0ea' },
        widgets: [
          { type: 'storymap', x: 40, y: 80, w: 780, h: 620 },
          { type: 'wordbank', x: 850, y: 80, w: 390, h: 430 },
        ],
      },
      {
        name: 'The everyday',
        background: { type: 'color', value: '#eef1f6' },
        widgets: [
          { type: 'timer', x: 60, y: 90, w: 320, h: 240 },
          { type: 'picker', x: 430, y: 90, w: 360, h: 260, props: { list: 'Demo class' } },
          { type: 'traffic', x: 840, y: 90, w: 170, h: 300 },
          { type: 'agenda', x: 60, y: 390, w: 430, h: 300 },
        ],
      },
    ],
  },
};
