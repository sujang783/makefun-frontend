[![make.fun frontend](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/c/makefun-frontend-01)
[![Rank](https://make.fun/badge/makefun-frontend-01/sujang783/makefun-frontend/rank.svg)](https://make.fun/c/makefun-frontend-01)
[![Reward](https://make.fun/badge/makefun-frontend-01/sujang783/makefun-frontend/reward.svg)](https://make.fun/c/makefun-frontend-01)

# make.fun frontend — a fast, read-only client for make.fun

An entry for make.fun's [makefun-frontend-01 bounty](https://make.fun/bounty/makefun-frontend-01)
("Build the best make.fun frontend", $500 pot). A static frontend — no build
step, no framework — that reads make.fun's public API alone and shows the four
surfaces a visitor needs: the live bounty board, a bounty's page, its
leaderboard, and an account's public profile, each reachable by a link and by
its own URL.

## Run it

```sh
node serve.ts        # app/ on http://localhost:8080
```

Open http://localhost:8080 in a desktop browser. Routes are hashes:

- `#/` — the board: every bounty with its live pot, entry fee, time left and entries
- `#/bounty/<slug>` — one bounty: summary, rewards table with the live pot, dates, rules, recent entries
- `#/bounty/<slug>/leaderboard` — the leaderboard, paginated and searchable
- `#/u/<handle>` — an account's public profile: record, entries, payouts

## Why it is fast

- **Tiny first load.** The shell, one stylesheet and the router load up front;
  each view loads with `import()` only when its route is visited.
- **Cached API answers.** Every answer is cached in memory and in
  localStorage and revalidated with the API's own ETag, so an unchanged
  answer costs a 304 with no body; stale answers render at once and refresh
  in the background. Identical in-flight requests share one fetch.
- **Small lists in the DOM.** A 6,700-entry leaderboard is fetched once and
  paginated 25 rows at a time; search and sort run client-side.
- **One timer.** Every countdown on screen is updated by a single 1-second
  interval that rewrites only the time-left text.

## Layout

```
main.ts                  entrypoint: copies app/ + screenshots/ to /output, writes dossier.json
serve.ts                 dev server for app/ (Node 22, standard library only)
vendor/makefun-frontend.ts  make.fun's dossier library (kit's copy, unchanged)
app/index.html           shell: header, main, footer
app/main.js              router (hash routes, lazy views, __shotReady)
app/api.js               cached GET layer (ETag, localStorage, dedupe, retry)
app/views-board.js       the bounty board
app/views-bounty.js      one bounty: rewards table, rules, recent entries
app/views-leaderboard.js the leaderboard (paginated, searchable, sortable)
app/views-profile.js     an account's public profile
app/format.js            money, dates, time left, percents, byte counts
app/style.css            one stylesheet, system fonts, responsive
screenshots/             1-board, 2-bounty, 3-leaderboard (live data)
```

## License

MIT — see [LICENSE](LICENSE).
