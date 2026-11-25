// team.js: Team Battle page (Angel vs Storm). Needs supabase-update-v31 + v32 (get_team_battle, team_join,
// team_post_banner, team_report, get_team_cards, get_team_hof).
import { supabase } from "./supabase-config.js";
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString();
const NAME = { angel: "Team Angel", storm: "Team Storm" };
const ICON = { round: "🏁", lucky: "🍀", power: "⚡", lead: "🔥", goal: "🎯", final: "🏆" };
const CHEER = ["Let's go Angels! 🪽", "Keep streaming, we've got this! 💪", "Every stream counts! 💖", "Proud of this team! ✨"];
const TAUNT = ["Nice try, see you on top 😏", "Storm clouds are coming ⛈️", "Angels, hold my halo 😇", "Friendly game, serious streams 🎧"];
const RANKS = [[1500, "💎 Diamond Streamer"], [500, "🥇 Gold Streamer"], [100, "🥈 Silver Streamer"], [0, "🥉 Bronze Streamer"]];
const TIER = { tier_bronze: "🥉 Bronze", tier_silver: "🥈 Silver", tier_gold: "🥇 Gold" };
let ctx = {};
let teamPages = { angel: 0, storm: 0 };
const TEAM_PAGE_SIZE = 10;

export async function showTeam({ avatarUri, uid }) {
  ctx = { avatarUri, uid };
  teamPages = { angel: 0, storm: 0 };
  const host = $("teamBody");
  if (!host) return;
  host.innerHTML = `<p class="muted">Loading the battle…</p>`;
  try {
    await supabase.rpc("team_join");
    const { data: d, error } = await supabase.rpc("get_team_battle");
    if (error) throw error;
    if (!d?.season) { host.innerHTML = `<p class="muted">No season yet. Check back soon!</p>`; return; }
    host.innerHTML = render(d);
    renderTeamLists(host, d);
    wire(host, d);
    supabase.rpc("get_team_cards").then(({ data }) => data && cards(host, data));
    supabase.rpc("get_team_hof").then(({ data }) => data?.length && hof(host, data));
  } catch (e) {
    host.innerHTML = `<p class="muted">Team Battle isn't set up yet (run supabase-update-v31 and v32).</p>`;
  }
}

function render(d) {
  const { avatarUri, uid } = ctx;
  const A = d.teams.angel || {}, S = d.teams.storm || {}, s = d.season, me = d.me;
  const tot = (A.total || 0) + (S.total || 0);
  const pa = tot ? Math.round(100 * (A.total || 0) / tot) : 50;
  const head = (k, t) => `<div class="team-card team-${k}"><h3>${NAME[k]}</h3>
    <b>${fmt(t.total)}</b> pts · ${fmt(t.streams)} streams<br>
    <span class="muted">${t.avg ?? 0} per active member · ${fmt(t.active)}/${fmt(t.members)} active · +${fmt(t.today)} today${t.mult > 1 ? ` · catch-up ×${t.mult}` : ""}</span></div>`;
  const col = (k) => `<div class="team-col"><h3>${NAME[k]}</h3>
    <div class="team-member-list" id="teamMembers-${k}"></div></div>`;

  const rank = RANKS.find(r => (d.lifetime || 0) >= r[0])[1];
  const mine = me ? `<div class="panel team-me ${me.team}">You're on <b>${NAME[me.team]}</b> — ${fmt(me.streams)} streams, ${me.share}% of your team (rank ${me.rank}).
    ${me.eligible ? "✅ Team reward unlocked." : `${Math.max(0, s.min_streams - me.streams)} more streams to unlock team rewards.`}
    <br><span class="muted">${rank} · ${fmt(d.lifetime)} lifetime team streams${d.seasons_played >= 3 ? " · 🎖️ Veteran" : ""} · 🃏 ${d.cards} cards</span></div>` : "";

  const power = d.power ? `<div class="panel team-power">⚡ POWER HOUR! Streams count double until ${new Date(d.power.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>` : "";

  const goals = (d.goals || []).map(g => {
    const have = g.kind === "boss" ? (A.streams || 0) + (S.streams || 0) : Math.max(A.streams || 0, S.streams || 0);
    const pct = Math.min(100, Math.round(100 * have / g.target));
    return `<div class="team-goal"><span>${g.hit.length ? "✅" : "🎯"} ${esc(g.label)} (+${g.mp} MP)</span>
      <div class="team-gbar"><i style="width:${pct}%"></i></div><span class="muted">${fmt(Math.min(have, g.target))}/${fmt(g.target)}</span></div>`;
  }).join("");

  const mvp = (d.mvp || []).map(m => `<span class="team-pill ${m.team}">⭐ ${esc(m.name)} (${NAME[m.team]})</span>`).join(" ");
  const R = d.roles || {};
  const roles = [["🏃 Marathoner", R.marathoner], ["🧭 Explorer", R.explorer], ["🌅 Early Bird", R.early], ["🌙 Night Owl", R.night]]
    .filter(x => x[1]).map(x => `<span class="team-pill">${x[0]}: ${esc(x[1].name)} (${fmt(x[1].v)})</span>`).join(" ");

  const feed = (d.feed || []).map(e => `<li class="team-ev ${e.team || ""}">${ICON[e.kind] || "•"} ${esc(e.msg)}</li>`).join("");
  const rounds = (d.rounds || []).slice(0, 14).map(r => `<span class="team-pill ${r.winner}" title="Angel ${r.a} · Storm ${r.s}">${esc(String(r.day).slice(5))} ${r.winner === "tie" ? "🤝" : r.winner === "angel" ? "🪽" : "⚡"}</span>`).join(" ");
  const golden = (d.golden || []).slice(0, 5).map(g => `<li>${esc(String(g.day).slice(5))}: <b>${esc(g.title)}</b></li>`).join("");

  const banners = (d.banners || []).map(b => `<li class="team-ev ${b.team}">${b.kind === "cheer" ? "📣" : "😜"} <b>${esc(b.name)}</b>: ${esc((b.kind === "cheer" ? CHEER : TAUNT)[b.preset - 1] || "")}</li>`).join("");
  const opts = (arr) => arr.map((t, i) => `<option value="${i + 1}">${esc(t)}</option>`).join("");
  const post = me && !s.finalized ? `<div class="team-post"><select id="tbKind"><option value="cheer">Cheer</option><option value="taunt">Light taunt</option></select>
    <select id="tbMsg">${opts(CHEER)}</select><button id="tbSend" class="btn">Post (24h)</button><span id="tbNote" class="muted"></span></div>` : "";

  const champs = (d.champions || []).map((c, i) => `<span>${["🥇", "🥈", "🥉"][i]} ${esc(c.name)} (${fmt(c.streams)})</span>`).join(" ");
  const troph = (d.trophies || []).filter(t => t.kind !== "participant").map(t =>
    `<span class="team-pill">${esc(t.season)}: ${esc(t.title || TIER[t.kind] || t.kind.replace(/_/g, " "))}${t.mp ? ` (+${t.mp})` : ""}</span>`).join(" ");

  return `<p class="muted">${esc(s.name)} · ${esc(s.starts_on)} → ${esc(s.ends_on)} · KST${s.finalized ? " · finished" : ""}</p>
    ${power}
    <div class="team-bar"><div class="team-fill-angel" style="width:${pa}%"></div><div class="team-fill-storm" style="width:${100 - pa}%"></div></div>
    <div class="team-heads">${head("angel", A)}${head("storm", S)}</div>${mine}
    ${feed ? `<div class="panel"><h3>Live feed</h3><ul class="team-list">${feed}</ul></div>` : ""}
    <div class="panel"><h3>Goals</h3>${goals}</div>
    <div class="team-cols">${col("angel")}${col("storm")}</div>
    ${mvp ? `<div class="panel"><h3>MVP of yesterday</h3>${mvp}</div>` : ""}
    ${roles ? `<div class="panel"><h3>Roles</h3>${roles}</div>` : ""}
    ${rounds ? `<div class="panel"><h3>Daily rounds (+10 MP for the winners)</h3>${rounds}</div>` : ""}
    ${golden ? `<div class="panel"><h3>Golden songs (counted ×3, revealed after the day)</h3><ul class="team-list">${golden}</ul></div>` : ""}
    <div class="panel"><h3>Cheers &amp; taunts</h3>${post}<ul class="team-list">${banners || `<li class="muted">Nothing posted in the last 24 hours.</li>`}</ul></div>
    ${champs ? `<div class="panel"><h3>Season champions</h3>${champs}</div>` : ""}
    ${troph ? `<div class="panel"><h3>Your trophy shelf</h3>${troph}</div>` : ""}
    <div id="teamCards"></div><div id="teamHof"></div>
    <p class="muted">Fair play: scores come from the listening data you link. Winner = higher average per active member; one player above 25% of a team counts half above that (with 4+ active). Team rewards need ${s.min_streams}+ streams. Teams are locked for the season. See something odd? Tap ⚑ next to a name.</p>`;
}

function renderTeamLists(host, d) {
  const { avatarUri, uid } = ctx;
  for (const team of ["angel", "storm"]) {
    const el = host.querySelector(`#teamMembers-${team}`);
    if (!el) continue;
    const players = (d.top || []).filter(p => p.team === team);
    const pages = Math.max(1, Math.ceil(players.length / TEAM_PAGE_SIZE));
    const page = Math.min(teamPages[team] || 0, pages - 1);
    teamPages[team] = page;
    const visible = players.slice(page * TEAM_PAGE_SIZE, (page + 1) * TEAM_PAGE_SIZE);
    const rows = visible.map(p => `
      <div class="leader-row${p.uid === uid ? " me" : ""}">
        <span class="leader-rank">${p.rank}</span>
        <img class="chibi-image leader-chibi" src="${esc(avatarUri(p.avatar, p.uid))}" alt="">
        <span class="leader-name">${esc(p.name)}${p.uid === uid ? " (you)" : ""}</span>
        <span>${fmt(p.streams)} · ${p.share}%</span>
        ${p.uid === uid ? "" : `<button class="team-flag" data-report="${esc(p.uid)}" title="Report something odd" aria-label="Report ${esc(p.name)}">⚑</button>`}
      </div>`).join("");
    const start = players.length ? page * TEAM_PAGE_SIZE + 1 : 0;
    const end = Math.min((page + 1) * TEAM_PAGE_SIZE, players.length);
    el.innerHTML = `${rows || `<p class="muted">No players yet.</p>`}
      <div class="team-pagination">
        <span class="muted">${start}–${end} of ${players.length} players</span>
        <div class="team-page-controls">
          <button type="button" class="team-page-btn" data-team-page="${team}" data-page="${page - 1}" ${page === 0 ? "disabled" : ""}>← Prev</button>
          <span class="team-page-number">${page + 1} / ${pages}</span>
          <button type="button" class="team-page-btn" data-team-page="${team}" data-page="${page + 1}" ${page >= pages - 1 ? "disabled" : ""}>Next →</button>
        </div>
      </div>`;
  }
}

function wire(host, d) {
  const kind = $("tbKind"), msg = $("tbMsg");
  if (kind) kind.onchange = () => { msg.innerHTML = (kind.value === "cheer" ? CHEER : TAUNT).map((t, i) => `<option value="${i + 1}">${esc(t)}</option>`).join(""); };
  const send = $("tbSend");
  if (send) send.onclick = async () => {
    send.disabled = true;
    const { error } = await supabase.rpc("team_post_banner", { p_kind: kind.value, p_preset: Number(msg.value) });
    if (error) { $("tbNote").textContent = error.message; send.disabled = false; return; }
    showTeam(ctx);
  };
  host.querySelectorAll("[data-team-page]").forEach((b) => b.onclick = () => {
    const team = b.dataset.teamPage;
    teamPages[team] = Number(b.dataset.page);
    renderTeamLists(host, d);
    wire(host, d);
  });
  host.querySelectorAll("[data-report]").forEach((b) => b.onclick = async () => {
    const note = window.prompt("What looks odd? (optional, max 140 characters)", "");
    if (note === null) return;
    const { error } = await supabase.rpc("team_report", { p_target: b.dataset.report, p_note: note });
    b.textContent = error ? "!" : "✓";
    b.title = error ? error.message : "Thanks, the admin will look at it.";
    if (error) window.alert(error.message);
  });
}

function cards(host, c) {
  const own = new Set(c.owned || []), el = host.querySelector("#teamCards");
  if (!el) return;
  el.innerHTML = `<div class="panel"><h3>Storm Cards (${own.size}/${c.catalog.length})</h3><div class="team-cardgrid">${c.catalog.map(k => own.has(k.id)
    ? `<div class="team-tcard ${k.rarity}" title="${esc(k.blurb)}"><span>${k.emoji}</span><b>${esc(k.name)}</b><small>${k.rarity}</small></div>`
    : `<div class="team-tcard locked"><span>❔</span><b>???</b><small>${k.rarity}</small></div>`).join("")}</div>
    <p class="muted">Everyone who plays a season gets a card from the crate. The top players get better odds.</p></div>`;
}

function hof(host, list) {
  const el = host.querySelector("#teamHof");
  if (!el) return;
  el.innerHTML = `<div class="panel"><h3>🏛️ Hall of Fame</h3>${list.map(s => `<p><b>${esc(s.name)}</b> — ${s.winner ? NAME[s.winner] : "?"} won<br>
    ${(s.champions || []).map(c => `${["", "🥇", "🥈", "🥉"][c.rank] || ""} ${esc(c.name)}`).join(" · ")}
    ${(s.mvps || []).length ? `<br><span class="muted">${s.mvps.map(m => `${esc(m.title || "MVP")}: ${esc(m.name)}`).join(" · ")}</span>` : ""}</p>`).join("")}</div>`;
}
