/* SmartQuiz original multiplayer character collection: 250 variations.
   25 original roles x 10 visual looks. SVG artwork and animation are original to SmartQuiz. */

export const AVATAR_COUNT = 250;

const LOOKS = [
  { name: 'Sunny', skin: '#f6c9a0', hair: '#3b2a1e', outfit: '#f59e0b' },
  { name: 'River', skin: '#e0a574', hair: '#1f1a17', outfit: '#0ea5e9' },
  { name: 'Coral', skin: '#fddcc0', hair: '#c2410c', outfit: '#f43f5e' },
  { name: 'Dusk', skin: '#a8714a', hair: '#161616', outfit: '#8b5cf6' },
  { name: 'Ember', skin: '#f1bf94', hair: '#7c2d12', outfit: '#ea580c' },
  { name: 'Frost', skin: '#fbe3cf', hair: '#cbd5e1', outfit: '#38bdf8' },
  { name: 'Jade', skin: '#c58c5f', hair: '#27272a', outfit: '#10b981' },
  { name: 'Misty', skin: '#8d5a3b', hair: '#0f0f10', outfit: '#6366f1' },
  { name: 'Onyx', skin: '#6b4429', hair: '#0a0a0a', outfit: '#334155' },
  { name: 'Rosy', skin: '#f8d4b8', hair: '#ca8a04', outfit: '#ec4899' }
];

const HAIR_STYLES = [
  c => `<path d="M33 31Q33 15 50 15Q67 15 67 31Q60 23 50 23Q40 23 33 31Z" fill="${c}"/>`,
  c => `<path d="M33 32L36 17L43 25L50 13L57 25L64 17L67 32Q58 24 50 24Q42 24 33 32Z" fill="${c}"/>`,
  c => `<rect x="31" y="22" width="38" height="34" rx="14" fill="${c}"/>`,
  c => `<path d="M33 31Q33 15 50 15Q67 15 67 31Q60 23 50 23Q40 23 33 31Z" fill="${c}"/><circle cx="50" cy="12" r="7" fill="${c}"/>`,
  c => `<g fill="${c}"><circle cx="38" cy="22" r="8"/><circle cx="50" cy="17" r="9"/><circle cx="62" cy="22" r="8"/><circle cx="34" cy="31" r="6"/><circle cx="66" cy="31" r="6"/></g>`
];

/* Headgear replaces hair for roles that wear something on their head. */
const GEAR = {
  wizard: () => '<path d="M32 28L50 -2L68 28Z" fill="#5b21b6"/><rect x="30" y="26" width="40" height="6" rx="3" fill="#7c3aed"/><path d="M50 8l1.8 4 4.2.4-3.2 2.8 1 4.2-3.8-2.2-3.8 2.2 1-4.2-3.2-2.8 4.2-.4z" fill="#fde047"/>',
  chef: () => '<rect x="36" y="22" width="28" height="8" rx="3" fill="#fff"/><g fill="#fff" stroke="#e2e8f0" stroke-width="1"><circle cx="38" cy="14" r="8"/><circle cx="50" cy="9" r="9"/><circle cx="62" cy="14" r="8"/></g><rect x="36" y="20" width="28" height="10" rx="3" fill="#fff"/>',
  pirate: () => '<path d="M30 28Q50 2 70 28Q50 22 30 28Z" fill="#111827"/><rect x="28" y="26" width="44" height="5" rx="2.5" fill="#1f2937"/><circle cx="50" cy="18" r="3.4" fill="#f8fafc"/><rect x="48.4" y="21" width="3.2" height="3" fill="#f8fafc"/>',
  cowboy: () => '<ellipse cx="50" cy="28" rx="26" ry="5" fill="#92400e"/><path d="M38 28Q38 10 50 10Q62 10 62 28Z" fill="#b45309"/><rect x="38" y="23" width="24" height="4" fill="#78350f"/>',
  ninja: () => '<rect x="33" y="22" width="34" height="9" rx="3" fill="#111827"/><rect x="33" y="40" width="34" height="13" rx="5" fill="#111827"/><path d="M67 25l10 3-8 4z" fill="#ef4444"/>',
  knight: () => '<path d="M32 36Q32 14 50 14Q68 14 68 36L68 40L32 40Z" fill="#94a3b8"/><rect x="36" y="31" width="28" height="5" rx="2" fill="#1e293b"/><path d="M50 14Q58 4 66 10Q58 12 52 18Z" fill="#dc2626"/>',
  astronaut: () => '<circle cx="50" cy="34" r="22" fill="#bae6fd" fill-opacity=".35" stroke="#e2e8f0" stroke-width="3"/><rect x="38" y="52" width="24" height="7" rx="3" fill="#e2e8f0"/>',
  clown: c => `<g fill="#ef4444"><circle cx="36" cy="22" r="8"/><circle cx="64" cy="22" r="8"/></g><circle cx="50" cy="39" r="4.2" fill="#ef4444"/>${HAIR_STYLES[0](c)}`,
  dj: () => '<path d="M33 34Q33 14 50 14Q67 14 67 34" fill="none" stroke="#1e293b" stroke-width="4"/><rect x="29" y="30" width="8" height="13" rx="4" fill="#ec4899"/><rect x="63" y="30" width="8" height="13" rx="4" fill="#ec4899"/>',
  rocker: () => '<path d="M33 28Q50 12 67 28L67 33Q50 24 33 33Z" fill="#dc2626"/><circle cx="40" cy="25" r="1.4" fill="#fff"/><circle cx="50" cy="22" r="1.4" fill="#fff"/><circle cx="60" cy="25" r="1.4" fill="#fff"/>',
  fairy: () => '<path d="M38 22L42 12L46 20L50 9L54 20L58 12L62 22Z" fill="#fde047"/>',
  alien: () => '<path d="M43 20L38 6M57 20L62 6" stroke="#16a34a" stroke-width="2.4"/><circle cx="38" cy="6" r="3" fill="#bef264"/><circle cx="62" cy="6" r="3" fill="#bef264"/>',
  robot: () => '<rect x="34" y="17" width="32" height="30" rx="8" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/><path d="M50 17L50 8" stroke="#64748b" stroke-width="2"/><circle cx="50" cy="7" r="3" fill="#ef4444"/>',
  detective: () => '<path d="M33 27Q33 12 50 12Q67 12 67 27Z" fill="#78716c"/><rect x="29" y="25" width="42" height="5" rx="2.5" fill="#57534e"/><rect x="33" y="19" width="34" height="3" fill="#44403c"/>',
  scientist: () => '<rect x="34" y="24" width="32" height="8" rx="4" fill="#94a3b8"/><circle cx="43" cy="28" r="5.2" fill="#e0f2fe" stroke="#475569" stroke-width="2"/><circle cx="57" cy="28" r="5.2" fill="#e0f2fe" stroke="#475569" stroke-width="2"/>',
  hero: () => '<rect x="34" y="28" width="32" height="9" rx="4" fill="#dc2626"/><path d="M34 31L28 28M66 31L72 28" stroke="#dc2626" stroke-width="3"/>',
  samurai: c => `<rect x="33" y="24" width="34" height="5" fill="#dc2626"/><circle cx="50" cy="13" r="6" fill="${c}"/><path d="M34 26Q36 16 50 16Q64 16 66 26Z" fill="${c}"/>`,
  healer: () => '<path d="M34 28Q34 14 50 14Q66 14 66 28Z" fill="#fff"/><rect x="47" y="16" width="6" height="10" fill="#ef4444"/><rect x="44" y="19" width="12" height="4" fill="#ef4444"/>',
  pyro: () => '<path d="M34 30Q30 18 40 12Q38 20 44 22Q42 10 52 4Q50 16 58 20Q60 12 66 14Q70 24 66 30Q58 22 50 22Q42 22 34 30Z" fill="#f97316"/><path d="M42 28Q42 20 50 16Q58 20 58 28Q50 24 42 28Z" fill="#fde047"/>',
  frost: () => '<path d="M34 28L38 14L44 24L50 10L56 24L62 14L66 28Z" fill="#7dd3fc" stroke="#e0f2fe" stroke-width="1.5"/>',
  storm: () => '<path d="M31 40Q29 14 50 13Q71 14 69 40Q60 30 50 30Q40 30 31 40Z" fill="#475569"/>',
  archer: () => '<path d="M34 28Q38 10 52 12Q64 14 66 28Q50 20 34 28Z" fill="#15803d"/><path d="M60 16L74 6L68 20Z" fill="#fde047"/>',
  monk: () => '<path d="M36 40Q50 56 64 40" fill="none" stroke="#a16207" stroke-width="2" stroke-dasharray="3 3"/><circle cx="50" cy="19" r="2" fill="#f59e0b"/>',
  gamer: () => '<path d="M33 34Q33 14 50 14Q67 14 67 34" fill="none" stroke="#0f172a" stroke-width="4"/><rect x="29" y="30" width="8" height="12" rx="4" fill="#22c55e"/><rect x="63" y="30" width="8" height="12" rx="4" fill="#22c55e"/><path d="M33 42Q38 50 45 47" fill="none" stroke="#0f172a" stroke-width="2.4"/>'
};

/* Capes and wings sit behind the body. */
const BACK = {
  hero: '<path d="M36 54L20 100L50 90L80 100L64 54Z" fill="#dc2626" fill-opacity=".85"/>',
  fairy: '<ellipse cx="24" cy="62" rx="9" ry="15" fill="#c4b5fd" fill-opacity=".7"/><ellipse cx="76" cy="62" rx="9" ry="15" fill="#c4b5fd" fill-opacity=".7"/>'
};

/* Props are drawn inside the right arm, so they move when the arm animates. */
const PROPS = {
  wand: '<rect x="68" y="58" width="3" height="22" rx="1.5" transform="rotate(35 69 68)" fill="#92400e"/><circle cx="76" cy="52" r="4" fill="#fde047"/>',
  sword: '<rect x="68" y="34" width="4" height="30" rx="1.5" fill="#cbd5e1"/><rect x="64" y="62" width="12" height="3.5" rx="1.5" fill="#92400e"/>',
  katana: '<rect x="70" y="30" width="3" height="34" rx="1.5" fill="#e2e8f0" transform="rotate(14 71 64)"/><rect x="66" y="62" width="10" height="3" fill="#7f1d1d" transform="rotate(14 71 64)"/>',
  shield: '<path d="M64 56h14v10q0 8-7 11q-7-3-7-11z" fill="#3b82f6" stroke="#1e3a8a" stroke-width="2"/>',
  bow: '<path d="M72 40Q88 62 72 84" fill="none" stroke="#92400e" stroke-width="3"/><path d="M72 40L72 84" stroke="#e2e8f0" stroke-width="1"/>',
  flag: '<rect x="70" y="26" width="2.4" height="42" fill="#78350f"/><path d="M72.4 28L92 33L72.4 40Z" fill="#111827"/><circle cx="80" cy="34" r="1.6" fill="#fff"/>',
  lasso: '<ellipse cx="80" cy="64" rx="11" ry="7" fill="none" stroke="#a16207" stroke-width="2.4"/>',
  flask: '<path d="M70 58h6v7l5 10q1 3-2 3h-12q-3 0-2-3l5-10z" fill="#a7f3d0" stroke="#0f766e" stroke-width="1.6"/>',
  pan: '<ellipse cx="76" cy="66" rx="9" ry="3.6" fill="#475569"/><rect x="82" y="64" width="12" height="3" rx="1.5" fill="#78350f"/>',
  guitar: '<ellipse cx="53" cy="70" rx="12" ry="9" fill="#b45309" transform="rotate(-24 53 70)"/><rect x="58" y="44" width="4" height="26" rx="2" fill="#78350f" transform="rotate(-24 60 56)"/><circle cx="53" cy="70" r="3" fill="#1c1917"/>',
  controller: '<rect x="66" y="60" width="16" height="9" rx="4" fill="#1e293b"/><circle cx="71" cy="64.5" r="1.6" fill="#f43f5e"/><circle cx="77" cy="64.5" r="1.6" fill="#22c55e"/>',
  mic: '<rect x="70" y="52" width="4" height="14" rx="2" fill="#1e293b"/><circle cx="72" cy="50" r="5" fill="#94a3b8"/>',
  magnifier: '<circle cx="76" cy="54" r="6" fill="#e0f2fe" fill-opacity=".7" stroke="#78350f" stroke-width="2"/><rect x="69" y="62" width="2.6" height="10" rx="1.3" fill="#78350f" transform="rotate(-40 70 64)"/>',
  heartstaff: '<rect x="70" y="42" width="2.6" height="34" rx="1.3" fill="#a16207"/><path d="M71 40q-6-8-10-2t10 12q10-6 10-12t-10 2z" fill="#f43f5e"/>',
  bolt: '<path d="M72 36L64 54L72 54L66 74L84 50L75 50Z" fill="#fde047" stroke="#ca8a04" stroke-width="1.5"/>',
  balls: '',
  drumsticks: '<path d="M64 66L83 43M68 70L88 49" stroke="#d6a15b" stroke-width="3.5" stroke-linecap="round"/>',
  fashionbag: '<path d="M66 57h17l-2 19H68z" fill="#db2777" stroke="#831843" stroke-width="1.5"/><path d="M70 57q0-9 5-9t5 9" fill="none" stroke="#831843" stroke-width="2"/>',
  bird: '<path d="M67 60q8-12 17-3l-4 9-10 2z" fill="#38bdf8" stroke="#075985" stroke-width="1.5"/><circle cx="79" cy="59" r="1.5" fill="#0f172a"/><path d="M84 60l6 2-6 2z" fill="#f59e0b"/>',
  pet: '<path d="M66 63q-2-9 6-11l4 4 5-4q8 3 7 12l-5 8H71z" fill="#c08457" stroke="#78350f" stroke-width="1.5"/><circle cx="74" cy="62" r="1.5" fill="#1e293b"/><circle cx="82" cy="62" r="1.5" fill="#1e293b"/><ellipse cx="78" cy="67" rx="3" ry="2" fill="#1e293b"/>',
  camera: '<rect x="65" y="57" width="22" height="15" rx="3" fill="#334155" stroke="#0f172a" stroke-width="1.5"/><circle cx="76" cy="64.5" r="5" fill="#7dd3fc" stroke="#e2e8f0" stroke-width="1.5"/>',
  confetti: '<path d="M68 65l18-8-7 18z" fill="#38bdf8" stroke="#075985" stroke-width="1.5"/><path d="M82 49l3-5m3 11l6-1M65 48l-3-4" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>',
  board: '<rect x="60" y="77" width="35" height="6" rx="3" fill="#f97316" stroke="#9a3412" stroke-width="1.5"/><circle cx="67" cy="85" r="3" fill="#334155"/><circle cx="88" cy="85" r="3" fill="#334155"/>',
  ball: '<circle cx="80" cy="69" r="10" fill="#f8fafc" stroke="#334155" stroke-width="1.8"/><path d="M75 61l7 1 3 6-5 6-7-4z" fill="#1e293b"/>',
  brush: '<path d="M70 72L84 48" stroke="#92400e" stroke-width="4" stroke-linecap="round"/><path d="M82 50l5-9 4 3-5 9z" fill="#e879f9"/>',
  book: '<path d="M65 56q8-4 14 1v20q-6-5-14-1zM79 57q7-5 14-1v20q-7-4-14 1z" fill="#f8fafc" stroke="#475569" stroke-width="1.5"/>',
  none: ''
};

/* Effects float around the character; positions come from the CSS .fx classes. */
const FX = {
  flame: '<path class="fx f1" d="M14 40q4-7 0-13q8 5 6 13z" fill="#fb923c"/><path class="fx f2" d="M84 30q4-7 0-13q8 5 6 13z" fill="#f97316"/><path class="fx f3" d="M10 70q3-5 0-10q6 4 4 10z" fill="#fde047"/>',
  snow: '<circle class="fx f1" cx="14" cy="30" r="3" fill="#e0f2fe"/><circle class="fx f2" cx="86" cy="26" r="2.5" fill="#bae6fd"/><circle class="fx f3" cx="8" cy="58" r="2.2" fill="#fff"/>',
  bolt: '<path class="fx f1" d="M12 20l-6 12h6l-4 10 10-14h-6z" fill="#fde047"/><path class="fx f2" d="M88 24l-5 10h5l-3 9 9-12h-5z" fill="#facc15"/>',
  sparkle: '<path class="fx f1" d="M12 28l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fde047"/><path class="fx f2" d="M88 20l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#f0abfc"/><path class="fx f3" d="M10 60l1.4 3.4 3.4 1.4-3.4 1.4-1.4 3.4-1.4-3.4-3.4-1.4 3.4-1.4z" fill="#a5f3fc"/>',
  heart: '<path class="fx f1" d="M14 34q-5-7-8-2t8 9q9-5 8-9t-8 2z" fill="#fb7185"/><path class="fx f2" d="M88 24q-4-6-7-2t7 8q8-4 7-8t-7 2z" fill="#f472b6"/>',
  bubble: '<circle class="fx f1" cx="14" cy="34" r="4" fill="none" stroke="#5eead4" stroke-width="2"/><circle class="fx f2" cx="86" cy="28" r="3" fill="none" stroke="#a7f3d0" stroke-width="2"/><circle class="fx f3" cx="10" cy="62" r="2.4" fill="none" stroke="#99f6e4" stroke-width="2"/>',
  music: '<text class="fx f1" x="8" y="36" font-size="15" fill="#f472b6">&#9834;</text><text class="fx f2" x="82" y="26" font-size="13" fill="#60a5fa">&#9835;</text>',
  star: '<path class="fx f1" d="M12 30l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5-4.5 2.5 1-5-3.7-3.4 5-.6z" fill="#fde047"/><path class="fx f2" d="M88 24l1.8 3.8 4.2.5-3.1 2.8.8 4.2-3.7-2.1-3.7 2.1.8-4.2-3.1-2.8 4.2-.5z" fill="#fbbf24"/>',
  none: ''
};

const ROLES = [
  { name: 'Drummer', skill: 'Plays a big victory drum solo', anim: 'drum', gear: null, prop: 'drumsticks', fx: 'music', speech: 'That answer hit like a drum solo! Let us go!', pitch: 0.92, rate: 1.02 },
  { name: 'Singer', skill: 'Sings a bright victory note', anim: 'sing', gear: 'fairy', prop: 'mic', fx: 'music', speech: 'This is my moment! Everybody sing along!', pitch: 1.28, rate: 0.94 },
  { name: 'Fashion Icon', skill: 'Shows off a signature runway pose', anim: 'pose', gear: null, prop: 'fashionbag', fx: 'sparkle', speech: 'A perfect answer and a perfect look. Iconic!', pitch: 1.18, rate: 1.0 },
  { name: 'Bird Keeper', skill: 'Celebrates with a clever little bird', anim: 'bird', gear: null, prop: 'bird', fx: 'heart', speech: 'We did it! My little bird says well played!', pitch: 1.12, rate: 0.96 },
  { name: 'Pet Trainer', skill: 'Celebrates with a loyal pet companion', anim: 'pet', gear: null, prop: 'pet', fx: 'heart', speech: 'Good job, team! My best friend is celebrating too!', pitch: 0.98, rate: 0.98 },
  { name: 'Guitarist', skill: 'Plays a quick electric guitar riff', anim: 'guitar', gear: 'rocker', prop: 'guitar', fx: 'music', speech: 'That was a winning riff! Rock on!', pitch: 0.9, rate: 1.08 },
  { name: 'DJ', skill: 'Drops a celebratory beat', anim: 'bob', gear: 'dj', prop: 'controller', fx: 'music', speech: 'DJ in the house! That point is mine!', pitch: 0.86, rate: 1.12 },
  { name: 'Dancer', skill: 'Pops, locks and grooves', anim: 'dance', gear: null, prop: 'none', fx: 'music', speech: 'I answered right and I brought the moves!', pitch: 1.2, rate: 1.08 },
  { name: 'Ninja', skill: 'Performs a quick shadow-style flip', anim: 'jump', gear: 'ninja', prop: 'katana', fx: 'star', speech: 'Quick thinking. Clean victory!', pitch: 0.82, rate: 1.08 },
  { name: 'Energy Hero', skill: 'Releases a harmless burst of game energy', anim: 'energy', gear: 'hero', prop: 'bolt', fx: 'bolt', speech: 'Power up! Another smart answer wins!', pitch: 0.9, rate: 1.0 },
  { name: 'Firework Artist', skill: 'Launches a colourful confetti celebration', anim: 'energy', gear: 'pyro', prop: 'confetti', fx: 'sparkle', speech: 'A brilliant answer deserves a brilliant celebration!', pitch: 1.05, rate: 0.96 },
  { name: 'Astronaut', skill: 'Floats in a zero-gravity celebration', anim: 'float', gear: 'astronaut', prop: 'none', fx: 'star', speech: 'Victory confirmed. Mission accomplished!', pitch: 0.88, rate: 0.92 },
  { name: 'Skater', skill: 'Shows off a smooth skating trick', anim: 'skate', gear: null, prop: 'board', fx: 'star', speech: 'Smooth move! I landed that answer!', pitch: 1.0, rate: 1.08 },
  { name: 'Photographer', skill: 'Snaps a winner celebration photo', anim: 'camera', gear: 'detective', prop: 'camera', fx: 'sparkle', speech: 'Hold that pose. That is a winning moment!', pitch: 1.08, rate: 0.98 },
  { name: 'Chef', skill: 'Flips a celebratory dish', anim: 'slash', gear: 'chef', prop: 'pan', fx: 'sparkle', speech: 'Fresh answer, freshly served! Delicious!', pitch: 0.96, rate: 1.0 },
  { name: 'Scientist', skill: 'Celebrates a successful discovery', anim: 'energy', gear: 'scientist', prop: 'flask', fx: 'bubble', speech: 'The results are in. My answer was correct!', pitch: 1.04, rate: 0.96 },
  { name: 'Gamer', skill: 'Celebrates a perfect gaming moment', anim: 'shake', gear: 'gamer', prop: 'controller', fx: 'star', speech: 'Easy points! GG, everyone!', pitch: 0.9, rate: 1.14 },
  { name: 'Football Star', skill: 'Scores an imaginary winning goal', anim: 'kick', gear: null, prop: 'ball', fx: 'star', speech: 'What a finish! That is a top-class answer!', pitch: 0.92, rate: 1.02 },
  { name: 'Artist', skill: 'Paints a little victory sparkle', anim: 'pose', gear: null, prop: 'brush', fx: 'sparkle', speech: 'A masterpiece of an answer!', pitch: 1.16, rate: 0.98 },
  { name: 'Guardian', skill: 'Raises a shield in a heroic pose', anim: 'flex', gear: 'knight', prop: 'shield', fx: 'star', speech: 'The team is safe. The point is secured!', pitch: 0.84, rate: 0.98 },
  { name: 'Magician', skill: 'Performs a sparkling trick', anim: 'magic', gear: 'wizard', prop: 'wand', fx: 'sparkle', speech: 'And now, the magic of a correct answer!', pitch: 1.12, rate: 0.98 },
  { name: 'Explorer', skill: 'Waves a flag after a discovery', anim: 'wave', gear: 'cowboy', prop: 'flag', fx: 'star', speech: 'Another discovery! We are moving forward!', pitch: 0.96, rate: 0.98 },
  { name: 'Speedster', skill: 'Dashes into a victory pose', anim: 'jump', gear: null, prop: 'bolt', fx: 'bolt', speech: 'Too quick! I got there first!', pitch: 1.24, rate: 1.18 },
  { name: 'Comedian', skill: 'Delivers a cheerful victory pose', anim: 'juggle', gear: 'clown', prop: 'balls', fx: 'heart', speech: 'I came, I saw, I answered correctly!', pitch: 1.22, rate: 1.04 },
  { name: 'Scholar', skill: 'Raises a book after a smart answer', anim: 'pose', gear: null, prop: 'book', fx: 'star', speech: 'Knowledge wins again. Keep learning!', pitch: 0.94, rate: 0.94 }
];

const MAX_ID = AVATAR_COUNT - 1;
const clampId = id => Math.min(MAX_ID, Math.max(0, Number.isInteger(+id) ? +id : 0));

export const AVATARS = Array.from({ length: AVATAR_COUNT }, (_, id) => {
  const role = ROLES[id % ROLES.length], look = LOOKS[Math.floor(id / ROLES.length)];
  return { id, name: `${look.name} ${role.name}`, role: role.name, skill: role.skill, anim: role.anim, speech: role.speech, pitch: role.pitch || 1, rate: role.rate || 1 };
});

const cache = new Map();

function build(id) {
  const role = ROLES[id % ROLES.length], look = LOOKS[Math.floor(id / ROLES.length)];
  const skin = role.skin || look.skin, outfit = look.outfit;
  const gear = role.gear && GEAR[role.gear] ? GEAR[role.gear](look.hair) : HAIR_STYLES[id % HAIR_STYLES.length](look.hair);
  const behind = BACK[role.gear] || '';
  const front = gear;
  const balls = role.prop === 'balls'
    ? '<g class="balls"><circle class="b1" cx="22" cy="40" r="5" fill="#ef4444"/><circle class="b2" cx="50" cy="40" r="5" fill="#22c55e"/><circle class="b3" cx="78" cy="40" r="5" fill="#3b82f6"/></g>'
    : '';
  const coat = role.gear === 'scientist' ? '<rect x="36" y="50" width="28" height="30" rx="10" fill="#f8fafc"/><rect x="48" y="52" width="4" height="26" fill="#e2e8f0"/>' : '';
  const stageProps = role.prop === 'drumsticks' ? '<g class="drum-kit"><ellipse cx="31" cy="82" rx="12" ry="7" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/><ellipse cx="31" cy="79" rx="12" ry="5" fill="#fecaca"/><ellipse cx="70" cy="83" rx="11" ry="6" fill="#2563eb" stroke="#1e3a8a" stroke-width="2"/><ellipse cx="70" cy="80" rx="11" ry="4" fill="#bfdbfe"/></g>' : '';
  const companion = role.prop === 'bird' ? '<g class="companion bird-companion"><ellipse cx="25" cy="54" rx="9" ry="11" fill="#38bdf8"/><circle cx="22" cy="51" r="1.5" fill="#0f172a"/><path d="M16 55l-6 2 6 2z" fill="#f59e0b"/></g>' : role.prop === 'pet' ? '<g class="companion pet-companion"><circle cx="24" cy="62" r="10" fill="#c08457"/><path d="M17 56l-5-7 9 2m5 5l6-7-1 10" fill="#92400e"/><circle cx="21" cy="61" r="1.4" fill="#1e293b"/><circle cx="28" cy="61" r="1.4" fill="#1e293b"/></g>' : '';
  return `<svg class="mpav a-${role.anim}" viewBox="0 0 100 120" role="img" aria-label="${AVATARS[id].name}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="shirt-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".3"/><stop offset=".5" stop-color="${outfit}"/><stop offset="1" stop-color="#0f172a" stop-opacity=".24"/></linearGradient><radialGradient id="skin-${id}" cx="35%" cy="25%"><stop offset="0" stop-color="#ffffff" stop-opacity=".35"/><stop offset="1" stop-color="${skin}"/></radialGradient></defs>\n<g class="av-fx">${FX[role.fx]}</g>${companion}
<ellipse class="av-shadow" cx="50" cy="111" rx="20" ry="4" fill="#0f172a" fill-opacity=".16"/>
<g class="av-body">${behind}
<g class="av-legs"><rect x="39" y="76" width="9" height="26" rx="4.5" fill="#334155"/><rect x="52" y="76" width="9" height="26" rx="4.5" fill="#334155"/><ellipse cx="42" cy="103" rx="7" ry="4" fill="#0f172a"/><ellipse cx="58" cy="103" rx="7" ry="4" fill="#0f172a"/></g>
<rect x="35" y="50" width="30" height="30" rx="11" fill="url(#shirt-${id})"/>${coat}
<g class="av-arm-l"><rect x="28" y="52" width="9" height="24" rx="4.5" fill="${outfit}"/><circle cx="32.5" cy="78" r="4.6" fill="${skin}"/></g>
<g class="av-arm-r"><rect x="63" y="52" width="9" height="24" rx="4.5" fill="${outfit}"/><circle cx="67.5" cy="78" r="4.6" fill="${skin}"/>${PROPS[role.prop] || ''}</g>
${balls}
${stageProps}
<g class="av-head"><circle cx="50" cy="34" r="17" fill="url(#skin-${id})"/>${front}
<circle cx="44" cy="34" r="2.3" fill="#1e293b"/><circle cx="56" cy="34" r="2.3" fill="#1e293b"/><circle cx="44.8" cy="33.2" r=".8" fill="#fff"/><circle cx="56.8" cy="33.2" r=".8" fill="#fff"/>
<ellipse cx="39.5" cy="40" rx="3.2" ry="2" fill="#f472b6" fill-opacity=".38"/><ellipse cx="60.5" cy="40" rx="3.2" ry="2" fill="#f472b6" fill-opacity=".38"/>
<path d="M45 41Q50 46 55 41" fill="none" stroke="#1e293b" stroke-width="1.8" stroke-linecap="round"/></g>
</g></svg>`;
}

/* Returns the avatar as an SVG string. `still` turns the animation off (used in the picker). */
export function avatarSvg(id, { still = false } = {}) {
  const key = clampId(id);
  if (!cache.has(key)) cache.set(key, build(key));
  const svg = cache.get(key);
  if (still) return svg.replace('class="mpav', 'class="mpav still');
  /* A different starting offset per avatar keeps a crowded lobby from moving in lockstep. */
  return svg.replace('class="mpav', `style="--d:-${((key * 37) % 20) / 10}s" class="mpav`);
}
