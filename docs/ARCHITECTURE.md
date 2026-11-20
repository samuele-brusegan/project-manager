# Architettura client-server — Project Hub

Visione: un **server (hub)** che aggrega lo stato di tutti i progetti su tutti i
dispositivi, dall'ideazione alla produzione. Piccoli **agent** installati sulle
macchine riportano lo stato osservato: git sul PC di sviluppo, deploy/health sul
server di produzione.

## Principio cardine: agenti intermittenti

Gli agent **non sono daemon sempre attivi**. Si collegano quando la macchina è
viva (login, sessione di lavoro, schedule), scambiano dati, e si disconnettono.
Conseguenze di design:

1. **Push, mai pull.** Il server non interroga gli agent: sono loro a chiamare
   casa. Niente porte aperte, niente NAT traversal, niente demoni systemd
   obbligatori — anche uno script lanciato a mano è un agent valido.
2. **Il server conserva snapshot.** Ogni report è persistito; la UI mostra
   sempre l'ultimo stato noto **con la sua freschezza** ("visto 2 min fa",
   "giacenza 9 g", "segnale perso"). La staleness è un dato, non un errore.
3. **Report idempotenti e completi.** Un agent manda lo stato corrente intero
   delle cose che sa osservare; il server sovrascrive lo snapshot, niente delta
   da riconciliare dopo disconnessioni lunghe.

## Modello dati (evoluzione)

```
users ─┬─ projects ─┬─ tasks
       │            ├─ project_links
       │            ├─ project_members (ruoli)
       │            ├─ environments ── deploy_targets
       │            └─ locations (project ↔ agent ↔ folder)
       │
       └─ agents (era: computers)
            ├─ agent_tokens
            ├─ capabilities (git | docker | systemd | http-health | …)
            └─ agent_reports (snapshot JSON + received_at)
```

- `computers` diventa `agents`: `id, user_id, name, public_key/token_hash,
  capabilities, last_seen_at, agent_version`.
- `environments`: `id, project_id, name (dev|staging|prod), agent_id NULL,
  url NULL` — collega un progetto a una macchina e a un ambiente.
- `agent_reports`: `id, agent_id, environment_id NULL, kind, payload JSON,
  observed_at, received_at`. `kind` ∈ `git-status`, `git-log`, `docker`,
  `systemd`, `http-health`, `heartbeat`.
- Il server espone ai client solo la **vista corrente** (ultimo report per
  agent+kind+environment), ma tiene lo storico per la timeline.

## Protocollo agent → server

HTTPS + token bearer per-agent (revocabile). Un'unica chiamata batch:

```
POST /api/agent/report
Authorization: Bearer <agent-token>
{
  "agent": {"name": "debianPC", "version": "0.1.0"},
  "reports": [
    {"kind": "git-status", "path": "/home/…/project-manager",
     "data": {"branch":"main","ahead":2,"behind":0,"dirty":false,
              "last_commit":"…","commit_date":"…"}},
    {"kind": "docker", "data": {"containers":[…]}},
    {"kind": "http-health", "data": {"url":"…","status":200,"ms":42}}
  ]
}
→ 200 {"ok":1, "server_time":"…", "commands":[…opzionale]}
```

- **Heartbeat implicito**: ogni report aggiorna `agents.last_seen_at`. Un
  report vuoto (`reports: []`) è il heartbeat puro.
- **Manifest di capacità** al primo register: l'agent dichiara cosa sa
  osservare (`capabilities`) e il server gli assegna gli `environment_id`.
- **`commands`** (opzionale, fase 2): il server può chiedere azioni
  ("rifai il report git di X", "pulla Y") nella stessa risposta —
  niente connessioni persistenti.

## Stati di freschezza in UI

Calcolati da `last_seen_at` (agent) e `observed_at` (dato):

| Età report | Bollo |
|---|---|
| < 5 min | `in transito` (blu) |
| < 24 h | `visto Nh fa` (neutro) |
| 1–14 g | `giacenza N g` (ambra) |
| > 14 g / mai visto | `segnale perso` (rosso) |

Regola d'oro: **nessun dato senza il suo timestamp**. Il manifesto non dice
"main è ahead 2" ma "main era ahead 2 alle 16:02 di ieri".

## Mappa agent → feature

| Agent | Capability | Cosa riporta |
|---|---|---|
| PC sviluppo | `git` | branch, ahead/behind, dirty, last commit, log/tree |
| Server prod | `docker`, `systemd` | container up/down, image tag, restart, uptime |
| Server prod | `http-health` | status code, latency, TLS expiry |
| Qualsiasi | `heartbeat` | "sono vivo alle T" |

Il `git-service/server.py` attuale diventa l'agent dev (capability `git`),
capovolto da pull a push: stessa whitelist di root, stesso vocabolario
(`git-info`, `git-tree`) come `kind` di report.

## Sicurezza

- Token per-agent, hash a riposo, revocabili singolarmente.
- L'agent dichiara i propri root; il server non manda mai path né comandi
  arbitrari (solo `kind` dal vocabolario).
- Report in sola lettura di stato: niente codice eseguito su richiesta del
  server in fase 1.
- TLS in produzione; `commands` eventualmente firmati.

## Fasi di migrazione

1. **Schema**: tabelle `agents`, `agent_reports`, `environments`; migrazione
   `computers → agents`, `locations.computer_id → environment/agent`.
2. **Endpoint report + vista corrente**: `POST /api/agent/report`,
   `GET api=fleet`, `GET api=project-state?id=`.
3. **Agent dev**: `git-service` evolve in agent push (python, stdlib only):
   report all'avvio sessione + ogni N minuti mentre vivo.
4. **UI**: il manifesto legge già rotte/bolli — collegare `Rotta` a
   `environments`, `Ultimo bollo` a `agent_reports.observed_at`,
   `Bollo dogana` alla freschezza; vista Porti = registro agent con
   `last_seen_at`.
5. **Agent prod**: capability `docker`/`http-health`; deploy state come
   destinazione della rotta.
6. **(opz.) comandi**: refresh on-demand, azioni dichiarate.
