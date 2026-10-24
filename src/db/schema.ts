import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Better Auth core tables. Field names follow Better Auth's defaults.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const saasPlan = pgEnum("saas_plan", ["free", "pro"]);
export const staffRole = pgEnum("staff_role", ["owner", "coach"]);

export const gym = pgTable("gym", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  saasPlan: saasPlan("saas_plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripeAccountId: text("stripe_account_id").unique(),
  chargesEnabled: boolean("charges_enabled").notNull().default(false),
  createdAt: createdAt(),
});

export const staff = pgTable(
  "staff",
  {
    id: id(),
    gymId: text("gym_id")
      .notNull()
      .references(() => gym.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: staffRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("staff_gym_user").on(t.gymId, t.userId)],
);

export const memberStatus = pgEnum("member_status", ["active", "paused", "cancelled"]);

export const member = pgTable(
  "member",
  {
    id: id(),
    gymId: text("gym_id")
      .notNull()
      .references(() => gym.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    status: memberStatus("status").notNull().default("active"),
    checkinCode: text("checkin_code").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("member_gym_email").on(t.gymId, t.email),
    uniqueIndex("member_gym_user").on(t.gymId, t.userId),
  ],
);

export const inviteRole = pgEnum("invite_role", ["coach", "member"]);

export const invite = pgTable("invite", {
  id: id(),
  gymId: text("gym_id")
    .notNull()
    .references(() => gym.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: inviteRole("role").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Plans and memberships
// ---------------------------------------------------------------------------

export const planKind = pgEnum("plan_kind", ["monthly", "pack", "dropin"]);

export const plan = pgTable("plan", {
  id: id(),
  gymId: text("gym_id")
    .notNull()
    .references(() => gym.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: planKind("kind").notNull(),
  priceCents: integer("price_cents").notNull(),
  /** Class credits for packs and drop-ins; null means unlimited (monthly). */
  credits: integer("credits"),
  /** Days a pack stays valid after purchase. */
  validDays: integer("valid_days"),
  description: text("description"),
  stripePriceId: text("stripe_price_id"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const membershipStatus = pgEnum("membership_status", ["active", "past_due", "cancelled", "expired"]);

export const membership = pgTable(
  "membership",
  {
    id: id(),
    gymId: text("gym_id")
      .notNull()
      .references(() => gym.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plan.id),
    status: membershipStatus("status").notNull().default("active"),
    creditsRemaining: integer("credits_remaining"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidVia: text("paid_via", { enum: ["stripe", "cash"] }).notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("membership_member").on(t.memberId, t.status)],
);

// ---------------------------------------------------------------------------
// Schedule and bookings
// ---------------------------------------------------------------------------

export const classTemplate = pgTable("class_template", {
  id: id(),
  gymId: text("gym_id")
    .notNull()
    .references(() => gym.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** 0 = Sunday … 6 = Saturday, in the gym's timezone. */
  weekday: smallint("weekday").notNull(),
  /** "HH:MM" local time. */
  startTime: text("start_time").notNull(),
  durationMin: integer("duration_min").notNull().default(60),
  capacity: integer("capacity").notNull(),
  coachId: text("coach_id").references(() => staff.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const classSession = pgTable(
  "class_session",
  {
    id: id(),
    gymId: text("gym_id")
      .notNull()
      .references(() => gym.id, { onDelete: "cascade" }),
    templateId: text("template_id").references(() => classTemplate.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull(),
    capacity: integer("capacity").notNull(),
    coachId: text("coach_id").references(() => staff.id, { onDelete: "set null" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("class_session_gym_start").on(t.gymId, t.startsAt),
    uniqueIndex("class_session_template_start").on(t.templateId, t.startsAt),
  ],
);

export const bookingStatus = pgEnum("booking_status", [
  "booked",
  "waitlisted",
  "cancelled",
  "late_cancel",
  "attended",
  "no_show",
]);

export const booking = pgTable(
  "booking",
  {
    id: id(),
    gymId: text("gym_id")
      .notNull()
      .references(() => gym.id, { onDelete: "cascade" }),
    classSessionId: text("class_session_id")
      .notNull()
      .references(() => classSession.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    status: bookingStatus("status").notNull(),
    /** Membership a credit was taken from, so a cancel can give it back. */
    membershipId: text("membership_id").references(() => membership.id, { onDelete: "set null" }),
    creditDebited: boolean("credit_debited").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("booking_session_member").on(t.classSessionId, t.memberId),
    index("booking_session_status").on(t.classSessionId, t.status, t.createdAt),
  ],
);

export const checkin = pgTable(
  "checkin",
  {
    id: id(),
    gymId: text("gym_id")
      .notNull()
      .references(() => gym.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    bookingId: text("booking_id").references(() => booking.id, { onDelete: "set null" }),
    byStaffId: text("by_staff_id").references(() => staff.id, { onDelete: "set null" }),
    hadEntitlement: boolean("had_entitlement").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("checkin_gym_created").on(t.gymId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    gymId: text("gym_id")
      .notNull()
      .references(() => gym.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index("audit_gym_created").on(t.gymId, t.createdAt)],
);

export const stripeEvent = pgTable("stripe_event", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
