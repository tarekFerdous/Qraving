# Qraving
A qr code based cart managing app.

## Seed Firestore demo data

Copy `.env.local.example` to `.env.local` and fill in your Firebase credentials, then run:

```bash
npx ts-node --esm scripts/seed-firestore.ts
```

This populates the demo company/branch with four menu categories and 20 items. Running it twice is safe (uses Firestore `set` with merge).

## Firestore TTL (session expiry cleanup)

To enable automatic deletion of expired sessions, register `expiresAt` as a TTL field in the Firebase console:

1. Go to **Firestore → Data** in the Firebase console.
2. Click **TTL policies** (or navigate to **Firestore → TTL**).
3. Add a new policy: Collection group = `sessions`, Field path = `expiresAt`.

Firestore will delete expired session documents (and their `baskets` sub-collections) within 72 hours of expiry. This is acceptable for V1.
