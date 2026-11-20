// ============================================================================
// phase3.js: shop sets + mystery boxes, cheers, emotes, Studio frames, weekly recap,
// quiz tiles and Song-of-the-Day tiles.
// Talks to the functions in supabase-update-phase3-v20.sql. If that SQL has not been run yet,
// every feature quietly shows a short note instead of breaking the game.
// ============================================================================
import { supabase } from "./supabase-config.js";
import { SPECIAL_TILES } from "./game-config.js";

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString();

let ctx = null;
const S = {
  signedIn: false,
  catalog: [],           // emotes [{id, glyph, label}]
  myEmote: null,         // emote id
  frame: "none",
  showEmote: true,
  recap: null,
  lastPos: null,
  tileKey: "",
  chipEvent: null,
  tileTimer: null,
  cheerTimer: null,
  shopTimer: null,
  sentTo: new Set(),
};

export const FRAMES = [["none", "No frame"], ["polaroid", "📸 Polaroid"], ["stage", "🎤 Stage lights"], ["storm", "⛈ Storm"], ["neon", "💗 Neon"]];
const CHEER_KINDS = { heart: "💜", star: "⭐", storm: "⚡", clap: "👏" };
const RARITY = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const SLOT = { style: "Hairstyle", outfit: "Outfit", accessory: "Accessory", aura: "Aura", wings: "Wings" };

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
const errText = (err, fallback) => String(err?.message || fallback || "Something went wrong.");
const sqlMissing = (err) => err?.code === "PGRST202" || /could not find the function|does not exist/i.test(String(err?.message || ""));
const toast = (text, opts) => { try { ctx?.toast?.(text, opts); } catch (_) { /* ignore */ } };

// ---------- modal ----------------------------------------------------------------
function escClose(e) { if (e.key === "Escape") closeModal(); }
export function closeModal() {
  $("p3Modal")?.remove();
  document.removeEventListener("keydown", escClose);
  updateTileChip();
}
function openModal(html) {
  $("p3Modal")?.remove();
  const wrap = document.createElement("div");
  wrap.className = "p3-modal";
  wrap.id = "p3Modal";
  wrap.innerHTML = `<div class="p3-card" role="dialog" aria-modal="true">${html}<button type="button" class="p3-x" aria-label="Close">×</button></div>`;
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest(".p3-x")) closeModal(); });
  document.body.appendChild(wrap);
  document.addEventListener("keydown", escClose);
  $("p3TileChip")?.classList.add("hidden");
  return wrap.querySelector(".p3-card");
}

// ============================================================================
// SHOP: era sets + mystery boxes
// ============================================================================
function ensureShopHost() {
  const view = $("shopView");
  if (!view) return null;
  let host = $("p3Shop");
  if (!host) { host = document.createElement("div"); host.id = "p3Shop"; host.className = "p3-shop"; view.appendChild(host); }
  return host;
}
function scheduleShop() { clearTimeout(S.shopTimer); S.shopTimer = setTimeout(renderShopExtras, 250); }

async function renderShopExtras() {
  const host = ensureShopHost();
  if (!host || !S.signedIn) return;
  let sets, boxes;
  try {
    [sets, boxes] = await Promise.all([rpc("get_shop_sets"), rpc("get_mystery_boxes")]);
  } catch (err) {
    host.innerHTML = `<section class="panel p3-panel"><p class="muted">${sqlMissing(err) ? "Sets and mystery boxes are not switched on yet. Run the phase-3 SQL in Supabase." : esc(errText(err, "Could not load the extras."))}</p></section>`;
    return;
  }
  const balance = ctx.mpBalance();

  const setCards = sets.map((s) => {
    const owned = s.items.filter((i) => i.owned).length;
    const total = s.items.length;
    const complete = owned === total;
    const action = s.claimed
      ? `<span class="p3-claimed">✓ Bonus claimed</span>`
      : complete
        ? `<button type="button" class="primary-button p3-claim-set" data-set="${esc(s.id)}">Claim +${fmt(s.bonus_mp)} MP</button>`
        : `<span class="p3-muted">${owned}/${total} pieces</span>`;
    return `<article class="p3-set${complete ? " complete" : ""}">
      <header><div><strong>${esc(s.name)}</strong><span class="p3-sub">${esc(s.blurb || "")}</span></div><span class="p3-pill">+${fmt(s.bonus_mp)} MP</span></header>
      <ul class="p3-items">${s.items.map((i) => `<li class="${i.owned ? "own" : ""} rarity-${esc(i.rarity)}">${i.owned ? "✓" : "○"} ${esc(i.name)} <em>${esc(SLOT[i.slot] || i.slot)}${i.owned ? "" : ` · ${fmt(i.price)} MP`}</em></li>`).join("")}</ul>
      <footer><div class="p3-bar"><i style="width:${Math.round((owned / total) * 100)}%"></i></div>${action}</footer>
    </article>`;
  }).join("");

  // boxes sorted by their pull odds: the lowest-tier boxes first, the best odds of rare stuff last
  const RANK = { common: 0, rare: 1, epic: 2, legendary: 3 };
  const oddsScore = (o) => { let t = 0, s = 0; for (const [r, w] of Object.entries(o || {})) { t += +w; s += (+w) * (RANK[r] ?? 0); } return t ? s / t : 0; };
  boxes = [...boxes].sort((a, b) => oddsScore(a.odds) - oddsScore(b.odds) || a.price - b.price);

  const boxCards = boxes.map((b) => {
    const odds = Object.entries(b.odds || {}).sort((x, y) => (RANK[y[0]] ?? 0) - (RANK[x[0]] ?? 0))
      .map(([r, w]) => `<li class="rarity-${esc(r)}"><span>${esc(RARITY[r] || r)}</span><b>${esc(w)}%</b></li>`).join("");
    const limited = b.daily_limit != null;
    const left = limited ? Math.max(0, b.daily_limit - (b.opened_today || 0)) : 1;
    const can = balance >= b.price && left > 0;
    return `<article class="p3-box">
      <div class="p3-box-art" aria-hidden="true">🎁</div>
      <strong>${esc(b.name)}</strong>
      <span class="p3-sub">A shop item you do not own yet, never a duplicate.</span>
      <ul class="p3-odds">${odds}</ul>
      <button type="button" class="primary-button p3-open-box" data-box="${esc(b.id)}" ${can ? "" : "disabled"}>${left > 0 ? `Open · ${fmt(b.price)} MP` : "Opened today ✓"}</button>
      ${limited ? `<span class="p3-sub">Limit: ${esc(b.daily_limit)} per day</span>` : ""}
      ${left > 0 && balance < b.price ? `<span class="p3-sub">You have ${fmt(balance)} MP</span>` : ""}
    </article>`;
  }).join("");

  host.innerHTML = `
    <section class="panel p3-panel">
      <p class="eyebrow">ERA SETS</p>
      <h2>Collect the whole look <span class="sparkle">✦</span></h2>
      <p class="muted">Own every piece of a set (buy it, open it from a box or win it) and claim a one-off bonus of 15% of the set's price.</p>
      <div class="p3-sets">${setCards}</div>
    </section>
    <section class="panel p3-panel">
      <p class="eyebrow">MYSTERY BOXES</p>
      <h2>Feeling lucky? <span class="sparkle">✦</span></h2>
      <p class="muted">The odds are shown on every box. Rarities you already own completely are skipped, and a box you cannot use is never charged.</p>
      <div class="p3-boxes">${boxCards}</div>
    </section>`;
}

async function claimSet(setId, btn) {
  btn.disabled = true;
  try {
    const r = await rpc("claim_set_bonus", { p_set: setId });
    toast(`Set complete! +${fmt(r.mp)} MP ✨`, { kind: "success" });
    ctx.confetti?.();
    await ctx.refreshPlayer();
  } catch (err) { toast(errText(err), { kind: "error" }); }
  renderShopExtras();
}

async function openBox(boxId, btn) {
  btn.disabled = true;
  try {
    const r = await rpc("open_mystery_box", { p_box: boxId });
    await ctx.refreshPlayer();
    const it = r.item;
    const card = openModal(`
      <div class="p3-reveal rarity-${esc(it.rarity)}">
        <div class="p3-box-art big">🎁</div>
        <p class="eyebrow">${esc(RARITY[it.rarity] || it.rarity)} ${esc(SLOT[it.slot] || it.slot)}</p>
        <h2>${esc(it.name)}</h2>
        <p class="muted">It is in your wardrobe now.</p>
        <div class="p3-actions"><button type="button" class="primary-button" id="p3Wear">Wear it</button><button type="button" class="ghost-button p3-x2">Nice!</button></div>
      </div>`);
    card.querySelector("#p3Wear")?.addEventListener("click", () => { closeModal(); ctx.showView("wardrobeView"); });
    card.querySelector(".p3-x2")?.addEventListener("click", closeModal);
    if (it.rarity !== "common") ctx.confetti?.();
  } catch (err) { toast(errText(err), { kind: "error" }); }
  renderShopExtras();
}

// ============================================================================
// EMOTES + STUDIO FRAMES
// ============================================================================
function glyphOf(id) { return S.catalog.find((e) => e.id === id)?.glyph || ""; }

function emotePickerHtml() {
  if (!S.catalog.length) return `<p class="muted">Emotes are not switched on yet. Run the phase-3 SQL in Supabase.</p>`;
  return `<div class="p3-emotes" role="radiogroup" aria-label="Your emote">
    <button type="button" class="p3-emote-btn${S.myEmote ? "" : " active"}" data-emote="" role="radio" aria-checked="${!S.myEmote}" title="No emote">∅</button>
    ${S.catalog.map((e) => `<button type="button" class="p3-emote-btn${S.myEmote === e.id ? " active" : ""}" data-emote="${esc(e.id)}" role="radio" aria-checked="${S.myEmote === e.id}" title="${esc(e.label)}">${esc(e.glyph)}</button>`).join("")}
  </div>`;
}
function renderEmotePickers() {
  const html = `<p class="eyebrow">YOUR EMOTE</p><p class="muted">Friends see it next to your chibi, and it can pop up in your Studio photos.</p>${emotePickerHtml()}`;
  const fr = $("friendsView");
  if (fr) {
    let panel = $("p3EmoteFriends");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "p3EmoteFriends";
      panel.className = "panel p3-emote-panel";
      (fr.querySelector(".friends-layout") || fr).before(panel);
    }
    panel.innerHTML = html;
  }
  const tools = $("p3StudioTools");
  if (tools) tools.querySelector(".p3-emote-slot").innerHTML = emotePickerHtml();
}
async function chooseEmote(id) {
  try {
    await rpc("set_emote", { p_emote: id || null });
    S.myEmote = id || null;
    renderEmotePickers();
    refreshStudio();
    decorateFriends();
  } catch (err) { toast(errText(err), { kind: "error" }); }
}

function ensureStudioTools() {
  const view = $("studioView");
  if (!view) return;
  let tools = $("p3StudioTools");
  if (!tools) {
    tools = document.createElement("section");
    tools.id = "p3StudioTools";
    tools.className = "panel p3-studio-tools";
    tools.innerHTML = `
      <p class="eyebrow">FRAME</p>
      <div class="p3-frames" role="radiogroup" aria-label="Photo frame"></div>
      <label class="p3-check"><input type="checkbox" id="p3ShowEmote" checked> Show my emote on the photo</label>
      <p class="eyebrow">YOUR EMOTE</p>
      <div class="p3-emote-slot"></div>`;
    view.appendChild(tools);
    tools.addEventListener("change", (e) => { if (e.target.id === "p3ShowEmote") { S.showEmote = e.target.checked; refreshStudio(); } });
  }
  tools.querySelector(".p3-frames").innerHTML = FRAMES.map(([id, label]) =>
    `<button type="button" class="studio-bg p3-frame${S.frame === id ? " active" : ""}" data-frame="${id}" role="radio" aria-checked="${S.frame === id}">${esc(label)}</button>`).join("");
  tools.querySelector(".p3-emote-slot").innerHTML = emotePickerHtml();
}
// re-render the Studio photo (it listens to the background buttons)
function refreshStudio() {
  ensureStudioTools();
  if ($("studioView")?.classList.contains("hidden")) return;
  document.querySelector(".studio-bg[data-bg].active")?.click();
}

function frameSvg(frame, name) {
  switch (frame) {
    case "polaroid":
      return `<path d="M0 0H320V320H0Z M14 14H306V268H14Z" fill="#FBFAF6" fill-rule="evenodd"/>
        <path d="M14 14H306V268H14Z" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="2"/>
        <text x="160" y="299" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="16" font-weight="800" fill="#3B3556">${esc(name)} · Beat The Angel Bite</text>`;
    case "stage":
      return `<defs><linearGradient id="p3b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".6"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient></defs>
        <polygon points="30,0 72,0 132,320 -22,320" fill="url(#p3b)"/>
        <polygon points="248,0 290,0 342,320 190,320" fill="url(#p3b)"/>
        <polygon points="140,0 180,0 232,320 88,320" fill="url(#p3b)" opacity=".55"/>
        <rect x="0" y="0" width="320" height="10" fill="#D7FF3A" opacity=".8"/>`;
    case "storm":
      return `<path d="M0 0H320V46Q292 72 262 48Q232 80 202 52Q172 86 142 54Q112 84 82 52Q52 76 22 50Q8 46 0 52Z" fill="#2A2750" opacity=".92"/>
        <path d="M170 40L142 94L166 94L148 142L198 78L173 78L192 40Z" fill="#D7FF3A"/>
        <rect x="5" y="5" width="310" height="310" rx="38" fill="none" stroke="#D7FF3A" stroke-width="5" stroke-opacity=".75"/>`;
    case "neon":
      return `<defs><filter id="p3g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter></defs>
        <rect x="10" y="10" width="300" height="300" rx="34" fill="none" stroke="#FF5CD1" stroke-width="12" filter="url(#p3g)"/>
        <rect x="10" y="10" width="300" height="300" rx="34" fill="none" stroke="#FF9BE8" stroke-width="4"/>
        <rect x="22" y="22" width="276" height="276" rx="24" fill="none" stroke="#5CF2FF" stroke-width="3" stroke-opacity=".9"/>`;
    default:
      return "";
  }
}
function decorate(svg) {
  const p = ctx?.getPlayer?.();
  let extra = frameSvg(S.frame, p?.name || "Player");
  const glyph = S.showEmote && S.myEmote ? glyphOf(S.myEmote) : "";
  if (glyph) {
    extra += `<g><path d="M240 88L226 114L262 98Z" fill="#fff" stroke="#3B3556" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="262" cy="64" r="35" fill="#fff" stroke="#3B3556" stroke-width="4"/>
      <text x="262" y="77" text-anchor="middle" font-size="36">${esc(glyph)}</text></g>`;
  }
  if (!extra) return svg;
  return /<\/svg>\s*$/.test(svg) ? svg.replace(/<\/svg>\s*$/, `${extra}</svg>`) : svg;
}

// ============================================================================
// CHEERS (friends)
// ============================================================================
export function decorateFriends() {
  if (!S.signedIn) return;
  const rows = [...document.querySelectorAll("#friendList .friend-row[data-uid]")];
  if (!rows.length) return;
  rows.forEach((r) => {
    const act = r.querySelector(".friend-actions");
    if (act && !act.querySelector(".p3-cheer")) {
      act.insertAdjacentHTML("afterbegin", `<button type="button" class="ghost-button p3-cheer" data-uid="${esc(r.dataset.uid)}" ${S.sentTo.has(r.dataset.uid) ? "disabled" : ""}>${S.sentTo.has(r.dataset.uid) ? "💜 Cheered" : "💜 Cheer"}</button>`);
    }
  });
  rpc("get_emotes", { p_ids: rows.map((r) => r.dataset.uid) }).then((map) => {
    rows.forEach((r) => {
      r.querySelector(".p3-emote")?.remove();
      const g = map?.[r.dataset.uid];
      if (g) r.querySelector(".friend-name")?.insertAdjacentHTML("beforeend", ` <span class="p3-emote" title="Their emote">${esc(g)}</span>`);
    });
  }).catch(() => { /* SQL not run yet: no emotes */ });
}

function askCheer(uid) {
  const card = openModal(`<div class="p3-cheer-pick"><p class="eyebrow">SEND A CHEER</p><h2>Pick one</h2>
    <div class="p3-cheer-row">${Object.entries(CHEER_KINDS).map(([k, g]) => `<button type="button" class="p3-cheer-kind" data-kind="${k}">${g}</button>`).join("")}</div>
    <p class="muted">Free, 5 a day, one per friend per day.</p></div>`);
  card.addEventListener("click", async (e) => {
    const b = e.target.closest(".p3-cheer-kind");
    if (!b) return;
    card.querySelectorAll("button").forEach((x) => (x.disabled = true));
    try {
      const r = await rpc("send_cheer", { p_to: uid, p_kind: b.dataset.kind });
      S.sentTo.add(uid);
      toast(`Cheer sent ${CHEER_KINDS[b.dataset.kind]} (${r.left} left today)`, { kind: "success" });
      closeModal();
      decorateFriends();
      document.querySelectorAll(`.p3-cheer[data-uid="${CSS.escape(uid)}"]`).forEach((x) => { x.disabled = true; x.textContent = "💜 Cheered"; });
    } catch (err) {
      toast(errText(err), { kind: "error" });
      closeModal();
    }
  });
}

async function pollCheers() {
  if (!S.signedIn) return;
  try {
    const r = await rpc("get_cheers");
    S.sentTo = new Set(r.sent_to_today || []);
    const unseen = r.unseen || [];
    if (unseen.length) {
      unseen.slice(0, 3).forEach((c) => toast(`${c.from} sent you a ${CHEER_KINDS[c.kind] || "💜"} cheer!`, { kind: "success" }));
      if (unseen.length > 3) toast(`…and ${unseen.length - 3} more cheers 💜`, { kind: "success" });
      await rpc("mark_cheers_seen");
    }
  } catch (_) { /* SQL not run yet */ }
}

// ============================================================================
// WEEKLY RECAP
// ============================================================================
function dayLabel(d) { const x = new Date(`${d}T00:00:00`); return x.toLocaleDateString([], { weekday: "short" }); }
function rangeLabel(r) {
  const f = (d) => new Date(`${d}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" });
  return `${f(r.from)} – ${f(r.to)}`;
}

async function renderRecap() {
  const host = $("recapHost");
  if (!host) return;
  host.innerHTML = `<p class="muted">Loading your week…</p>`;
  let r;
  try { r = await rpc("get_weekly_recap"); S.recap = r; }
  catch (err) { host.innerHTML = `<p class="muted">${sqlMissing(err) ? "The weekly recap is not switched on yet. Run the phase-3 SQL in Supabase." : esc(errText(err))}</p>`; return; }

  const maxDay = Math.max(1, ...r.per_day.map((d) => d.streams));
  host.innerHTML = `
    <div class="p3-recap">
      <p class="eyebrow">${esc(rangeLabel(r))}</p>
      <div class="p3-stats">
        <div><b>${fmt(r.streams)}</b><span>TXT streams</span></div>
        <div><b>${fmt(r.songs)}</b><span>different songs</span></div>
        <div><b>${fmt(r.tasks_done)}</b><span>tasks done</span></div>
        <div><b>${fmt(r.rolls)}</b><span>dice rolls</span></div>
        <div><b>${fmt(r.mp_from_tasks)}</b><span>MP from tasks</span></div>
      </div>
      <div class="p3-days" aria-label="Streams per day">${r.per_day.map((d) => `<div><i style="height:${Math.max(4, Math.round((d.streams / maxDay) * 100))}%"></i><span>${esc(dayLabel(d.day))}</span><em>${fmt(d.streams)}</em></div>`).join("")}</div>
      ${r.top_songs.length ? `<p class="eyebrow">YOUR TOP SONGS</p><ol class="p3-top">${r.top_songs.map((s) => `<li><span>${esc(s.title)}</span><b>${fmt(s.plays)}×</b></li>`).join("")}</ol>` : `<p class="muted">No streams yet this week. Play some TXT and press “Check my listening”.</p>`}
      ${r.best_day ? `<p class="muted">Your best day was <strong>${esc(dayLabel(r.best_day.day))}</strong> with ${fmt(r.best_day.streams)} streams.</p>` : ""}
      <div class="p3-actions"><button type="button" class="primary-button" id="p3RecapDl">Download my recap <span>↓</span></button><span id="p3RecapMsg" class="form-message" role="status"></span></div>
    </div>`;
}

function xml(value, max = 28) { const t = String(value ?? ""); return esc(t.length > max ? `${t.slice(0, max - 1)}…` : t); }
function recapSvg(r) {
  const p = ctx.getPlayer();
  const avatar = ctx.svgToDataUri(ctx.avatarSvgText(p.avatar, p.uid, "transparent"));
  const maxDay = Math.max(1, ...r.per_day.map((d) => d.streams));
  const bars = r.per_day.map((d, i) => {
    const h = Math.max(10, Math.round((d.streams / maxDay) * 170));
    const x = 110 + i * 128;
    return `<rect x="${x}" y="${1000 - h}" width="84" height="${h}" rx="14" fill="url(#bar)"/>
      <text x="${x + 42}" y="1034" font-size="26" font-weight="700" fill="#fff" fill-opacity=".8" text-anchor="middle">${xml(dayLabel(d.day), 5)}</text>
      <text x="${x + 42}" y="${990 - h}" font-size="26" font-weight="800" fill="#D7FF3A" text-anchor="middle">${fmt(d.streams)}</text>`;
  }).join("");
  const tops = r.top_songs.map((s, i) => `<text x="110" y="${1130 + i * 52}" font-size="34" font-weight="700" fill="#fff">${i + 1}. ${xml(s.title, 26)}</text>
      <text x="970" y="${1130 + i * 52}" font-size="34" font-weight="800" fill="#D7FF3A" text-anchor="end">${fmt(s.plays)}×</text>`).join("");
  const stat = (x, n, label) => `<text x="${x}" y="560" font-size="76" font-weight="900" fill="#fff" text-anchor="middle">${fmt(n)}</text>
      <text x="${x}" y="602" font-size="26" font-weight="700" fill="#fff" fill-opacity=".7" text-anchor="middle">${label}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="Nunito, Arial, Helvetica, sans-serif">
    <defs>
      <linearGradient id="bgc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#17152F"/><stop offset=".55" stop-color="#2B2360"/><stop offset="1" stop-color="#14224A"/></linearGradient>
      <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D7FF3A"/><stop offset="1" stop-color="#7A6BFF"/></linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#bgc)"/>
    <text x="540" y="104" font-size="30" font-weight="800" fill="#D7FF3A" text-anchor="middle" letter-spacing="6">BEAT THE ANGEL BITE · MY WEEK</text>
    <text x="540" y="150" font-size="28" font-weight="700" fill="#fff" fill-opacity=".75" text-anchor="middle">${xml(rangeLabel(r), 40)}</text>
    <image href="${avatar}" x="390" y="180" width="300" height="300"/>
    <text x="540" y="512" font-size="40" font-weight="900" fill="#fff" text-anchor="middle">${xml(p.name, 22)}</text>
    ${stat(190, r.streams, "TXT streams")}${stat(540, r.songs, "different songs")}${stat(890, r.tasks_done, "tasks done")}
    <rect x="80" y="660" width="920" height="2" fill="#fff" fill-opacity=".15"/>
    <text x="110" y="740" font-size="30" font-weight="800" fill="#D7FF3A" letter-spacing="4">STREAMS PER DAY</text>
    ${bars}
    <text x="110" y="1090" font-size="30" font-weight="800" fill="#D7FF3A" letter-spacing="4">TOP SONGS</text>
    ${tops}
    <text x="540" y="1310" font-size="24" font-weight="700" fill="#fff" fill-opacity=".5" text-anchor="middle">Beat The Angel Bite - by Moastation · fan-made</text>
  </svg>`;
}
async function svgToPng(svg, w, h) {
  const img = new Image();
  img.decoding = "async";
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error("Could not draw the picture.")); img.src = ctx.svgToDataUri(svg); });
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the picture."))), "image/png"));
}
async function downloadRecap() {
  const msg = $("p3RecapMsg");
  try {
    if (!S.recap) return;
    msg.textContent = "Making your picture…";
    const blob = await svgToPng(recapSvg(S.recap), 1080, 1350);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(ctx.getPlayer()?.name || "me").replace(/[^A-Za-z0-9_-]+/g, "_")}-perfect-storm-week.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    msg.textContent = "Saved!";
  } catch (err) { if (msg) msg.textContent = errText(err, "Could not make the picture."); }
}

// ============================================================================
// SPECIAL TILES: quiz + Song of the Day
// ============================================================================
const isSpecial = (pos) => SPECIAL_TILES.quiz.includes(pos) || SPECIAL_TILES.song.includes(pos);

function updateTileChip(ev) {
  let chip = $("p3TileChip");
  if (ev !== undefined) S.chipEvent = ev;
  const e = S.chipEvent;
  const show = S.signedIn && e && e.kind && !e.done && !e.unavailable && !$("p3Modal");
  if (!show) { chip?.classList.add("hidden"); return; }
  if (!chip) {
    chip = document.createElement("button");
    chip.id = "p3TileChip";
    chip.type = "button";
    chip.className = "p3-chip";
    chip.addEventListener("click", () => showTileModal(S.chipEvent));
    document.body.appendChild(chip);
  }
  chip.textContent = e.kind === "quiz" ? "❓ Quiz tile: answer for MP" : "🎵 Song of the Day: claim MP";
  chip.classList.remove("hidden");
}

async function checkTile({ auto = true } = {}) {
  if (!S.signedIn) return;
  const pos = ctx.getPlayer()?.position;
  if (!isSpecial(pos)) { updateTileChip(null); return; }
  let ev;
  try { ev = await rpc("get_tile_event"); } catch (_) { updateTileChip(null); return; }   // SQL not run yet
  updateTileChip(ev);
  const key = `${pos}:${ctx.kstDateKey()}`;
  if (auto && ev.kind && !ev.done && !ev.unavailable && S.tileKey !== key) {
    S.tileKey = key;
    showTileModal(ev);
  }
}

function showTileModal(ev) {
  if (!ev?.kind) return;
  if (ev.kind === "quiz") return showQuiz(ev);
  return showSong(ev);
}

function showQuiz(ev) {
  const card = openModal(`<div class="p3-tile">
    <p class="eyebrow">QUIZ TILE · TILE ${esc(ev.tile)}</p>
    <h2>${esc(ev.question)}</h2>
    <div class="p3-answers">${ev.options.map((o, i) => `<button type="button" class="p3-answer" data-i="${i}">${esc(o)}</button>`).join("")}</div>
    <p class="muted">One try per tile. Right answer +${esc(ev.mp_correct)} MP, wrong +${esc(ev.mp_wrong)} MP.</p></div>`);
  card.addEventListener("click", async (e) => {
    const b = e.target.closest(".p3-answer");
    if (!b || b.disabled) return;
    card.querySelectorAll(".p3-answer").forEach((x) => (x.disabled = true));
    try {
      const r = await rpc("answer_quiz", { p_tile: ev.tile, p_choice: Number(b.dataset.i) });
      card.querySelectorAll(".p3-answer").forEach((x) => { if (Number(x.dataset.i) === r.answer) x.classList.add("right"); });
      if (!r.correct) b.classList.add("wrong");
      card.querySelector(".muted").innerHTML = r.correct
        ? `🎉 Correct! <strong>+${esc(r.mp)} MP</strong>`
        : `Not this time. The answer was <strong>${esc(r.answer_text)}</strong>. <strong>+${esc(r.mp)} MP</strong> for trying.`;
      if (r.correct) ctx.confetti?.();
      S.chipEvent = { ...ev, done: true };
      await ctx.refreshPlayer();
    } catch (err) {
      card.querySelector(".muted").textContent = errText(err);
    }
  });
}

function showSong(ev) {
  const body = (e) => `
    <p class="eyebrow">SONG OF THE DAY · TILE ${esc(e.tile)}</p>
    <h2>${esc(e.song)}</h2>
    <p class="muted">Stream it <strong>${esc(e.target)} times today</strong> (Korean time) and claim <strong>+${esc(e.mp)} MP</strong>.</p>
    <div class="p3-bar big"><i style="width:${Math.min(100, Math.round((e.played / e.target) * 100))}%"></i></div>
    <p class="p3-progress">${esc(Math.min(e.played, e.target))}/${esc(e.target)} plays today</p>
    <div class="p3-actions"><button type="button" class="primary-button" id="p3Claim">Claim ✨</button>
    <button type="button" class="ghost-button" id="p3Recheck">Check my listening</button></div>
    <p class="form-message" id="p3SongMsg" role="status"></p>`;
  const card = openModal(`<div class="p3-tile">${body(ev)}</div>`);
  card.querySelector("#p3Claim")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const r = await rpc("claim_song_tile");
      if (r.ok) {
        card.innerHTML = `<div class="p3-tile"><p class="eyebrow">CLAIMED</p><h2>+${esc(r.mp)} MP ✨</h2><p class="muted">Thanks for streaming ${esc(r.song)}!</p></div>`;
        ctx.confetti?.();
        S.chipEvent = { ...ev, done: true };
        await ctx.refreshPlayer();
      } else {
        card.querySelector("#p3SongMsg").textContent = `Not yet: ${r.played}/${r.target} plays counted. Press “Check my listening”, then try again.`;
        e.target.disabled = false;
      }
    } catch (err) { card.querySelector("#p3SongMsg").textContent = errText(err); e.target.disabled = false; }
  });
  card.querySelector("#p3Recheck")?.addEventListener("click", () => {
    closeModal();
    ctx.showView("tasksView");
  });
}

// ============================================================================
// hooks called by extras.js
// ============================================================================
export function init(context) {
  ctx = context;
  window.txtStudioDecorate = decorate;
  document.addEventListener("click", (e) => {
    const cs = e.target.closest(".p3-claim-set"); if (cs) return claimSet(cs.dataset.set, cs);
    const ob = e.target.closest(".p3-open-box"); if (ob) return openBox(ob.dataset.box, ob);
    const em = e.target.closest(".p3-emote-btn"); if (em) return chooseEmote(em.dataset.emote);
    const fr = e.target.closest(".p3-frame"); if (fr) { S.frame = fr.dataset.frame; ensureStudioTools(); refreshStudio(); return; }
    const ch = e.target.closest(".p3-cheer"); if (ch && !ch.disabled) return askCheer(ch.dataset.uid);
    if (e.target.closest("#p3RecapDl")) return downloadRecap();
  });
}

export async function onSignedIn() {
  S.signedIn = true;
  try { S.catalog = await rpc("get_emote_catalog"); } catch (_) { S.catalog = []; }
  try {
    const uid = ctx.getPlayer()?.uid;
    if (uid) { const m = await rpc("get_emotes", { p_ids: [uid] }); const g = m?.[uid]; S.myEmote = S.catalog.find((e) => e.glyph === g)?.id || null; }
  } catch (_) { /* ignore */ }
  pollCheers();
  clearInterval(S.cheerTimer);
  S.cheerTimer = setInterval(pollCheers, 75000);
  ensureStudioTools();
}

export function onSignedOut() {
  S.signedIn = false; S.myEmote = null; S.lastPos = null; S.tileKey = ""; S.chipEvent = null; S.sentTo = new Set(); S.recap = null;
  clearInterval(S.cheerTimer); clearTimeout(S.tileTimer); clearTimeout(S.shopTimer);
  $("p3Modal")?.remove(); $("p3TileChip")?.classList.add("hidden");
  $("p3Shop")?.replaceChildren();
}

export function onViewShown(viewId) {
  if (!S.signedIn) return;
  if (viewId === "shopView") renderShopExtras();
  if (viewId === "friendsView") { renderEmotePickers(); decorateFriends(); }
  if (viewId === "studioView") { ensureStudioTools(); refreshStudio(); }
  if (viewId === "recapView") renderRecap();
}

export function onPlayerUpdate(p) {
  if (!S.signedIn || !p) return;
  if (!$("shopView")?.classList.contains("hidden")) scheduleShop();
  if (p.position !== S.lastPos) {
    const first = S.lastPos === null;
    S.lastPos = p.position;
    clearTimeout(S.tileTimer);
    S.tileTimer = setTimeout(() => checkTile({ auto: true }), first ? 900 : 1900);   // let the move animation finish
  }
}
