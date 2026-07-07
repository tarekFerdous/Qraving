# TODO

Deferred items not in V1 scope:

1. **Refunds** — No V1 refund UI or API. Refunds must be initiated directly in the Helcim dashboard by an admin.

2. **Shared-item split payment** — Splitting the cost of a shared item (e.g. a bottle ordered by the table) across multiple people is not supported in V1.

3. **Admin dashboard payment status view** — A per-order payment status column/panel is blocked on the admin dashboard build. Wire up once the dashboard exists.

4. **Automatic session expiry sweep for unpaid baskets** — Sessions with unpaid baskets that have passed the 30-minute inactivity deadline need a background sweep to expire/clean them up. Not implemented in V1.
