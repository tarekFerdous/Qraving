# Qraving — Product Context

## Overview

**Qraving** is a QR code-based, shared cart ordering web application for restaurants and similar businesses. The name blends *QR* and *craving* — capturing the exact emotional moment before every order: the desire, the hunger, the need. Scan a QR code, satisfy the craving, instantly.

Qraving is a mobile-friendly internal SaaS tool that allows customers to scan a QR code, browse a menu, and collaboratively place orders from a shared cart — all without downloading an app. Orders are routed to the appropriate staff in real time.

---

## Problem Statement

In traditional restaurant and service settings:
- Ordering is slow and dependent on staff availability
- Group ordering creates confusion and delays
- Paper menus are static, hard to update, and offer no dietary context
- There is no seamless way for a table to collectively manage a shared order

Qraving eliminates these friction points by turning any table into a self-service, collaborative ordering station.

---

## Target Verticals

Qraving is designed as a flexible platform applicable across multiple industries:

| Vertical | Use Case |
|---|---|
| 🍽️ Restaurants | Table-based dine-in ordering |
| ☕ Cafés & Food Trucks | Counter or seat-based ordering |
| 💊 Pharmacies | Product request or consultation queuing |
| 🏨 Hotels | Room service and amenity ordering |
| 🎪 Events & Stadiums | Seat-based food and merchandise ordering |
| 🏥 Hospital Cafeterias | Patient or visitor meal ordering |
| ✂️ Service Businesses | Waiting room service requests (salons, clinics) |

---

## Core Concepts

### Dynamic QR Codes
Each QR code is unique to a specific:
- **Company** (e.g. a restaurant brand)
- **Branch** (e.g. a specific location)
- **Table or Area** (e.g. Table 5, Room 204, Seat Block A)

Scanning the QR code generates a dynamic link that encodes all three identifiers. This ensures every order is correctly routed without any manual input from staff.

### Shared Cart Session
- A cart session is created the moment the first person scans the QR code
- Subsequent scans of the same QR code **automatically join** the existing active session — no join code or invite link required
- All members of the table share a single cart in real time
- Each member identifies themselves by **name and phone number** when adding items
- Any member can add, edit, or remove any item in the cart (no ownership restrictions — kept simple intentionally)
- A session expires after **30 minutes of inactivity**

### Multiple Order Rounds
A table is not limited to a single order. After the first order is submitted, the session remains open. The table can place additional orders (e.g. drinks, desserts) within the same session.

---

## User Flow (Customer)

```
Scan QR Code
     │
     ▼
Open Web App (no install required)
     │
     ▼
Auto-join or create table session
     │
     ▼
Browse Menu
  - View item details
  - See allergen info, vegan/halal/dietary tags
  - Select customizations (size, add-ons, special notes e.g. "no onions")
     │
     ▼
Add items to shared cart
     │
     ▼
Enter name + phone number
     │
     ▼
Pass phone to next person OR next person scans QR on their own device
     │
     ▼
All items accumulate in shared cart
     │
     ▼
Any member submits the order
     │
     ▼
Order sent for staff review
     │
     ▼
Staff accepts or rejects the order
     │
     ▼
Accepted order routed to kitchen/fulfillment
     │
     ▼
Table can place additional orders in same session
```

---

## User Flow (Staff / Kitchen)

```
Order submitted by table
     │
     ▼
Staff notified via:
  - Kitchen Display Screen (KDS)
  - Receipt Printer
  - Tablet
  - Phone Notification
     │
     ▼
Staff reviews order
     │
     ▼
Accept or Reject
  - If accepted → routed to appropriate maker (kitchen, bar, etc.)
  - If rejected → customer session receives rejection notice
     │
     ▼
Order fulfilled
```

---

## Menu System

Menus are managed entirely by the **company admin** via the dashboard. Each menu item supports:

- **Name and description**
- **Price**
- **Category** (e.g. Starters, Mains, Drinks)
- **Images**
- **Dietary tags:**
  - ✅ Vegan
  - ✅ Vegetarian
  - ✅ Halal
  - ✅ Gluten-Free
  - ✅ Nut-Free
  - ✅ Dairy-Free
  - ⚠️ Allergen warnings (e.g. contains peanuts, shellfish, etc.)
- **Customization options:**
  - Size variants (e.g. Small / Medium / Large)
  - Add-ons (e.g. extra cheese, double shot)
  - Special instructions (free-text field, e.g. "no onions")
- **Availability toggle** (in stock / out of stock)

---

## Admin Dashboard

The dashboard is accessible to company administrators and supports full management of the Qraving setup.

### Account Hierarchy

```
Company Account (top level)
     │
     ├── Branch 1
     │     ├── Branch Admin
     │     ├── Menu
     │     ├── Tables/Areas + QR Codes
     │     └── Orders
     │
     └── Branch 2
           ├── Branch Admin
           ├── Menu
           ├── Tables/Areas + QR Codes
           └── Orders
```

- A **central company account** manages all branches
- Each branch can have its own **branch-level admin**
- Branch admins can manage their own menus, tables, and orders independently

### Dashboard Capabilities (V1)

- **Menu management** — add, edit, remove items; manage categories and dietary tags
- **Table/Area management** — create tables, generate and download QR codes
- **Branch management** — add branches, assign admins
- **Order management** — view incoming orders, accept/reject, track status
- **Notification settings** — configure KDS, printer, tablet, phone alerts
- **Session monitoring** — view active table sessions in real time

---

## Technical Overview

| Attribute | Detail |
|---|---|
| Type | Web App (no install required) |
| Framework | Next.js |
| Target device | Mobile-first, fully responsive |
| QR Code | Encodes dynamic URL with company + branch + table identifiers |
| Session model | Shared real-time cart per table session |
| Session timeout | 30 minutes of inactivity |
| Payment | Not in V1 |
| Auth (customer) | No login — name + phone number only |
| Auth (admin) | Account-based login |

---

## Version Roadmap

### V1 — Core (Current Scope)
- QR code generation per table/branch
- Shared cart with auto-join
- Menu browsing with dietary/allergen info and customizations
- Per-person name + phone identification
- Multi-round ordering in one session
- Staff order review (accept/reject)
- Order routing to KDS, printer, tablet, phone
- Admin dashboard (menu, tables, branches, orders)

### V2 — Planned
- In-app payment (card, digital wallets)
- Order status tracking for customers
- Customer order history via phone number
- Analytics dashboard (popular items, peak hours, revenue)
- Loyalty / repeat customer recognition

### V3 — Future
- Multi-language menu support
- AI-powered item recommendations based on group preferences
- Inventory management integration
- Third-party POS system integrations
- White-label support for enterprise clients

---

## Brand

**Name:** Qraving
**Meaning:** QR + Craving — the platform that meets customers at the moment of desire
**Positioning:** The ordering platform that starts where the craving does.
**Tagline ideas:**
- *"Scan your craving."*
- *"From craving to table, instantly."*
- *"Every craving, one scan away."*
- *"Feed the craving."*

---

## Key Differentiators

- **No app download** — pure web, scan and go
- **Auto-join shared cart** — no friction for groups
- **Per-person identification** — orders stay organized without login
- **Multi-round ordering** — one session for the full dining experience
- **Dietary transparency** — allergens, halal, vegan all front and center
- **Multi-vertical** — not just restaurants; hotels, events, pharmacies and more
- **Branch-aware** — every QR knows exactly where it is
