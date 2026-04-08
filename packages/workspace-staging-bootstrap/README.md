# @signal/workspace-staging-bootstrap

Tooling-only CLI to upsert **`workspaces/ws_maire_staging`** and one **`members/{uid}`** doc using `@signal/contracts` Firestore shapes. Not a runtime or public API.

## Usage

Requires Application Default Credentials (`gcloud auth application-default login`) and `FIREBASE_PROJECT_ID` implied by the Firebase Admin default project, or set `GOOGLE_APPLICATION_CREDENTIALS`.

```bash
# Dry-run (no writes)
pnpm --filter @signal/workspace-staging-bootstrap run bootstrap -- --uid <FIREBASE_AUTH_UID>

# Apply
pnpm --filter @signal/workspace-staging-bootstrap run bootstrap -- --uid <FIREBASE_AUTH_UID> --apply
```

Optional: `--workspace ws_maire_staging` (default), `--role admin|analyst|viewer` (default `admin`).

Reruns preserve **`createdAt`** on the workspace root and **`joinedAt`** on the member document; **`updatedAt`** is set to the current run time.
