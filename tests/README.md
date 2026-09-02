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
4. Aggiunta/completamento di un task.
5. Condivisione con un secondo account nei ruoli `viewer` ed `editor`.
6. Notifica, backup giornaliero e aggiornamento Git con `PROJECT_GIT_ROOTS` configurato.

Il test runtime va eseguito nel container applicativo, dove sono disponibili `pdo_sqlite`, directory sessioni scrivibile e Git.
