import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { runDaily } from "@/lib/jobs";
import { generateClasses } from "@/lib/schedule";
import { makeGym, makeMember, resetDb } from "./factories";

beforeEach(resetDb);
afterAll(resetDb);

describe("schedule generation", () => {
  it("creates classes from templates in the gym's timezone and is idempotent", async () => {
    const { gym } = await makeGym({ timezone: "America/New_York" });
    // Monday and Wednesday 06:00
    await db.insert(schema.classTemplate).values([
      { gymId: gym.id, title: "WOD", weekday: 1, startTime: "06:00", capacity: 16 },
      { gymId: gym.id, title: "WOD", weekday: 3, startTime: "06:00", capacity: 16 },
    ]);
    const now = new Date("2026-10-26T00:00:00Z"); // Sunday evening in New York
    expect(await generateClasses(gym, now, 14)).toBe(4);
    expect(await generateClasses(gym, now, 14)).toBe(0);
    const first = await db.query.classSession.findFirst({ orderBy: (c, { asc }) => asc(c.startsAt) });
    expect(first?.startsAt.toISOString()).toBe("2026-10-26T10:00:00.000Z");
  });
});

describe("runDaily", () => {
  it("expires lapsed cash passes but leaves Stripe subscriptions to webhooks", async () => {
    const { gym, pack, monthly } = await makeGym();
    const { member } = await makeMember(gym.id);
    const past = new Date(Date.now() - 86_400_000);
    await db.insert(schema.membership).values([
      { gymId: gym.id, memberId: member.id, planId: pack.id, paidVia: "cash", creditsRemaining: 3, expiresAt: past },
      { gymId: gym.id, memberId: member.id, planId: monthly.id, paidVia: "stripe", expiresAt: past, stripeSubscriptionId: "sub_x" },
    ]);
    const r = await runDaily();
    expect(r.passesExpired).toBe(1);
    const rows = await db.query.membership.findMany({ where: eq(schema.membership.memberId, member.id) });
    expect(rows.map((m) => m.status).sort()).toEqual(["active", "expired"]);
  });
});
