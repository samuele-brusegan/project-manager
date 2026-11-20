# Test

Il controllo statico si esegue con:

```bash
php tests/smoke.php
```

Per il test browser manuale/automatizzabile, avviare l’app nel container PHP-FPM o con:

```bash
php -S 127.0.0.1:8080
```

Verificare almeno:

1. Login demo e registrazione.
2. Creazione, modifica, filtro e cancellazione di un progetto.
3. Creazione di un computer e associazione di un percorso.
4. Aggiunta, modifica, completamento ed eliminazione di un task.
5. Vista “Da completare”: ricerca, filtro per scadenza e filtro per priorità.
6. Condivisione con un secondo account nei ruoli `viewer` ed `editor`.
7. Aggiunta, apertura in una nuova scheda e rimozione di un link di progetto; verifica del caricamento della favicon.
8. Notifica, backup giornaliero e aggiornamento Git con `PROJECT_GIT_ROOTS` configurato, oppure con `git-service/server.py` avviato per il percorso Docker.

Il test runtime va eseguito nel container applicativo, dove sono disponibili `pdo_sqlite` e directory sessioni scrivibile. In Docker, l’accesso ai repository locali passa dal servizio host `git-service/server.py`.
