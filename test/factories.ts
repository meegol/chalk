import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { grantMembership } from "@/lib/memberships";

export async function resetDb() {
  await db.execute(sql`
    truncate table checkin, booking, membership, class_session, class_template, plan, member,
      invite, staff, audit_log, stripe_event, gym, session, account, verification, "user" cascade
  `);
}

let n = 0;

export async function makeGym(overrides: Partial<typeof schema.gym.$inferInsert> = {}) {
  n++;
  const [gym] = await db
    .insert(schema.gym)
    .values({ name: `Gym ${n}`, slug: `gym-${n}-${Date.now()}`, timezone: "America/New_York", ...overrides })
    .returning();
  const [monthly, pack] = await db
    .insert(schema.plan)
    .values([
      { gymId: gym.id, name: "Unlimited", kind: "monthly", priceCents: 15000 },
      { gymId: gym.id, name: "10 pack", kind: "pack", priceCents: 18000, credits: 10, validDays: 90 },
    ])
    .returning();
  return { gym, monthly, pack };
}

export async function makeMember(gymId: string, plan?: typeof schema.plan.$inferSelect, credits?: number) {
  n++;
  const [member] = await db
    .insert(schema.member)
    .values({ gymId, name: `Member ${n}`, email: `m${n}-${Date.now()}@test.dev`, checkinCode: `CODE${n}X${Date.now()}` })
    .returning();
  let membership = null;
  if (plan) {
    membership = await grantMembership(db, { gymId, memberId: member.id, plan, paidVia: "cash" });
    if (credits != null && membership) {
      await db
        .update(schema.membership)
        .set({ creditsRemaining: credits })
        .where(sql`${schema.membership.id} = ${membership.id}`);
    }
  }
  return { member, membership };
}

export async function makeClass(gymId: string, startsAt: Date, capacity = 12) {
  const [cls] = await db
    .insert(schema.classSession)
    .values({ gymId, title: "WOD", startsAt, durationMin: 60, capacity })
    .returning();
  return cls;
}

export async function credits(membershipId: string) {
  const row = await db.query.membership.findFirst({ where: (m, { eq }) => eq(m.id, membershipId) });
  return row?.creditsRemaining ?? null;
}
