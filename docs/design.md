# Chalk — design spec

Chalk is a multi-tenant SaaS for strength and CrossFit-style gyms ("boxes").
A gym signs up, sets its class schedule and membership plans, and its members
book classes, buy memberships and check in at the door from their phones.

## Users and roles

| Role   | Scope       | Can do |
|--------|-------------|--------|
| Owner  | one gym     | everything: billing, payouts, staff, plans, members, schedule |
| Coach  | one gym     | schedule, rosters, attendance, members, check-in |
| Member | one gym     | book / cancel / waitlist, buy plans, show check-in QR |

One login (`user`) can be staff at one gym and a member at another. Roles live
on the join rows (`staff`, `member`), never on the user.

## Tenancy

- Path based: `/g/[slug]` is the member app, `/g/[slug]/admin` the staff app.
  Works on any host with no wildcard DNS.
- Every tenant table has `gym_id`. All reads and writes go through
  `src/lib/tenant.ts`, which resolves the gym from the slug, checks the caller's
  role and returns a context object. Queries always filter on `ctx.gym.id`;
  nothing takes a `gym_id` from the client.

## Billing (Stripe, test mode)

Two layers:

1. **Gym pays Chalk.** Free plan: up to 30 active members. Pro: $49/month,
   unlimited. Stripe Checkout (subscription) + Billing Portal. Webhooks set
   `gym.saas_plan`. The member cap is enforced on every path that adds a member.
2. **Member pays the gym.** Stripe Connect Express accounts, destination
   charges with a 2% platform fee. Plan kinds:
   - `monthly` — recurring subscription, unlimited classes
   - `pack` — one-off payment, N class credits
   - `dropin` — one-off payment, 1 credit
   Gyms that haven't finished Connect onboarding can still record cash
   payments from the admin, which creates the same membership row.

Webhook handling is idempotent: every Stripe event id is stored in
`stripe_event` and skipped if seen; memberships are unique on the checkout
session id.

## Booking rules

- A booking needs an entitlement: an active monthly membership, or a pack /
  drop-in with credits left. Monthly is used first, then the pack that expires
  soonest.
- Booking locks the class row (`SELECT … FOR UPDATE`), counts booked seats and
  either books (debiting a credit) or waitlists. Capacity can never be exceeded
  by concurrent requests.
- Cancelling 2h or more before start refunds the credit. Later cancels forfeit it.
- A freed seat promotes the oldest waitlisted member who still has an
  entitlement.
- A daily cron marks `booked` seats in finished classes as `no_show`.
- Classes come from weekly templates (e.g. "WOD, Mon 06:00, 16 spots").
  "Generate" creates the next 14 days and is idempotent.

## Check-in

Each member has a random `checkin_code` shown as a QR on their phone. The front
desk scans it (camera) or searches by name. A check-in marks a booking for a
class starting within ±60 minutes as `attended`; otherwise it is recorded as an
open-gym visit. Members without an entitlement are flagged in red, but staff can
still let them in.

## Frontend

### Direction

The gym itself is the source: whiteboards, chalk, rubber floor, painted
competition plates. The UI should feel like a well-kept box: utilitarian,
loud where it matters (times, spots left), quiet everywhere else.
No gradients, no glass, no soft drop shadows, no purple.

### Palette

Built from bumper-plate colours on chalk paper. Plate colours are used only
for meaning, never for decoration.

| Token        | Light     | Dark      | Use |
|--------------|-----------|-----------|-----|
| `paper`      | `#F1EEE6` | `#141412` | page background (chalk / rubber floor) |
| `surface`    | `#FBFAF6` | `#1D1C19` | cards, inputs |
| `ink`        | `#1A1916` | `#EDE9DF` | text, primary buttons (iron) |
| `ink-soft`   | `#57534A` | `#A39E92` | secondary text |
| `line`       | `#D6D0C2` | `#35332E` | borders, rules |
| `red`        | `#C4321C` | `#E5553C` | full / late / destructive, "live now" |
| `blue`       | `#1D4E9E` | `#6C97E0` | links, focus ring, info |
| `yellow`     | `#D99A06` | `#F0B83A` | waitlist, warnings |
| `green`      | `#2C7339` | `#5FB36D` | booked, checked in, paid |

The primary button is solid ink with paper text. Red is never the primary
action colour: in a gym, red means a full class or a missed payment.

### Type

- **Big Shoulders** (600–800, uppercase): headings, class times, big
  numbers. A condensed industrial face with a stencilled, gym-sign feel.
- **Archivo** (400–700): body and UI. A sturdy grotesque that holds up at
  small sizes on phones.
- **IBM Plex Mono** (500): check-in codes, prices in tables, timestamps.

Times and counts always use tabular figures.

### Shape and motifs

- 2px radius on everything; 2px ink borders on primary surfaces, 1px `line`
  borders elsewhere.
- Capacity shown as a row of plate-like blocks (filled = taken), not a
  progress bar. Above 16 spots it switches to a count.
- Section headers sit on a thick ink rule, like a whiteboard heading.
- The class card is the core component: time on the left in display type,
  title + coach, spots meter, one action button.

### Layout and mobile

- Mobile first. The member app is a phone app: a sticky top bar with the gym
  name, a bottom tab bar (Schedule, My classes, Pass, Plans) with 48px touch
  targets, and `env(safe-area-inset-bottom)` padding.
- Staff app: a sidebar at ≥1024px, a bottom tab bar plus "More" sheet below.
- Schedule: a horizontal day strip (7 days, snap-scroll) and a list of class
  cards for the chosen day, on every screen size. Desktop staff also get a
  week grid.
- Tables collapse into stacked rows below 640px.
- Forms are single column, inputs 48px tall, 16px font (no iOS zoom).
- The check-in page is full screen with the camera on top and the result in a
  large coloured banner that clears after 4 seconds.

### Accessibility

Contrast is at least 4.5:1 for text on paper and surface in both themes.
Colour never carries meaning alone: status chips carry a word ("Booked",
"Waitlist #2"). Visible focus ring: 2px blue, 2px offset. Honours
`prefers-reduced-motion`.

## Stack

Next.js 16 (App Router, Server Actions), TypeScript, Tailwind v4, Postgres 17,
Drizzle ORM, Better Auth (email + password), Stripe, Vitest. Local Postgres
runs in Docker; production targets Vercel + Neon.

## Out of scope for v1

Real email delivery (mail is logged to the console in development, and invite
links are shown to staff to copy), custom domains, multiple locations per gym,
workout logging and leaderboards.
