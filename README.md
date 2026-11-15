# TXT Perfect Storm — Daily Quest

A multiplayer, TXT-inspired Snakes & Ladders daily quest game: plain HTML/CSS/JS on the front, **Supabase** (Auth, Postgres, Realtime, RPC) on the back.
Fan-made, unofficial. Not affiliated with BIGHIT MUSIC or TXT.

## Setup (3 steps)

1. **Tables** – you already ran the table/RLS SQL (`profiles`, `daily_rolls`, `gift_claims`).
2. **Game rules** – open Supabase → **SQL Editor**, paste all of **`supabase-game-functions.sql`** and run it once.
   It is safe to re-run. It also adds MP, bonus rolls, the listening history and the username rules.
3. **Username login (no email)** – Supabase → Authentication → Providers → Email → switch **OFF “Confirm email”**.
   Then run **`supabase-username-login.sql`** once to move existing accounts over (read the notes inside first).
4. **Host the folder** on any static host (GitHub Pages, Netlify, Vercel…) or test locally:
   ```bash
   python3 -m http.server 8000   # open http://localhost:8000
   ```
   Then in Supabase → Authentication → URL Configuration, add your site URL.
   (ES modules don't work when you double-click `index.html`; use a server.)

`supabase-config.js` already holds your project URL and publishable key.

## The three boards

The game now has **three boards**. Your tile number runs 1–300: board 1 = 1–100, board 2 = 101–200, board 3 = 201–300. Landing on tile 100 / 200 / 300 finishes a board; you wait on the START pad of the next board and your next roll starts there.
The board tiles below are **local** (1–100 on each board; the board adds 0 / 100 / 200).

| | Board 1 · Storm Is Coming | Board 2 · Ride the Storm | Board 3 · Eye of the Storm |
|---|---|---|---|
| Checkpoints | 25, 50, 75 | 25, 50, 75 (= 125, 150, 175) | **none** |
| Storm portals (down) | 30→11, 40→21, 68→53, 95→86, 98→83 | 20→1, 29→12, 40→21, 49→32, 60→41, 68→53, 86→75, 89→72 | 16→5, 19→2, 36→25, 39→22, 54→47, 57→44, 60→41, 74→67, 77→64, 80→61, 95→86, 99→82 |
| Ladders (up) | 8→13, 18→23, 37→44, 46→55, 65→76, 73→88, 82→99 | 8→13, 30→31, 39→42, 63→78, 69→72, 88→93 | 17→24, 20→21, 34→47, 76→85 |
| Gifts (once per player) | 5, 12, 22, 33, 42, 52, 62, 70, 85, 94 | 3, 19, 23, 28, 38, 46, 54, 67, 77, 82 | 11, 29, 33, 37, 52, 58, 62, 68, 81, 94 |
| Gifts lean | forward | a bit backward | mostly backward |

On board 3 there is **no safe floor**: a storm can send you all the way back to tile 201.
Expected pace (simulated): about **9 days** for board 1, **21** for boards 1–2 and **35** for all three (3 rolls a day).

## Chibi items you can unlock

Drops are tied to checkpoints and board finishes, so nobody can miss one. All are original, storm-themed drawings (nothing copied from TXT's real outfits, logos or lightstick). Wear them in the **Wardrobe** tab.

| Item | Slot | Rarity | How to get it |
|---|---|---|---|
| Raindrop clip | accessory | common | checkpoint 25 |
| Storm cloud | accessory | common | checkpoint 50 |
| Raincoat | outfit | common | checkpoint 75 |
| Lightning pin | accessory | common | checkpoint 125 (board 2) |
| Storm hoodie | outfit | common | checkpoint 150 (board 2) |
| Neon halo | accessory | common | checkpoint 175 (board 2) |
| Storm cloak | outfit | **rare** | finish board 1 |
| Lightning aura | aura | **epic** | finish board 2 |
| Storm wings | wings | **legendary** | finish board 3 |

Finishing a board plays the **Eye of the Storm finale** (rain stops, confetti, reward pop-up) and gives a badge next to the player's name on the leaderboard: ⚡ Storm Rider (board 1), 🌩️ Storm Breaker (board 2), 👁️ Eye of the Storm (all three).
The server refuses to equip an item you haven't unlocked (`equip_chibi` / `save_profile`).
To add or change items: `CHIBI_ITEMS` in `game-config.js`, the `chibi_items` insert in the SQL (same ids and names), and the drawing in `avatarDataUri()` in `app.js`.

**One row only**: every ladder goes exactly one row up and every storm one row down, in the same column (the pictures are one tile tall). If you move one, keep it vertical: the tile one row up from tile `n` is `n + 2*(10 - column) + 1` on odd rows and `n + 2*column + 1`-style on even rows, so easiest is to copy the numbers from the table. The client (`game-config.js`) and the server (`c_ladders`, `c_storms`, `c_gifts` in the SQL) must always say the same thing, otherwise a player stands on a ladder that does nothing.

**No loops, by design**
- A jump never lands on another jump or gift tile, so jumps can't chain.
- From a storm exit or ladder top, one dice roll can never reach a storm entrance (and from a storm exit never a ladder), so there is no ping-pong.
- The server applies at most ONE event per roll.
- Passing over a storm/ladder tile does nothing – only the tile you *land* on counts.

## Rules (enforced on the server in `roll_daily()`)

- **3 rolls per KST day**, each with its own dice and **2 tasks**: one task from `song_tasks` and one from `other_tasks` (see *Task tables* below). A song task only counts songs played after the roll that gave it. The dice (movement) is rolled on the server.
- You stop on the last tile of the board you are on (100 / 200 / 300); the next roll starts the next board.
- Storm portals can't push you below your highest unlocked checkpoint (boards 1 and 2 only; board 3 has none).
- Gifts: random forward / backward / dud / **roll one more time**, once per player per gift tile, and they never trigger another event.
  A bonus roll only moves you; today's tasklist stays the same.
- **MP (moasta points)**: every completed task gives 50 MP (a task row can set its own `mp`). **Checkpoints give +10 MP** each (25, 50, 75, 125, 150, 175) and **finishing a board gives +25 / +50 / +75 MP** (tile 100 / 200 / 300). Each bonus is paid once, also to players who already passed them when you install this update. The leaderboard ranks by MP *earned*; MP spent in the Shop does not lower your rank.
- Leaderboard: MP, then highest checkpoint, then tile (up to 300).

## Listening tasks (Last.fm) – one-time setup

Players link a free Last.fm account; their tasks then tick themselves.
Only songs played **after the player's roll** count. Two kinds of task:

- **Generic** (“Listen to 3 TXT songs”): a play counts if it is by TOMORROW X TOGETHER (any version or collab) or a solo song by Soobin, Yeonjun, Beomgyu, Taehyun or Huening Kai.
- **Song tasks** (“Listen to Some Song”): checked **by the song title in the task, whoever the artist is**, so songs that aren't released yet, demos, or anything Last.fm files under another artist still tick. Put the title in the task as `{"text":"Listen to X","song":"X"}` or just write it in quotes: `Listen to "X"`.

1. **Last.fm API key** – create one at https://www.last.fm/api/account/create (free, for non-commercial use).
2. **SQL** – re-run `supabase-game-functions.sql`, then run `supabase-listening-tasks.sql` (replaces the 6 task lists with listening tasks).
3. **Secret** – Supabase → Edge Functions → Secrets → add `LASTFM_API_KEY` = your key.
4. **Deploy the function** – Supabase → Edge Functions → *Deploy a new function* → name it exactly `check-listening`, paste in `supabase/functions/check-listening/index.ts`, switch **Verify JWT off** (the function checks the player itself), deploy.
   (CLI alternative: `supabase functions deploy check-listening --no-verify-jwt`.)
5. Upload the site files again.

Players: Tasklists page → *Connect Last.fm*. They need their streaming app connected to Last.fm, and "Hide recent listening information" must be off in their Last.fm privacy settings.

- **Change what counts**: edit the lists at the top of `index.ts` (group names, member names).
- **Change the tasks**: edit `song_tasks` / `other_tasks` in Table Editor (see *Task tables*).
- Listening tasks can't be ticked by hand (the server refuses); admin test accounts can.
- The checker looks at the last 3 days of rolls, so a tasklist can still finish after midnight.
- The Tasklists page shows the last 20 songs that counted (stored in `listening_history`).

## Test admin account (temporary)

1. Re-run `supabase-game-functions.sql` (it includes the admin tools).
2. Sign up on the site with a test username and create the chibi.
3. Put that username into `supabase-make-admin.sql` and run it. Refresh the site.
4. An **Admin · testing only** panel appears: pick a dice number (or random), roll as often as you like, or jump to any tile with any checkpoint to test ladders, storms and gifts. Gifts re-arm each time.
5. When finished, delete the user in Supabase → Authentication → Users (profile, rolls and gifts are removed with it).

The server refuses admin actions for everyone not listed in `admin_users`.

## Accounts

- Players sign up with a **username + password only** (no email). The username is turned into a hidden address `username@players.perfectstorm.game` (`AUTH_EMAIL_DOMAIN` in `game-config.js` and the SQL).
- Usernames: 3–18 letters, numbers or `_`, **unique ignoring upper/lower case**.
- No username may contain the word **`admin`** (any capitalisation). It is blocked on the sign-up form, in `save_profile` and by a trigger on `auth.users`. Admin rights come from the `admin_users` table (see `supabase-make-admin.sql`), not from the name.
- There is no password reset by email any more. If someone forgets their password, set a new one in Supabase → Authentication → Users.

## Leaderboard

- Ranked by moasta points, then checkpoint, then tile. **Admin accounts are not listed** (the list comes from the `get_leaderboard()` function, and admins also don't appear as tokens on other players' boards).
- The box on the right shows **streams collected on this website** (every play the checker counted, all players together) and the total for each song of the album set in `ALBUM_TRACKS` in `game-config.js`. A play is only counted once, and admin test plays are left out. Counting starts when you install this update.
- When the album's song names change, edit `ALBUM_NAME` / `ALBUM_TRACKS`.

## See-through cards

The cards let the daily background show through. Adjust `--panel`, `--overlay-a` and `--overlay-b` at the bottom of `style.css`.

## Sounds

`assets/sounds/`: `moved-up.wav` (gift moved you forward / bonus roll), `moved-down.wav` (gift moved you back), `storm.wav` (storm portal), `ladder.wav` (ladder). They are short synthesized effects; replace any file with your own (same name) to change it. Players can mute with the 🔊 button.

## Screen size

The game, welcome, login and character screens are scaled to about 65% (one variable, `--app-zoom` near the bottom of `style.css`) so board and cards fit one laptop screen. Set it to `1` for no scaling.

## Task tables (`song_tasks` and `other_tasks`)

Tasks live in two separate tables (Supabase → Table Editor):

| | `song_tasks` | `other_tasks` |
|---|---|---|
| Columns | `sort_order`, `text`, `song`, `count`, `distinct_songs`, `mp`, `active` | `sort_order`, `text`, `mp`, `active` |
| Completed by | ticks itself from the player's **Last.fm or stats.fm** plays (`song` = exact title, empty = any TXT song; `count` = plays needed) | the player **checks / unchecks** it on the Tasklists page |
| MP | 50 | 50 |
| Picked | the **next row** by `sort_order`, top to bottom, no skips, then back to the top (the pointer is `profiles.stream_cursor`) | random (never one the player already has today) |

Each roll **adds** 1 task from each table to today's list. Earlier tasks and their progress are never replaced (admin test accounts can roll without a daily limit, and their tasks are added the same way).
`song_tasks` is seeded with the PERFECT STORM album, top to bottom. `other_tasks` is a starter list: **change the wording to whatever your fans actually do**. Don't put quote marks around a title in an `other_tasks` row.
Add a new task = add a row. Retire one with `active = false`. If you used the old single `task_pool` table, re-running the SQL copies its rows into the two new tables and removes it.
Un-checking a task is blocked if the MP it gave was already spent in the Shop.

## Shop (spend MP on chibi items)

The **Shop** tab sells 23 items: hairstyles, outfits, accessories, auras and wings, all drawn in `avatarDataUri()` in `app.js`. Players see a preview on their own chibi before buying, then tap **Wear**. Bought items also appear in the Wardrobe. Items you earn at checkpoints / boards stay free drops.

Balance = MP earned − MP spent (`profiles.mp` − `profiles.mp_spent`). Buying runs on the server (`buy_chibi_item`), so nobody can buy without the points or buy twice.

**Prices** (common 100–250, rare 400–750, epic 900–1400, legendary 1800; whole shop = 14,500 MP). A player can earn at most 300 MP a day (3 rolls × 2 tasks × 50), so on day 1 they can afford 1–2 cheap items at most, and even a perfect player needs about 7 weeks for everything. To make the shop faster / slower, change `price` in `game-config.js` **and** in the `chibi_items` insert in `supabase-game-functions.sql`, then re-run it.
To add an item: a line in `CHIBI_ITEMS` (`kind: "shop"`, `price`), the same row in the SQL, and a drawing in `app.js` (`SHOP_HAIR`, `SHOP_OUTFITS`, `SHOP_ACCESSORIES`, `SHOP_WINGS` or the aura map, keyed by the item name).

## Editing on GitHub

You can change files directly on github.com (open the file → pencil icon → *Commit changes*) and GitHub Pages republishes in about a minute. You do **not** need VS Code for that. Use VS Code when you change many files at once, or want to test locally first. The SQL file is never used by GitHub: after changing it, paste it into Supabase → SQL Editor and run it.

## Changing things

- **Board / gifts / milestones**: edit `game-config.js` (what players SEE) **and** the matching constants at the top of `roll_daily()` in `supabase-game-functions.sql` (what the server DOES), then re-run the SQL. Keep the loop rules above.
- **Tasks**: Supabase → Table Editor → `song_tasks` / `other_tasks` (see *Task tables*). Re-running the SQL never overwrites your edits. (`task_templates` and `supabase-listening-tasks.sql` are the OLD per-dice task lists and are no longer used.)
- **Backgrounds**: `assets/backgrounds/background-1…7.jpg`, one per KST day from `SEASON_START_DATE`, cycling.
- **Chibi options**: `CHIBI_OPTIONS` / `CHIBI_PALETTES` in `app.js`.

## Testing tip

To roll again today, run (with your own user id from Authentication → Users):
```sql
delete from public.daily_rolls where player_id = 'YOUR-USER-UUID'
  and roll_date = (now() at time zone 'Asia/Seoul')::date;
```
More reset snippets are at the bottom of the SQL file.

## Changelog (this version)
- Two task tables (`song_tasks` and `other_tasks`), 1 of each per roll.
- +10 MP per checkpoint, +25 / +50 / +75 MP for finishing boards 1 / 2 / 3.
- Shop tab with 23 buyable chibi items (`buy_chibi_item`); balance = MP earned − MP spent.
- **Update steps**: re-run `supabase-game-functions.sql` once, upload the site files again (check-listening needs no change).

- **Three boards** (tiles 1–300) with their own storms, ladders, gifts and checkpoints; board 3 has no checkpoints. Board tabs on the Game page, a START pad for players waiting between boards.
- **Chibi unlocks**: 6 common checkpoint drops, plus a rare / epic / legendary item for finishing each board, a Wardrobe tab, locked items show how to earn them.
- **Eye of the Storm finale** and tiered finisher badges.
- Admin tools now accept tiles 1–300 and checkpoints 125 / 150 / 175.
- **Re-run `supabase-game-functions.sql`** (it removes the old 100-tile limits and adds `chibi_items`, `chibi_unlocks`, `equip_chibi`). Existing players automatically receive the items they have already earned.

- **stats.fm as a second source**: players pick Last.fm or stats.fm on the Tasklists page (Change lets them switch or disconnect). Re-run `supabase-game-functions.sql` and **redeploy `check-listening`** (paste the new `index.ts`). stats.fm needs no API key, only a public profile. It uses stats.fm's unofficial API (`api.stats.fm`), so if it ever stops working only `statsfmPlays()` in `index.ts` needs fixing. The `LASTFM_API_KEY` secret is still needed for Last.fm players and for telling apart members with shared names.

- **Listening checks**: automatic check every 7 minutes (was 2) while Tasklists is open; after pressing *Check my listening* the button is locked for 5 minutes (countdown shown, survives page refresh). Constants `AUTO_CHECK_MS` / `MANUAL_COOLDOWN_MS` in `app.js`.

- **Fewer 1s**: on a player's first roll ever a 1 is ~2% likely, on the first two rolls of each KST day ~7% (instead of 16.7%). Later rolls and gift bonus rolls are normal. Tune `v_w1` in `roll_core()` (re-run `supabase-game-functions.sql`).
- Cards more see-through (`--panel` .50).
- Stormy site: clouds, rain and lightning layer (`.storm-fx`, bottom of `style.css`); respects reduced-motion.

- **Ladder bug fixed**: the board on screen and the server rules now match (see "One row only").
- Ladders and storms are exactly one row; storms 48→40 and 90→95 and gifts 13→12, 53→52, 86→85 moved to keep the no-loop rules.
- 3 rolls per day, 2 tasks per roll; the Tasklists page groups tasks by roll.
- Leaderboard: streams-collected box with the Perfect Storm songs; admin hidden.
- Cards more transparent.

### Earlier
- **Zoom fixed**: narrower page (1180px), board capped to the screen height, smaller headings/tokens; background is now a fixed "cover" layer instead of `background-attachment: fixed`; background JPGs shrunk from ~5 MB to ~0.5 MB each.
- **Welcome page always first**: signed-in players see *Continue your journey* instead of landing straight on the chibi screen. Load errors are shown on the welcome page with a *Try again* button.
- **Storm/ladder layout redone** with automatic loop checks (see above). Movement animation now walks tile by tile and plays only the landing event (before, walking *over* a storm tile could teleport you).
- **Full backend included**: `get_my_profile`, `save_profile`, `roll_daily`, `set_task_completion`, `task_templates`, realtime.
- **Chibi creator** now shows a small picture of every hairstyle, eye style, outfit and accessory instead of text tags.
- Smaller fixes: token refresh no longer kicks you back to the Game tab; the roll popup can be skipped; the board token no longer jumps early when the leaderboard refreshes; "整理" typo in a task fixed; duplicate-username message.
