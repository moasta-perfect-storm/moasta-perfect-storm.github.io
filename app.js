
import { supabase } from "./supabase-config.js";
import {
  BOARDS, BOARD_SIZE, BOARD_COUNT, TOTAL_TILES, BADGES, CHIBI_ITEMS,
  SEASON_START_DATE, BACKGROUND_COUNT,
  AUTH_EMAIL_DOMAIN, TASK_MP, ROLLS_PER_DAY, ALBUM_NAME, ALBUM_TRACKS,
  CHECKPOINT_MP, BOARD_FINISH_MP
} from "./game-config.js";

const $ = (id) => document.getElementById(id);
const screens = ["tutorialScreen", "authScreen", "profileScreen", "appScreen"];

let currentUser = null;
let player = null;
let playersChannel = null;
let leaderboardSubscriptionPromise = null;
let authTransitionId = 0;
let portalAnimation = null;
let selectedAvatarState = {
  selections: {},
  colors: {
    hair: "#4A3728",
    skin: "#F4C9A8",
    clothes: "#D8C7F2",
    bottom: "#4D4767",
    stroke: "#302B40",
    background: "transparent"
  }
};
let authMode = "signup";
let rolling = false;

// ---- three boards ------------------------------------------------------------------
let viewBoard = 0;            // which board is shown (0-2)
let userPickedBoard = false;  // true once the player clicked a board tab
let animBoard = null;         // while a roll animates, the board the roll started on

// Where does a player stand? pos 100/200 = just finished a board, waiting on the START pad
// of the next one; 300 = finished the last board (stays on its final tile).
function placeOf(p) {
  const pos = p.position || 1;
  if (animBoard !== null && p.uid === currentUser?.id) return { board: animBoard, tile: pos };
  if (pos >= TOTAL_TILES) return { board: BOARD_COUNT - 1, tile: pos };
  const board = Math.floor(pos / BOARD_SIZE);
  return pos % BOARD_SIZE === 0 ? { board, tile: pos, start: true } : { board, tile: pos };
}
function boardsFinished(pos) { return Math.min(BOARD_COUNT, Math.floor((pos || 1) / BOARD_SIZE)); }
function badgeHtml(pos) {
  const b = BADGES[boardsFinished(pos)];
  return b ? `<span class="badge-chip badge-${boardsFinished(pos)}" title="${escapeHtml(b.name)}">${b.icon} ${escapeHtml(b.name)}</span>` : "";
}
function currentViewBoard() {
  if (animBoard !== null) return animBoard;
  if (!userPickedBoard && player) viewBoard = placeOf(player).board;
  return viewBoard;
}

// Start-up flow: the welcome page is ALWAYS shown first. Signed-in players
// simply see "Continue" and are routed after pressing it.
let hasEntered = false;        // has the player pressed the start button yet?
let profileReady = false;      // has get_my_profile finished (success or error)?
let profileLoadError = "";     // friendly message if loading the profile failed
let loadedUserId = null;       // which user the current `player` belongs to
let revealDismiss = null;      // lets the task popup be skipped early

window.latestPlayers = [];

// ---- Sound effects ------------------------------------------------------------
// Files live in ./assets/sounds/ - replace them with your own (same names) any time.
const SOUND_FILES = {
  up:     "./assets/sounds/moved-up.wav",     // a gift moved you forward
  down:   "./assets/sounds/moved-down.wav",   // a gift moved you backward
  storm:  "./assets/sounds/storm.wav",        // you went into a storm portal
  ladder: "./assets/sounds/ladder.wav"        // you climbed a ladder
};
const sounds = {};
let soundOn = true;
try { soundOn = localStorage.getItem("ps-sound") !== "off"; } catch (_) { /* private mode */ }

function preloadSounds() {
  Object.entries(SOUND_FILES).forEach(([name, src]) => {
    if (sounds[name]) return;
    try {
      const audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = 0.7;
      sounds[name] = audio;
    } catch (_) { /* no audio support */ }
  });
}

function playSound(name) {
  if (!soundOn) return;
  preloadSounds();
  const audio = sounds[name];
  if (!audio) return;
  try {
    audio.currentTime = 0;
    const result = audio.play();
    if (result && result.catch) result.catch(() => {});
  } catch (_) { /* ignore */ }
}

function updateSoundToggle() {
  const button = $("soundToggle");
  if (!button) return;
  button.textContent = soundOn ? "🔊" : "🔇";
  button.classList.toggle("off", !soundOn);
  button.setAttribute("aria-label", soundOn ? "Sound on" : "Sound off");
}

function showScreen(id) {
  screens.forEach(screen =>
    $(screen).classList.toggle("hidden", screen !== id)
  );
}

function showView(viewId) {
  document.querySelectorAll(".app-view").forEach(view =>
    view.classList.toggle("hidden", view.id !== viewId)
  );

  document.querySelectorAll(".nav-link").forEach(button =>
    button.classList.toggle("active", button.dataset.view === viewId)
  );

  // Opening the Tasklists page checks Last.fm for new TXT plays.
  if (viewId === "leaderboardView") loadStreamStats();
  if (viewId === "wardrobeView") renderWardrobe();
  if (viewId === "shopView") renderShop();

  if (viewId === "tasksView") {
    loadSongHistory();
    checkListening();
  }
}

function kstDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function gameDayIndex(today = kstDateKey()) {
  const [sy, sm, sd] = SEASON_START_DATE.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(sy, sm - 1, sd)) / 86400000);
  return Math.max(0, days);
}

// One background per KST day, cycling through background-1 … background-N.
function updateDailyBackground() {
  const today = kstDateKey();
  if (document.body.dataset.gameDate === today) return;

  const dayIndex = gameDayIndex(today);
  const number = (dayIndex % BACKGROUND_COUNT) + 1;

  document.body.style.setProperty(
    "--daily-background",
    `url("./assets/backgrounds/background-${number}.jpg")`
  );
  document.body.dataset.gameDay = String(dayIndex + 1);
  document.body.dataset.gameDate = today;
}

function msUntilKstMidnight() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(new Date());

  const p = Object.fromEntries(parts.map(x => [x.type, Number(x.value)]));
  const nextMidnightUtc =
    Date.UTC(p.year, p.month - 1, p.day + 1) - 9 * 60 * 60 * 1000;

  return Math.max(0, nextMidnightUtc - Date.now());
}

function updateCountdown() {
  updateDailyBackground();
  const remaining = msUntilKstMidnight();
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);

  $("countdown").textContent =
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function notify(message) {
  const toast = $("eventToast");
  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.add("hidden"), 4200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function boardOrder() {
  const order = [];

  for (let row = 9; row >= 0; row--) {
    const nums = Array.from(
      { length: 10 },
      (_, i) => row * 10 + i + 1
    );

    if (row % 2 === 1) nums.reverse();
    order.push(...nums);
  }

  return order;
}

function makeToken(p, tileGlobal) {
  const token = document.createElement("span");
  const isCurrentPlayer = p.uid === currentUser?.id;
  token.className = "player-token" + (isCurrentPlayer ? " me" : "");

  if (isCurrentPlayer && portalAnimation && portalAnimation.tile === tileGlobal) {
    token.classList.add(portalAnimation.className);
  }

  token.innerHTML = `<img class="chibi-image board-chibi" src="${escapeHtml(avatarDataUri(p.avatar, p.uid))}" alt="">`;
  token.title = p.name || "Player";
  return token;
}

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";

  const vb = currentViewBoard();
  const cfg = BOARDS[vb];
  const offset = vb * BOARD_SIZE;
  const hasCheckpoints = cfg.milestones.length > 0;

  // heading, tabs, legend and rules text follow the board being viewed
  $("boardTitle").textContent = cfg.name;
  $("boardEyebrow").textContent = `BOARD ${vb + 1} OF ${BOARD_COUNT} · ${cfg.sub.toUpperCase()}`;
  $("legendMilestone").classList.toggle("hidden", !hasCheckpoints);
  $("rulesTitle").textContent = hasCheckpoints ? "Storm checkpoint rule" : "No checkpoints here";
  $("rulesText").textContent = hasCheckpoints
    ? "Storm portals can take you down only as far as your highest unlocked milestone. Surprise gifts can still move you below it."
    : "The last storm has no safe floor. A storm portal can send you all the way back to the start of this board, and surprise gifts tend to push you back.";

  const finished = player ? boardsFinished(player.position) : 0;
  $("boardTabs").innerHTML = BOARDS.map((b, i) =>
    `<button type="button" class="board-tab${i === vb ? " active" : ""}${i < finished ? " done" : ""}" data-board="${i}" role="tab" title="${escapeHtml(b.name)}">${i < finished ? "✓ " : ""}Board ${i + 1}</button>`
  ).join("");

  const allPlayers = [...(window.latestPlayers || [])];

  if (player) {
    const ownIndex = allPlayers.findIndex(p => p.uid === currentUser?.id);

    if (ownIndex >= 0) allPlayers[ownIndex] = player;
    else allPlayers.push(player);
  }

  const byTile = new Map();
  const onStart = [];

  allPlayers.forEach(p => {
    if (!p.position) return;
    const place = placeOf(p);
    if (place.board !== vb) return;
    if (place.start) { onStart.push(p); return; }

    if (!byTile.has(place.tile)) byTile.set(place.tile, []);
    byTile.get(place.tile).push(p);
  });

  // START pad: players who finished the previous board wait here
  const pad = $("boardStart");
  pad.classList.toggle("hidden", vb === 0);
  if (vb > 0) {
    pad.innerHTML = `<span class="start-label">START · ${escapeHtml(cfg.name)}</span><span class="start-tokens"></span>`;
    const holder = pad.querySelector(".start-tokens");
    onStart.slice(0, 8).forEach(p => holder.appendChild(makeToken(p, offset)));
  }

  boardOrder().forEach(local => {
    const number = offset + local;
    const tile = document.createElement("div");
    tile.className = "tile";

    const isStorm = Object.hasOwn(cfg.storms, local);
    const isLadder = Object.hasOwn(cfg.ladders, local);
    const isGift = Object.hasOwn(cfg.gifts, local);
    const isMilestone = cfg.milestones.includes(local);

    if (isMilestone) tile.classList.add("milestone");
    if (isLadder) tile.classList.add("ladder");
    if (isStorm) tile.classList.add("storm");
    if (isGift) tile.classList.add("gift");

    const eventArt = isStorm
      ? `<img class="board-event-art storm-art" src="./assets/board/storm.png" alt="Storm portal" draggable="false">`
      : isLadder
        ? `<img class="board-event-art ladder-art" src="./assets/board/ladder.png" alt="Ladder" draggable="false">`
        : "";
    const symbol = isMilestone ? "✦" : isGift ? "🎁" : "";

    tile.innerHTML = `
      <span class="tile-number">${number}</span>
      ${eventArt}
      <span class="tile-symbol">${symbol}</span>
      <div class="player-stack"></div>
    `;

    const stack = tile.querySelector(".player-stack");
    (byTile.get(number) || []).slice(0, 5).forEach(p => stack.appendChild(makeToken(p, number)));

    board.appendChild(tile);
  });
}

$("boardTabs").addEventListener("click", event => {
  const tab = event.target.closest(".board-tab");
  if (!tab || animBoard !== null) return;
  userPickedBoard = true;
  viewBoard = Number(tab.dataset.board) || 0;
  renderBoard();
});

function updatePlayerUI() {
  if (!player) return;

  $("welcomeName").textContent = player.name;

  $("profileChip").innerHTML = `
    <img class="chibi-image profile-chibi" src="${escapeHtml(avatarDataUri(player.avatar, player.uid))}" alt="">
    <span>${escapeHtml(player.name)}</span>${badgeHtml(player.position)}
  `;

  $("topUser").innerHTML = `
    <button id="logoutButton" class="nav-link">Log out</button>
  `;

  $("logoutButton").addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  $("currentPosition").textContent = player.position ?? 1;
  $("statPosition").textContent = `${player.position ?? 1} / ${TOTAL_TILES}`;
  $("statBoard").textContent = `${placeOf(player).board + 1} / ${BOARD_COUNT}`;
  updateWardrobeBadge();
  updateShopNav();

  $("statMilestone").textContent =
    player.highestMilestone > 1
      ? `Tile ${player.highestMilestone}`
      : "Start";

  // Up to 3 rolls a day (admins: unlimited). A gift can add a bonus roll.
  const { rollsUsed, rollsLeft, bonusRoll, canRoll } = rollState();
  const alreadyRolled = !canRoll;
  $("adminPanel").classList.toggle("hidden", !player.isAdmin);

  $("statRoll").textContent = `${rollsUsed} / ${ROLLS_PER_DAY}`;

  $("rollButton").disabled = alreadyRolled || rolling;

  $("rollButton").textContent =
    alreadyRolled ? `All ${ROLLS_PER_DAY} rolls used ✓`
      : bonusRoll ? "Roll one more time ✦"
      : player.isAdmin ? "Roll dice ✦ (admin)"
      : `Roll dice ✦ (${rollsUsed + 1}/${ROLLS_PER_DAY})`;

  $("rollStatus").textContent =
    alreadyRolled
      ? "Your next adventure begins after the KST reset."
      : bonusRoll
        ? "A gift gave you a bonus roll!"
        : rollsUsed > 0
          ? `${rollsLeft} roll${rollsLeft === 1 ? "" : "s"} left today.`
          : "Your next adventure awaits.";

  $("diceNumber").textContent =
    rollsUsed > 0 ? (player.lastRoll || "?") : "?";

  renderBoard();
  renderListeningPanel();
  renderTaskHistory();
  renderSongHistory();
  if (!$("shopView").classList.contains("hidden")) renderShop();
}

const CHIBI_OPTIONS = {
  style: ["Soft bob", "Long waves", "Twin tails", "Side pony", "Short fluffy", "Bangs"],
  eyes: ["Sparkle", "Soft", "Sleepy", "Happy"],
  outfit: ["Heart sweater", "Sailor top", "Cardigan", "Hoodie", "Ribbon blouse"],
  accessory: ["None", "Bow", "Star clip", "Flower", "Headphones", "Beret"],
  aura: ["None"],
  wings: ["None"]
};
const CHIBI_PALETTES = {
  skin: ["#FBE0D2", "#F3C6A5", "#D99B78", "#A96F55", "#754A3A"],
  hair: ["#49313F", "#76506B", "#B87891", "#E7B8C9", "#6B789E", "#C89B62", "#292638"],
  clothes: ["#F4BFD7", "#CBB9F5", "#B9DDF1", "#C4E5CF", "#F5D99F", "#FFFFFF", "#55506D"]
};
const AVATAR_DEFAULTS = {style:"Soft bob", eyes:"Sparkle", outfit:"Heart sweater", accessory:"Bow", skin:"#F3C6A5", hair:"#76506B", clothes:"#F4BFD7"};
function normaliseAvatarState(value, seed="perfect-storm-player") {
  let saved = value;
  if (typeof value === "string") { try { saved = JSON.parse(value); } catch (_) { saved = null; } }
  const source = saved && typeof saved === "object" ? saved : {};
  const selections = source.selections || source;
  const colors = source.colors || {};
  return {
    style: selections.style || AVATAR_DEFAULTS.style,
    eyes: selections.eyes || AVATAR_DEFAULTS.eyes,
    outfit: selections.outfit || AVATAR_DEFAULTS.outfit,
    accessory: selections.accessory === "beret" ? "Beret" : (selections.accessory || AVATAR_DEFAULTS.accessory),
    skin: colors.skin || source.skin || AVATAR_DEFAULTS.skin,
    hair: colors.hair || source.hair || AVATAR_DEFAULTS.hair,
    clothes: colors.clothes || source.clothes || AVATAR_DEFAULTS.clothes,
    aura: selections.aura || source.aura || "None",
    wings: selections.wings || source.wings || "None",
    seed
  };
}
function avatarDataUri(value, seed="perfect-storm-player", view="0 0 320 320") {
  const a = normaliseAvatarState(value, seed);
  const hairBack = a.style === "Twin tails" ? `<circle cx="92" cy="158" r="32" fill="${a.hair}"/><circle cx="228" cy="158" r="32" fill="${a.hair}"/>` : `<path d="M91 132 Q72 42 160 39 Q248 42 229 132 L220 177 L100 177Z" fill="${a.hair}"/>`;
  const star4 = (x, y, r, fill) => `<path d="M${x} ${y - r} L${x + r * .3} ${y - r * .3} L${x + r} ${y} L${x + r * .3} ${y + r * .3} L${x} ${y + r} L${x - r * .3} ${y + r * .3} L${x - r} ${y} L${x - r * .3} ${y - r * .3}Z" fill="${fill}"/>`;
  const mirror = (shape) => `${shape}<g transform="translate(320 0) scale(-1 1)">${shape}</g>`;
  const hairCap = `<path d="M86 117 Q77 38 160 40 Q243 38 234 117 Q213 91 198 108 Q179 83 160 109 Q139 84 121 109 Q103 92 86 117Z" fill="${a.hair}"/>`;
  const SHOP_HAIR = {
    "Messy bun": `<circle cx="160" cy="30" r="27" fill="${a.hair}"/><path d="M142 20 Q160 6 178 22 M146 40 Q160 30 176 38" stroke="#FFFFFF" stroke-opacity=".3" stroke-width="3" fill="none" stroke-linecap="round"/>${hairCap}<path d="M144 54 Q160 64 176 54" stroke="#F4BFD7" stroke-width="6" fill="none" stroke-linecap="round"/>`,
    "Space buns": `<circle cx="104" cy="52" r="25" fill="${a.hair}"/><circle cx="216" cy="52" r="25" fill="${a.hair}"/><circle cx="104" cy="52" r="25" fill="none" stroke="#FFFFFF" stroke-opacity=".25" stroke-width="3"/><circle cx="216" cy="52" r="25" fill="none" stroke="#FFFFFF" stroke-opacity=".25" stroke-width="3"/>${hairCap}<circle cx="116" cy="76" r="5" fill="#F4BFD7"/><circle cx="204" cy="76" r="5" fill="#F4BFD7"/>`,
    "Long braid": `<path d="M88 118 Q79 42 160 43 Q241 42 232 118 Q205 91 185 96 Q150 111 88 118Z" fill="${a.hair}"/><g fill="${a.hair}" stroke="#302B40" stroke-opacity=".3" stroke-width="2"><ellipse cx="226" cy="150" rx="15" ry="19"/><ellipse cx="231" cy="178" rx="15" ry="19"/><ellipse cx="226" cy="206" rx="15" ry="19"/><ellipse cx="231" cy="234" rx="14" ry="18"/></g><path d="M222 252 Q231 266 240 252Z" fill="#F4BFD7"/><path d="M94 112 Q85 159 108 177 L121 139Z" fill="${a.hair}"/>`,
    "Wolf cut": `<path d="M82 124 Q68 34 160 38 Q252 34 238 124 L252 160 L228 146 L236 190 L210 150 Q198 104 160 104 Q122 104 110 150 L84 190 L92 146 L68 160Z" fill="${a.hair}"/><path d="M96 108 Q125 80 160 98 Q195 80 224 108 Q190 94 160 114 Q130 94 96 108Z" fill="${a.hair}" stroke="#FFFFFF" stroke-opacity=".2" stroke-width="2"/>`,
    "Windswept": `<path d="M86 117 Q77 38 160 40 Q243 38 234 117 Q200 90 150 108 Q114 116 86 117Z" fill="${a.hair}"/><path d="M90 108 Q40 112 22 160 Q60 146 98 142Z" fill="${a.hair}"/><path d="M92 96 Q50 78 30 100 Q64 96 96 112Z" fill="${a.hair}"/><path d="M226 100 Q268 80 292 44 Q256 62 222 78Z" fill="${a.hair}"/>`
  };
  const hairFront = {
    ...SHOP_HAIR,
    "Soft bob": `<path d="M88 118 Q79 42 160 43 Q241 42 232 118 Q205 91 185 96 Q150 111 88 118Z" fill="${a.hair}"/><path d="M94 112 Q85 159 108 177 L121 139Z M226 112 Q235 159 212 177 L199 139Z" fill="${a.hair}"/>`,
    "Long waves": `<path d="M86 111 Q76 35 160 40 Q244 35 234 111 L247 224 Q221 244 214 198 L222 117Z" fill="${a.hair}"/><path d="M94 110 Q79 170 87 220 Q111 238 119 184 L113 116Z" fill="${a.hair}"/>`,
    "Twin tails": `<path d="M87 113 Q79 39 160 41 Q241 39 233 113 Q202 87 160 96 Q119 88 87 113Z" fill="${a.hair}"/><path d="M111 89 Q132 67 157 92 Q133 104 111 89Z" fill="${a.hair}"/>`,
    "Side pony": `<path d="M88 113 Q77 40 160 41 Q241 39 233 113 Q204 91 160 97 Q119 89 88 113Z" fill="${a.hair}"/><path d="M215 95 Q265 113 242 177 Q224 198 215 160Z" fill="${a.hair}"/>`,
    "Short fluffy": `<path d="M86 119 Q73 37 160 39 Q247 37 234 119 Q217 88 201 93 Q179 74 160 94 Q129 74 111 99Z" fill="${a.hair}"/>`,
    "Bangs": `<path d="M86 117 Q77 38 160 40 Q243 38 234 117 Q213 91 198 108 Q179 83 160 109 Q139 84 121 109 Q103 92 86 117Z" fill="${a.hair}"/>`
  }[a.style] || "";
  const eyes = a.eyes === "Sleepy" ? `<path d="M126 127 Q137 137 148 127 M172 127 Q183 137 194 127" stroke="#493744" stroke-width="5" fill="none" stroke-linecap="round"/>` : a.eyes === "Happy" ? `<path d="M124 130 Q137 113 150 130 M170 130 Q183 113 196 130" stroke="#493744" stroke-width="5" fill="none" stroke-linecap="round"/>` : `<ellipse cx="138" cy="128" rx="8" ry="12" fill="#493744"/><ellipse cx="182" cy="128" rx="8" ry="12" fill="#493744"/><circle cx="140" cy="124" r="3" fill="white"/><circle cx="184" cy="124" r="3" fill="white"/>`;
  const baseOutfit = a.outfit === "Sailor top" ? `<path d="M105 205 L215 205 L247 300 L73 300Z" fill="${a.clothes}"/><path d="M135 204 L160 244 L185 204 L173 260 L147 260Z" fill="#FFFFFF"/><path d="M160 244 L149 267 L171 267Z" fill="#E98FB9"/>` : a.outfit === "Cardigan" ? `<path d="M104 205 Q160 185 216 205 L246 300 L74 300Z" fill="${a.clothes}"/><path d="M160 207 L160 300" stroke="#FFFFFF" stroke-width="5"/><circle cx="172" cy="245" r="3" fill="#FFFFFF"/><circle cx="172" cy="267" r="3" fill="#FFFFFF"/>` : a.outfit === "Hoodie" ? `<path d="M104 210 Q160 183 216 210 L247 300 L73 300Z" fill="${a.clothes}"/><path d="M130 207 Q160 168 190 207" stroke="#FFFFFF" stroke-width="10" fill="none"/><path d="M143 270 Q160 281 177 270" stroke="#FFFFFF" stroke-width="3" fill="none"/>` : a.outfit === "Ribbon blouse" ? `<path d="M105 205 L215 205 L247 300 L73 300Z" fill="${a.clothes}"/><path d="M160 216 L147 237 L160 249 L173 237Z" fill="#E98FB9"/>` : `<path d="M105 205 Q160 187 215 205 L247 300 L73 300Z" fill="${a.clothes}"/><path d="M145 244 Q160 228 175 244 Q160 265 145 244Z" fill="#E98FB9"/>`;
  const NEW_OUTFITS = {
    "Raincoat": `<path d="M104 208 Q160 184 216 208 L250 300 L70 300Z" fill="${a.clothes}"/><path d="M160 200 L160 300" stroke="#FFFFFF" stroke-width="4"/><path d="M122 214 L160 236 L198 214" stroke="#E8F55A" stroke-width="7" fill="none" stroke-linejoin="round"/><circle cx="148" cy="250" r="4" fill="#FFFFFF"/><circle cx="148" cy="272" r="4" fill="#FFFFFF"/><circle cx="172" cy="250" r="4" fill="#FFFFFF"/><circle cx="172" cy="272" r="4" fill="#FFFFFF"/><g stroke="#FFFFFF" stroke-width="2" opacity=".55"><path d="M95 262l-5 14M120 280l-5 14M200 276l-5 14M226 262l-5 14"/></g>`,
    "Storm hoodie": `<path d="M104 210 Q160 183 216 210 L247 300 L73 300Z" fill="${a.clothes}"/><path d="M130 207 Q160 168 190 207" stroke="#3B3F63" stroke-width="10" fill="none"/><path d="M150 214 L150 246 M170 214 L170 246" stroke="#D7FF3A" stroke-width="4" stroke-linecap="round"/><path d="M166 252 L150 276 H162 L156 298 L180 268 H167 L174 252Z" fill="#D7FF3A" stroke="#302B40" stroke-width="2" stroke-linejoin="round"/>`,
    "Storm cloak": `<path d="M88 206 Q160 178 232 206 L266 300 L54 300Z" fill="#363A62"/><path d="M88 206 Q160 178 232 206" stroke="#D7FF3A" stroke-width="5" fill="none"/><path d="M160 190 L160 300" stroke="#262A4D" stroke-width="3"/><circle cx="160" cy="216" r="10" fill="#D7FF3A" stroke="#302B40" stroke-width="2"/><path d="M165 208 L156 218 H162 L158 227 L168 215 H162Z" fill="#302B40"/><path d="M70 270 Q160 252 250 270" stroke="#FFFFFF" stroke-width="2" fill="none" opacity=".35"/>`
  };
  const SHOP_OUTFITS = {
    "Denim jacket": `<path d="M104 208 Q160 184 216 208 L250 300 L70 300Z" fill="#6F8FBF"/><path d="M140 204 Q160 226 180 204 L172 262 H148Z" fill="#FFFFFF"/><path d="M122 210 L150 250 L141 205Z M198 210 L170 250 L179 205Z" fill="#4A6490"/><path d="M160 226 V300" stroke="#4A6490" stroke-width="4"/><path d="M96 258 H132 M188 258 H224" stroke="#E8F0FF" stroke-width="3" stroke-dasharray="5 4"/><circle cx="160" cy="244" r="4" fill="#E8C468"/><circle cx="160" cy="270" r="4" fill="#E8C468"/>`,
    "Starry pajamas": `<path d="M104 208 Q160 184 216 208 L250 300 L70 300Z" fill="#3E3F7A"/><path d="M130 208 Q160 230 190 208" stroke="#F4F0FF" stroke-width="5" fill="none"/>${star4(128, 250, 10, "#FFE29B")}${star4(196, 242, 8, "#FFE29B")}${star4(160, 278, 11, "#FFE29B")}${star4(104, 284, 7, "#FFE29B")}${star4(220, 280, 8, "#FFE29B")}<circle cx="160" cy="228" r="3.5" fill="#FFE29B"/><circle cx="160" cy="246" r="3.5" fill="#FFE29B"/>`,
    "Stage jacket": `<path d="M100 208 Q160 182 220 208 L254 300 L66 300Z" fill="#2B2740"/><path d="M100 208 Q160 182 220 208" stroke="#E9C46A" stroke-width="6" fill="none"/><path d="M122 206 L160 258 L198 206" stroke="#E9C46A" stroke-width="5" fill="none" stroke-linejoin="round"/><path d="M160 258 V300" stroke="#E9C46A" stroke-width="4"/><circle cx="160" cy="270" r="5" fill="#E9C46A"/><circle cx="160" cy="286" r="5" fill="#E9C46A"/><path d="M88 236 L98 262 M232 236 L222 262" stroke="#E9C46A" stroke-width="4" stroke-linecap="round"/>${star4(132, 280, 7, "#E9C46A")}${star4(188, 280, 7, "#E9C46A")}`,
    "Neon windbreaker": `<path d="M102 208 Q160 183 218 208 L250 300 L70 300Z" fill="${a.clothes}"/><path d="M102 208 L70 300 H92 L118 214Z M218 208 L250 300 H228 L202 214Z" fill="#D7FF3A"/><path d="M160 198 V300" stroke="#302B40" stroke-width="4"/><path d="M148 208 Q160 222 172 208" stroke="#302B40" stroke-width="5" fill="none"/><rect x="164" y="226" width="6" height="14" rx="3" fill="#D7FF3A" stroke="#302B40" stroke-width="2"/>`,
    "Cloud dress": `<path d="M108 208 Q160 186 212 208 L232 262 Q226 282 214 278 Q210 300 190 292 Q176 304 160 294 Q144 304 130 292 Q110 300 106 278 Q94 282 88 262Z" fill="#F4F8FF" stroke="#B9C6F0" stroke-width="3"/><path d="M130 208 Q160 226 190 208" stroke="#B9C6F0" stroke-width="5" fill="none"/><g fill="#DDE7FF" opacity=".9"><circle cx="128" cy="258" r="11"/><circle cx="196" cy="250" r="9"/><circle cx="160" cy="270" r="12"/></g>`
  };
  const outfitShape = NEW_OUTFITS[a.outfit] || SHOP_OUTFITS[a.outfit] || baseOutfit;
  const NEW_ACCESSORIES = {
    "Raindrop clip": `<path d="M214 66 Q232 92 214 108 Q196 92 214 66Z" fill="#8FD3FF" stroke="#FFFFFF" stroke-width="3"/><path d="M208 90 Q208 98 214 101" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>`,
    "Storm cloud": `<g stroke="#FFFFFF" stroke-width="3"><circle cx="128" cy="30" r="16" fill="#8E97BF"/><circle cx="160" cy="20" r="21" fill="#9AA3C9"/><circle cx="194" cy="31" r="15" fill="#8E97BF"/><rect x="122" y="30" width="78" height="18" rx="9" fill="#9AA3C9" stroke="none"/></g><path d="M165 22 L154 40 H162 L157 54 L174 36 H166 L172 22Z" fill="#D7FF3A" stroke="#302B40" stroke-width="2" stroke-linejoin="round"/>`,
    "Lightning pin": `<path d="M210 66 L194 94 H207 L199 120 L225 87 H212 L221 66Z" fill="#D7FF3A" stroke="#302B40" stroke-width="3" stroke-linejoin="round"/>`,
    "Neon halo": `<ellipse cx="160" cy="26" rx="54" ry="12" fill="none" stroke="#D7FF3A" stroke-width="12" opacity=".28"/><ellipse cx="160" cy="26" rx="54" ry="12" fill="none" stroke="#F4FFB0" stroke-width="5"/>`
  };
  const SHOP_ACCESSORIES = {
    "Round glasses": `<g fill="#FFFFFF" fill-opacity=".18" stroke="#302B40" stroke-width="4"><circle cx="137" cy="132" r="19"/><circle cx="183" cy="132" r="19"/></g><path d="M156 130 Q160 125 164 130 M118 128 L100 124 M202 128 L220 124" stroke="#302B40" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    "Sunglasses": `<g fill="#2B2740"><rect x="114" y="116" width="44" height="28" rx="11"/><rect x="162" y="116" width="44" height="28" rx="11"/></g><path d="M158 126 H162 M114 124 L98 120 M206 124 L222 120" stroke="#2B2740" stroke-width="4" stroke-linecap="round"/><path d="M121 123 L133 123 M169 123 L181 123" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>`,
    "Cat ears": `<path d="M96 96 Q160 28 224 96" stroke="#3B3F63" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M100 78 L106 28 L146 58Z M220 78 L214 28 L174 58Z" fill="#3B3F63" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round"/><path d="M113 62 L114 42 L132 54Z M207 62 L206 42 L188 54Z" fill="#F3A9CC"/>`,
    "Fuzzy scarf": `<path d="M114 200 Q160 236 206 200 L214 226 Q160 258 106 226Z" fill="#E9606E" stroke="#302B40" stroke-width="3" stroke-linejoin="round"/><path d="M184 232 L206 290 L178 296 L168 244Z" fill="#E9606E" stroke="#302B40" stroke-width="3" stroke-linejoin="round"/><path d="M178 262 L200 258 M180 278 L203 274" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>`,
    "Pearl headband": `${[...Array(9)].map((_, i) => { const t = i / 8, x = (1 - t) ** 2 * 94 + 2 * (1 - t) * t * 160 + t * t * 226, y = (1 - t) ** 2 * 112 + 2 * (1 - t) * t * 8 + t * t * 112; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#FFFFFF" stroke="#D9CFF0" stroke-width="2.5"/>`; }).join("")}`,
    "Gold crown": `<path d="M110 74 L120 40 L142 62 L160 32 L178 62 L200 40 L210 74Z" fill="#F5D58C" stroke="#302B40" stroke-width="3" stroke-linejoin="round"/><circle cx="160" cy="58" r="5" fill="#F49DB6"/><circle cx="130" cy="64" r="4" fill="#8FD3FF"/><circle cx="190" cy="64" r="4" fill="#8FD3FF"/>`,
    "Crystal tiara": `<ellipse cx="160" cy="48" rx="68" ry="26" fill="#BFE6FF" opacity=".22"/><path d="M104 78 L116 48 L132 68 L146 36 L160 64 L174 36 L188 68 L204 48 L216 78Z" fill="#E6F6FF" stroke="#7FB8E6" stroke-width="3" stroke-linejoin="round"/><path d="M146 36 L141 54 M160 64 L160 44 M174 36 L179 54" stroke="#FFFFFF" stroke-width="3" fill="none"/>${star4(160, 26, 8, "#FFFFFF")}`
  };
  const bolt = (x, y) => `<path d="M${x} ${y} L${x - 12} ${y + 24} H${x - 1} L${x - 7} ${y + 46} L${x + 14} ${y + 18} H${x + 3} L${x + 10} ${y}Z"/>`;
  const aura = a.aura === "Lightning aura"
    ? `<circle cx="160" cy="160" r="146" fill="none" stroke="#D7FF3A" stroke-width="3" stroke-dasharray="7 11" opacity=".75"/><circle cx="160" cy="160" r="128" fill="#D7FF3A" opacity=".08"/><g fill="#D7FF3A" stroke="#302B40" stroke-width="2" stroke-linejoin="round">${bolt(28, 60)}${bolt(286, 40)}${bolt(270, 214)}${bolt(42, 220)}</g>`
    : ({
      "Sparkle aura": `<circle cx="160" cy="160" r="132" fill="#FFE29B" opacity=".12"/>${[[34,70,13],[290,56,11],[300,196,14],[24,200,10],[150,10,9],[250,126,7],[70,130,7]].map(([x,y,r]) => star4(x, y, r, "#FFE29B")).join("")}${[[60,36],[268,22],[304,130],[16,130],[40,276],[286,276]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#FFFFFF" opacity=".8"/>`).join("")}`,
      "Rain shimmer": `<circle cx="160" cy="160" r="134" fill="#8FD3FF" opacity=".10"/><g stroke="#8FD3FF" stroke-width="4" stroke-linecap="round" opacity=".85">${[[30,40],[62,90],[22,150],[48,210],[34,270],[290,36],[262,92],[300,152],[272,214],[290,272],[120,16],[200,14]].map(([x,y]) => `<path d="M${x} ${y} l-7 20"/>`).join("")}</g><g fill="#FFFFFF" opacity=".7">${[[44,64],[276,60],[40,236],[284,240]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="4"/>`).join("")}</g>`,
      "Rainbow storm": `<g fill="none" stroke-width="6" opacity=".7">${["#FF8FA3","#FFB36B","#FFE27A","#9BE7A6","#8FD3FF","#B9A7FF"].map((c, i) => `<circle cx="160" cy="160" r="${150 - i * 7}" stroke="${c}"/>`).join("")}</g><circle cx="160" cy="160" r="104" fill="#FFFFFF" opacity=".10"/>`
    }[a.aura] || "");
  const featherWing = `<path d="M100 222 Q28 196 14 96 Q44 126 66 120 Q50 146 86 160 Q64 176 104 190Z"`;
  const SHOP_WINGS = {
    "Cloud wings": mirror(`<g fill="#F4F8FF" stroke="#8E97BF" stroke-width="3"><circle cx="74" cy="196" r="26"/><circle cx="46" cy="164" r="23"/><circle cx="66" cy="130" r="24"/><circle cx="98" cy="154" r="26"/><circle cx="96" cy="192" r="22"/></g>`),
    "Butterfly wings": mirror(`<path d="M104 196 Q44 84 14 112 Q2 168 104 208Z" fill="#F3A9CC" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round"/><path d="M104 212 Q52 246 38 228 Q28 196 104 206Z" fill="#B9A7FF" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round"/><circle cx="40" cy="136" r="9" fill="#FFE6F1"/><circle cx="64" cy="168" r="6" fill="#FFE6F1"/><circle cx="58" cy="222" r="5" fill="#E9E2FF"/>`),
    "Rainbow wings": mirror(["#FF8FA3","#FFB36B","#FFE27A","#9BE7A6","#8FD3FF"].map((c, i) => `<g transform="translate(104 210) scale(${(1 - i * .16).toFixed(2)}) translate(-104 -210)">${featherWing} fill="${c}" stroke="#302B40" stroke-opacity=".35" stroke-width="2" stroke-linejoin="round"/></g>`).join(""))
  };
  const wingShape = `<path d="M100 222 Q28 196 14 96 Q44 126 66 120 Q50 146 86 160 Q64 176 104 190Z" fill="#2E3259" stroke="#D7FF3A" stroke-width="3" stroke-linejoin="round"/><path d="M60 128 Q70 168 92 186 M40 118 Q50 160 80 182" stroke="#D7FF3A" stroke-width="2" fill="none" opacity=".6"/>`;
  const wings = a.wings === "Storm wings" ? `${wingShape}<g transform="translate(320 0) scale(-1 1)">${wingShape}</g>` : (SHOP_WINGS[a.wings] || "");
  const accessory = {"Bow":`<path d="M112 76 Q87 52 91 91 Q105 103 121 87 Q137 105 150 89 Q154 52 126 73Z" fill="#F3A9CC" stroke="#FFFFFF" stroke-width="3"/><circle cx="121" cy="83" r="7" fill="#FFE6F1"/>`,"Star clip":`<path d="M212 78 L218 92 L233 94 L222 104 L225 119 L212 111 L199 119 L202 104 L191 94 L206 92Z" fill="#FFE29B" stroke="#FFFFFF" stroke-width="3"/>`,"Flower":`<g fill="#FFF0B8" stroke="#FFFFFF" stroke-width="2"><circle cx="214" cy="91" r="9"/><circle cx="228" cy="91" r="9"/><circle cx="221" cy="79" r="9"/><circle cx="221" cy="103" r="9"/></g><circle cx="221" cy="91" r="6" fill="#F2A9C9"/>`,"Headphones":`<path d="M91 123 Q83 46 160 46 Q237 46 229 123" stroke="#B8A7F5" stroke-width="12" fill="none"/><rect x="83" y="112" width="18" height="39" rx="8" fill="#B8A7F5"/><rect x="219" y="112" width="18" height="39" rx="8" fill="#B8A7F5"/>`,"Beret":`<path d="M93 83 Q142 35 218 76 Q230 88 217 98 L104 102 Q86 97 93 83Z" fill="#D9B8F0" stroke="#FFFFFF" stroke-width="3"/>`}[a.accessory] || NEW_ACCESSORIES[a.accessory] || SHOP_ACCESSORIES[a.accessory] || "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#FFF0F7"/><stop offset="1" stop-color="#EDE7FF"/></linearGradient></defs><rect width="320" height="320" rx="42" fill="url(#bg)"/><circle cx="160" cy="151" r="122" fill="#FFFFFF" opacity=".35"/>${aura}${wings}${hairBack}<path d="M95 300 Q96 203 160 198 Q224 203 225 300Z" fill="${a.clothes}" stroke="#493744" stroke-width="4"/><path d="M119 214 Q160 238 201 214" stroke="#FFFFFF" stroke-width="5" fill="none" opacity=".8"/><rect x="143" y="178" width="34" height="38" rx="14" fill="${a.skin}"/><ellipse cx="160" cy="128" rx="67" ry="78" fill="${a.skin}" stroke="#493744" stroke-width="4"/>${hairFront}${eyes}<ellipse cx="113" cy="151" rx="13" ry="7" fill="#F49DB6" opacity=".55"/><ellipse cx="207" cy="151" rx="13" ry="7" fill="#F49DB6" opacity=".55"/><path d="M154 151 Q160 157 166 151" stroke="#A66D72" stroke-width="3" fill="none" stroke-linecap="round"/>${outfitShape}${accessory}<path d="M135 291 Q160 301 185 291" stroke="#FFFFFF" stroke-width="4" fill="none" opacity=".8"/><path d="M50 80 l5 12 12 5 -12 5 -5 12 -5 -12 -12 -5 12 -5Z M265 178 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4Z" fill="#F5D58C"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function updateAvatarPreview() {
  const preview = $("chibiPreview");
  if (preview) preview.src = avatarDataUri(selectedAvatarState, currentUser?.id || "new-player");
}

// Which picker options exist for a slot: the base ones plus the unlockable items.
function pickerChoices(key) {
  const base = (CHIBI_OPTIONS[key] || []).map(name => ({ name }));
  const items = CHIBI_ITEMS.filter(item => item.slot === key);
  return [...base, ...items.map(item => ({ name: item.name, item }))];
}

// Used for the character screen AND the wardrobe. `state` is edited in place.
function renderAvatarPicker(opts = {}) {
  const host = opts.host || $("avatarPicker");
  const state = opts.state || selectedAvatarState;
  const owned = new Set(opts.unlocked || player?.unlocks || []);
  const seed = currentUser?.id || "new-player";

  const fresh = normaliseAvatarState(state, seed);
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, fresh);

  const again = () => renderAvatarPicker(opts);
  const categories = [["style","Hairstyle"],["eyes","Eyes"],["outfit","Outfit"],["accessory","Accessories"],["aura","Aura"],["wings","Wings"]];
  const isLocked = c => c.item && !owned.has(c.item.id);

  host.innerHTML = `<div class="kawaii-builder"><div class="kawaii-preview-panel"><div class="kawaii-preview-frame"><img class="picker-preview" alt="Your kawaii chibi preview"></div><strong>Your little storm buddy</strong><p>Every detail updates as you customise! 🔒 items are earned in the game.</p><button class="secondary-button picker-random" type="button">✧ Surprise me</button>${opts.onSave ? `<button class="primary-button picker-save" type="button">Save look <span>→</span></button>` : ""}</div><div class="kawaii-controls">${categories.map(([key,label])=>`<section class="kawaii-category"><h3>${label}</h3><div class="kawaii-choice-row" data-key="${key}"></div></section>`).join("")}<section class="kawaii-category"><h3>Skin tone</h3><div class="kawaii-swatches" data-swatch="skin"></div></section><section class="kawaii-category"><h3>Hair colour</h3><div class="kawaii-swatches" data-swatch="hair"></div></section><section class="kawaii-category"><h3>Outfit colour</h3><div class="kawaii-swatches" data-swatch="clothes"></div></section></div></div>`;

  const preview = host.querySelector(".picker-preview");
  preview.src = avatarDataUri(state, seed);

  categories.forEach(([key,label])=>{
    const row = host.querySelector(`.kawaii-choice-row[data-key="${key}"]`);
    pickerChoices(key).forEach(choice => {
      const locked = isLocked(choice);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kawaii-tag" + (state[key]===choice.name ? " selected" : "")
        + (choice.item ? ` rarity-${choice.item.rarity}` : "") + (locked ? " locked" : "");
      btn.textContent = (locked ? "🔒 " : "") + choice.name;
      btn.disabled = locked;
      if (choice.item) btn.title = locked ? choice.item.how : `${choice.item.rarity} item`;
      btn.setAttribute("aria-label", `${label}: ${choice.name}${locked ? " (locked)" : ""}`);
      btn.setAttribute("aria-pressed", state[key]===choice.name ? "true" : "false");
      btn.addEventListener("click",()=>{state[key]=choice.name;again();});
      row.appendChild(btn);
    });
  });
  ["skin","hair","clothes"].forEach(key=>{
    const row = host.querySelector(`[data-swatch="${key}"]`);
    (CHIBI_PALETTES[key]||[]).forEach(color=>{const btn=document.createElement("button");btn.type="button";btn.className="kawaii-swatch"+(state[key]===color?" selected":"");btn.style.background=color;btn.title=color;btn.setAttribute("aria-label",`${key} colour ${color}`);btn.addEventListener("click",()=>{state[key]=color;again();});row.appendChild(btn);});
  });

  host.querySelector(".picker-random").addEventListener("click",()=>{
    categories.forEach(([key])=>{
      const open = pickerChoices(key).filter(c => !isLocked(c));
      if (open.length) state[key] = open[Math.floor(Math.random()*open.length)].name;
    });
    Object.entries(CHIBI_PALETTES).forEach(([key,values])=>state[key]=values[Math.floor(Math.random()*values.length)]);
    again();
  });
  host.querySelector(".picker-save")?.addEventListener("click", () => opts.onSave());
}

// ---- Wardrobe (wear the items you unlocked) ----------------------------------------------
let wardrobeState = null;
const seenKey = () => `txtSeenUnlocks:${currentUser?.id || ""}`;
function seenUnlocks() { try { return new Set(JSON.parse(localStorage.getItem(seenKey()) || "[]")); } catch (_) { return new Set(); } }
function markUnlocksSeen() {
  try { localStorage.setItem(seenKey(), JSON.stringify(player?.unlocks || [])); } catch (_) {}
  updateWardrobeBadge();
}
function updateWardrobeBadge() {
  const nav = $("wardrobeNav");
  if (!nav || !player) return;
  const seen = seenUnlocks();
  const fresh = (player.unlocks || []).filter(id => !seen.has(id)).length;
  nav.textContent = fresh ? `Wardrobe ● ${fresh} new` : "Wardrobe";
}
function renderWardrobe() {
  if (!player) return;
  wardrobeState = normaliseAvatarState(player.avatar, player.uid);
  $("wardrobeMessage").textContent = "";
  renderAvatarPicker({ host: $("wardrobeHost"), state: wardrobeState, unlocked: player.unlocks, onSave: saveWardrobe });
  markUnlocksSeen();
}
async function saveWardrobe() {
  $("wardrobeMessage").textContent = "Saving…";
  try {
    const { data, error } = await supabase.rpc("equip_chibi", { p_avatar: JSON.stringify(wardrobeState) });
    if (error) throw error;
    player = convertPlayer(data.player);
    updatePlayerUI();
    $("wardrobeMessage").textContent = "Saved! This is how you look on the board now.";
  } catch (error) {
    $("wardrobeMessage").textContent = error.message || "Could not save your look.";
  }
}

// ---- Shop (spend moasta points on chibi items) -------------------------------------------
// MP earned = tasks (50 each) + checkpoints (+CHECKPOINT_MP) + finished boards (+BOARD_FINISH_MP).
// Spendable balance = MP earned - MP spent. The leaderboard keeps ranking by MP EARNED.
let shopFilter = "all";
const SHOP_FILTERS = [["all", "All"], ["style", "Hairstyles"], ["outfit", "Outfits"], ["accessory", "Accessories"], ["aura", "Auras"], ["wings", "Wings"]];
const SLOT_LABEL = { style: "Hairstyle", outfit: "Outfit", accessory: "Accessory", aura: "Aura", wings: "Wings" };

function mpBalance() { return Math.max(0, (player?.mp || 0) - (player?.mpSpent || 0)); }
function updateShopNav() {
  const nav = $("shopNav");
  if (nav && player) nav.textContent = `Shop · ${mpBalance()} MP`;
}

function renderShop() {
  if (!player) return;
  const owned = new Set(player.unlocks || []);
  const balance = mpBalance();
  const base = normaliseAvatarState(player.avatar, player.uid);
  const all = CHIBI_ITEMS.filter(i => i.kind === "shop");
  const items = all.filter(i => shopFilter === "all" || i.slot === shopFilter).sort((x, y) => x.price - y.price);

  $("shopBalance").textContent = balance;
  $("shopOwned").textContent = `${all.filter(i => owned.has(i.id)).length} / ${all.length} owned`;

  const filters = $("shopFilters");
  filters.innerHTML = "";
  SHOP_FILTERS.forEach(([key, label]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "shop-filter" + (shopFilter === key ? " active" : "");
    b.textContent = label;
    b.addEventListener("click", () => { shopFilter = key; renderShop(); });
    filters.appendChild(b);
  });

  const grid = $("shopGrid");
  grid.innerHTML = "";
  items.forEach(item => {
    const have = owned.has(item.id);
    const look = { ...base, [item.slot]: item.name };
    const card = document.createElement("div");
    card.className = `shop-item rarity-${item.rarity}` + (have ? " owned" : "");
    card.innerHTML = `
      <img class="reward-chibi" src="${escapeHtml(avatarDataUri(look, player.uid))}" alt="">
      <b>${escapeHtml(item.name)}</b>
      <span class="shop-meta"><span class="rarity-chip">${item.rarity}</span> ${SLOT_LABEL[item.slot] || item.slot}</span>
      ${have
        ? `<button type="button" class="secondary-button shop-wear">Owned ✓ · Wear</button>`
        : `<button type="button" class="shop-buy" ${balance < item.price ? "disabled" : ""}>Buy · ${item.price} MP</button>
           ${balance < item.price ? `<small class="muted">${item.price - balance} MP to go</small>` : ""}`}
    `;
    card.querySelector(".shop-buy")?.addEventListener("click", ev => buyItem(item, ev.currentTarget));
    card.querySelector(".shop-wear")?.addEventListener("click", ev => wearItem(item, ev.currentTarget));
    grid.appendChild(card);
  });
}

async function buyItem(item, button) {
  button.disabled = true;
  $("shopMessage").textContent = "Buying…";
  try {
    const { data, error } = await supabase.rpc("buy_chibi_item", { p_item: item.id });
    if (error) throw error;
    player = convertPlayer(data.player);
    updatePlayerUI();
    $("shopMessage").textContent = `You bought ${item.name}! Tap "Wear" to put it on.`;
  } catch (error) {
    $("shopMessage").textContent = error.message || "Could not buy this item.";
    button.disabled = false;
  }
}

async function wearItem(item, button) {
  button.disabled = true;
  try {
    const look = { ...normaliseAvatarState(player.avatar, player.uid), [item.slot]: item.name };
    const { data, error } = await supabase.rpc("equip_chibi", { p_avatar: JSON.stringify(look) });
    if (error) throw error;
    player = convertPlayer(data.player);
    updatePlayerUI();
    $("shopMessage").textContent = `Now wearing ${item.name}.`;
  } catch (error) {
    $("shopMessage").textContent = error.message || "Could not equip this item.";
    button.disabled = false;
  }
}

// ---- Finale / reward pop-up -------------------------------------------------------------
const FINALE_TEXT = [
  { title: "You crossed the first storm!", text: "Board 1 complete. The sky clears for a moment… then the next storm gathers. “Ride the Storm” awaits." },
  { title: "Through the second storm!", text: "Board 2 complete. One board is left, and it has no checkpoints at all." },
  { title: "You reached the Eye of the Storm!", text: "All three boards complete. The sky is finally calm. Thank you for riding it out." }
];

function launchConfetti() {
  const box = $("confetti");
  box.innerHTML = "";
  const colors = ["#D7FF3A", "#B9A7FF", "#F3B7D8", "#8FD3FF", "#FFE29B"];
  for (let i = 0; i < 70; i++) {
    const bit = document.createElement("i");
    bit.style.left = Math.random() * 100 + "%";
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = Math.random() * 2.5 + "s";
    bit.style.animationDuration = 3 + Math.random() * 3 + "s";
    bit.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(bit);
  }
}

// Resolves with "close" or "wardrobe".
function showReward({ board = null, ids = [], who, bonusMp = 0 }) {
  return new Promise(resolve => {
    const modal = $("rewardModal");
    const items = ids.map(id => CHIBI_ITEMS.find(i => i.id === id)).filter(Boolean);
    const rarityRank = { common: 0, rare: 1, epic: 2, legendary: 3 };
    items.sort((x, y) => rarityRank[y.rarity] - rarityRank[x.rarity]);

    if (board) {
      const t = FINALE_TEXT[board - 1] || FINALE_TEXT[0];
      $("rewardEyebrow").textContent = `BOARD ${board} COMPLETE`;
      $("rewardTitle").textContent = t.title;
      $("rewardText").textContent = t.text;
      document.body.classList.add("calm");      // the rain stops, the sky clears
      launchConfetti();
    } else {
      $("rewardEyebrow").textContent = "CHECKPOINT REWARD";
      $("rewardTitle").textContent = items.length > 1 ? "New chibi items!" : "New chibi item!";
      $("rewardText").textContent = "You found something in the storm.";
      $("confetti").innerHTML = "";
    }
    if (bonusMp) $("rewardText").textContent += ` +${bonusMp} MP added to your balance!`;

    $("rewardItems").innerHTML = items.map(item => {
      const look = { ...normaliseAvatarState(who?.avatar, who?.uid), [item.slot]: item.name };
      return `<div class="reward-item rarity-${item.rarity}">
        <img class="reward-chibi" src="${escapeHtml(avatarDataUri(look, who?.uid))}" alt="">
        <b>${escapeHtml(item.name)}</b>
        <span class="rarity-chip">${item.rarity}</span>
      </div>`;
    }).join("");
    $("rewardWardrobe").classList.toggle("hidden", !items.length);

    const finish = choice => {
      modal.classList.add("hidden");
      $("confetti").innerHTML = "";
      setTimeout(() => document.body.classList.remove("calm"), 6000);   // calm lingers a little
      resolve(choice);
    };
    $("rewardClose").onclick = () => finish("close");
    $("rewardWardrobe").onclick = () => finish("wardrobe");
    modal.classList.remove("hidden");
  });
}

// ---- Last.fm listening check ------------------------------------------------
let listeningNote = "";          // status line shown in the listening panel
let listeningCounted = null;     // { plays, distinct, counted[] } from the last check
let listeningChecking = false;
let lastListeningCheck = 0;
let changingListening = false;
let listeningFormSource = null;

// Is there any listening task from the last 3 days that is still unfinished?
function hasOpenListeningTask() {
  const recent = [0, 1, 2].map(i => kstDateKey(new Date(Date.now() - i * 86400000)));
  return (player?.taskHistory || []).some(day =>
    recent.includes(day.date) &&
    (day.auto || []).some((isAuto, i) => isAuto && !(day.completed || []).includes(i))
  );
}

function renderListeningPanel() {
  const host = $("listeningPanel");
  if (!host) return;

  if (!player?.listeningName || changingListening) {
    const src = listeningFormSource || player?.listeningSource || "lastfm";
    const isStats = src === "statsfm";
    host.innerHTML = `
      <p class="eyebrow">LISTENING TASKS</p>
      <h3>Connect where you listen</h3>
      <div class="source-switch" role="tablist">
        <button type="button" class="source-btn ${isStats ? "" : "active"}" data-source="lastfm">Last.fm</button>
        <button type="button" class="source-btn ${isStats ? "active" : ""}" data-source="statsfm">stats.fm</button>
      </div>
      <form id="lastfmForm" class="lastfm-form">
        <input id="lastfmInput" maxlength="30" required value="${escapeHtml(player?.listeningSource === src ? player.listeningName || "" : "")}" placeholder="${isStats ? "Your stats.fm username" : "Your Last.fm username"}" autocomplete="off">
        <button class="primary-button" type="submit">Connect <span>→</span></button>
      </form>
      <p class="fine-print">${isStats
        ? "Use your stats.fm username (the name in stats.fm/yourname). In stats.fm → Settings → Privacy, your profile and recent streams must be public."
        : "You need a free Last.fm account with your streaming app connected (Last.fm → Settings → Applications). Under Settings → Privacy, \"Hide recent listening information\" must be off."}</p>
      <p class="fine-print">Pick whichever you already use. Both work the same, and splitting players between them keeps the load low.</p>
      <p id="lastfmMessage" class="form-message" role="status"></p>
      ${player?.listeningName ? `<div class="source-actions"><button id="cancelChange" class="nav-link" type="button">Cancel</button><button id="disconnectListening" class="nav-link" type="button">Disconnect</button></div>` : ""}
    `;
    host.querySelectorAll(".source-btn").forEach(btn => btn.addEventListener("click", () => {
      listeningFormSource = btn.dataset.source;
      renderListeningPanel();
    }));
    $("lastfmForm").addEventListener("submit", async event => {
      event.preventDefault();
      await saveListeningAccount(src, $("lastfmInput").value);
    });
    $("cancelChange")?.addEventListener("click", () => { changingListening = false; renderListeningPanel(); });
    $("disconnectListening")?.addEventListener("click", async () => {
      if (confirm("Disconnect your listening account?")) await saveListeningAccount(src, "");
    });
    return;
  }

  const counted = listeningCounted;
  host.innerHTML = `
    <div class="listening-row">
      <div>
        <p class="eyebrow">LISTENING TASKS</p>
        <h3>${player.listeningSource === "statsfm" ? "stats.fm" : "Last.fm"}: <b>${escapeHtml(player.listeningName)}</b><span class="mp-chip" title="Moasta points">${player.mp || 0} moasta points</span></h3>
        <p class="muted" id="listeningNote">${escapeHtml(listeningNote || "Songs you play after rolling are counted automatically.")}</p>
      </div>
      <div class="listening-actions">
        <button id="checkListeningButton" class="secondary-button" type="button">Check my listening</button>
        <button id="changeLastfmButton" class="nav-link" type="button">Change</button>
      </div>
    </div>
    ${counted ? `
      <p class="fine-print">Today: <b>${counted.plays}</b> TXT play${counted.plays === 1 ? "" : "s"} · <b>${counted.distinct}</b> different song${counted.distinct === 1 ? "" : "s"}</p>
    ` : ""}
  `;
  refreshCheckButton();
  $("checkListeningButton").addEventListener("click", () => checkListening({ manual: true }));
  $("changeLastfmButton").addEventListener("click", () => {
    changingListening = true;
    listeningFormSource = null;
    renderListeningPanel();
  });
}

async function saveListeningAccount(source, username) {
  try {
    const { data, error } = await supabase.rpc(source === "statsfm" ? "save_statsfm" : "save_lastfm", { p_username: username });
    if (error) throw error;
    player = convertPlayer(data.player);
    listeningCounted = null;
    listeningNote = "";
    changingListening = false;
    listeningFormSource = null;
    updatePlayerUI();
    if (player.listeningName) checkListening({ manual: true, force: true });
  } catch (error) {
    const msg = $("lastfmMessage");
    if (msg) msg.textContent = error.message || "Could not save your username.";
    else notify(error.message || "Could not save your username.");
  }
}

const LISTENING_MESSAGES = {
  not_connected: "Connect your Last.fm account to start counting.",
  no_roll: "Roll the dice first. Only songs played after your roll count.",
  lastfm_private: "Last.fm says your recent listening is hidden. Turn off “Hide recent listening information” in Last.fm → Settings → Privacy.",
  lastfm_user_not_found: "Last.fm could not find that username. Check the spelling with “Change”.",
  statsfm_private: "stats.fm says your profile or recent streams are private. Make them public in stats.fm → Settings → Privacy.",
  statsfm_user_not_found: "stats.fm could not find that username. Check the spelling with “Change”.",
  statsfm_unavailable: "stats.fm is not answering right now. Try again in a minute.",
  lastfm_unavailable: "Last.fm is not answering right now. Try again in a minute.",
  server_not_configured: "The listening checker is not set up yet (missing Last.fm key).",
  error: "Something went wrong while checking. Try again in a minute."
};

// Automatic checks run at most every 7 minutes; after pressing the button a player must wait 5 minutes.
const AUTO_CHECK_MS = 7 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 5 * 60 * 1000;
const COOLDOWN_KEY = "txtListeningManualAt";

function manualCooldownLeft() {
  let at = 0;
  try { at = Number(localStorage.getItem(COOLDOWN_KEY)) || 0; } catch (_) {}
  return Math.max(0, MANUAL_COOLDOWN_MS - (Date.now() - at));
}
function cooldownLabel() {
  const left = Math.ceil(manualCooldownLeft() / 1000);
  return `Check again in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}
function refreshCheckButton() {
  const btn = $("checkListeningButton");
  if (!btn) return;
  const left = manualCooldownLeft();
  btn.disabled = listeningChecking || left > 0;
  btn.textContent = listeningChecking ? "Checking…" : left > 0 ? cooldownLabel() : "Check my listening";
}
setInterval(refreshCheckButton, 1000);

async function checkListening({ manual = false, force = false } = {}) {
  if (!player?.listeningName || listeningChecking) return;
  if (manual && !force && manualCooldownLeft() > 0) { refreshCheckButton(); return; }
  if (!manual && Date.now() - lastListeningCheck < AUTO_CHECK_MS) return;
  if (manual && !force) {
    try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch (_) {}
  }

  if (!manual && !hasOpenListeningTask()) return;

  listeningChecking = true;
  lastListeningCheck = Date.now();
  renderListeningPanel();

  try {
    const { data, error } = await supabase.functions.invoke("check-listening", { body: {} });
    if (error) throw error;

    if (data?.status === "ok") {
      listeningCounted = { plays: data.plays, distinct: data.distinct, counted: data.counted || [] };
      listeningNote = `Checked at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
      const fresh = await loadMyProfile();
      if (fresh) player = fresh;
      await loadSongHistory();
      loadStreamStats();
    } else {
      listeningNote = LISTENING_MESSAGES[data?.status] || LISTENING_MESSAGES.error;
    }
  } catch (error) {
    console.error("Listening check:", error);
    listeningNote = "Could not reach the listening checker. Is the check-listening function deployed?";
  } finally {
    listeningChecking = false;
    updatePlayerUI();
  }
}

// re-check when the player comes back to the tab, and every 7 minutes while Tasklists is open
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !$("tasksView")?.classList.contains("hidden")) checkListening();
});
setInterval(() => {
  if (document.visibilityState === "visible" && !$("tasksView")?.classList.contains("hidden")) checkListening();
}, AUTO_CHECK_MS);
setInterval(() => {
  if (document.visibilityState === "visible" && !$("leaderboardView")?.classList.contains("hidden")) loadStreamStats();
}, 60000);

function renderTaskHistory() {
  const history = [...(player?.taskHistory || [])]
    .sort((a, b) => b.date.localeCompare(a.date));

  const host = $("taskHistory");
  host.innerHTML = "";

  if (!history.length) {
    host.innerHTML = `
      <div class="panel task-empty">
        <h3>No tasklists yet</h3>
        <p class="muted">Roll the dice to receive your first daily quest list.</p>
      </div>
    `;
    return;
  }

  history.forEach(day => {
    const card = document.createElement("section");
    card.className = "panel task-day";

    const completed = day.completed || [];
    const earned = completed.reduce((sum, i) => sum + ((day.mp || [])[i] ?? TASK_MP), 0);

    // which dice were rolled that day (one entry per roll)
    const rollList = [];
    (day.task_roll || []).forEach((n, i) => {
      if (!rollList.some(r => r.n === n)) rollList.push({ n, dice: (day.task_dice || [])[i] ?? day.roll });
    });
    const diceText = rollList.length ? rollList.map(r => r.dice).join(" · ") : day.roll;

    card.innerHTML = `
      <div class="task-day-head">
        <div>
          <p class="eyebrow">${escapeHtml(day.date)}${day.date === kstDateKey() ? " · TODAY" : ""}</p>
          <h3>Dice ${rollList.length > 1 ? "rolls" : "roll"}: ${diceText}</h3>
        </div>
        <small>${completed.length}/${day.tasks.length} completed <span class="day-mp">+${earned} moasta points</span> </small>
      </div>
    `;

    let lastRollNo = null;

    day.tasks.forEach((task, index) => {
      // a small heading before each roll's tasks (only when the day has several rolls)
      const rollNo = (day.task_roll || [])[index] ?? 1;
      if (rollList.length > 1 && rollNo !== lastRollNo) {
        const label = document.createElement("p");
        label.className = "roll-label";
        label.textContent = `ROLL ${rollNo} · DICE ${(day.task_dice || [])[index] ?? ""}`;
        card.appendChild(label);
      }
      lastRollNo = rollNo;

      const done = completed.includes(index);
      const isAuto = (day.auto || [])[index] === true;
      const target = (day.targets || [])[index] || 1;
      const progress = done ? target : Math.min(target, (day.progress || [])[index] || 0);

      const row = document.createElement("div");
      row.className = "task-row" + (done ? " done" : "") + (isAuto ? " auto" : "");

      // Plain tasks (and admin test accounts) can be ticked by tapping the counter.
      const tappable = !isAuto || player?.isAdmin;
      // Two kinds of task: STREAMING ticks itself (Last.fm / stats.fm), NON-STREAMING is checked / unchecked by hand.
      const kindChip = isAuto
        ? `<span class="task-kind stream" title="Ticks itself when your streams show up on Last.fm / stats.fm">🎧 Streaming</span>`
        : `<span class="task-kind manual" title="Tick it yourself when you have done it">✅ Non-streaming</span>`;
      const counter = isAuto ? `${progress}/${target}` : (done ? "☑ Done" : "☐ To do");
      row.innerHTML = `
        <span class="task-text">${kindChip}${escapeHtml(task)}</span>
        ${tappable
          ? `<button type="button" class="task-count" title="Tap to ${done ? "un-check" : "check"}">${counter}</button>`
          : `<span class="task-count">${counter}</span>`}
      `;

      const button = row.querySelector("button.task-count");
      if (button) {
        button.addEventListener("click", async () => {
          button.disabled = true;

          try {
            const { data, error } = await supabase.rpc("set_task_completion", {
              p_date: day.date,
              p_task_index: index,
              p_completed: !done
            });

            if (error) throw error;

            player = convertPlayer(data.player);
            updatePlayerUI();
            loadLeaderboard().catch(() => {});
          } catch (error) {
            notify(error.message || "Could not update this task.");
          } finally {
            button.disabled = false;
          }
        });
      }

      card.appendChild(row);
    });

    host.appendChild(card);
  });
}

// ---- Streams collected on the website (leaderboard box) --------------------------
// Same matching as the check-listening function: "Storm is…" and "Storm is... (Japanese ver.)"
// are the same song.
function songKey(title) {
  const norm = value => String(value ?? "")
    .normalize("NFKC").toLowerCase().replace(/×/g, " x ").replace(/\s+/g, " ").trim();
  const base = norm(title)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s+-\s+.*$/, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return base || norm(title);
}

let streamStats = null;

async function loadStreamStats() {
  if (!currentUser) return;

  try {
    const { data, error } = await supabase.rpc("get_stream_stats");
    if (error) throw error;
    streamStats = data || { total: 0, songs: {} };
  } catch (error) {
    console.warn("Could not load stream stats:", error);
    streamStats = streamStats || null;
  }

  renderStreamStats();
}

function renderStreamStats() {
  const host = $("streamStats");
  if (!host) return;

  if (!streamStats) {
    host.innerHTML = `<p class="muted">Streams will show here once the database update is installed.</p>`;
    return;
  }

  const fmt = n => Number(n || 0).toLocaleString();
  const songs = streamStats.songs || {};
  const rows = ALBUM_TRACKS.map(title => ({ title, streams: Number(songs[songKey(title)] || 0) }));
  const albumTotal = rows.reduce((sum, r) => sum + r.streams, 0);
  const total = Number(streamStats.total || 0);
  const max = Math.max(1, ...rows.map(r => r.streams));

  host.innerHTML = `
    <p class="eyebrow">STREAMS COLLECTED</p>
    <h3>All players together</h3>
    <p class="stream-total">${fmt(total)}</p>
    <p class="stream-sub">streams counted through tasks on this website</p>

    <p class="album-title">${escapeHtml(ALBUM_NAME)}</p>
    <ul class="album-list">
      ${rows.map(r => `
        <li>
          <div class="album-song-row"><span>${escapeHtml(r.title)}</span><b>${fmt(r.streams)}</b></div>
          <div class="album-bar"><i style="width:${Math.round((r.streams / max) * 100)}%"></i></div>
        </li>`).join("")}
    </ul>
    <p class="album-other">Other counted songs: ${fmt(Math.max(0, total - albumTotal))}</p>
  `;
}

// ---- Recently played (the latest 20 songs the checker counted) -------------------
let songHistory = [];
let songHistoryLoaded = false;

async function loadSongHistory() {
  if (!currentUser) return;

  try {
    const { data, error } = await supabase
      .from("listening_history")
      .select("track, artist, played_at")
      .order("played_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    songHistory = data || [];
  } catch (error) {
    console.warn("Could not load listening history:", error);
    songHistory = [];
  }

  songHistoryLoaded = true;
  renderSongHistory();
}

function formatPlayedAt(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const sameDay = kstDateKey(d) === kstDateKey();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return sameDay
    ? `Today ${time}`
    : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

function renderSongHistory() {
  const host = $("songHistory");
  if (!host) return;

  const list = songHistory.length
    ? `<ol class="song-list">${songHistory.map((song, i) => `
        <li>
          <span class="song-n">${i + 1}</span>
          <span class="song-meta">
            <span class="song-title">${escapeHtml(song.track)}</span>
            <span class="song-artist">${escapeHtml(song.artist || "")}</span>
          </span>
          <span class="song-time">${escapeHtml(formatPlayedAt(song.played_at))}</span>
        </li>`).join("")}</ol>`
    : `<p class="muted">${!player?.listeningName
        ? "Connect Last.fm or stats.fm to see the songs you have played here."
        : songHistoryLoaded
          ? "No counted songs yet. Play a song from your tasklist, then press “Check my listening”."
          : "Loading…"}</p>`;

  host.innerHTML = `
    <p class="eyebrow">LISTENING HISTORY</p>
    <h3>Last 20 songs played</h3>
    <p class="muted">Songs that counted for your tasks, newest first.</p>
    ${list}
  `;
}

function renderLeaderboard() {
  const host = $("leaderboardRows");

  const sorted = [...(window.latestPlayers || [])].sort((a, b) =>
    (b.mp || 0) - (a.mp || 0) ||
    (b.highestMilestone || 1) - (a.highestMilestone || 1) ||
    (b.position || 1) - (a.position || 1) ||
    String(a.name).localeCompare(String(b.name))
  );

  if (!sorted.length) {
    host.innerHTML =
      `<p class="muted">No players yet. Be the first to enter the storm!</p>`;
    return;
  }

  host.innerHTML = sorted.map((p, i) => `
    <div class="leader-row">
      <div class="leader-person">
        <span class="leader-rank">${i + 1}</span>
        <img class="chibi-image leader-chibi" src="${escapeHtml(avatarDataUri(p.avatar, p.uid))}" alt="">
        <span class="leader-name">
          ${escapeHtml(p.name || "Player")}${p.uid === currentUser?.id ? " (you)" : ""}${badgeHtml(p.position)}
        </span>
      </div>
      <span class="leader-milestone">
        ${p.highestMilestone > 1 ? `Checkpoint ${p.highestMilestone}` : "Not reached"}
      </span>
      <span class="leader-tile">${p.position || 1}</span>
      <span class="leader-mp">${p.mp || 0}</span>
    </div>
  `).join("");
}

function convertPlayer(data) {
  if (!data) return null;

  return {
    uid: data.id,
    name: data.username,
    avatar: data.avatar,
    position: data.position,
    highestMilestone: data.highest_milestone,
    lastRollDate: data.last_roll_date ?? null,
    lastRoll: data.last_roll ?? null,
    taskHistory: data.task_history || [],
    isAdmin: data.is_admin === true,
    lastfmUsername: data.lastfm_username ?? null,
    statsfmUsername: data.statsfm_username ?? null,
    listeningSource: data.listening_source ?? null,
    listeningName: (data.listening_source === "statsfm" ? data.statsfm_username : data.lastfm_username) ?? null,
    mp: data.mp ?? 0,
    mpSpent: data.mp_spent ?? 0,
    unlocks: data.unlocks || [],
    extraRolls: data.extra_rolls ?? 0,
    rollsToday: data.rolls_today ?? 0
  };
}

async function loadLeaderboard() {
  const columns = "id, username, avatar, position, highest_milestone, mp";

  // public_players = players WITHOUT admin accounts (created by supabase-game-functions.sql).
  let { data, error } = await supabase.from("public_players").select(columns);

  if (error) {
    // The SQL hasn't been re-run yet: fall back to the plain table so the game still works.
    console.warn("public_players view missing, using profiles:", error.message);
    ({ data, error } = await supabase.from("profiles").select(columns));
  }

  if (error) {
    console.error("Leaderboard:", error);
    return;
  }

  window.latestPlayers = data.map(convertPlayer);
  renderBoard();
  renderLeaderboard();
}

async function subscribeLeaderboard() {
  // Reuse an in-progress setup instead of creating duplicate channels.
  if (leaderboardSubscriptionPromise) {
    return leaderboardSubscriptionPromise;
  }

  // If the channel already exists, only refresh its current data.
  if (playersChannel) {
    await loadLeaderboard();
    return;
  }

  leaderboardSubscriptionPromise = (async () => {
    await loadLeaderboard();

    if (!currentUser || playersChannel) return;

    const channel = supabase.channel("public-profiles-leaderboard");

    // Register the callback before subscribe() is called.
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      () => {
        loadLeaderboard().catch(error => {
          console.error("Could not refresh leaderboard:", error);
        });
      }
    );

    playersChannel = channel;

    channel.subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("Leaderboard realtime subscription:", status, error || "");
        if (playersChannel === channel) playersChannel = null;
      }

      if (status === "CLOSED" && playersChannel === channel) {
        playersChannel = null;
      }
    });
  })();

  try {
    await leaderboardSubscriptionPromise;
  } finally {
    leaderboardSubscriptionPromise = null;
  }
}

function showTaskReveal(roll, tasks, rollNo) {
  $("revealTitle").textContent =
    `You rolled a ${roll}!` + (rollNo ? ` · Roll ${rollNo}/${ROLLS_PER_DAY}` : "");

  $("revealTasks").innerHTML = tasks.map((task, i) => `
    <div class="reveal-task">
      <b>${i + 1}.</b> ${escapeHtml(task)}
    </div>
  `).join("");

  $("taskReveal").classList.remove("hidden");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setTile(tile) {
  player.position = tile;
  $("currentPosition").textContent = tile;
  $("statPosition").textContent = `${tile} / ${TOTAL_TILES}`;
  renderBoard();
}

// Wait for the task popup to time out OR be closed by the player.
function waitForReveal(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      revealDismiss = null;
      resolve();
    }
    revealDismiss = done;
  });
}

function hideReveal() {
  $("taskReveal").classList.add("hidden");
  if (revealDismiss) revealDismiss();
}

// 1) Walk tile by tile (passing over a storm/ladder does NOTHING - only the
//    landing tile counts), 2) then play at most ONE jump: storm, ladder or gift.
async function animateRoll(result) {
  const walk = (result.walk || []).map(Number);
  const jump = result.jump || null;

  // keep showing the board the roll started on until the finale / rewards are done
  animBoard = Math.min(BOARD_COUNT - 1, Math.floor((player.position || 1) / BOARD_SIZE));

  for (const tile of walk) {
    portalAnimation = null;
    setTile(tile);
    await sleep(240);
  }

  if (!jump) return;

  const from = Number(jump.from);
  const to = Number(jump.to);

  if (jump.kind === "storm" && to !== from) {
    // Shrink into the storm art, reappear at the exit.
    portalAnimation = { tile: from, className: "portal-entering" };
    playSound("storm");
    setTile(from);
    await sleep(320);

    portalAnimation = { tile: to, className: "portal-exiting" };
    setTile(to);
    await sleep(450);
  } else if (jump.kind === "ladder" && to !== from) {
    playSound("ladder");
    await sleep(350);
    portalAnimation = { tile: to, className: "ladder-arriving" };
    setTile(to);
    await sleep(520);
  } else if (jump.kind === "gift") {
    await sleep(500);
    if (to > from) playSound("up");
    else if (to < from) playSound("down");
    else if (jump.outcome === "reroll") playSound("up");

    if (to !== from) {
      const dir = to > from ? 1 : -1;
      for (let tile = from + dir; dir > 0 ? tile <= to : tile >= to; tile += dir) {
        portalAnimation = null;
        setTile(tile);
        await sleep(220);
      }
    }
  }

  portalAnimation = null;
  renderBoard();
}

function rollState() {
  const rollsUsed = player?.lastRollDate === kstDateKey() ? (player.rollsToday || 0) : 0;
  const rollsLeft = Math.max(0, ROLLS_PER_DAY - rollsUsed);
  const bonusRoll = !player?.isAdmin && (player?.extraRolls || 0) > 0 && rollsUsed >= 1;
  const canRoll = !!player?.isAdmin || bonusRoll || rollsLeft > 0;
  return { rollsUsed, rollsLeft, bonusRoll, canRoll };
}

async function doDailyRoll() {
  if (rolling || !player) return;
  if (!rollState().canRoll) return;

  rolling = true;
  $("rollButton").disabled = true;
  $("diceVisual").classList.add("rolling");

  let finalPlayer = null;

  try {
    // Admins use admin_roll (unlimited, optional forced dice); everyone else roll_daily.
    const { data, error } = player.isAdmin
      ? await supabase.rpc("admin_roll", { p_dice: Number($("adminDice").value) || null })
      : await supabase.rpc("roll_daily");
    if (error) throw error;

    // Keep the OLD `player` on the board until the animation finishes, so a
    // realtime leaderboard refresh can't make the token jump early.
    finalPlayer = convertPlayer(data.player);

    $("diceNumber").textContent = data.roll;
    $("diceVisual").classList.remove("rolling");

    // A bonus roll (won from a gift) only moves you; the tasklist stays the same.
    if (!data.bonus) {
      showTaskReveal(data.roll, data.tasks, data.roll_no);
      await waitForReveal(4200);
      hideReveal();
    } else {
      await sleep(600);
    }

    await animateRoll(data);

    if (data.event_message || data.bonus_mp)
      notify([data.event_message, data.bonus_mp ? `+${data.bonus_mp} MP bonus!` : ""].filter(Boolean).join(" "));

    // finished a board? checkpoint drop? show the finale / reward pop-up first
    let wantWardrobe = false;
    const newIds = data.new_unlocks || [];
    if (data.board_complete || newIds.length) {
      const choice = await showReward({ board: data.board_complete || null, ids: newIds, who: finalPlayer, bonusMp: data.bonus_mp || 0 });
      wantWardrobe = choice === "wardrobe";
    }

    animBoard = null;
    userPickedBoard = false;
    player = finalPlayer;
    updatePlayerUI();
    if (wantWardrobe) showView("wardrobeView");

    subscribeLeaderboard().catch(error => {
      console.error("Leaderboard refresh failed after roll:", error);
    });
  } catch (error) {
    console.error("Roll failed:", error);
    $("diceVisual").classList.remove("rolling");
    hideReveal();
    portalAnimation = null;
    animBoard = null;

    // If the server already saved the roll, show the saved result.
    if (finalPlayer) player = finalPlayer;
    notify(error.message || "The roll could not be completed.");
  } finally {
    rolling = false;
    updatePlayerUI();
  }
}

function setStartMessage(text = "") {
  const el = $("startMessage");
  if (el) el.textContent = text;
}

function updateStartButton() {
  const button = $("startButton");

  if (!currentUser) {
    button.innerHTML = 'Enter the storm <span>→</span>';
    setStartMessage("");
    return;
  }

  button.innerHTML = profileLoadError
    ? 'Try again <span>↻</span>'
    : 'Continue your journey <span>→</span>';

  if (profileLoadError) setStartMessage(profileLoadError);
  else if (!profileReady) setStartMessage("Loading your player…");
  else if (player) setStartMessage(`Welcome back, ${player.name}!`);
  else setStartMessage("You're signed in — create your chibi to begin.");
}

function friendlyLoadError(error) {
  const text = String(error?.message || error || "");

  if (/could not find the function|get_my_profile|schema cache/i.test(text)) {
    return "The game's database functions are not installed yet. Run supabase-game-functions.sql in the Supabase SQL Editor, then press Try again.";
  }

  return `We couldn't load your player profile. ${text}`.trim();
}

// Sends a signed-in player to the right place, but ONLY after they have
// pressed the start button on the welcome page.
function routeSignedIn() {
  if (!currentUser) return;

  updateStartButton();

  if (!hasEntered || !profileReady) return;

  if (profileLoadError) {
    showScreen("tutorialScreen");
    notify(profileLoadError);
    return;
  }

  if (!player) {
    selectedAvatarState = normaliseAvatarState(null, currentUser.id);
    $("profileMessage").textContent = "";

    // The username chosen at sign-up is the player name and can't be changed here.
    const chosen = currentUser.user_metadata?.username || "";
    $("playerName").value = chosen;
    $("playerName").readOnly = !!chosen;
    showScreen("profileScreen");
    renderAvatarPicker();
    return;
  }

  showScreen("appScreen");
  $("mainNav").classList.remove("hidden");
  updatePlayerUI();
  showView("gameView");

  subscribeLeaderboard().catch(error => {
    console.error("Leaderboard setup failed:", error);
    notify("Your profile loaded, but the leaderboard could not connect.");
  });
  loadStreamStats();
}

async function loadPlayerForCurrentUser(transition) {
  try {
    const loaded = await loadMyProfile();
    if (transition !== authTransitionId || !currentUser) return;

    player = loaded;
    profileLoadError = "";
    loadedUserId = currentUser.id;
  } catch (error) {
    console.error("Could not load player profile:", error);
    if (transition !== authTransitionId || !currentUser) return;

    player = null;
    profileLoadError = friendlyLoadError(error);
  }

  profileReady = true;
  routeSignedIn();
}

$("startButton").addEventListener("click", async () => {
  hasEntered = true;
  preloadSounds();

  if (!currentUser) {
    showScreen("authScreen");
    return;
  }

  if (profileLoadError) {
    profileReady = false;
    profileLoadError = "";
    updateStartButton();
    await loadPlayerForCurrentUser(authTransitionId);
    return;
  }

  routeSignedIn();
});

$("signupTab").addEventListener("click", () => setAuthMode("signup"));
$("loginTab").addEventListener("click", () => setAuthMode("login"));

function setAuthMode(mode) {
  authMode = mode;

  $("signupTab").classList.toggle("active", mode === "signup");
  $("loginTab").classList.toggle("active", mode === "login");

  $("authSubmit").innerHTML =
    mode === "signup"
      ? 'Create account <span>→</span>'
      : 'Log in <span>→</span>';

  $("passwordInput").autocomplete =
    mode === "signup" ? "new-password" : "current-password";

  $("authMessage").textContent = "";
}

// Players sign up with just a username + password. Behind the scenes the username is
// turned into a private fake e-mail address (Supabase accounts need one).
const USERNAME_RULE = /^[A-Za-z0-9_]{3,18}$/;

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();

  $("authSubmit").disabled = true;
  $("authMessage").textContent = "Please wait…";

  try {
    const username = $("usernameInput").value.trim();
    const password = $("passwordInput").value;

    if (!USERNAME_RULE.test(username)) {
      throw new Error("Usernames need 3–18 letters, numbers or underscores (no spaces).");
    }

    if (authMode === "signup") {
      if (username.toLowerCase() === "admin") {
        throw new Error("The username “admin” is reserved. Please choose another.");
      }

      // Friendly pre-check (the server enforces uniqueness either way).
      const { data: free, error: freeError } = await supabase.rpc("username_available", { p_name: username });
      if (!freeError && free === false) {
        throw new Error("That username is already taken. Please choose another.");
      }

      const { data, error } = await supabase.auth.signUp({
        email: usernameToEmail(username),
        password,
        options: { data: { username } }
      });
      if (error) throw error;

      if (!data.session) {
        // Works only when "Confirm email" is switched off in Supabase.
        const retry = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
        if (retry.error) {
          throw new Error("Account created, but it could not log in automatically. Ask the game owner to switch off “Confirm email” in Supabase → Authentication → Providers → Email.");
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password
      });
      if (error) throw error;
    }
  } catch (error) {
    const text = String(error?.message || error || "");

    $("authMessage").textContent =
      /already registered|already been registered|already exists/i.test(text) ? "That username is already taken. Please choose another."
      : /invalid login credentials/i.test(text) ? "Wrong username or password."
      : /reserved/i.test(text) ? "The username “admin” is reserved. Please choose another."
      : /database error saving new user/i.test(text) ? "That username can’t be used. Please choose another."
      : text;
  } finally {
    $("authSubmit").disabled = false;
  }
});

$("profileForm").addEventListener("submit", async event => {
  event.preventDefault();

  const name = $("playerName").value.trim();
  $("profileMessage").textContent = "Saving your character…";

  try {
    const { data, error } = await supabase.rpc("save_profile", {
      p_name: name,
      p_avatar: JSON.stringify(selectedAvatarState)
    });

    if (error) throw error;

    player = convertPlayer(data.player);
    hasEntered = true;
    profileReady = true;
    profileLoadError = "";
    loadedUserId = currentUser?.id || null;

    showScreen("appScreen");
    $("mainNav").classList.remove("hidden");

    updatePlayerUI();
    showView("gameView");

    // The profile save is complete; leaderboard connection is separate.
    subscribeLeaderboard().catch(error => {
      console.error("Leaderboard setup failed:", error);
      notify("Your profile is saved, but the leaderboard could not connect.");
    });
  } catch (error) {
    console.error("Could not save player profile:", error);
    $("profileMessage").textContent =
      error.message || "Could not save profile.";
  }
});

document.querySelectorAll(".nav-link[data-view]").forEach(button => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

$("rollButton").addEventListener("click", doDailyRoll);

// ---- Admin testing tools (the server refuses anyone who is not an admin) ----
async function adminMove(tile, checkpoint) {
  if (rolling || !player?.isAdmin) return;

  try {
    const { data, error } = await supabase.rpc("admin_set_position", {
      p_tile: tile,
      p_checkpoint: checkpoint
    });
    if (error) throw error;

    player = convertPlayer(data.player);
    userPickedBoard = false;           // follow the admin to the board they moved to
    updatePlayerUI();
    notify(`Moved to tile ${player.position}.`);
    subscribeLeaderboard().catch(() => {});
  } catch (error) {
    notify(error.message || "Could not move.");
  }
}

$("adminGo").addEventListener("click", () =>
  adminMove(Number($("adminTile").value) || 1, Number($("adminCheckpoint").value) || 0)
);

$("adminReset").addEventListener("click", () => {
  $("adminTile").value = 1;
  $("adminCheckpoint").value = "0";
  adminMove(1, 0);
});

$("soundToggle").addEventListener("click", () => {
  soundOn = !soundOn;
  try { localStorage.setItem("ps-sound", soundOn ? "on" : "off"); } catch (_) { /* ignore */ }
  updateSoundToggle();
  if (soundOn) playSound("up");
});
updateSoundToggle();

$("closeReveal").addEventListener("click", hideReveal);

$("taskReveal").addEventListener("click", event => {
  if (event.target === $("taskReveal")) hideReveal();
});

// The kawaii chibi renderer is self-contained; no third-party avatar editor is loaded.
renderBoard();
setInterval(updateCountdown, 1000);
updateCountdown();

async function loadMyProfile() {
  const { data, error } = await supabase.rpc("get_my_profile");

  if (error) throw error;

  return data.player ? convertPlayer(data.player) : null;
}

supabase.auth.onAuthStateChange((event, session) => {
  const user = session?.user || null;

  // Token refreshes and tab re-focus fire this callback again for the SAME
  // user. Ignore them so the player isn't thrown back to the game tab.
  if (user && user.id === loadedUserId) {
    currentUser = user;
    return;
  }

  currentUser = user;
  const thisTransition = ++authTransitionId;

  if (!currentUser) {
    const oldChannel = playersChannel;
    playersChannel = null;

    if (oldChannel) {
      supabase.removeChannel(oldChannel).catch(error => {
        console.warn("Could not close leaderboard channel:", error);
      });
    }

    player = null;
    songHistory = [];
    songHistoryLoaded = false;
    loadedUserId = null;
    hasEntered = false;
    profileReady = false;
    profileLoadError = "";
    window.latestPlayers = [];
    portalAnimation = null;

    $("mainNav").classList.add("hidden");
    $("topUser").textContent = "";

    showScreen("tutorialScreen");
    updateStartButton();
    return;
  }

  profileReady = false;
  profileLoadError = "";
  updateStartButton();

  // Run data requests after the auth callback has returned.
  setTimeout(() => loadPlayerForCurrentUser(thisTransition), 0);
});
