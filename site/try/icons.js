/* Sage Stage icon set — original hand-drawn SVGs.
   Style: 24x24 grid, rounded 1.7px ink outlines, one pastel accent fill per icon.
   The accent color comes from the CSS variable --acc so each tool can tint its own icon. */
(function () {
  'use strict';

  const A = 'fill="var(--acc, #c7d2fe)"';

  const I = {
    // ---- tools ----
    background: `<rect x="3.5" y="4.5" width="13" height="6" rx="1.6" ${A}/>
      <path d="M16.5 6.5H19a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5h-6.8V14"/>
      <rect x="11" y="14" width="2.4" height="6" rx="1.2"/>`,
    draw: `<path d="M4.5 19.5l1-3.8L15.8 5.4a2 2 0 0 1 2.8 2.8L8.3 18.5l-3.8 1z" ${A}/>
      <path d="M13.8 7.4l2.8 2.8"/>`,
    text: `<path d="M4.8 18.5L9.8 6l5 12.5"/>
      <path d="M6.6 14.2h6.4"/>
      <circle cx="17.4" cy="15.6" r="2.6" ${A}/>
      <path d="M20 12.6v6"/>`,
    clock: `<circle cx="12" cy="12" r="8.2" ${A}/>
      <path d="M12 7.5V12l3.2 2"/>`,
    timer: `<path d="M8.2 5.5h7.6L12.9 10.6h-1.8L8.2 5.5z" ${A}/>
      <path d="M8.2 18.5h7.6l-2.9-5.1h-1.8l-2.9 5.1z" ${A}/>
      <path d="M6.2 4h11.6M6.2 20h11.6"/>`,
    visualtimer: `<circle cx="12" cy="12" r="8.2"/>
      <path d="M12 12V3.8a8.2 8.2 0 0 1 7.6 5.1L12 12z" ${A}/>
      <path d="M12 2.5v1.3"/>`,
    stopwatch: `<circle cx="12" cy="13.4" r="6.8" ${A}/>
      <path d="M12 13.4V9.8"/>
      <path d="M10.2 3.4h3.6M12 3.4v3.2"/>
      <path d="M17.9 8l1.3-1.3"/>`,
    countdown: `<ellipse cx="12" cy="9" rx="4.9" ry="5.7" ${A}/>
      <path d="M11 14.7h2l-.6 1.5h-.8l-.6-1.5z"/>
      <path d="M12 16.4c-1.6 1.3 1.6 2.3 0 3.9"/>`,
    calendar: `<path d="M6 5.5h12a2 2 0 0 1 2 2V10H4V7.5a2 2 0 0 1 2-2z" ${A} stroke="none"/>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2"/>
      <path d="M4 10h16M8 3.4v4M16 3.4v4"/>
      <rect x="13.2" y="12.8" width="3.6" height="3.2" rx="0.8" fill="currentColor" stroke="none" opacity="0.75"/>
      <path d="M7.4 14h3M7.4 17.2h5"/>`,
    agenda: `<rect x="5" y="4.5" width="14" height="16.5" rx="2"/>
      <rect x="9" y="2.8" width="6" height="3.4" rx="1.1" ${A}/>
      <path d="M8.5 10.5h7M8.5 14h7M8.5 17.5h4"/>`,
    traffic: `<rect x="8" y="3" width="8" height="18" rx="3.2"/>
      <circle cx="12" cy="7.6" r="1.5"/>
      <circle cx="12" cy="12" r="1.5"/>
      <circle cx="12" cy="16.4" r="1.5" ${A}/>`,
    symbols: `<path d="M4.5 7.2A2.2 2.2 0 0 1 6.7 5h10.6a2.2 2.2 0 0 1 2.2 2.2v5.6a2.2 2.2 0 0 1-2.2 2.2h-5.9L7.5 18.6V15h-.8a2.2 2.2 0 0 1-2.2-2.2V7.2z" ${A}/>
      <circle cx="8.7" cy="10" r="0.95" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="10" r="0.95" fill="currentColor" stroke="none"/>
      <circle cx="15.3" cy="10" r="0.95" fill="currentColor" stroke="none"/>`,
    sound: `<rect x="9.4" y="3.5" width="5.2" height="9.6" rx="2.6" ${A}/>
      <path d="M6.2 11.4a5.8 5.8 0 0 0 11.6 0"/>
      <path d="M12 17.2V20M9 20h6"/>`,
    picker: `<circle cx="11" cy="8.2" r="3.1" ${A}/>
      <path d="M5 19.5c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6"/>
      <path d="M18.3 3.6v3.4M16.6 5.3H20"/>`,
    groups: `<circle cx="9" cy="8.8" r="2.7" ${A}/>
      <circle cx="15.9" cy="10.3" r="2.2"/>
      <path d="M4.2 19c0-2.9 2.1-4.7 4.8-4.7s4.8 1.8 4.8 4.7"/>
      <path d="M15.9 15.4c2.2 0 3.7 1.5 3.9 3.6"/>`,
    dice: `<rect x="4.5" y="4.5" width="15" height="15" rx="3.4" ${A}/>
      <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>
      <circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/>`,
    poll: `<rect x="4.6" y="11" width="3.9" height="8" rx="1"/>
      <rect x="10.05" y="5" width="3.9" height="14" rx="1" ${A}/>
      <rect x="15.5" y="8.5" width="3.9" height="10.5" rx="1"/>`,
    score: `<path d="M9.8 10.6L5.6 3.5h4.1L12 8.1l2.3-4.6h4.1l-4.2 7.1"/>
      <circle cx="12" cy="14.6" r="5" ${A}/>
      <path d="M12 12.4l.8 1.6 1.8.3-1.3 1.3.3 1.8-1.6-.8-1.6.8.3-1.8-1.3-1.3 1.8-.3.8-1.6z" fill="currentColor" stroke="none"/>`,
    help: `<circle cx="12" cy="12" r="8.2" ${A}/>
      <path d="M9.7 9.4a2.4 2.4 0 0 1 4.7.7c0 1.5-2.4 1.8-2.4 3.3"/>
      <path d="M12 16.6v.01"/>`,
    image: `<rect x="4" y="5" width="16" height="14" rx="2"/>
      <circle cx="9" cy="9.8" r="1.6" ${A}/>
      <path d="M4.5 16.5L9 12l3 3 3.5-3.5 4 4"/>`,
    print: `<path d="M7 8.5V4h10v4.5"/>
      <rect x="4" y="8.5" width="16" height="8" rx="2"/>
      <rect x="7" y="13.5" width="10" height="6.5" rx="1" ${A}/>`,
    modelwrite: `<rect x="4" y="3.5" width="13" height="17" rx="2"/>
      <path d="M7 8h7M7 11.5h7M7 15h4"/>
      <path d="M13.5 17.8l6-6 1.7 1.7-6 6-2.2.5.5-2.2z" ${A}/>`,
    video: `<rect x="4" y="5.5" width="16" height="13" rx="3"/>
      <path d="M10.3 9.1l5.2 2.9-5.2 2.9V9.1z" ${A}/>`,
    webcam: `<circle cx="12" cy="10.4" r="6.2"/>
      <circle cx="12" cy="10.4" r="2.6" ${A}/>
      <path d="M12 16.6v2.9M8.5 19.5h7"/>`,
    embed: `<path d="M6 5h12a2 2 0 0 1 2 2v1.5H4V7a2 2 0 0 1 2-2z" ${A} stroke="none"/>
      <rect x="4" y="5" width="16" height="14" rx="2"/>
      <path d="M4 8.5h16"/>
      <path d="M9.8 11.8L7.8 14l2 2.2M14.2 11.8l2 2.2-2 2.2"/>`,
    pdf: `<path d="M13.5 3.5V8h5z" ${A}/>
      <path d="M7.5 3.5h6L18.5 8v11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/>
      <path d="M13.5 3.5V8h5"/>
      <path d="M9 12.4h6M9 15.4h6M9 18.2h3.5"/>`,
    qr: `<rect x="4.5" y="4.5" width="5.6" height="5.6" rx="1.2" ${A}/>
      <rect x="13.9" y="4.5" width="5.6" height="5.6" rx="1.2"/>
      <rect x="4.5" y="13.9" width="5.6" height="5.6" rx="1.2"/>
      <path d="M14 14h2.4v2.4H14zM17.1 17.1h2.4v2.4h-2.4z" fill="currentColor" stroke="none"/>`,
    link: `<path d="M13.6 10.4a3.6 3.6 0 0 0-5.1 0l-2.9 2.9a3.6 3.6 0 0 0 5.1 5.1l1.3-1.3"/>
      <path d="M10.4 13.6a3.6 3.6 0 0 0 5.1 0l2.9-2.9a3.6 3.6 0 0 0-5.1-5.1l-1.3 1.3"/>
      <circle cx="12" cy="12" r="1.5" ${A} stroke="none"/>`,
    sticker: `<path d="M12 3.6l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8 2.5-5z" ${A}/>`,
    more: `<rect x="4.5" y="4.5" width="6" height="6" rx="1.7" ${A}/>
      <rect x="13.5" y="4.5" width="6" height="6" rx="1.7"/>
      <rect x="4.5" y="13.5" width="6" height="6" rx="1.7"/>
      <rect x="13.5" y="13.5" width="6" height="6" rx="1.7" ${A}/>`,
    maths: `<circle cx="8.2" cy="8.2" r="4" ${A}/>
      <path d="M8.2 6.3v3.8M6.3 8.2h3.8"/>
      <path d="M14.6 8.2h4.6"/>
      <path d="M6.6 14.6l3.2 3.2M9.8 14.6l-3.2 3.2"/>
      <path d="M14.6 16.2h4.6"/>
      <circle cx="16.9" cy="14" r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="16.9" cy="18.4" r="0.9" fill="currentColor" stroke="none"/>`,
    english: `<path d="M12 6.3c-1.9-1.5-4.4-1.9-7.5-1.5v13.7c3.1-.4 5.6 0 7.5 1.5 1.9-1.5 4.4-1.9 7.5-1.5V4.8c-3.1-.4-5.6 0-7.5 1.5z" ${A}/>
      <path d="M12 6.3v13.7"/>
      <path d="M6.9 8.8c1.1-.1 2.1 0 3.1.4M6.9 11.7c1.1-.1 2.1 0 3.1.4M14 9.2c1-.4 2-.5 3.1-.4M14 12.1c1-.4 2-.5 3.1-.4"/>`,
    phonemetiles: `<rect x="3.2" y="6.2" width="5.2" height="5.2" rx="1" ${A}/>
      <rect x="9.4" y="6.2" width="5.2" height="5.2" rx="1"/>
      <rect x="15.6" y="6.2" width="5.2" height="5.2" rx="1" ${A}/>
      <circle cx="5.8" cy="15.4" r="1.2" fill="currentColor" stroke="none"/>
      <path d="M10.3 15.4h3.4"/>
      <path d="M16.5 14.8c1 1.7 2.7 1.7 3.7 0"/>`,
    wordsort: `<rect x="8.8" y="3.2" width="6.4" height="3.8" rx="1.2" ${A}/>
      <path d="M12 7v1.6"/>
      <rect x="3.2" y="8.6" width="7.6" height="10.6" rx="1.4" ${A}/>
      <rect x="13.2" y="8.6" width="7.6" height="10.6" rx="1.4"/>
      <path d="M5.4 12.2h3.2M5.4 15h3.2M15.4 12.2h3.2M15.4 15h3.2"/>`,
    wordbank: `<rect x="3.2" y="6.6" width="8.4" height="5.6" rx="1.2" ${A}/>
      <rect x="13.4" y="4.2" width="7.4" height="5.2" rx="1.2"/>
      <rect x="7.6" y="14.4" width="8.8" height="5.6" rx="1.2" ${A}/>
      <path d="M17.1 3.1v3.2M15.5 4.7h3.2"/>
      <path d="M5.6 9.4h3.6M10 17.2h4"/>`,
    sentencebuilder: `<rect x="2.6" y="9.2" width="6" height="5" rx="1.2" ${A}/>
      <rect x="10.2" y="9.2" width="7.4" height="5" rx="1.2"/>
      <circle cx="20.4" cy="13.9" r="1.1" fill="currentColor" stroke="none"/>
      <path d="M6.2 5.4h11.6"/>
      <path d="M4.4 17.9c4.8 2 10.4 2 15.2 0"/>`,
    genretoolkit: `<rect x="4" y="3.2" width="16" height="17.6" rx="1.8"/>
      <rect x="6.6" y="6.4" width="10.8" height="2.8" rx="1" ${A}/>
      <path d="M6.8 13l1.4 1.4 2.4-2.8"/>
      <path d="M12.8 13.2h4.6"/>
      <path d="M6.8 17.6l1.4 1.4 2.4-2.8"/>
      <path d="M12.8 17.8h4.6"/>`,
    storymap: `<rect x="3" y="4" width="18" height="16" rx="1.8"/>
      <path d="M9 4v16M15 4v16" opacity=".45"/>
      <path d="M5.6 14.6l3.4-4 3 3.4 3-5.2 3 2.6"/>
      <circle cx="5.6" cy="14.6" r="1.5" ${A}/>
      <circle cx="12" cy="14" r="1.5" ${A}/>
      <circle cx="18" cy="11.4" r="1.5" ${A}/>`,
    games: `<path d="M8 7h8a5 5 0 0 1 4.9 6l-.7 3.2a2.7 2.7 0 0 1-4.8 1L14.2 15H9.8l-1.2 2.2a2.7 2.7 0 0 1-4.8-1L3.1 13A5 5 0 0 1 8 7z" ${A}/>
      <path d="M8.4 9.6v3M6.9 11.1h3"/>
      <circle cx="15.2" cy="10" r="1" fill="currentColor" stroke="none"/>
      <circle cx="17.2" cy="12.2" r="1" fill="currentColor" stroke="none"/>`,

    teachclock: `<circle cx="12" cy="13" r="7.6" ${A}/>
      <path d="M12 8.8V13l3 1.8"/>
      <path d="M7.5 3.6a9.5 9.5 0 0 1 9 0"/>
      <path d="M14.6 2.4l1.9 1.2-1.2 1.9"/>`,
    shade: `<rect x="4" y="3.5" width="16" height="7.5" rx="1.6" ${A}/>
      <path d="M4 11h16"/>
      <path d="M6.8 11v1.6M17.2 11v1.6"/>
      <path d="M12 11v3"/>
      <circle cx="12" cy="15.8" r="1.5"/>`,

    money: `<rect x="3" y="10.5" width="12.5" height="8" rx="1.6" ${A}/>
      <circle cx="9.2" cy="14.5" r="2"/>
      <circle cx="16.2" cy="8.4" r="4.9"/>
      <path d="M16.2 6.2v4.4M14.3 8.4h3.8"/>`,
    frametiles: `<rect x="3.5" y="6.5" width="17" height="11" rx="2" ${A}/>
      <path d="M3.5 12h17M9.2 6.5v11M14.8 6.5v11"/>
      <circle cx="6.4" cy="9.2" r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="9.2" r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="6.4" cy="14.8" r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="14.8" r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="17.6" cy="9.2" r="1.05" fill="currentColor" stroke="none"/>`,
    barmodel: `<path d="M4.5 6.2V4.5h15v1.7"/>
      <rect x="4.5" y="8.6" width="15" height="4.8" rx="1" ${A}/>
      <path d="M13.4 8.6v4.8"/>
      <rect x="4.5" y="16" width="9.6" height="4.5" rx="1"/>`,
    partwhole: `<circle cx="12" cy="6.6" r="3.7" ${A}/>
      <path d="M10.3 9.9L8.2 14.1M13.7 9.9l2.1 4.2"/>
      <circle cx="6.6" cy="17.1" r="3.4"/>
      <circle cx="17.4" cy="17.1" r="3.4"/>`,
    counters: `<rect x="3.5" y="8" width="17" height="8" rx="1.8"/>
      <path d="M12 8v8"/>
      <circle cx="7.8" cy="12" r="2.7" ${A}/>
      <circle cx="16.2" cy="12" r="2.7"/>`,
    dienes: `<rect x="3.2" y="3.2" width="10.6" height="10.6" rx="1.2" ${A}/>
      <path d="M6.7 3.2v10.6M10.3 3.2v10.6M3.2 6.7h10.6M3.2 10.3h10.6"/>
      <rect x="16.6" y="3.2" width="3.6" height="14.2" rx="1"/>
      <path d="M16.6 6.7h3.6M16.6 10.2h3.6M16.6 13.7h3.6"/>
      <rect x="4.2" y="16.6" width="3.4" height="3.4" rx="0.8" fill="currentColor" stroke="none" opacity="0.8"/>
      <rect x="9.6" y="16.6" width="3.4" height="3.4" rx="0.8" fill="currentColor" stroke="none" opacity="0.8"/>`,
    pvcounters: `<rect x="3.2" y="4" width="17.6" height="16" rx="2" ${A}/>
      <path d="M12 4v16M3.2 9h17.6"/>
      <circle cx="7.6" cy="13.1" r="2.05" ${A}/>
      <circle cx="7.6" cy="17.4" r="2.05"/>
      <circle cx="16.4" cy="13.1" r="2.05"/>
      <circle cx="12" cy="9" r="1.35" fill="currentColor" stroke="none"/>`,
    rekenrek: `<rect x="3" y="4.2" width="18" height="15.6" rx="2.6" ${A}/>
      <path d="M3 9.4h18M3 14.6h18"/>
      <circle cx="7.1" cy="9.4" r="1.85" fill="currentColor" stroke="none"/>
      <circle cx="11.3" cy="9.4" r="1.85" fill="currentColor" stroke="none"/>
      <circle cx="16.9" cy="14.6" r="1.85"/>`,
    numberline: `<path d="M2.6 15.2h18.8M20 13.6l1.6 1.6-1.6 1.6M4 13.6l-1.6 1.6L4 16.8"/>
      <path d="M7 13.3v3.8M12 13.3v3.8M17 13.3v3.8"/>
      <path d="M7.4 11.4q4.6-5.8 9.3-.5"/>
      <path d="M16 8.7l.7 2.2-2.3.5"/>
      <circle cx="7.4" cy="11.4" r="1.7" ${A}/>`,
    shop: `<path d="M4.5 9L6 4.5h12L19.5 9v1a2 2 0 0 1-4 0 2 2 0 0 1-4 0v-1 1a2 2 0 0 1-4 0 2 2 0 0 1-4 0z" ${A}/>
      <path d="M6 12.5V19a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19v-6.5"/>
      <rect x="9.5" y="14.5" width="5" height="6"/>`,

    headphones: `<path d="M4.5 13.5a7.5 7.5 0 0 1 15 0"/>
      <rect x="3.5" y="13" width="4.4" height="6.6" rx="2" ${A}/>
      <rect x="16.1" y="13" width="4.4" height="6.6" rx="2" ${A}/>`,

    // ---- chrome ----
    gear: `<circle cx="12" cy="12" r="5.6" ${A}/>
      <circle cx="12" cy="12" r="2.1"/>
      <path d="M12 6.4V3.7M12 17.6v2.7M6.4 12H3.7M17.6 12h2.7M16 8l1.9-1.9M8 8L6.1 6.1M16 16l1.9 1.9M8 16l-1.9 1.9"/>`,
    copy: `<rect x="8.5" y="8.5" width="11" height="11" rx="2" ${A}/>
      <path d="M15.5 5.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5"/>`,
    close: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
    save: `<path d="M4.5 14.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5"/>
      <path d="M12 4v9.5M8.3 10.2l3.7 3.7 3.7-3.7"/>`,
    expand: `<path d="M4.5 9V6.5a2 2 0 0 1 2-2H9M15 4.5h2.5a2 2 0 0 1 2 2V9M19.5 15v2.5a2 2 0 0 1-2 2H15M9 19.5H6.5a2 2 0 0 1-2-2V15"/>`,
    chevl: `<path d="M14.5 6l-6 6 6 6"/>`,
    chevr: `<path d="M9.5 6l6 6-6 6"/>`,
    plus: `<path d="M12 5.5v13M5.5 12h13"/>`,
    trash: `<path d="M7 7l.8 12.1A1.6 1.6 0 0 0 9.4 20.6h5.2a1.6 1.6 0 0 0 1.6-1.5L17 7" ${A}/>
      <path d="M5 7h14"/>
      <path d="M9.5 7V5.7A1.7 1.7 0 0 1 11.2 4h1.6a1.7 1.7 0 0 1 1.7 1.7V7"/>
      <path d="M10.2 10.8v6M13.8 10.8v6"/>`,
    pin: `<path d="M9.4 3.8h5.2l-.8 5 2.8 2.7H7.4l2.8-2.7-.8-5z" ${A}/>
      <path d="M12 11.5v8"/>`,
    dots: `<circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/>`,
    fit: `<path d="M9 4.5v3A1.5 1.5 0 0 1 7.5 9h-3M15 4.5v3A1.5 1.5 0 0 0 16.5 9h3M9 19.5v-3A1.5 1.5 0 0 0 7.5 15h-3M15 19.5v-3a1.5 1.5 0 0 1 1.5-1.5h3"/>`,
    lock: `<rect x="5.5" y="10.5" width="13" height="9" rx="2" ${A}/>
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>
      <path d="M12 13.8v2.4"/>`,
    spot: `<path d="M9.5 3.5h5v2.6L13 8.8v9.7a1 1 0 0 1-1 1 1 1 0 0 1-1-1V8.8L9.5 6.1V3.5z" ${A}/>
      <path d="M17 5.5l2.2-1.6M17.5 9H20.2"/>`,
    tofront: `<path d="M5 4.5h14"/>
      <path d="M12 20V8.5M8.3 12.2L12 8.5l3.7 3.7"/>`,
    toback: `<path d="M5 19.5h14"/>
      <path d="M12 4v11.5M8.3 11.8l3.7 3.7 3.7-3.7"/>`,
    chain: `<path d="M13.6 10.4a3.6 3.6 0 0 0-5.1 0l-2.9 2.9a3.6 3.6 0 0 0 5.1 5.1l1.3-1.3"/>
      <path d="M10.4 13.6a3.6 3.6 0 0 0 5.1 0l2.9-2.9a3.6 3.6 0 0 0-5.1-5.1l-1.3 1.3"/>`,
    move: `<path d="M12 3.5v17M3.5 12h17"/>
      <path d="M9.8 5.7L12 3.5l2.2 2.2M9.8 18.3l2.2 2.2 2.2-2.2M5.7 9.8L3.5 12l2.2 2.2M18.3 9.8l2.2 2.2-2.2 2.2"/>`,
    marker: `<path d="M6.2 14.8l6.3-6.3 3 3-6.3 6.3H6.2v-3z" ${A}/>
      <path d="M13.6 7.4l1.6-1.6a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1l-1.6 1.6"/>
      <path d="M4.5 20.5h7"/>`,
    alignl: `<path d="M4.5 6h15M4.5 10h9M4.5 14h15M4.5 18h9"/>`,
    alignc: `<path d="M4.5 6h15M7.5 10h9M4.5 14h15M7.5 18h9"/>`,
    alignr: `<path d="M4.5 6h15M10.5 10h9M4.5 14h15M10.5 18h9"/>`,
    list: `<path d="M9 6.5h10.5M9 12h10.5M9 17.5h10.5"/>
      <circle cx="5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="17.5" r="1.2" fill="currentColor" stroke="none"/>`,
    pointer: `<path d="M6.5 4.5l12 5.6-5.2 1.9 3 5.6-2.6 1.4-3-5.6-4.2 3.6V4.5z" ${A}/>`,
    scribble: `<path d="M4 16.5c3.5-7 5.8-9.6 7-8.4 1.3 1.3-2.6 5.6-1.2 6.8 1.4 1.2 4-4.4 6.4-5.6 1.6-.8 2.9-.2 3.8 1.2"/>`,
    eraser: `<path d="M9.8 19h-3l-2.6-2.6a1.8 1.8 0 0 1 0-2.5l8.2-8.2a1.8 1.8 0 0 1 2.5 0l4.4 4.4a1.8 1.8 0 0 1 0 2.5L12.9 19" ${A}/>
      <path d="M8.4 9.9l6.2 6.2M9.8 19h10"/>`,
    shapes: `<circle cx="9.5" cy="9.5" r="5" ${A}/>
      <rect x="11.5" y="11.5" width="8" height="8" rx="1.4" fill="#fff"/>
      <rect x="11.5" y="11.5" width="8" height="8" rx="1.4"/>`,
    undo: `<path d="M8 5.5L4.5 9 8 12.5"/>
      <path d="M4.5 9h9a5 5 0 0 1 0 10H9"/>`,
    redo: `<path d="M16 5.5L19.5 9 16 12.5"/>
      <path d="M19.5 9h-9a5 5 0 0 0 0 10H15"/>`,
    sketchpad: `<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" ${A}/>
      <path d="M7 14.5c1.8-3.6 3.2-5.4 4.4-4.2 1.2 1.2-.9 3.4.4 4.2 1.3.8 2.6-2.4 5.2-3"/>`,
    shrink: `<path d="M19.5 4.5L14.8 9.2M14.8 9.2h3.4M14.8 9.2V5.8M4.5 19.5l4.7-4.7M9.2 14.8H5.8M9.2 14.8v3.4"/>`,
    screens: `<rect x="5" y="5" width="14" height="12" rx="2" ${A}/>
      <path d="M8 20h8"/>`,
    // ---- modelled writing ----
    // Lift and Lasso were deferred once for want of an icon a teacher would
    // read correctly (2026-07-26). Borrowing `pointer` for Lift would have said
    // "select", which is the one thing it does not do — so both are drawn for
    // the job: Lift is a written line with the stroke coming away upwards,
    // Lasso is the dashed loop every drawing tool has used for thirty years.
    hilite: `<path d="M4.5 20.5h7"/>
      <path d="M6.5 16.5l7.8-7.8 3.5 3.5-7.8 7.8H6.5v-3.5z" ${A} stroke-linejoin="round"/>
      <path d="M14.8 8.2l2.1-2.1a1.6 1.6 0 0 1 2.3 0l.9.9a1.6 1.6 0 0 1 0 2.3l-2.1 2.1"/>
      <path d="M13.5 20.5h7"/>`,
    lift: `<path d="M4 17.5c2.4-1 4.6-1.3 6.6-1"/>
      <path d="M13.6 12.6c1.4-1.5 2.9-2.6 4.4-3.3"/>
      <path d="M16.2 4.5v6.4M13.6 7l2.6-2.5L18.8 7"/>
      <path d="M8.4 13.2l3.4 3.4" ${A} stroke-linecap="round"/>
      <circle cx="10.1" cy="14.9" r="2.4" ${A}/>`,
    lasso: `<path d="M12 5.2c4.4 0 7.8 2.3 7.8 5.2 0 2.4-2.4 4.4-5.7 5v2.2" ${A} stroke-dasharray="2.6 2.2"/>
      <path d="M12 5.2C7.6 5.2 4.2 7.5 4.2 10.4c0 2 1.7 3.7 4.2 4.6" stroke-dasharray="2.6 2.2"/>
      <path d="M14.1 17.6c0 1.3-.9 2.2-2 2.2s-1.9-.7-1.9-1.7c0-.8.7-1.3 1.4-1.3.6 0 1.1.4 1.1 1"/>`,
    tick: `<path d="M5 12.4l4.4 4.4L19 6.6" ${A} stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4.5 20.5h15" stroke-width="1.4" opacity=".55"/>`,
    paper: `<rect x="4.5" y="3.5" width="15" height="17" rx="2" ${A}/>
      <path d="M7.6 8h8.8M7.6 11.6h8.8M7.6 15.2h8.8" stroke-width="1.3"/>
      <path d="M7.6 11.6h8.8"/>`,
    linetool: `<path d="M5 19L19 5"/>`,
    arrowtool: `<path d="M5 19L18 6M18 6h-6M18 6v6"/>`,
    recttool: `<rect x="4.5" y="6.5" width="15" height="11" rx="1.5"/>`,
    elltool: `<ellipse cx="12" cy="12" rx="7.5" ry="5.5"/>`,
    tritool: `<path d="M12 5.5L20 18.5H4z"/>`,
    speechtool: `<path d="M6 5.5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-6.5L8 19v-3.5H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z"/>`,
    brackettool: `<path d="M10 4.5H7.5v15H10M14 4.5h2.5v15H14"/>`,
    bracetool: `<path d="M9.5 4.5c-1.7 0-2 1-2 2.5s.3 4-2 5c2.3 1 2 3.5 2 5s.3 2.5 2 2.5M14.5 4.5c1.7 0 2 1 2 2.5s-.3 4 2 5c-2.3 1-2 3.5-2 5s-.3 2.5-2 2.5"/>`,
    // geometry instruments
    geotools: `<path d="M4 15a8 8 0 0 1 16 0"/><path d="M4 15h16"/><path d="M8 15v-2M12 15v-3M16 15v-2"/>`,
    ruler: `<rect x="2.5" y="8.5" width="19" height="7" rx="1.2"/><path d="M6 8.5v2.5M9 8.5v3.5M12 8.5v2.5M15 8.5v3.5M18 8.5v2.5"/>`,
    protractor: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5"/>`,
    protractor180: `<path d="M3.5 16.5a8.5 8.5 0 0 1 17 0z"/><path d="M12 16.5v-3M6.7 8.4l-.9-1.6M17.3 8.4l.9-1.6"/>`,
    setsquare: `<path d="M4.5 4.5v15h15z"/><path d="M4.5 14.5h5v5"/>`,
  };

  function icon(name) {
    // vendored set (icons-scarlab.js) wins when it has the name; hand-drawn set covers the rest (chrome)
    const vendored = window.SageVendorIcons;
    if (vendored && vendored[name]) return vendored[name];
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[name] || I.more) + '</svg>';
  }

  window.SageIcons = { icon };
})();
