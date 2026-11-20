# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developer teams and individual developers managing multiple software projects across multiple machines — work PCs, home laptops, production servers, NAS. Their job: keep track of where every project lives, what state its code is in, and whether what's deployed matches what's in the repo. Multi-user and multi-tenant by design; sharing and roles already exist.

## Product Purpose

Project Hub is a command center for the whole lifecycle of software projects, from ideation to production. It aggregates tasks, links, local checkout locations, git state, and deploy state into one place so a user can answer in seconds: "where is this project, on which machine, in what state, and is production in sync?" Success = opening the hub replaces hunting through terminals, SSH sessions, and memory.

## Positioning

Not another task board. The differentiating mechanism is twofold and inseparable:

1. **A fleet of agents**: small agents installed on each machine (dev PC, prod server, NAS) report real observed state — git status/log/tree on dev machines, deploy/health state on prod servers — during their session, not via always-on daemons.
2. **A single pipeline view**: ideation → tasks → commits → deploy is one continuous timeline per project, rendered from the real data the agents collect.

A generic tracker cannot truthfully copy "2 repos are behind on debianPC, prod is 9 days stale" because it doesn't observe reality.

## Operating Context

- Self-hosted (Docker) or plain PHP; SQLite persistence. Multi-user with session auth, optional Authentik/OIDC.
- Agents are **intermittent by design**: they connect when the machine/session is alive, exchange data, and disconnect. The server stores the last reported snapshot per agent; the hub always shows data with its freshness ("seen 2h ago", "stale 9d").
- Current data model: users, projects, tasks, computers, locations (project↔computer↔folder), project links, shares (viewer/editor), notifications, git metadata via a host-side git-service.
- Target model (migration in progress): `computers` evolve into registered **agents** with capabilities (git, docker, systemd, http-health); projects gain **environments** (dev/staging/prod); agent reports are persisted snapshots shown with staleness in the UI.
- UI language is Italian.

## Capabilities and Constraints

- Auth multi-user, CSRF, sharing with viewer/editor roles.
- Projects, tasks (priority/due), links with favicons, per-computer local paths, GitHub repo auto-fill, git last-commit and git-tree via local clones or the host git-service.
- No constraints are binding: stack, language, and look are all open to change (user granted carte blanche, 2026-11-14). Migration toward a server + push-agent architecture is the active direction.
- Undecided: whether the PHP monolith becomes the server or is replaced; agent language/packaging; realtime transport for agent→server reports.

## Brand Commitments

- Name: "project hub" (stylized lowercase with ✦ mark). Voice: warm, direct, Italian.

## Evidence on Hand

- `index.php` (single-file PHP app + API), `assets/app.js`, `assets/style.css`, `git-service/server.py` (host agent prototype), `data/projects.sqlite`, `tests/`, `README.md`. No real user testimonials or external proof assets exist — do not fabricate any.

## Product Principles

1. **Observed state over declared state**: the UI prefers what agents measured to what users typed; staleness is always visible, never hidden.
2. **Intermittent by design**: agents join and leave; "offline since…" is a first-class state, not an error.
3. **Locality is the soul**: "where does this live" (which machine, which path, which URL) is primary information, not metadata.
4. **Pipeline, not piles**: a project's story is a timeline from idea to deploy, not a stack of unrelated lists.
5. **Self-hosted honest**: no fabricated stats, no marketing chrome; every number on screen is real.
