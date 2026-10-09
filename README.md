<div align="center">

# Qraving

*QR + craving: scan your craving.*

**A shared-cart, QR-code ordering web app for restaurants, cafés, hotels, events, and anywhere people order together.**
Scan the code on the table, browse the menu, and everyone at the table adds to one live cart. No app to install, no account to create, and no waiting for someone to bring a menu.

![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Firebase](https://img.shields.io/badge/Firestore-realtime-FFCA28?logo=firebase&logoColor=black)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/deploys%20on-Vercel-000?logo=vercel&logoColor=white)
![Helcim payments](https://img.shields.io/badge/payments-Helcim-5B2EFF)
![No app install](https://img.shields.io/badge/customer%20app-none%20needed-2ea44f)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
[![CI](https://github.com/tarekFerdous/Qraving/actions/workflows/ci.yml/badge.svg)](https://github.com/tarekFerdous/Qraving/actions/workflows/ci.yml)

<img src="docs/screenshots/menu-swipe.gif" alt="Animated: swiping through Italian menu cards (Spaghetti Carbonara, Margherita, Penne Arrabbiata, Tiramisu, Risotto ai Funghi), then flipping the Carbonara card to show its description and allergens" width="300">

<sub>Real recording from the <a href="https://youtu.be/tT9zgV6_FE0">V1 demo video</a>. Swipe through a category, and tap a card to flip it for details and allergens.</sub>

</div>

---

## Features

- **One QR per table.** Every code points at one company, branch and table, so orders are routed with no input from staff.
- **Shared cart with auto-join.** The first scan opens a table session. Every later scan of the same code joins it, with no join code or invite link.
- **Per-person baskets.** Each diner gives a name and phone number (email optional). Items stay grouped by person, with no login.
- **Live sync.** Every device sees cart changes as they happen, through Firestore real-time listeners.
- **Dietary transparency.** Vegan, vegetarian, halal, kosher, gluten-free, lactose-free and nut-free icons, plus allergen warnings (peanuts, shellfish, dairy, gluten, eggs, soy, tree nuts).
- **Customizations.** Sizes, add-ons and free-text instructions ("no onions"). Matching items merge into one line with a higher quantity.
- **Flexible payment.** One person can pay for the whole table, or each person pays their own basket. Shared items (a bottle, a dessert) can be split across chosen people.
- **Payment before the kitchen.** An order goes to the kitchen only once the table has paid, through Helcim (card, Apple Pay, Google Pay, Interac).
- **SMS receipts** through Twilio.
- **Any business shape.** Each company defines its own layers (for example *Branch → Floor → Table*, or *Hotel → Wing → Room*), and managers can be assigned at any layer.
- **Two admin panels.** A super-admin panel to onboard companies, and a per-company manager panel to run menus, tables, QR codes and live sessions.
- **Live menu safety.** If a manager deletes an item mid-session, it is removed from every open cart and the diners are told.

## How it looks

### At the table

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/dietary.png" alt="Menu card for Juicy Grilled Chicken Breasts at $35.00 CAD, with halal, gluten-free, nut-free and dairy-free icons down the side" width="200"><br><sub><b>Menu</b>: dietary icons on every card</sub></td>
    <td align="center"><img src="docs/screenshots/details.png" alt="Flipped Spaghetti Carbonara card showing its description and an allergen warning: contains eggs, dairy, gluten" width="200"><br><sub><b>Details</b>: description and allergens</sub></td>
    <td align="center"><img src="docs/screenshots/customize.png" alt="Customize sheet for Spaghetti Carbonara: size Small, Medium or Large; add-ons Extra Sauce, Double Portion, Extra Cheese, No Ice; special instructions box" width="200"><br><sub><b>Customize</b>: sizes, add-ons, notes</sub></td>
    <td align="center"><img src="docs/screenshots/pass-or-finish.png" alt="Sheet after adding to basket with three choices: Add more, I am done and passing to the next person, or We are done with this table" width="200"><br><sub><b>Pass the phone</b> or finish the table</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/baskets.png" alt="Baskets sheet listing Tarek's Basket with one item, Spaghetti Carbonara (Medium, Double Portion, note: put it in 2 bowls for sharing), with Modify and Pay buttons" width="200"><br><sub><b>Baskets</b>: one per person, shared by the table</sub></td>
    <td align="center"><img src="docs/screenshots/checkout.png" alt="Checkout showing a total of $18.00 CAD with Pay with Apple Pay, Pay with Google Pay, and a Helcim card-entry form" width="200"><br><sub><b>Checkout</b> with Helcim</sub></td>
    <td align="center"><img src="docs/screenshots/payment-confirmed.png" alt="Payment confirmed screen: $18.00 CAD paid, thank you Tarek, SMS receipt sent (phone number blurred), payment status, and an optional email receipt field" width="200"><br><sub><b>Paid</b>: SMS receipt, optional email</sub></td>
    <td></td>
  </tr>
</table>

### Manager panel

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/manager-orders.png" alt="Manager dashboard: one active session marked Paying with a Free the table button, and an incoming $72.00 order for 1 Juicy Grilled Chicken Breasts with Accept and Reject buttons" width="200"><br><sub><b>Dashboard</b>: live sessions, accept or reject orders</sub></td>
    <td align="center"><img src="docs/screenshots/manager-menu.png" alt="Menu tab showing a Chicken category with Juicy Grilled Chicken at $35.00 tagged halal, gluten-free, nut-free, dairy-free and Available, and a Beef category below" width="200"><br><sub><b>Menu</b>: categories, items, tags, availability</sub></td>
    <td align="center"><img src="docs/screenshots/manager-edit-item.png" alt="Edit item form with photo, name Juicy Grilled Chicken Breasts, description and price $35.00" width="200"><br><sub><b>Edit item</b>: photo, details, price</sub></td>
    <td align="center"><img src="docs/screenshots/manager-qr.png" alt="Structure tab: Front area with Table 1 and its generated QR code, link, Download PNG and Regenerate, and a Back area below" width="200"><br><sub><b>Structure</b>: areas, tables, QR codes</sub></td>
  </tr>
</table>

<sub>All screenshots are from the <a href="https://youtu.be/tT9zgV6_FE0">V1 demo video</a> (51 min), which walks through the customer flow, super-admin setup, the manager panel, and an end-to-end order.</sub>

## How it works

```mermaid
flowchart LR
    QR["QR code on table<br/>/company/…/qrCode"] --> R["Catch-all route<br/>resolves company → node → branch"]
    R --> M["Published menu<br/>(server-rendered)"]
    M --> S["Table session<br/>(Firestore, real-time)"]
    S --> B1["Basket · Alice"]
    S --> B2["Basket · Bob"]
    S --> B3["Basket · …"]
    B1 & B2 & B3 --> P["Payment plan<br/>whole table or split"]
    P --> H["Helcim checkout"]
    H --> W["Webhook / callback<br/>marks baskets paid"]
    W --> O["Order → branch orders<br/>staff accept / reject"]
```

1. **Resolve.** A scan opens `/{companySlug}/…/{qrCode}`. The server finds the company by slug, the table node by its QR code, and walks up to the branch that owns the menu. Locked companies, unknown tables and unpublished menus each show their own screen.
2. **Join.** The table's session ID is scoped to the table node, so every phone that scans the same code lands in the same session.
3. **Build.** Each diner gets their own basket under `sessions/{id}/baskets/{userId}`. Anyone can edit any item, which keeps it simple on purpose.
4. **Pay.** With two or more baskets, the table picks a plan: **single** (one person pays the full table total) or **split** (each basket pays its own share, with a 30-minute deadline). Shared items must have their sharers picked before checkout opens.
5. **Charge.** The server, not the client, calculates the amount from the live menu prices, then starts a Helcim payment. The webhook or Interac callback marks the baskets as paid.
6. **Fulfil.** Once every basket is paid, the order is written to the branch's `orders` collection for staff to accept or reject.

### Session lifecycle

```mermaid
stateDiagram-v2
    [*] --> building: first scan
    building --> payment_pending: first checkout started
    payment_pending --> fully_paid: all baskets paid
    fully_paid --> submitted: sent to kitchen
    submitted --> accepted
    submitted --> rejected
    accepted --> [*]: staff free the table
    rejected --> [*]: staff free the table
```

**Freeing a table** resets the session. Draft baskets are deleted, paid baskets are archived to `archivedBaskets`, and failed payments are kept so the diner is still asked to pay.

## Getting started

**Requirements**
- Node.js 20 or newer
- A Firebase project with Firestore and Authentication enabled
- A Vercel Blob store (for company logos and menu photos)
- Optional: a Helcim account (payments) and a Twilio account (SMS receipts)

**Install**

```bash
git clone https://github.com/tarekFerdous/Qraving.git
cd Qraving
npm install
```

**Configure**

Copy both example files and fill them in:

```bash
cp .env.local.example .env.local   # Firebase client + admin SDK, Vercel Blob
cp .env.example .env               # Helcim, Twilio
```

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client SDK (Project Settings → Your apps) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Admin SDK service account, minified to one line |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, needed only locally (automatic on Vercel) |
| `HELCIM_API_KEY` | Helcim API token. **Leave empty to simulate approved payments.** |
| `HELCIM_TEST_MODE` | `true` to use a Helcim sandbox key |
| `HELCIM_WEBHOOK_SECRET` | HMAC secret for verifying Helcim webhooks |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS receipts (sender in E.164) |

**Seed and run**

```bash
npx ts-node --esm scripts/seed-firestore.ts   # demo company: 4 categories, 20 items (safe to re-run)
npm run seed:superadmin                       # create the first super-admin account
npm run dev
```

Then open:

| URL | What |
|---|---|
| <http://localhost:3000/demo-table> | The customer menu for the seeded demo table |
| <http://localhost:3000/qraving-admin-panel> | Super-admin panel: create companies, define layers, assign managers |
| `http://localhost:3000/{companySlug}/admin` | Manager panel for one company |
| `http://localhost:3000/{companySlug}/{…}/{qrCode}` | What a printed QR code opens |

### Session expiry (Firestore TTL)

Sessions expire after **30 minutes of inactivity**. To have Firestore delete expired sessions automatically, add a TTL policy in the Firebase console:

1. Go to **Firestore → TTL policies**.
2. Add a policy with collection group `sessions` and field path `expiresAt`.

Firestore deletes expired session documents, and their `baskets` subcollections, within about 72 hours of expiry.

## Admin panels

| Panel | Who | What they can do |
|---|---|---|
| **Super admin** · `/qraving-admin-panel` | Qraving operators (`role: superadmin`) | Create companies and their layer structure, upload logos, add or remove managers, lock and restore a company, hard-delete a company along with its stored images |
| **Manager** · `/{companySlug}/admin` | Company/branch managers (`role: manager`) | **Dashboard:** live sessions, incoming orders, free a table. **Menu:** categories and items, drag to reorder, photos, dietary tags, sizes and add-ons, publish. **Structure:** branches, areas and tables, and generating or downloading QR codes |

Access is enforced in three places: `middleware.ts` verifies the Firebase ID token server-side, each page re-checks the role, and `firestore.rules` limits a manager to their own company and branch.

## Data model

```
users/{uid}                                   role + company/branch scope
companies/{companyId}                         name, slug, layers, logo, locked
  nodes/{nodeId}                              branch / area / table tree, QR codes
  branches/{branchId}
    categories/{categoryId}/items/{itemId}    manager-edited menu
    menu/{docId}                              published menu
    sessions/{sessionId}                      orderStatus, paymentPlan, paymentDeadline
      baskets/{userId}                        name, phone, items, paymentStatus
      archivedBaskets/{userId}                paid baskets kept after a table reset
    orders/{orderId}                          paid orders for staff review
```

## Project layout

```
app/
  [...path]/                  QR entry point: company → table → branch → menu
  [companySlug]/admin/        manager panel (Dashboard / Menu / Structure tabs)
  [companySlug]/login/        manager login
  qraving-admin-panel/        super-admin panel
  demo-table/                 demo menu at a fixed table
  api/admin/                  companies, nodes, managers, logo and item uploads, role claims
  api/payment/                initiate, Helcim webhook, Interac callback
  api/orders/                 write paid orders
  api/receipts/               SMS (Twilio) and email receipts
components/                   menu cards, cart, checkout and payment-plan sheets, admin UI
lib/
  session.ts                  pure session and basket logic (create, upsert, share, reset)
  payment.ts                  totals, split shares, payment plans, deadlines
  session-firestore.ts        Firestore persistence for sessions
  company.ts                  company/node tree, QR codes, branch resolution, lock/delete
  menu.ts · manager-menu.ts   public and manager menu read/write
  auth*.ts                    client auth + server-side role checks
middleware.ts                 route guards for both admin panels
firestore.rules               security rules
scripts/                      Firestore and super-admin seeding, CI helper
tests/                        Firestore rules, middleware, write paths, Playwright specs
.github/workflows/ci.yml      PR checks
CLAUDE.md · context.md        product brief and rules for contributors (human or AI)
```

## Development

```bash
npm run lint                    # ESLint (Next.js core-web-vitals + TypeScript rules)
npm run typecheck               # tsc --noEmit
npm test                        # Vitest unit + component tests
npm run test:emulator           # Firestore rules + write-path tests on the Firestore emulator (needs Java 21)
npm run test:middleware-guard   # admin route guard against the real Firebase project (needs .env.local)
npx playwright test             # browser tests (expects the dev server on :3000)
npm run build
```

### CI/CD

Every pull request (and every push to `main`) runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

| Job | Steps |
|---|---|
| **Lint, typecheck, test, build** | `npm ci` → lint → typecheck → unit tests → `next build` |
| **Firestore rules + emulator tests** | Starts the Firestore emulator and runs the security-rules and write-path suites |

CI needs no secrets. The build uses a throwaway, freshly generated service-account key (`scripts/ci-fake-service-account.mjs`), because no page touches Firestore during the build. Vercel's Git integration handles deployment: a preview for every PR and production from `main`.

- Most business logic in `lib/session.ts` and `lib/payment.ts` is pure functions, kept apart from Firestore so it's easy to unit-test. Tests sit next to the code (`*.test.ts`).
- The amount charged is always calculated on the server from live menu prices. Never trust a total sent by the client.
- [`context.md`](context.md) holds the product brief: the problem, target verticals, user flows and roadmap.

## Roadmap

**Not built yet (see [`TODO.md`](TODO.md))**
- Refunds (for now, issue them from the Helcim dashboard)
- A payment-status column in the admin dashboard
- A background sweep that expires sessions with unpaid baskets
- Cancelling an in-progress Helcim payment when a table is freed
- Email receipts (the endpoint is still a stub)

**Next**
- Order-status tracking for customers
- Order history by phone number
- Analytics: popular items, peak hours, revenue
- Loyalty and repeat-customer recognition

**Later**
- Multi-language menus
- AI recommendations based on the group's preferences
- Inventory and POS integrations
- White-label support for enterprise clients

## Known limitations

- Prices are charged in CAD only.
- Anyone at the table can edit any basket. This is on purpose for V1.
- Expired sessions are cleaned up only by the Firestore TTL policy, which can take up to about 72 hours.
- Email receipts are logged on the server, not sent.

## License

[MIT](LICENSE) © 2026 tarekFerdous: free to use, modify and share, including commercially, as long as the copyright notice is kept.
