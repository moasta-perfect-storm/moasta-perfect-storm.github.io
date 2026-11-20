// ============================================================================
// Website intro: your logos slide in from the sides and form the letters "TXT",
// then settle into the wordmark and fade into the site.
// The list of logos lives in game-config.js (INTRO_LOGOS), so it never changes with a comeback.
// ============================================================================

const SEEN_KEY = "psIntroSeen";
const rand = (a, b) => a + Math.random() * (b - a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function markSeen() { try { sessionStorage.setItem(SEEN_KEY, "1"); } catch (_) { /* private mode */ } }

// Points that fill the letters. Returns { points: [{x,y}], gap } in CSS pixels.
function letterPoints(text, W, H, wanted) {
  const cw = Math.min(W * 0.86, 980), ch = Math.min(H * 0.5, cw * 0.46);
  const cv = document.createElement("canvas");
  const scale = 1;
  cv.width = Math.ceil(cw * scale); cv.height = Math.ceil(ch * scale);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  let size = ch * 0.95;
  ctx.font = `900 ${size}px Nunito, "Arial Black", Arial, sans-serif`;
  const tw = ctx.measureText(text).width;
  if (tw > cw * 0.96) { size *= (cw * 0.96) / tw; ctx.font = `900 ${size}px Nunito, "Arial Black", Arial, sans-serif`; }
  ctx.fillText(text, cw / 2, ch / 2 + size * 0.04);
  const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < cv.width && y < cv.height && data[(y * cv.width + x) * 4 + 3] > 140;

  // find the grid gap that gives about `wanted` icons
  let gap = Math.max(14, Math.round(size / 9)), pts = [];
  for (let tries = 0; tries < 40; tries++) {
    pts = [];
    for (let y = gap / 2; y < cv.height; y += gap) {
      for (let x = gap / 2; x < cv.width; x += gap) if (solid(Math.round(x), Math.round(y))) pts.push({ x, y });
    }
    if (pts.length >= wanted) break;
    gap = Math.max(10, gap * 0.92);
    if (gap <= 10) break;
  }
  const offX = (W - cw) / 2, offY = (H - ch) / 2;
  return { gap, points: pts.map((p) => ({ x: p.x + offX, y: p.y + offY })) };
}

export async function playIntro({ logos = [], fallback = "", wordmark = "", text = "TXT" } = {}) {
  const overlay = document.getElementById("introOverlay");
  if (!overlay) return;
  if (document.documentElement.classList.contains("intro-seen")) { overlay.remove(); return; }

  const stage = document.getElementById("introStage");
  const skipBtn = document.getElementById("introSkip");
  const wmEl = document.getElementById("introWordmark");
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  let finished = false;
  const anims = [];
  const finish = async (quick = false) => {
    if (finished) return;
    finished = true;
    markSeen();
    anims.forEach((a) => { try { a.cancel(); } catch (_) { /* ignore */ } });
    overlay.classList.add("leaving");
    await wait(quick ? 250 : 650);
    overlay.remove();
  };
  skipBtn?.addEventListener("click", () => finish(true));
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish(true); }, { once: true });

  try {
    if (document.fonts?.ready) await Promise.race([document.fonts.ready, wait(1200)]);

    const W = window.innerWidth, H = window.innerHeight;
    const sources = (logos.length ? logos : [fallback]).filter(Boolean);

    // load the logos first, so nothing pops in half-drawn
    const loaded = (await Promise.all(sources.map((src) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(src); im.onerror = () => res(null); im.src = src;
    })))).filter(Boolean);

    if (reduce || !loaded.length) {
      // no motion: just show the wordmark / letters for a moment
      stage.innerHTML = `<div class="intro-text">${text}</div>`;
      if (wordmark) { wmEl.src = wordmark; wmEl.hidden = false; stage.innerHTML = ""; }
      await wait(900);
      return finish();
    }

    const wanted = Math.max(36, Math.min(110, Math.round((W * H) / 9000)));
    const { gap, points } = letterPoints(text, W, H, wanted);
    const size = Math.max(18, Math.min(64, Math.round(gap * 0.92)));
    const sorted = points.sort((a, b) => a.x - b.x);        // sweep left to right, so the letters build in order

    const els = sorted.map((pt, i) => {
      const img = document.createElement("img");
      img.src = loaded[i % loaded.length];
      img.alt = ""; img.draggable = false;
      img.className = "intro-logo";
      img.style.width = img.style.height = `${size}px`;
      stage.appendChild(img);
      const fromLeft = i % 2 === 0;
      const sx = fromLeft ? -size - rand(60, 360) : W + size + rand(60, 360);
      const sy = pt.y + rand(-H * 0.18, H * 0.18);
      const rot0 = rand(-260, 260), rot1 = rand(-8, 8);
      const tx = pt.x - size / 2, ty = pt.y - size / 2;
      const delay = (i / sorted.length) * 1500 + rand(0, 260);
      const a = img.animate([
        { transform: `translate(${sx}px, ${sy}px) rotate(${rot0}deg) scale(.7)`, opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { transform: `translate(${tx}px, ${ty}px) rotate(${rot1}deg) scale(1)`, opacity: 1 },
      ], { duration: rand(1300, 1900), delay, easing: "cubic-bezier(.16,.84,.24,1)", fill: "both" });
      anims.push(a);
      return { img, a, tx, ty, rot1 };
    });

    await Promise.all(els.map((e) => e.a.finished.catch(() => {})));
    if (finished) return;

    // settle: gentle pulse together
    stage.classList.add("formed");
    await wait(900);
    if (finished) return;

    if (wordmark) {
      wmEl.src = wordmark; wmEl.hidden = false;
      wmEl.classList.add("show");
      stage.classList.add("fade-out");
      await wait(1200);
    } else {
      await wait(300);
    }
    await finish();
  } catch (err) {
    console.warn("Intro skipped:", err);
    await finish(true);
  }
}
