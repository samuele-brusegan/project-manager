# Project Hub

Workspace per progetti, task, repository e cartelle locali.

## Avvio
Richiede PHP 8+ con `pdo_sqlite`:
```bash
php -S localhost:8080
```
Al primo avvio viene creato il database SQLite e un account iniziale **samuele@localhost** con password casuale, stampata una sola volta nel log degli errori PHP (`docker compose logs app` o stderr di `php -S`): cambiarla subito dopo il primo accesso. È possibile registrare nuovi account dalla schermata di accesso; ogni utente vede e modifica solo i propri progetti.

## Avvio con Docker

È disponibile un’immagine Apache/PHP pronta con SQLite, cURL e Git:

```bash
test -f .env || cp .env.example .env
docker compose up --build -d
```

Aprire [http://localhost:8080](http://localhost:8080). Il database e i backup restano in `data/`.

Per seguire i log o fermare l’app:

```bash
docker compose logs -f app
docker compose down
```

Le variabili opzionali di GitHub e Authentik/OIDC possono essere impostate nel file `.env`.

## Git locale dal container

I repository locali possono essere sparsi sull’host: non vengono copiati né montati nel container. Il piccolo servizio `git-service/server.py` gira sull’host, valida i percorsi autorizzati ed esegue soltanto letture Git (`git-info` e `git-tree`). L’app Docker lo raggiunge tramite `host.docker.internal` usando un token condiviso.

Avviarlo in un terminale dell’host:

```bash
export GIT_SERVICE_TOKEN="$(openssl rand -hex 32)"
export GIT_SERVICE_ROOTS="/home/samuele/Documents/dev,/home/samuele/development"
export GIT_SERVICE_BIND=0.0.0.0   # necessario: il container lo raggiunge via host.docker.internal
python3 git-service/server.py
```

Copiare lo stesso valore di `GIT_SERVICE_TOKEN` nel file `.env`, quindi ricreare l’app:

```bash
docker compose up -d --force-recreate app
```

Nell’app salvare i percorsi reali dell’host, ad esempio `/home/samuele/development/mio-progetto`. Il servizio non usa il socket Docker e non permette comandi Git arbitrari.

## Funzioni
- autenticazione multi-utente con password cifrate e sessioni;
- progetti, task e posizioni locali isolati per utente;
- menu dei tre puntini per modificare/eliminare progetti e per logout;
- tema scuro predefinito, con preferenza salvata e alternativa chiara;
- ricerca, filtri e layout responsive;
- task con priorità e scadenza, con evidenza dei task scaduti;
- centro attività globale con filtri per scadenza e priorità;
- modifica ed eliminazione dei task dal dettaglio progetto e dal centro attività;
- link multipli per progetto, apribili con un click e corredati dalla favicon del dominio;
- vista dei computer dell'utente e percorsi locali associati ai progetti;
- aggiornamento dell'ultimo commit e visualizzazione del Git tree dai repository clonati localmente;
- compilazione automatica dei dati del progetto dai repository GitHub inserendo l'URL;
- login Authentik/OIDC opzionale.

## Authentik / OIDC

Impostare `AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET` e, se necessario, `AUTHENTIK_REDIRECT_URI`. Il redirect predefinito è `/index.php?oidc_callback=1`. L’accesso è legato all’identità stabile del provider (`oidc_issuer` + `sub` salvati su `users`): l’email deve essere marcata come verificata (`email_verified`) e un account locale preesistente con la stessa email **non** viene collegato automaticamente — per il primo accesso OIDC serve un’email non già registrata, oppure collegare manualmente `oidc_issuer`/`oidc_sub` in `users`.

## Git e percorsi locali

Associare almeno un percorso che contenga una directory `.git`. Con Docker il percorso viene verificato dal servizio Git sull’host; con l’avvio PHP locale viene usata la whitelist `PROJECT_GIT_ROOTS`. Per un URL GitHub viene interrogata l’API pubblica di GitHub e vengono importati nome, descrizione, branch predefinito e ultimo commit. I repository privati richiedono `GITHUB_TOKEN` nell’ambiente PHP e che il loro owner sia in `GITHUB_TOKEN_OWNERS`; senza token o in caso di indisponibilità temporanea il salvataggio conserva i dati digitati manualmente.

Il recupero parte quando si esce dal campo URL e viene ripetuto lato server durante il salvataggio. Sono accettati URL `https://github.com/<owner>/<repo>` anche con suffisso `.git`.

## Note di sicurezza

Con Docker, Apache nega l’accesso web a `data/` (SQLite e backup), a tutte le directory e ai file nascosti (`.git`, `.env`, `.claude`, …) e alle estensioni non servite dal frontend (`docker/security.conf`). La stessa regola è consigliata dietro un reverse proxy.

Con `php -S` non esiste un equivalente nativo: il server integrato espone qualunque file sotto la root, quindi `data/` e i sorgenti restano raggiungibili. Per uso reale usare Docker o un virtual host Apache/nginx con regole analoghe.

Il servizio Git riceve percorsi locali dall’utente ma applica una whitelist di directory, usa `subprocess` senza shell e accetta solo operazioni predefinite. Ascolta su `127.0.0.1` per impostazione predefinita (`GIT_SERVICE_BIND` per cambiare): è protetto solo dal bearer token, quindi non esporlo su reti non fidate senza firewall. Usare sempre HTTPS per le sessioni.

Tutte le richieste API, login compreso, richiedono un token CSRF associato alla sessione. I cookie di sessione sono `HttpOnly`, usano `SameSite=Lax` e diventano `Secure` quando l’app è servita in HTTPS (o dietro un proxy che imposta `X-Forwarded-Proto: https`). Il login è limitato a 8 tentativi falliti per IP+email e 25 per email ogni 15 minuti, e le password richiedono almeno 8 caratteri.

Con Docker la porta è pubblicata solo su `127.0.0.1` per impostazione predefinita (`PROJECT_HUB_BIND`): l’app va raggiunta tramite un reverse proxy HTTPS. Impostare `PROJECT_HUB_BIND=0.0.0.0` solo per l’accesso diretto dalla LAN.

`git-info` e `git-tree` richiedono che il percorso sia registrato come `locations.folder` di un progetto a cui l’utente ha accesso: nessun utente può interrogare repository altrui anche se il percorso è nelle root autorizzate. `repo_url` accetta solo URL HTTP/HTTPS validi (niente `javascript:` o `data:`) e il frontend applica un’ulteriore validazione degli `href`.

`GITHUB_TOKEN` viene inviato a `api.github.com` solo per repository il cui owner è elencato in `GITHUB_TOKEN_OWNERS` (separati da virgola); per tutti gli altri la richiesta è anonima e vede solo dati pubblici. `ALLOW_REGISTRATION=0` disabilita la registrazione pubblica (consigliato su VPS condivise).

L’app invia header di sicurezza: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`.

Per i link di progetto la favicon viene cercata prima su `<origine>/favicon.ico`; se il dominio non la espone, l’interfaccia usa il servizio favicon di DuckDuckGo come fallback. Non vengono scaricati né salvati file favicon nel database.

## Condivisione, backup e test

Il proprietario può condividere un progetto con un altro utente registrato come `viewer` o `editor`. I viewer possono consultare il progetto; gli editor possono modificarne dati, task e percorsi.

`PROJECT_GIT_ROOTS` contiene una lista separata da virgole di directory radice autorizzate per Git nell’avvio PHP locale. Con Docker la whitelist del servizio host è `GIT_SERVICE_ROOTS`; se nessuna delle due è impostata, l’integrazione Git viene disabilitata.

All'avvio viene creato un backup SQLite giornaliero in `data/backups/`, mantenendo gli ultimi 15 file, e viene registrata la versione dello schema in `schema_versions`.

Il controllo statico è disponibile in `tests/smoke.php`; la checklist browser è in `tests/README.md`.
