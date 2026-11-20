# Design

<!-- impeccable:design-schema 1 -->
<!-- seed:a0707b06143fd17d · direction: pick (grounded) · 2026-11-14 -->

## World

**Polizza di Carico** — shipping manifests, bills of lading, customs rubber stamps. Every project is a consignment between ports (machines) and destinations (environments); observed state is stamped, history is a signed waybill. Chosen by the user over an Impeccable direction roll (assigned: ship's log; challengers: midnight transit map, split-flap board — both kept as alternates).

Operate-mode limits apply: the world lends type, palette, density, and signature moves — never navigation or control widgets, which stay standard web components.

## Palette

Dark "freight office at night" ground with paper surfaces for primary content:

- `--ink`: #1a1611 · `--ink-2`: #241f18 · `--ink-3`: #2e2820 (dark shell)
- `--paper`: #f0e6d0 · `--paper-2`: #e4d8bd · `--paper-3`: #d8cbb0 (manifest paper)
- `--stamp-red`: #b7410e (transit/alert stamps, primary action, links)
- `--stamp-blue`: #2f5d8a (info/transit state)
- `--stamp-green`: #3f7a52 (cleared/in-sync state)
- `--amber`: #e8a020 (warnings, staleness)
- `--muted-on-paper`: #6b5f47 · `--muted-on-ink`: #9a8f78
- Selection, caret, scrollbars, and focus rings themed from stamp-red/amber.

Contrast floor: body text ≥4.5:1, placeholders ≥4.5:1, secondary text never plain gray on a colored ground (tint from paper/ink).

## Type

- Display/labels/manifest headers: **Archivo** (600–800), uppercase for section headers with mono tracking only when stamping.
- Stamps, waybill data, routes, timestamps, commit hashes: **IBM Plex Mono** — it is the world's data voice, not decoration.
- Body copy 13–15px; functional text floor 11px (no 9–10px labels; uppercase micro-labels only where ≥10.5px and letterspaced).
- Tabular numerals everywhere a number matters (dates, counts, staleness).

## Signature moves

1. **Route line**: `port → destination` rendered in mono (e.g. `debianPC → vps-prod:443`); divergence shown as a dashed extension or amber stamp, never a generic badge.
2. **Stamps**: state communicated via slightly rotated (±1.5–2.5°), bordered, uppercase mono stamps in stamp-red/blue/green — `in transito`, `sdoganata`, `giacenza Nd`, `fuori rotta`. Rotation is per-element jitter, not random per render.
3. **Waybill numbering**: every project carries `n. NNNN` + task count as its bill-of-lading identity.
4. **Manifest table**: the primary surface is a ruled manifest (paper on ink), not a card grid; each row is a consignment.
5. **Lading notes**: warnings render as dashed-border "NOTA DI CARICO" notes in mono.

## Components

- `.manifest` paper table on dark shell; rows = projects/consignments.
- `.stamp`, `.stamp.r/.b/.g/.a` bordered rotated stamps.
- `.route` mono route segments with `→` separators and dashed tails for stale legs.
- `.note` dashed lading note.
- Buttons: filled stamp-red primary; bordered secondary; danger uses stamp-red darker. All controls real `<button>`/`<a>` with labels, focus-visible rings in amber.
- Detail view = the waybill document (paper sheet), sections as manifest blocks; actions as stamped controls.
- Toasts = stamped slips entering from bottom-right.

## States

- **Agent freshness** is a first-class stamp: `visto ora`, `visto 2h fa`, `giacenza 9 g`, `segnale perso`. Never hidden.
- Empty states speak manifest language ("stiva vuota — imbarca il primo progetto").
- Loading = skeleton ruled rows, not spinners alone.
- Errors name the problem and the recovery.

## Iconography

No unicode-glyph icons. Small authored SVG set (stroke 1.5, round joins): ship/anchor, route arrow, stamp, clipboard/task, box/link, machine/port, bell. Used at 14–16px, decorative only when a text label also exists.

## Layout

Shell: left nav rail (ink) + main work surface. The overview leads with the manifest table (consignments ranked by update recency) and a fleet line naming each port's last stamp. Task center = bill of lading items. Computers view = port registry.

## Bans (from craft-floor, project-specific)

- No eyebrow/kicker labels above headings — the heading carries weight.
- No editable metadata fields the system computes (last commit, commit date are read-only stamps).
- No "Progresso 0%" on taskless projects — show `n. NNNN · nessun task`.
- No light-theme placebo: the light theme is paper manifest light; both themes are real.
