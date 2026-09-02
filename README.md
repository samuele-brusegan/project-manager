# Project Hub

Workspace per progetti, task, repository e cartelle locali.

## Avvio
Richiede PHP 8+ con `pdo_sqlite`:
```bash
php -S localhost:8080
```
Al primo avvio viene creato il database SQLite e l’account demo **samuele@localhost / samuele**. È possibile registrare nuovi account dalla schermata di accesso; ogni utente vede e modifica solo i propri progetti.

## Funzioni
- autenticazione multi-utente con password cifrate e sessioni;
- progetti, task e posizioni locali isolati per utente;
- menu dei tre puntini per modificare/eliminare progetti e per logout;
- tema scuro predefinito, con preferenza salvata e alternativa chiara;
- ricerca, filtri e layout responsive.
- vista dei computer dell'utente e percorsi locali associati ai progetti;
- aggiornamento dell'ultimo commit e visualizzazione del Git tree dai repository clonati localmente;
- compilazione automatica dei dati del progetto dai repository GitHub inserendo l'URL;
- login Authentik/OIDC opzionale.

## Authentik / OIDC

Impostare `AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET` e, se necessario, `AUTHENTIK_REDIRECT_URI`. Il redirect predefinito è `/index.php?oidc_callback=1`. L'utente viene creato o riconosciuto tramite l'indirizzo email restituito dal provider.

## Git e percorsi locali

Associare almeno un percorso che contenga una directory `.git`. Il server PHP deve poter leggere quel percorso e avere Git installato. Per un URL GitHub viene interrogata l'API pubblica di GitHub e vengono importati nome, descrizione, branch predefinito e ultimo commit. I repository privati richiedono `GITHUB_TOKEN` nell'ambiente PHP; senza token o in caso di indisponibilità temporanea il salvataggio conserva i dati digitati manualmente.

Il recupero parte quando si esce dal campo URL e viene ripetuto lato server durante il salvataggio. Sono accettati URL `https://github.com/<owner>/<repo>` anche con suffisso `.git`.

## Note di sicurezza

La funzione Git riceve percorsi locali dall'utente e attualmente usa `git -C` con escaping degli argomenti. In produzione è consigliabile aggiungere una whitelist di directory consentite e spostare i comandi in un worker isolato. Cambiare inoltre la password demo al primo avvio e usare HTTPS per le sessioni.

## Condivisione, backup e test

Il proprietario può condividere un progetto con un altro utente registrato come `viewer` o `editor`. I viewer possono consultare il progetto; gli editor possono modificarne dati, task e percorsi.

`PROJECT_GIT_ROOTS` contiene una lista separata da virgole di directory radice autorizzate per Git. Se non è impostata, l’integrazione Git viene disabilitata.

All'avvio viene creato un backup SQLite giornaliero in `data/backups/`, mantenendo gli ultimi 15 file, e viene registrata la versione dello schema in `schema_versions`.

Il controllo statico è disponibile in `tests/smoke.php`; la checklist browser è in `tests/README.md`.
