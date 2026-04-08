# @signal/firebase-auth-uid-lookup

Tooling-only CLI: stampa l’**UID** Firebase Auth per un’email. Non è un’API runtime.

## Requisiti

- `FIREBASE_PROJECT_ID` (es. `signal-ac219`)
- Application Default Credentials: `gcloud auth application-default login`

## Uso

```bash
FIREBASE_PROJECT_ID=signal-ac219 pnpm firebase-auth-uid -- --email someone@example.com
```

**Exit:** `0` se trovato; `1` se utente assente o errore Auth; `2` se argomenti / env mancanti.

**Stdout:** prima riga = `uid`, seconda = `email: …`
