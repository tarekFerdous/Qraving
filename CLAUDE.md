@context.md

# Development rules

- Before opening a PR, run what CI runs: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. CI (`.github/workflows/ci.yml`) also runs `npm run test:emulator`.
- The CI build has no real Firebase credentials. Pages must not read Firestore at build time: anything that fetches data must render per request (`export const dynamic = 'force-dynamic'` or a dynamic route).
- Payment amounts are always computed server-side from live menu prices (`lib/payment.ts`, `app/api/payment/initiate`). Never trust a total sent by the client.
- Keep session and payment business logic pure in `lib/session.ts` and `lib/payment.ts`, with unit tests next to the code. Firestore I/O lives in `lib/session-firestore.ts`.
- Tests that need the Firestore emulator or the real Firebase project go in `tests/` and in `vitest.integration.config.ts`, not in the default `vitest run`.
- `react-hooks/set-state-in-effect` and `react-hooks/refs` are warnings only because older components predate them. Don't add new violations.
