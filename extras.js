// ============================================================================
// extras.js: notifications, toasts, badges, daily chest, friends, top-bar helpers.
// Everything here talks to the functions in txt-perfect-storm-update-v19-core.sql.
// If that SQL has not been run yet, each feature quietly hides itself instead of breaking the game.
// ============================================================================
import { supabase } from "./supabase-config.js";
import * as phase3 from "./phase3.js";

const $ = (id) => document.getElementById(id);
let ctx = null;

const state = {
  uid: null,
  signedIn: false,
  missing: new Set(),            // features whose SQL function is not there yet
  notif: { unread: 0, items: [], maxId: 0, loaded: false },
  badges: { defs: [], earned: [], loaded: false },
  lbBadges: {},
  friends: null,
  chest: null,
  chestReward: null,
  doneSet: null,
  lastSig: "",
  badgeTimer: null,
  pollTimer: null,
};

// ---------- small helpers --------------------------------------------------
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const msg = String(error.message || "");
    if (error.code === "PGRST202" || /could not find the function|does not exist/i.test(msg)) state.missing.add(name);
    throw error;
  }
  return data;
}

function timeAgo(value) {
  const s = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function toast(text, { kind = "", ms = 4200 } = {}) {
  const stack = $("toastStack");
  if (!stack) return;
  while (stack.children.length >= 3) stack.firstChild.remove();
  const el = document.createElement("div");
  el.className = `toast ${kind}`.trim();
  el.textContent = text;
  stack.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, ms);
}

// ---------- top bar: menus -------------------------------------------------
function setMore(open) {
  $("moreMenu")?.classList.toggle("hidden", !open);
  $("moreToggle")?.setAttribute("aria-expanded", String(!!open));
}
function setNotif(open) {
  $("notifPanel")?.classList.toggle("hidden", !open);
  $("notifButton")?.setAttribute("aria-expanded", String(!!open));
}
export function closeMenus() { setMore(false); setNotif(false); }

export function init(context) {
  ctx = context;
  phase3.init({ ...context, toast });

  $("moreToggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setNotif(false);
    setMore($("moreMenu").classList.contains("hidden"));
  });
  $("notifButton")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setMore(false);
    const opening = $("notifPanel").classList.contains("hidden");
    setNotif(opening);
    if (opening) openNotifications();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav-more")) setMore(false);
    if (!e.target.closest(".notif-wrap")) setNotif(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });

  $("logoutButton")?.addEventListener("click", async () => { closeMenus(); await supabase.auth.signOut(); });
  $("mpChip")?.addEventListener("click", () => ctx.showView("shopView"));

  $("friendForm")?.addEventListener("submit", onAddFriend);
  $("friendRequests")?.addEventListener("click", onFriendAction);
  $("friendList")?.addEventListener("click", onFriendAction);
  $("chestCard")?.addEventListener("click", (e) => { if (e.target.closest("#chestOpen")) openChest(); });
}

// ---------- session hooks (called from app.js) ----------------------------------
export function onSignedIn() {
  const p = ctx.getPlayer();
  state.uid = p?.uid || null;
  state.signedIn = true;
  state.notif = { unread: 0, items: [], maxId: 0, loaded: false };
  state.badges = { defs: [], earned: [], loaded: false };
  state.lbBadges = {};
  state.friends = null;
  state.chest = null;
  state.chestReward = null;
  state.doneSet = null;
  state.lastSig = "";
  state.missing = new Set();

  $("notifButton")?.classList.remove("hidden");
  $("mpChip")?.classList.remove("hidden");

  refreshBadges({ quiet: false }).finally(() => { loadLeaderboardBadges(); });
  refreshNotifications({ first: true });
  loadChest({ nudge: true });
  loadFriends({ quiet: true });
  phase3.onSignedIn();

  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(poll, 60000);
}

export function onSignedOut() {
  phase3.onSignedOut();
  state.signedIn = false;
  state.uid = null;
  clearInterval(state.pollTimer);
  clearTimeout(state.badgeTimer);
  closeMenus();
  $("notifButton")?.classList.add("hidden");
  $("mpChip")?.classList.add("hidden");
  $("friendsDot")?.classList.add("hidden");
  const stack = $("toastStack"); if (stack) stack.innerHTML = "";
}

export function onViewShown(viewId) {
  closeMenus();
  if (!state.signedIn) return;
  phase3.onViewShown(viewId);
  if (viewId === "friendsView") loadFriends();
  if (viewId === "badgesView") refreshBadges({ quiet: true });
  if (viewId === "leaderboardView") loadLeaderboardBadges();
}

function poll() {
  if (!state.signedIn || document.visibilityState !== "visible") return;
  refreshNotifications({});
  if (!$("friendsView")?.classList.contains("hidden")) loadFriends({ quiet: true });
  if (state.chest && state.chest.date !== ctx.kstDateKey()) loadChest({});   // a new KST day: a new chest
}

// Called every time the game redraws the player (after rolls, task ticks, checks, shop buys).
export function onPlayerUpdate(p) {
  if (!p) return;
  phase3.onPlayerUpdate(p);

  // top bar: MP chip + player pill
  const mp = ctx.mpBalance();
  const chipVal = $("mpChipValue"); if (chipVal) chipVal.textContent = mp.toLocaleString();
  const top = $("topUser");
  if (top) {
    top.innerHTML = `<div class="user-pill" title="${esc(p.name)}"><img class="chibi-image" src="${esc(ctx.avatarDataUri(p.avatar, p.uid))}" alt=""><span class="user-name">${esc(p.name)}</span></div>`;
  }

  // "+50 MP" toast when a task gets finished
  const done = new Map();
  (p.taskHistory || []).forEach((day) => (day.completed || []).forEach((i) => done.set(`${day.date}:${i}`, (day.mp || [])[i] ?? 50)));
  if (state.doneSet && state.doneSet.uid === p.uid) {
    let gained = 0, n = 0;
    done.forEach((m, k) => { if (!state.doneSet.keys.has(k)) { gained += m; n++; } });
    if (n > 0 && done.size > state.doneSet.keys.size) {
      toast(`+${gained} MP · ${n > 1 ? `${n} tasks` : "task"} complete ✓`, { kind: "mp" });
    }
  }
  state.doneSet = { uid: p.uid, keys: new Set(done.keys()) };

  // something that can earn a badge changed: check, soon
  const sig = `${done.size}|${p.position}|${p.mp}`;
  if (state.lastSig && sig !== state.lastSig && !state.missing.has("my_badges")) {
    clearTimeout(state.badgeTimer);
    state.badgeTimer = setTimeout(() => refreshBadges({ quiet: false }), 1200);
  }
  state.lastSig = sig;
}

// ---------- notifications ---------------------------------------------------
const NOTIF_ICON = { friend_request: "📨", friend_accepted: "🤝", badge: "🏅", announce: "📣" };

async function refreshNotifications({ first = false } = {}) {
  if (state.missing.has("get_notifications")) return;
  try {
    const data = await rpc("get_notifications");
    const items = data.items || [];
    const prevMax = state.notif.maxId;
    if (state.notif.loaded) {
      items.filter((n) => n.id > prevMax && !n.read && n.kind !== "badge").slice(0, 3).reverse().forEach((n) =>
        toast(`${NOTIF_ICON[n.kind] || "🔔"} ${n.title}`, { kind: n.kind.startsWith("friend") ? "social" : "" }));
    }
    state.notif = { unread: data.unread || 0, items, maxId: Math.max(prevMax, ...items.map((n) => n.id), 0), loaded: true };
    renderBellCount();
    if (!$("notifPanel").classList.contains("hidden")) renderNotifPanel();
  } catch (err) {
    if (!first) console.warn("Notifications:", err.message);
    if (state.missing.has("get_notifications")) $("notifButton")?.classList.add("hidden");
  }
}

function renderBellCount() {
  const el = $("notifCount"); if (!el) return;
  const n = state.notif.unread;
  el.textContent = n > 9 ? "9+" : String(n);
  el.classList.toggle("hidden", n <= 0);
}

function renderNotifPanel() {
  const panel = $("notifPanel");
  const items = state.notif.items;
  panel.innerHTML = `<div class="notif-head"><b>NOTIFICATIONS</b></div>` + (items.length
    ? items.map((n) => `
        <button type="button" class="notif-item${n.read ? "" : " unread"}" data-kind="${esc(n.kind)}">
          <span class="notif-ico">${NOTIF_ICON[n.kind] || "🔔"}</span>
          <span><span class="notif-title">${esc(n.title)}</span>${n.body ? `<span class="notif-body">${esc(n.body)}</span>` : ""}<span class="notif-time">${timeAgo(n.at)}</span></span>
        </button>`).join("")
    : `<div class="notif-empty">You're all caught up ✦</div>`);
  panel.querySelectorAll(".notif-item").forEach((b) => b.addEventListener("click", () => {
    const kind = b.dataset.kind;
    setNotif(false);
    if (kind.startsWith("friend")) ctx.showView("friendsView");
    else if (kind === "badge") ctx.showView("badgesView");
  }));
}

async function openNotifications() {
  renderNotifPanel();
  if (state.notif.unread > 0 && !state.missing.has("mark_notifications_read")) {
    state.notif.unread = 0; renderBellCount();
    try { await rpc("mark_notifications_read"); } catch (_) { /* soft */ }
  }
}

// ---------- badges ------------------------------------------------------------
async function refreshBadges({ quiet = true } = {}) {
  if (state.missing.has("my_badges")) return;
  try {
    const data = await rpc("my_badges");
    state.badges = { defs: data.defs || [], earned: data.earned || [], loaded: true, stats: data.stats || {} };
    const fresh = data.new || [];
    if (fresh.length && !quiet) {
      if (fresh.length <= 2) fresh.forEach((b) => toast(`${b.emoji} New badge: ${b.name}`, { kind: "badge", ms: 5200 }));
      else toast(`🏅 ${fresh.length} new badges earned!`, { kind: "badge", ms: 5200 });
      ctx.confetti?.();
    }
    if (fresh.length) { loadLeaderboardBadges(); refreshNotifications({}); }
    renderBadges();
    if (state.friends) renderFriends();
  } catch (err) {
    console.warn("Badges:", err.message);
  }
}

function renderBadges() {
  const grid = $("badgesGrid"); if (!grid) return;
  const { defs, earned } = state.badges;
  const when = new Map(earned.map((e) => [e.id, e.at]));
  const sum = $("badgesSummary");
  if (sum && defs.length) sum.textContent = `${when.size} of ${defs.length} badges earned. Keep rolling, finishing tasks and crossing the boards!`;
  const order = [...defs].sort((a, b) => (when.has(b.id) - when.has(a.id)));
  grid.innerHTML = order.map((d) => {
    const at = when.get(d.id);
    return `<div class="badge-card ${at ? "earned" : "locked"}">
      <span class="b-emoji">${esc(d.emoji)}</span><b>${esc(d.name)}</b><small>${esc(d.description)}</small>
      ${at ? `<small class="b-date">Earned ${esc(new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" }))}</small>` : ""}
    </div>`;
  }).join("");
}

async function loadLeaderboardBadges() {
  if (state.missing.has("leaderboard_badges")) return;
  try {
    state.lbBadges = (await rpc("leaderboard_badges")) || {};
    ctx.renderLeaderboard?.();
  } catch (err) { console.warn("Leaderboard badges:", err.message); }
}

// Up to 3 badge icons for a leaderboard row
export function badgeIcons(uid) {
  const ids = state.lbBadges?.[uid];
  if (!ids?.length || !state.badges.defs.length) return "";
  const byId = new Map(state.badges.defs.map((d) => [d.id, d]));
  const shown = ids.map((id) => byId.get(id)).filter(Boolean);
  if (!shown.length) return "";
  return `<span class="leader-badges" title="${esc(shown.map((d) => d.name).join(", "))}">${shown.map((d) => esc(d.emoji)).join("")}</span>`;
}

// ---------- daily chest ----------------------------------------------------------
async function loadChest({ nudge = false } = {}) {
  const card = $("chestCard"); if (!card) return;
  if (state.missing.has("chest_status")) { card.classList.add("hidden"); return; }
  try {
    state.chest = await rpc("chest_status");
    card.classList.remove("hidden");
    renderChest();
    if (nudge && state.chest.available) {
      const key = `psChestNudge:${state.chest.date}`;
      let seen = false; try { seen = !!sessionStorage.getItem(key); sessionStorage.setItem(key, "1"); } catch (_) { /* ignore */ }
      if (!seen) toast("🎁 Your daily chest is ready!", { kind: "mp" });
    }
  } catch (err) {
    console.warn("Chest:", err.message);
    if (state.missing.has("chest_status")) card.classList.add("hidden");
  }
}

function rewardText(r) {
  if (!r) return "";
  return r.type === "roll" ? "🎲 A bonus roll!" : `+${r.mp} MP`;
}

function renderChest() {
  const card = $("chestCard"); if (!card || !state.chest) return;
  card.classList.remove("opening");
  const reward = state.chestReward
    ? `<div class="chest-reward ${state.chestReward.tier === "epic" ? "epic" : ""}">${esc(rewardText(state.chestReward))}</div>` : "";
  card.innerHTML = state.chest.available
    ? `<p class="eyebrow">DAILY CHEST</p>
       <button type="button" class="chest-btn" id="chestOpen"><span class="chest-emoji">🎁</span><b>Open today's chest</b><span class="chest-sub">A free surprise every day</span></button>`
    : `<p class="eyebrow">DAILY CHEST</p>
       <div class="chest-btn chest-done"><span class="chest-emoji">📭</span><b>Chest opened ✓</b><span class="chest-sub">A new chest arrives after the midnight KST reset</span></div>${reward}`;
}

async function openChest() {
  const card = $("chestCard"); const btn = $("chestOpen");
  if (!card || !btn || btn.disabled) return;
  btn.disabled = true;
  card.classList.add("opening");
  try {
    const [res] = await Promise.all([rpc("claim_daily_chest"), new Promise((r) => setTimeout(r, 750))]);
    if (res?.ok) {
      state.chestReward = res.reward;
      state.chest = { ...(state.chest || {}), available: false, date: ctx.kstDateKey() };
      toast(`🎁 Daily chest: ${rewardText(res.reward)}`, { kind: "mp", ms: 5000 });
      if (res.reward?.tier === "epic" || res.reward?.tier === "rare") ctx.confetti?.();
      renderChest();
      await ctx.refreshPlayer?.();
    } else {
      await loadChest({});
    }
  } catch (err) {
    toast(err.message || "Could not open the chest.");
    card.classList.remove("opening"); btn.disabled = false;
  }
}

// ---------- friends -----------------------------------------------------------
async function loadFriends({ quiet = false } = {}) {
  if (state.missing.has("get_friends")) {
    if (!quiet) { const l = $("friendList"); if (l) l.innerHTML = `<p class="muted">Friends are not switched on yet. Run the v19 SQL in Supabase.</p>`; }
    return;
  }
  try {
    const data = await rpc("get_friends");
    const incoming = (data.incoming || []).length;
    if (state.friends && incoming > (state.friends.incoming || []).length && quiet) { /* new request: the notification toast covers it */ }
    state.friends = data;
    $("friendsDot")?.classList.toggle("hidden", incoming === 0);
    renderFriends();
  } catch (err) {
    if (!quiet) { const l = $("friendList"); if (l) l.innerHTML = `<p class="muted">${esc(err.message || "Could not load friends.")}</p>`; }
  }
}

function personRow(p, actions, meta = "", extra = "", uid = "") {
  return `<div class="friend-row"${uid ? ` data-uid="${esc(uid)}"` : ""}>
    <img class="chibi-image" src="${esc(ctx.avatarDataUri(p.avatar, p.id || p.uid))}" alt="">
    <div><div class="friend-name">${esc(p.username)}${extra}</div>${meta ? `<div class="friend-meta">${meta}</div>` : ""}</div>
    <div class="friend-actions">${actions}</div></div>`;
}

function renderFriends() {
  const data = state.friends; if (!data) return;
  const byId = new Map(state.badges.defs.map((d) => [d.id, d]));

  const req = $("friendRequests");
  const inc = data.incoming || [], out = data.outgoing || [];
  req.innerHTML = (inc.length ? `<p class="eyebrow friend-sub">REQUESTS FOR YOU</p>` + inc.map((r) => personRow(r,
      `<button class="secondary-button" data-act="accept" data-id="${r.id}">Accept</button><button class="secondary-button danger" data-act="decline" data-id="${r.id}">Decline</button>`)).join("") : "")
    + (out.length ? `<p class="eyebrow friend-sub">WAITING FOR THEM</p>` + out.map((r) => personRow(r,
      `<button class="secondary-button" data-act="cancel" data-uid="${r.uid}">Cancel</button>`, "Request sent")).join("") : "");

  const list = $("friendList");
  const friends = data.friends || [];
  $("friendCount").textContent = friends.length ? `· ${friends.length}` : "";
  list.innerHTML = friends.length
    ? friends.map((f) => personRow(f,
        `<button class="secondary-button danger" data-act="remove" data-uid="${f.id}" data-name="${esc(f.username)}">Remove</button>`,
        `Tile ${esc(f.position ?? 1)} · ${esc((f.mp ?? 0).toLocaleString())} MP`,
        (f.badges || []).length ? `<span class="mini-badges">${f.badges.map((id) => esc(byId.get(id)?.emoji || "")).join("")}</span>` : "",
        f.id)).join("")
    : `<p class="muted">No friends yet. Send a request using a username above.</p>`;
  phase3.decorateFriends();
}

async function onAddFriend(e) {
  e.preventDefault();
  const input = $("friendInput"), msg = $("friendMessage");
  const name = input.value.trim();
  if (!name) return;
  msg.textContent = "Sending…";
  try {
    const res = await rpc("friend_request", { p_username: name });
    msg.textContent = res.status === "accepted" ? `You and ${res.username} are now friends! 🎉` : `Request sent to ${res.username}.`;
    input.value = "";
    loadFriends({ quiet: true });
  } catch (err) {
    msg.textContent = err.message || "Could not send the request.";
  }
}

async function onFriendAction(e) {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const act = b.dataset.act;
  try {
    if (act === "accept" || act === "decline") {
      await rpc("friend_respond", { p_id: Number(b.dataset.id), p_accept: act === "accept" });
      if (act === "accept") toast("🤝 Friend added!", { kind: "social" });
    } else if (act === "cancel") {
      await rpc("friend_remove", { p_other: b.dataset.uid });
    } else if (act === "remove") {
      if (!confirm(`Remove ${b.dataset.name} from your friends?`)) return;
      await rpc("friend_remove", { p_other: b.dataset.uid });
    }
    loadFriends({ quiet: true });
  } catch (err) {
    toast(err.message || "Something went wrong.");
  }
}
