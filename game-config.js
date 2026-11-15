// Edit this file to customise your board. Tiles are numbered 1–100 in the
// classic serpentine layout (1 at bottom-left, 100 at top-left).
//
// IMPORTANT: the real game rules run on the server (supabase-game-functions.sql).
// If you change anything below, change the same values in that SQL file and
// run it again, otherwise the board you SEE and the board the server USES differ.
//
// Loop-proof rules this layout follows (checked automatically before shipping):
//  1. A storm exit / ladder top is never a storm entrance, ladder bottom or gift tile,
//     so jumps never chain into each other.
//  2. From a storm exit or ladder top, one dice roll can never reach a storm entrance
//     (and from a storm exit, never a ladder bottom) – no ping-pong between hazards.
//  3. The server never applies a second jump after a jump.

// Fake e-mail domain used behind the scenes so players only need a username + password.
// Must match c_domain in supabase-game-functions.sql / supabase-username-login.sql.
export const AUTH_EMAIL_DOMAIN = "players.perfectstorm.game";

// MP (moasta points) earned for every completed task.
export const TASK_MP = 50;

export const MILESTONES = [25, 50, 75];

// RULE FOR EVERY LADDER AND STORM: the jump is exactly ONE ROW and stays in the same column
// (ladder: one row up, storm: one row down), because the pictures are only about one tile tall.
// e.g. ladder 8 -> 13, storm 30 -> 11.
//
// Storm portals: entrance tile -> exit tile (sends you BACK).
// A milestone you already unlocked is a floor: a storm can never push you below it.
export const STORM_PORTALS = {
  30: 11,
  40: 21,
  68: 53,
  95: 86,
  98: 83
};

// Ladders: bottom tile -> top tile (sends you FORWARD).
export const LADDERS = {
  8: 13,
  18: 23,
  37: 44,
  46: 55,
  65: 76,
  73: 88,
  82: 99
};


// Day 1 of the season (KST). Backgrounds rotate daily through the 7 images.
export const SEASON_START_DATE = "2026-11-14";
export const BACKGROUND_COUNT = 7;

// 10 gift tiles. Each is opened once per player; one outcome is picked at random:
// forward, backward, dud, or "reroll" (roll the dice one more time today).
// Gifts never trigger ladders or storms afterwards.
export const GIFTS = {
  5: [
    { type: "forward" , amount: 3, message: "A lucky star! Move forward 3 tiles." },
    { type: "backward", amount: 2, message: "A little storm! Move back 2 tiles." },
    { type: "dud"     , amount: 0, message: "A mysterious box… it was empty!" },
    { type: "reroll"  , amount: 0, message: "A golden ticket! Roll the dice one more time." }
  ],
  12: [
    { type: "forward" , amount: 4, message: "A sparkling gift! Move forward 4 tiles." },
    { type: "backward", amount: 3, message: "Oops! Move back 3 tiles." },
    { type: "dud"     , amount: 0, message: "A dud! Better luck next time." },
    { type: "reroll"  , amount: 0, message: "Bonus roll! Roll the dice one more time." }
  ],
  22: [
    { type: "forward" , amount: 4, message: "A little boost! Move forward 4 tiles." },
    { type: "backward", amount: 3, message: "The storm caught you. Move back 3 tiles." },
    { type: "dud"     , amount: 0, message: "Nothing inside this one!" },
    { type: "reroll"  , amount: 0, message: "Lucky you! You get to roll one more time." }
  ],
  33: [
    { type: "forward" , amount: 6, message: "A wonderful surprise! Move forward 6 tiles." },
    { type: "backward", amount: 5, message: "A tricky surprise. Move back 5 tiles." },
    { type: "dud"     , amount: 0, message: "Just confetti. No movement!" },
    { type: "reroll"  , amount: 0, message: "A golden ticket! Roll the dice one more time." }
  ],
  42: [
    { type: "forward" , amount: 5, message: "A lucky star! Move forward 5 tiles." },
    { type: "backward", amount: 4, message: "A little storm! Move back 4 tiles." },
    { type: "dud"     , amount: 0, message: "A mysterious box… it was empty!" },
    { type: "reroll"  , amount: 0, message: "Bonus roll! Roll the dice one more time." }
  ],
  52: [
    { type: "forward" , amount: 5, message: "A sparkling gift! Move forward 5 tiles." },
    { type: "backward", amount: 4, message: "Oops! Move back 4 tiles." },
    { type: "dud"     , amount: 0, message: "A dud! Better luck next time." },
    { type: "reroll"  , amount: 0, message: "Lucky you! You get to roll one more time." }
  ],
  62: [
    { type: "forward" , amount: 5, message: "A little boost! Move forward 5 tiles." },
    { type: "backward", amount: 4, message: "The storm caught you. Move back 4 tiles." },
    { type: "dud"     , amount: 0, message: "Nothing inside this one!" },
    { type: "reroll"  , amount: 0, message: "A golden ticket! Roll the dice one more time." }
  ],
  70: [
    { type: "forward" , amount: 6, message: "A wonderful surprise! Move forward 6 tiles." },
    { type: "backward", amount: 5, message: "A tricky surprise. Move back 5 tiles." },
    { type: "dud"     , amount: 0, message: "Just confetti. No movement!" },
    { type: "reroll"  , amount: 0, message: "Bonus roll! Roll the dice one more time." }
  ],
  85: [
    { type: "forward" , amount: 7, message: "A lucky star! Move forward 7 tiles." },
    { type: "backward", amount: 6, message: "A little storm! Move back 6 tiles." },
    { type: "dud"     , amount: 0, message: "A mysterious box… it was empty!" },
    { type: "reroll"  , amount: 0, message: "Lucky you! You get to roll one more time." }
  ],
  94: [
    { type: "forward" , amount: 5, message: "A sparkling gift! Move forward 5 tiles." },
    { type: "backward", amount: 4, message: "Oops! Move back 4 tiles." },
    { type: "dud"     , amount: 0, message: "A dud! Better luck next time." },
    { type: "reroll"  , amount: 0, message: "A golden ticket! Roll the dice one more time." }
  ]
};

// OLD sample quests (no longer used). Tasks now live in the `song_tasks` and `other_tasks` tables: edit them in
// Supabase → Table Editor (see README).
export const TASKS_BY_DICE = {
  1: ["Listen to one TXT song mindfully", "Write down one lyric that made you smile", "Take a 10-minute break"],
  2: ["Listen to two TXT songs", "Drink a glass of water", "Write one thing you're grateful for"],
  3: ["Watch a TXT performance", "Stretch for 5 minutes", "Tidy your desk for 5 minutes"],
  4: ["Listen to your favourite TXT album track", "Go for a short walk", "Take a photo of something pretty"],
  5: ["Watch a TXT variety clip", "Do one small task you've been postponing", "Write a short journal entry"],
  6: ["Have a mini self-care session", "Listen to a TXT song you haven't heard recently", "Do something creative for 15 minutes"]
};

// Daily dice rolls (keep equal to c_rolls_per_day in supabase-game-functions.sql).
// Each roll gives the first 2 tasks of its dice number (c_tasks_per_roll in the SQL).
export const ROLLS_PER_DAY = 3;

// The album shown in the leaderboard "streams collected" box. Titles are matched ignoring
// capitals, punctuation and "(… ver.)" brackets. Order = order shown.
export const ALBUM_NAME = "PERFECT STORM";
export const ALBUM_TRACKS = [
  "Storm is…",
  "Angel Bite",
  "Higher Love",
  "Sweetest Escape",
  "Touch the Sky",
  "Hate It or Love It"
];


// ==========================================================================
// THREE BOARDS.  Tiles are numbered 1-300 in total: board 1 = 1-100, board 2 = 101-200,
// board 3 = 201-300.  The numbers below are LOCAL (1-100) for each board; the board adds
// its offset (0 / 100 / 200).  Board 1 is the original board defined above.
//  * Board 2 "Ride the Storm": checkpoints (125, 150, 175), more storms.
//  * Board 3 "Eye of the Storm": NO checkpoints, even more storms, gifts mostly move you back.
// The server copy of all of this is `c_boards` in roll_core() (supabase-game-functions.sql).
// Every ladder/storm is exactly one row and loop-checked (see rules at the top).
// ==========================================================================
export const BOARD_SIZE = 100;
export const BOARD_COUNT = 3;
export const TOTAL_TILES = 300;

export const BOARDS = [
  { name: "Storm Is Coming", sub: "Tiles 1–100",
    milestones: MILESTONES, storms: STORM_PORTALS, ladders: LADDERS, gifts: GIFTS },
  { name: "Ride the Storm", sub: "Tiles 101–200",
    milestones: [25, 50, 75],
    storms: {"20": 1, "29": 12, "40": 21, "49": 32, "60": 41, "68": 53, "86": 75, "89": 72},
    ladders: {"8": 13, "30": 31, "39": 42, "63": 78, "69": 72, "88": 93},
    gifts: {
    3: [{"type": "forward", "amount": 4, "message": "A sparkling gift! Move forward 4 tiles."}, {"type": "backward", "amount": 5, "message": "Oops! A gust pushes you back 5 tiles."}, {"type": "backward", "amount": 8, "message": "Oops! A gust pushes you back 8 tiles."}, {"type": "dud", "amount": 0, "message": "A mysterious box… it was empty!"}, {"type": "reroll", "amount": 0, "message": "Bonus roll! Roll the dice one more time."}],
    19: [{"type": "forward", "amount": 6, "message": "A lucky star! Move forward 6 tiles."}, {"type": "backward", "amount": 4, "message": "The storm caught you. Move back 4 tiles!"}, {"type": "backward", "amount": 6, "message": "Oops! A gust pushes you back 6 tiles."}, {"type": "dud", "amount": 0, "message": "Just confetti. No movement!"}, {"type": "reroll", "amount": 0, "message": "Bonus roll! Roll the dice one more time."}],
    23: [{"type": "forward", "amount": 4, "message": "A lucky star! Move forward 4 tiles."}, {"type": "backward", "amount": 4, "message": "A tricky surprise. Move back 4 tiles."}, {"type": "backward", "amount": 6, "message": "The storm caught you. Move back 6 tiles!"}, {"type": "dud", "amount": 0, "message": "Nothing inside this one!"}, {"type": "reroll", "amount": 0, "message": "Bonus roll! Roll the dice one more time."}],
    28: [{"type": "forward", "amount": 6, "message": "A little boost! Move forward 6 tiles."}, {"type": "backward", "amount": 5, "message": "A tricky surprise. Move back 5 tiles."}, {"type": "backward", "amount": 5, "message": "Oops! A gust pushes you back 5 tiles."}, {"type": "dud", "amount": 0, "message": "Just confetti. No movement!"}, {"type": "reroll", "amount": 0, "message": "A golden ticket! Roll the dice one more time."}],
    38: [{"type": "forward", "amount": 6, "message": "A lucky star! Move forward 6 tiles."}, {"type": "backward", "amount": 5, "message": "A tricky surprise. Move back 5 tiles."}, {"type": "backward", "amount": 5, "message": "The storm caught you. Move back 5 tiles!"}, {"type": "dud", "amount": 0, "message": "A mysterious box… it was empty!"}, {"type": "reroll", "amount": 0, "message": "A golden ticket! Roll the dice one more time."}],
    46: [{"type": "forward", "amount": 5, "message": "A little boost! Move forward 5 tiles."}, {"type": "backward", "amount": 4, "message": "Oops! A gust pushes you back 4 tiles."}, {"type": "backward", "amount": 7, "message": "The storm caught you. Move back 7 tiles!"}, {"type": "dud", "amount": 0, "message": "A mysterious box… it was empty!"}, {"type": "reroll", "amount": 0, "message": "A golden ticket! Roll the dice one more time."}],
    54: [{"type": "forward", "amount": 5, "message": "A lucky star! Move forward 5 tiles."}, {"type": "backward", "amount": 4, "message": "The storm caught you. Move back 4 tiles!"}, {"type": "backward", "amount": 5, "message": "A tricky surprise. Move back 5 tiles."}, {"type": "dud", "amount": 0, "message": "Just confetti. No movement!"}, {"type": "reroll", "amount": 0, "message": "A golden ticket! Roll the dice one more time."}],
    67: [{"type": "forward", "amount": 4, "message": "A sparkling gift! Move forward 4 tiles."}, {"type": "backward", "amount": 6, "message": "Oops! A gust pushes you back 6 tiles."}, {"type": "backward", "amount": 8, "message": "The storm caught you. Move back 8 tiles!"}, {"type": "dud", "amount": 0, "message": "Nothing inside this one!"}, {"type": "reroll", "amount": 0, "message": "A golden ticket! Roll the dice one more time."}],
    77: [{"type": "forward", "amount": 6, "message": "A little boost! Move forward 6 tiles."}, {"type": "backward", "amount": 5, "message": "Oops! A gust pushes you back 5 tiles."}, {"type": "backward", "amount": 7, "message": "A tricky surprise. Move back 7 tiles."}, {"type": "dud", "amount": 0, "message": "Nothing inside this one!"}, {"type": "reroll", "amount": 0, "message": "Bonus roll! Roll the dice one more time."}],
    82: [{"type": "forward", "amount": 5, "message": "A lucky star! Move forward 5 tiles."}, {"type": "backward", "amount": 5, "message": "The storm caught you. Move back 5 tiles!"}, {"type": "backward", "amount": 7, "message": "The storm caught you. Move back 7 tiles!"}, {"type": "dud", "amount": 0, "message": "Just confetti. No movement!"}, {"type": "reroll", "amount": 0, "message": "Bonus roll! Roll the dice one more time."}]
  } },
  { name: "Eye of the Storm", sub: "Tiles 201–300 · no checkpoints",
    milestones: [],
    storms: {"16": 5, "19": 2, "36": 25, "39": 22, "54": 47, "57": 44, "60": 41, "74": 67, "77": 64, "80": 61, "95": 86, "99": 82},
    ladders: {"17": 24, "20": 21, "34": 47, "76": 85},
    gifts: {
    11: [{"type": "forward", "amount": 3, "message": "A lucky star! Move forward 3 tiles."}, {"type": "backward", "amount": 9, "message": "A tricky surprise. Move back 9 tiles."}, {"type": "backward", "amount": 7, "message": "The storm caught you. Move back 7 tiles!"}, {"type": "backward", "amount": 8, "message": "The storm caught you. Move back 8 tiles!"}, {"type": "dud", "amount": 0, "message": "A mysterious box… it was empty!"}, {"type": "reroll", "amount": 0, "message": "A golden ticket! Roll the dice one more time."}],
    29: [{"type": "forward", "amount": 5, "message": "A sparkling gift! Move forward 5 tiles."}, {"type": "backward", "amount": 7, "message": "The storm caught you. Move back 7 tiles!"}, {"type": "backward", "amount": 8, "message": "The storm caught you. Move back 8 tiles!"}, {"type": "backward", "amount": 5, "message": "The storm caught you. Move back 5 tiles!"}, {"type": "dud", "amount": 0, "message": "Just confetti. No movement!"}, {"type": "reroll", "amount": 0, "message": "Bonus roll! Roll the dice one more time."}],
    33: [{"type": "forward", "amount": 5, "message": "A lucky star! Move forward 5 tiles."}, {"type": "backward", "amount": 9, "message": "The storm caught you. Move back 9 tiles!"}, {"type": "backward", "amount": 8, "message": "Oops! A gust pushes you back 8 tiles."}, {"type": "backward", "amount": 5, "message": "Oops! A gust pushes you back 5 tiles."}, {"type": "dud", "amount": 0, "message": "A mysterious box… it was empty!"}, {"type": "reroll", "amount": 0, "message": "A golden ticket! Roll the dice one more time."}],
    37: [{"type": "forward", "amount": 4, "message": "A lucky star! Move forward 4 tiles."}, {"type": "backward", "amount": 9, "message": "A tricky surprise. Move back 9 tiles."}, {"type": "backward", "amount": 9, "message": "The storm caught you. Move back 9 tiles!"}, {"type": "backward", "amount": 6, "message": "Oops! A gust pushes you back 6 tiles."}, {"type": "dud", "amount": 0, "message": "Just confetti. No movement!"}, {"type": "reroll", "amount": 0, "message": "A golden ticket! Roll the dice one more time."}],
    52: [{"type": "forward", "amount": 3, "message": "A lucky star! Move forward 3 tiles."}, {"type": "backward", "amount": 7, "message": "The storm caught you. Move back 7 tiles!"}, {"type": "backward", "amount": 9, "message": "Oops! A gust pushes you back 9 tiles."}, {"type": "backward", "amount": 6, "message": "The storm caught you. Move back 6 tiles!"}, {"type": "dud", "amount": 0, "message": "A mysterious box… it was empty!"}, {"type": "reroll", "amount": 0, "message": "Bonus roll! Roll the dice one more time."}],
    58: [{"type": "forward", "amount": 5, "message": "A sparkling gift! Move forward 5 tiles."}, {"type": "backward", "amount": 7, "message": "Oops! A gust pushes you back 7 tiles."}, {"type": "backward", "amount": 8, "message": "The storm caught you. Move back 8 tiles!"}, {"type": "backward", "amount": 8, "message": "Oops! A gust pushes you back 8 tiles."}, {"type": "dud", "amount": 0, "message": "Just confetti. No movement!"}, {"type": "reroll", "amount": 0, "message": "A golden ticket! Roll the dice one more time."}],
    62: [{"type": "forward", "amount": 4, "message": "A little boost! Move forward 4 tiles."}, {"type": "backward", "amount": 6, "message": "Oops! A gust pushes you back 6 tiles."}, {"type": "backward", "amount": 9, "message": "A tricky surprise. Move back 9 tiles."}, {"type": "backward", "amount": 7, "message": "Oops! A gust pushes you back 7 tiles."}, {"type": "dud", "amount": 0, "message": "Nothing inside this one!"}, {"type": "reroll", "amount": 0, "message": "Bonus roll! Roll the dice one more time."}],
    68: [{"type": "forward", "amount": 3, "message": "A sparkling gift! Move forward 3 tiles."}, {"type": "backward", "amount": 6, "message": "A tricky surprise. Move back 6 tiles."}, {"type": "backward", "amount": 9, "message": "A tricky surprise. Move back 9 tiles."}, {"type": "backward", "amount": 6, "message": "A tricky surprise. Move back 6 tiles."}, {"type": "dud", "amount": 0, "message": "Nothing inside this one!"}, {"type": "reroll", "amount": 0, "message": "A golden ticket! Roll the dice one more time."}],
    81: [{"type": "forward", "amount": 3, "message": "A sparkling gift! Move forward 3 tiles."}, {"type": "backward", "amount": 7, "message": "The storm caught you. Move back 7 tiles!"}, {"type": "backward", "amount": 7, "message": "A tricky surprise. Move back 7 tiles."}, {"type": "backward", "amount": 7, "message": "Oops! A gust pushes you back 7 tiles."}, {"type": "dud", "amount": 0, "message": "Nothing inside this one!"}, {"type": "reroll", "amount": 0, "message": "Bonus roll! Roll the dice one more time."}],
    94: [{"type": "forward", "amount": 5, "message": "A lucky star! Move forward 5 tiles."}, {"type": "backward", "amount": 7, "message": "Oops! A gust pushes you back 7 tiles."}, {"type": "backward", "amount": 7, "message": "Oops! A gust pushes you back 7 tiles."}, {"type": "backward", "amount": 8, "message": "Oops! A gust pushes you back 8 tiles."}, {"type": "dud", "amount": 0, "message": "A mysterious box… it was empty!"}, {"type": "reroll", "amount": 0, "message": "A golden ticket! Roll the dice one more time."}]
  } }
];

// Badges shown next to a player's name: one tier per board finished.
export const BADGES = [
  null,
  { icon: "⚡", name: "Storm Rider" },
  { icon: "🌩️", name: "Storm Breaker" },
  { icon: "👁️", name: "Eye of the Storm" }
];

// Unlockable chibi items. `id` and `name` must match the chibi_items table in the SQL.
// Checkpoint items are common drops; finishing a board gives a rarer one.
export const CHIBI_ITEMS = [
  { id: "cp-25",   slot: "accessory", name: "Raindrop clip",  rarity: "common",    how: "Reach checkpoint 25" },
  { id: "cp-50",   slot: "accessory", name: "Storm cloud",    rarity: "common",    how: "Reach checkpoint 50" },
  { id: "cp-75",   slot: "outfit",    name: "Raincoat",       rarity: "common",    how: "Reach checkpoint 75" },
  { id: "cp-125",  slot: "accessory", name: "Lightning pin",  rarity: "common",    how: "Reach checkpoint 125 (board 2)" },
  { id: "cp-150",  slot: "outfit",    name: "Storm hoodie",   rarity: "common",    how: "Reach checkpoint 150 (board 2)" },
  { id: "cp-175",  slot: "accessory", name: "Neon halo",      rarity: "common",    how: "Reach checkpoint 175 (board 2)" },
  { id: "board-1", slot: "outfit",    name: "Storm cloak",    rarity: "rare",      how: "Finish board 1 (tile 100)" },
  { id: "board-2", slot: "aura",      name: "Lightning aura", rarity: "epic",      how: "Finish board 2 (tile 200)" },
  { id: "board-3", slot: "wings",     name: "Storm wings",    rarity: "legendary", how: "Finish board 3 (tile 300)" },

  // ---- SHOP ITEMS: bought with moasta points (MP). Same ids / names / prices as supabase-game-functions.sql ----
  { id: "hair-bun", slot: "style", name: "Messy bun", rarity: "common", kind: "shop", price: 150, how: "Shop · 150 MP" },
  { id: "hair-spacebuns", slot: "style", name: "Space buns", rarity: "common", kind: "shop", price: 200, how: "Shop · 200 MP" },
  { id: "hair-braid", slot: "style", name: "Long braid", rarity: "common", kind: "shop", price: 250, how: "Shop · 250 MP" },
  { id: "hair-wolf", slot: "style", name: "Wolf cut", rarity: "rare", kind: "shop", price: 450, how: "Shop · 450 MP" },
  { id: "hair-windswept", slot: "style", name: "Windswept", rarity: "rare", kind: "shop", price: 600, how: "Shop · 600 MP" },
  { id: "fit-denim", slot: "outfit", name: "Denim jacket", rarity: "common", kind: "shop", price: 200, how: "Shop · 200 MP" },
  { id: "fit-pjs", slot: "outfit", name: "Starry pajamas", rarity: "common", kind: "shop", price: 250, how: "Shop · 250 MP" },
  { id: "fit-stage", slot: "outfit", name: "Stage jacket", rarity: "rare", kind: "shop", price: 600, how: "Shop · 600 MP" },
  { id: "fit-windbreaker", slot: "outfit", name: "Neon windbreaker", rarity: "rare", kind: "shop", price: 700, how: "Shop · 700 MP" },
  { id: "fit-cloud", slot: "outfit", name: "Cloud dress", rarity: "epic", kind: "shop", price: 1100, how: "Shop · 1100 MP" },
  { id: "acc-glasses", slot: "accessory", name: "Round glasses", rarity: "common", kind: "shop", price: 100, how: "Shop · 100 MP" },
  { id: "acc-sunnies", slot: "accessory", name: "Sunglasses", rarity: "common", kind: "shop", price: 150, how: "Shop · 150 MP" },
  { id: "acc-cat", slot: "accessory", name: "Cat ears", rarity: "common", kind: "shop", price: 200, how: "Shop · 200 MP" },
  { id: "acc-scarf", slot: "accessory", name: "Fuzzy scarf", rarity: "common", kind: "shop", price: 250, how: "Shop · 250 MP" },
  { id: "acc-pearls", slot: "accessory", name: "Pearl headband", rarity: "rare", kind: "shop", price: 400, how: "Shop · 400 MP" },
  { id: "acc-crown", slot: "accessory", name: "Gold crown", rarity: "rare", kind: "shop", price: 750, how: "Shop · 750 MP" },
  { id: "acc-tiara", slot: "accessory", name: "Crystal tiara", rarity: "epic", kind: "shop", price: 1200, how: "Shop · 1200 MP" },
  { id: "aura-sparkle", slot: "aura", name: "Sparkle aura", rarity: "rare", kind: "shop", price: 650, how: "Shop · 650 MP" },
  { id: "aura-rain", slot: "aura", name: "Rain shimmer", rarity: "epic", kind: "shop", price: 900, how: "Shop · 900 MP" },
  { id: "aura-rainbow", slot: "aura", name: "Rainbow storm", rarity: "epic", kind: "shop", price: 1400, how: "Shop · 1400 MP" },
  { id: "wings-cloud", slot: "wings", name: "Cloud wings", rarity: "rare", kind: "shop", price: 900, how: "Shop · 900 MP" },
  { id: "wings-butterfly", slot: "wings", name: "Butterfly wings", rarity: "epic", kind: "shop", price: 1300, how: "Shop · 1300 MP" },
  { id: "wings-rainbow", slot: "wings", name: "Rainbow wings", rarity: "legendary", kind: "shop", price: 1800, how: "Shop · 1800 MP" }
];


// ==========================================================================
// MP (moasta points) EXTRAS.  Keep equal to the SQL (grant_progress_unlocks).
//  * Every completed task = TASK_MP (50), whichever table it came from.
//  * Every checkpoint you reach (once): +CHECKPOINT_MP.
//  * Finishing a board (once): +BOARD_FINISH_MP[tile].
// Your SPENDABLE balance = mp (earned) - mp_spent. The leaderboard ranks by mp EARNED, so buying
// things never drops you down the ranking.
// ==========================================================================
export const CHECKPOINT_MP = 10;
export const BOARD_FINISH_MP = { 100: 25, 200: 50, 300: 75 };
