import "server-only";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, dayKey, zonedToUtc } from "./time";

export type ClassListItem = {
  id: string;
  title: string;
  startsAt: Date;
  durationMin: number;
  capacity: number;
  cancelledAt: Date | null;
  coachName: string | null;
  booked: number;
  waitlisted: number;
  my?: { bookingId: string; status: string; position?: number } | null;
};

/** Classes between two local days (inclusive start, exclusive end) with seat counts. */
export async function getClasses(
  gym: { id: string; timezone: string },
  fromDay: string,
  toDay: string,
  memberId?: string,
): Promise<ClassListItem[]> {
  const from = zonedToUtc(fromDay, "00:00", gym.timezone);
  const to = zonedToUtc(toDay, "00:00", gym.timezone);
  const rows = await db
    .select({
      cls: schema.classSession,
      coachName: schema.user.name,
      booked: sql<number>`(select count(*)::int from ${schema.booking} b where b.class_session_id = ${schema.classSession.id} and b.status in ('booked','attended'))`,
      waitlisted: sql<number>`(select count(*)::int from ${schema.booking} b where b.class_session_id = ${schema.classSession.id} and b.status = 'waitlisted')`,
    })
    .from(schema.classSession)
    .leftJoin(schema.staff, eq(schema.staff.id, schema.classSession.coachId))
    .leftJoin(schema.user, eq(schema.user.id, schema.staff.userId))
    .where(
      and(eq(schema.classSession.gymId, gym.id), gte(schema.classSession.startsAt, from), lt(schema.classSession.startsAt, to)),
    )
    .orderBy(asc(schema.classSession.startsAt));

  let mine = new Map<string, { bookingId: string; status: string; position?: number }>();
  if (memberId && rows.length) {
    const ids = rows.map((r) => r.cls.id);
    const bookings = await db
      .select({
        b: schema.booking,
        position: sql<number>`(select count(*)::int from ${schema.booking} w where w.class_session_id = ${schema.booking.classSessionId} and w.status = 'waitlisted' and w.created_at <= ${schema.booking.createdAt})`,
      })
      .from(schema.booking)
      .where(and(eq(schema.booking.memberId, memberId), inArray(schema.booking.classSessionId, ids)));
    mine = new Map(
      bookings.map(({ b, position }) => [
        b.classSessionId,
        { bookingId: b.id, status: b.status, position: b.status === "waitlisted" ? position : undefined },
      ]),
    );
  }

  return rows.map(({ cls, coachName, booked, waitlisted }) => ({
    id: cls.id,
    title: cls.title,
    startsAt: cls.startsAt,
    durationMin: cls.durationMin,
    capacity: cls.capacity,
    cancelledAt: cls.cancelledAt,
    coachName,
    booked,
    waitlisted,
    my: memberId ? (mine.get(cls.id) ?? null) : undefined,
  }));
}

export function groupByDay<T extends { startsAt: Date }>(items: T[], timeZone: string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = dayKey(item.startsAt, timeZone);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

export function parseDay(value: unknown, fallback: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export function weekOf(day: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(day, i));
}

export async function getCoaches(gymId: string) {
  return db
    .select({ id: schema.staff.id, name: schema.user.name })
    .from(schema.staff)
    .innerJoin(schema.user, eq(schema.user.id, schema.staff.userId))
    .where(eq(schema.staff.gymId, gymId));
}
