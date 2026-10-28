/**
 * Demo data: one gym ("Ironside Strength"), three staff, two dozen members,
 * a weekly timetable, a week of history and a busy week ahead.
 *
 *   npm run db:seed
 *
 * Safe to rerun: it deletes the demo gym and demo users first.
 */
import "dotenv/config";
import { eq, inArray, like, or } from "drizzle-orm";
import { db, schema } from "../src/db";
import { auth } from "../src/lib/auth";
import { bookClass, closeFinishedClasses } from "../src/lib/booking";
import { grantMembership } from "../src/lib/memberships";
import { generateClasses } from "../src/lib/schedule";
import { addDays, dayKey, zonedToUtc } from "../src/lib/time";
import { randomCode } from "../src/lib/utils";

const SLUG = "ironside";
const PASSWORD = "chalkdemo";
const TZ = "America/Chicago";

// Deterministic randomness so the demo looks the same after every reseed.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const FIRST = ["Maya", "Jordan", "Priya", "Luis", "Hana", "Marcus", "Ines", "Tomás", "Aaliyah", "Ben", "Chen", "Dara", "Elif", "Femi", "Grace", "Hugo", "Ivy", "Jae", "Kofi", "Lena", "Mateo", "Nia", "Owen", "Rosa"];
const LAST = ["Okafor", "Reyes", "Nakamura", "Silva", "Kowalski", "Haddad", "Brennan", "Mensah", "Ortiz", "Lindqvist", "Patel", "Moreau"];

async function user(name: string, email: string) {
  const res = await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } });
  return res.user;
}

async function main() {
  // Clean slate for the demo tenant only.
  await db.delete(schema.gym).where(eq(schema.gym.slug, SLUG));
  await db.delete(schema.user).where(or(like(schema.user.email, "%@demo.chalk.dev"), inArray(schema.user.email, ["owner@chalk.dev", "coach@chalk.dev", "member@chalk.dev"])));

  const owner = await user("Sam Ironside", "owner@chalk.dev");
  const coachUser = await user("Riley Chen", "coach@chalk.dev");
  const coach2User = await user("Dev Okoro", "coach2@demo.chalk.dev");
  const memberUser = await user("Alex Rivera", "member@chalk.dev");

  const [gym] = await db.insert(schema.gym).values({ slug: SLUG, name: "Ironside Strength", timezone: TZ }).returning();
  const [ownerStaff, coach, coach2] = await db
    .insert(schema.staff)
    .values([
      { gymId: gym.id, userId: owner.id, role: "owner" },
      { gymId: gym.id, userId: coachUser.id, role: "coach" },
      { gymId: gym.id, userId: coach2User.id, role: "coach" },
    ])
    .returning();

  const [unlimited, pack, dropin] = await db
    .insert(schema.plan)
    .values([
      { gymId: gym.id, name: "Unlimited", kind: "monthly", priceCents: 16500, description: "Every class, every day. Billed monthly." },
      { gymId: gym.id, name: "10-class pack", kind: "pack", priceCents: 19000, credits: 10, validDays: 90, description: "Ten classes, use within 90 days." },
      { gymId: gym.id, name: "Drop-in", kind: "dropin", priceCents: 2500, credits: 1, validDays: 30, description: "One class. Visiting athletes welcome." },
    ])
    .returning();

  // Timetable. Weekday 0 = Sunday.
  const t = (title: string, weekdays: number[], startTime: string, capacity: number, coachId: string, durationMin = 60) =>
    weekdays.map((weekday) => ({ gymId: gym.id, title, weekday, startTime, capacity, coachId, durationMin }));
  await db.insert(schema.classTemplate).values([
    ...t("WOD", [1, 2, 3, 4, 5], "06:00", 16, coach.id),
    ...t("WOD", [1, 2, 3, 4, 5], "07:00", 16, coach2.id),
    ...t("Lunch WOD", [1, 3, 5], "12:00", 12, ownerStaff.id, 45),
    ...t("WOD", [1, 2, 3, 4, 5], "17:30", 16, coach.id),
    ...t("WOD", [1, 2, 3, 4, 5], "18:30", 16, coach2.id),
    ...t("Olympic Lifting", [2, 4], "19:30", 8, ownerStaff.id, 75),
    ...t("Partner WOD", [6], "09:00", 20, coach.id, 75),
    ...t("Open Gym", [0], "10:00", 24, ownerStaff.id, 120),
  ]);

  // Members: the demo login plus 23 others. Free plan cap is 30, so the meter reads 24/30.
  const memberRows = [
    { name: memberUser.name, email: memberUser.email, userId: memberUser.id },
    ...Array.from({ length: 23 }, (_, i) => {
      const name = `${FIRST[i]} ${pick(LAST)}`;
      return { name, email: `${FIRST[i].toLowerCase()}.${i}@demo.chalk.dev`, userId: null };
    }),
  ];
  const members = await db
    .insert(schema.member)
    .values(memberRows.map((m) => ({ ...m, gymId: gym.id, checkinCode: randomCode() })))
    .returning();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 8 * 86_400_000);
  for (const [i, m] of members.entries()) {
    if (i === 0) {
      await grantMembership(db, { gymId: gym.id, memberId: m.id, plan: pack, paidVia: "cash", now: weekAgo });
      continue;
    }
    const r = rand();
    if (r < 0.6) await grantMembership(db, { gymId: gym.id, memberId: m.id, plan: unlimited, paidVia: rand() < 0.5 ? "stripe" : "cash", now: weekAgo });
    else if (r < 0.85) await grantMembership(db, { gymId: gym.id, memberId: m.id, plan: pack, paidVia: "cash", now: weekAgo });
    else if (r < 0.93) await grantMembership(db, { gymId: gym.id, memberId: m.id, plan: dropin, paidVia: "cash", now: weekAgo });
    // the rest have no pass, which shows up at check-in
  }
  await db.update(schema.member).set({ status: "paused" }).where(eq(schema.member.id, members[members.length - 1].id));

  // History: build last week's classes by generating from a week ago.
  const pastStart = addDays(dayKey(now, TZ), -7);
  await generateClasses(gym, zonedToUtc(pastStart, "00:00", TZ), 7);
  await generateClasses(gym, now);

  const classes = await db.query.classSession.findMany({ where: eq(schema.classSession.gymId, gym.id) });
  for (const cls of classes) {
    const isPast = cls.startsAt <= now;
    const isSoon = !isPast && cls.startsAt.getTime() - now.getTime() < 3 * 86_400_000;
    const fill = isPast ? 0.35 + rand() * 0.5 : isSoon ? 0.4 + rand() * 0.75 : 0.1 + rand() * 0.4;
    const want = Math.round(cls.capacity * fill);
    const order = [...members.slice(1)].sort(() => rand() - 0.5);
    let placed = 0;
    for (const m of order) {
      if (placed >= want) break;
      try {
        // Book "as of" an hour before class so past classes accept bookings too.
        await bookClass({
          gymId: gym.id,
          memberId: m.id,
          classSessionId: cls.id,
          now: isPast ? new Date(cls.startsAt.getTime() - 3_600_000) : now,
        });
        placed++;
      } catch {
        // no pass or no credits left: skip
      }
    }
  }

  // Past classes: most people showed up.
  const pastIds = new Set(classes.filter((c) => c.startsAt <= now).map((c) => c.id));
  const bookingsWithClass = await db.query.booking.findMany({ where: eq(schema.booking.gymId, gym.id) });
  const attended = bookingsWithClass.filter((b) => pastIds.has(b.classSessionId) && b.status === "booked" && rand() < 0.88);
  if (attended.length) {
    await db.update(schema.booking).set({ status: "attended" }).where(inArray(schema.booking.id, attended.map((b) => b.id)));
    await db.insert(schema.checkin).values(
      attended.map((b) => {
        const cls = classes.find((c) => c.id === b.classSessionId)!;
        return { gymId: gym.id, memberId: b.memberId, bookingId: b.id, byStaffId: coach.id, hadEntitlement: true, createdAt: new Date(cls.startsAt.getTime() - 600_000) };
      }),
    );
  }
  await closeFinishedClasses(now);

  // The demo member: two upcoming bookings so the app isn't empty on first open.
  const upcoming = classes.filter((c) => c.startsAt > new Date(now.getTime() + 4 * 3_600_000)).sort((a, b) => +a.startsAt - +b.startsAt);
  for (const c of upcoming.slice(0, 6).filter((_, i) => i % 3 === 0)) {
    await bookClass({ gymId: gym.id, memberId: members[0].id, classSessionId: c.id, now }).catch(() => {});
  }

  await db.insert(schema.auditLog).values({ gymId: gym.id, actorUserId: owner.id, action: "gym.seeded", meta: { members: members.length } });

  console.log(`Seeded ${gym.name}: ${members.length} members, ${classes.length} classes.`);
  console.log(`Logins (password "${PASSWORD}"): owner@chalk.dev, coach@chalk.dev, member@chalk.dev`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
