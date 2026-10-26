import { and, asc, count, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { usableMembershipsQuery } from "./memberships";

export const LATE_CANCEL_HOURS = 2;
export const CHECKIN_WINDOW_MIN = 60;

export class BookingError extends Error {}

type ClassRow = typeof schema.classSession.$inferSelect;
const SEATED = ["booked", "attended"] as const;

async function lockClass(tx: Tx, gymId: string, classSessionId: string) {
  const [cls] = await tx
    .select()
    .from(schema.classSession)
    .where(and(eq(schema.classSession.id, classSessionId), eq(schema.classSession.gymId, gymId)))
    .for("update");
  return cls ?? null;
}

async function seatsTaken(tx: Tx, classSessionId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(schema.booking)
    .where(and(eq(schema.booking.classSessionId, classSessionId), inArray(schema.booking.status, [...SEATED])));
  return row.n;
}

/** Take one credit (or none, for unlimited) from the best membership. Null when nothing can pay. */
async function debitEntitlement(tx: Tx, memberId: string, at: Date) {
  const [m] = await usableMembershipsQuery(tx, memberId, at).limit(1).for("update");
  if (!m) return null;
  if (m.creditsRemaining != null) {
    await tx
      .update(schema.membership)
      .set({ creditsRemaining: sql`${schema.membership.creditsRemaining} - 1` })
      .where(eq(schema.membership.id, m.id));
  }
  return { membershipId: m.id, debited: m.creditsRemaining != null };
}

async function hasEntitlement(tx: Tx | typeof db, memberId: string, at: Date) {
  const rows = await usableMembershipsQuery(tx, memberId, at).limit(1);
  return rows.length > 0;
}

async function refundCredit(tx: Tx, membershipId: string | null) {
  if (!membershipId) return;
  await tx
    .update(schema.membership)
    .set({ creditsRemaining: sql`${schema.membership.creditsRemaining} + 1` })
    .where(eq(schema.membership.id, membershipId));
}

export type BookResult = { status: "booked" } | { status: "waitlisted"; position: number };

/**
 * Book a seat, or join the waitlist when the class is full. The class row is
 * locked for the whole transaction, so concurrent bookings queue up behind each
 * other and capacity can't be exceeded.
 */
export async function bookClass(input: {
  gymId: string;
  memberId: string;
  classSessionId: string;
  now?: Date;
}): Promise<BookResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const cls = await lockClass(tx, input.gymId, input.classSessionId);
    if (!cls || cls.cancelledAt) throw new BookingError("This class isn't running.");
    if (cls.startsAt <= now) throw new BookingError("This class has already started.");

    const member = await tx.query.member.findFirst({
      where: and(eq(schema.member.id, input.memberId), eq(schema.member.gymId, input.gymId)),
    });
    if (!member || member.status !== "active") throw new BookingError("Your membership isn't active. Talk to the front desk.");

    const existing = await tx.query.booking.findFirst({
      where: and(eq(schema.booking.classSessionId, cls.id), eq(schema.booking.memberId, member.id)),
    });
    if (existing?.status === "booked") return { status: "booked" } as const;
    if (existing?.status === "waitlisted") {
      return { status: "waitlisted", position: await waitlistPosition(tx, cls.id, existing.createdAt) } as const;
    }

    const upsert = (values: Partial<typeof schema.booking.$inferInsert>) =>
      tx
        .insert(schema.booking)
        .values({
          gymId: input.gymId,
          classSessionId: cls.id,
          memberId: member.id,
          status: "booked",
          ...values,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.booking.classSessionId, schema.booking.memberId],
          set: {
            status: values.status ?? "booked",
            membershipId: values.membershipId ?? null,
            creditDebited: values.creditDebited ?? false,
            createdAt: now,
            updatedAt: now,
          },
        });

    if ((await seatsTaken(tx, cls.id)) < cls.capacity) {
      const paid = await debitEntitlement(tx, member.id, cls.startsAt);
      if (!paid) throw new BookingError("You need an active pass to book. Grab one under Plans.");
      await upsert({ status: "booked", membershipId: paid.membershipId, creditDebited: paid.debited });
      return { status: "booked" } as const;
    }

    // Only queue people who could actually take the seat when it opens.
    if (!(await hasEntitlement(tx, member.id, cls.startsAt))) {
      throw new BookingError("This class is full, and you need an active pass to join the waitlist.");
    }
    await upsert({ status: "waitlisted" });
    return { status: "waitlisted", position: await waitlistPosition(tx, cls.id, now) } as const;
  });
}

async function waitlistPosition(tx: Tx, classSessionId: string, createdAt: Date) {
  const [row] = await tx
    .select({ n: count() })
    .from(schema.booking)
    .where(
      and(
        eq(schema.booking.classSessionId, classSessionId),
        eq(schema.booking.status, "waitlisted"),
        lte(schema.booking.createdAt, createdAt),
      ),
    );
  return row.n;
}

/**
 * Fill open seats from the waitlist, oldest first. Anyone whose pass ran out
 * while waiting is skipped and dropped from the list.
 */
async function promoteWaitlist(tx: Tx, cls: ClassRow, now: Date) {
  if (cls.cancelledAt || cls.startsAt <= now) return [];
  let open = cls.capacity - (await seatsTaken(tx, cls.id));
  if (open <= 0) return [];
  const waiting = await tx
    .select()
    .from(schema.booking)
    .where(and(eq(schema.booking.classSessionId, cls.id), eq(schema.booking.status, "waitlisted")))
    .orderBy(asc(schema.booking.createdAt))
    .for("update");

  const promoted: string[] = [];
  for (const w of waiting) {
    if (open <= 0) break;
    const paid = await debitEntitlement(tx, w.memberId, cls.startsAt);
    if (!paid) {
      await tx.update(schema.booking).set({ status: "cancelled", updatedAt: now }).where(eq(schema.booking.id, w.id));
      continue;
    }
    await tx
      .update(schema.booking)
      .set({ status: "booked", membershipId: paid.membershipId, creditDebited: paid.debited, updatedAt: now })
      .where(eq(schema.booking.id, w.id));
    promoted.push(w.memberId);
    open--;
  }
  return promoted;
}

export type CancelResult = { status: "cancelled" | "late_cancel"; refunded: boolean; promoted: string[] };

/**
 * Cancel a booking or leave the waitlist. Cancelling at least LATE_CANCEL_HOURS
 * before start refunds the credit; later cancels forfeit it. Staff can waive the
 * late fee.
 */
export async function cancelBooking(input: {
  gymId: string;
  bookingId: string;
  memberId?: string;
  waiveLateFee?: boolean;
  now?: Date;
}): Promise<CancelResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const found = await tx.query.booking.findFirst({
      where: and(eq(schema.booking.id, input.bookingId), eq(schema.booking.gymId, input.gymId)),
    });
    if (!found || (input.memberId && found.memberId !== input.memberId)) throw new BookingError("Booking not found.");
    const cls = await lockClass(tx, input.gymId, found.classSessionId);
    if (!cls) throw new BookingError("Booking not found.");
    const [b] = await tx.select().from(schema.booking).where(eq(schema.booking.id, found.id)).for("update");

    if (b.status === "waitlisted") {
      await tx.update(schema.booking).set({ status: "cancelled", updatedAt: now }).where(eq(schema.booking.id, b.id));
      return { status: "cancelled", refunded: false, promoted: [] };
    }
    if (b.status !== "booked") throw new BookingError("This booking can't be cancelled.");
    if (cls.startsAt <= now) throw new BookingError("This class has already started.");

    const late = !input.waiveLateFee && cls.startsAt.getTime() - now.getTime() < LATE_CANCEL_HOURS * 3_600_000;
    const refunded = !late && b.creditDebited;
    if (refunded) await refundCredit(tx, b.membershipId);
    await tx
      .update(schema.booking)
      .set({ status: late ? "late_cancel" : "cancelled", creditDebited: !refunded && b.creditDebited, updatedAt: now })
      .where(eq(schema.booking.id, b.id));

    const promoted = await promoteWaitlist(tx, cls, now);
    return { status: late ? "late_cancel" : "cancelled", refunded, promoted };
  });
}

/** Change a class's capacity; extra seats are offered to the waitlist straight away. */
export async function setCapacity(input: { gymId: string; classSessionId: string; capacity: number; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const cls = await lockClass(tx, input.gymId, input.classSessionId);
    if (!cls) throw new BookingError("Class not found.");
    const taken = await seatsTaken(tx, cls.id);
    if (input.capacity < taken) throw new BookingError(`${taken} people are already booked. Capacity can't go below that.`);
    const [updated] = await tx
      .update(schema.classSession)
      .set({ capacity: input.capacity })
      .where(eq(schema.classSession.id, cls.id))
      .returning();
    return promoteWaitlist(tx, updated, now);
  });
}

/** Cancel a whole class and give every credit back. */
export async function cancelClass(input: { gymId: string; classSessionId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const cls = await lockClass(tx, input.gymId, input.classSessionId);
    if (!cls || cls.cancelledAt) return [];
    const bookings = await tx
      .select()
      .from(schema.booking)
      .where(and(eq(schema.booking.classSessionId, cls.id), inArray(schema.booking.status, ["booked", "waitlisted"])))
      .for("update");
    for (const b of bookings) {
      if (b.status === "booked" && b.creditDebited) await refundCredit(tx, b.membershipId);
    }
    await tx
      .update(schema.booking)
      .set({ status: "cancelled", creditDebited: false, updatedAt: now })
      .where(and(eq(schema.booking.classSessionId, cls.id), inArray(schema.booking.status, ["booked", "waitlisted"])));
    await tx.update(schema.classSession).set({ cancelledAt: now }).where(eq(schema.classSession.id, cls.id));
    return bookings.map((b) => b.memberId);
  });
}

/** Mark the attendance of a booked member by staff. */
export async function markAttendance(input: { gymId: string; bookingId: string; attended: boolean }) {
  const [b] = await db
    .update(schema.booking)
    .set({ status: input.attended ? "attended" : "no_show", updatedAt: new Date() })
    .where(
      and(
        eq(schema.booking.id, input.bookingId),
        eq(schema.booking.gymId, input.gymId),
        inArray(schema.booking.status, ["booked", "attended", "no_show"]),
      ),
    )
    .returning();
  return b ?? null;
}

/**
 * Nightly job: anyone still "booked" in a finished class didn't show; anyone
 * still waiting never got in. Classes are closed once so this is idempotent.
 */
export async function closeFinishedClasses(now = new Date()) {
  return db.transaction(async (tx) => {
    const finished = await tx
      .select({ id: schema.classSession.id })
      .from(schema.classSession)
      .where(
        and(
          isNull(schema.classSession.closedAt),
          sql`${schema.classSession.startsAt} + make_interval(mins => ${schema.classSession.durationMin}) < ${now.toISOString()}::timestamptz`,
        ),
      )
      .for("update", { skipLocked: true });
    if (finished.length === 0) return { closed: 0 };
    const ids = finished.map((f) => f.id);
    await tx
      .update(schema.booking)
      .set({ status: "no_show", updatedAt: now })
      .where(and(inArray(schema.booking.classSessionId, ids), eq(schema.booking.status, "booked")));
    await tx
      .update(schema.booking)
      .set({ status: "cancelled", updatedAt: now })
      .where(and(inArray(schema.booking.classSessionId, ids), eq(schema.booking.status, "waitlisted")));
    await tx.update(schema.classSession).set({ closedAt: now }).where(inArray(schema.classSession.id, ids));
    return { closed: ids.length };
  });
}

export type CheckinResult = {
  member: typeof schema.member.$inferSelect;
  classTitle: string | null;
  hadEntitlement: boolean;
};

/**
 * Front-desk check-in by QR code or member id. Marks a booking for a class
 * starting within the check-in window as attended; otherwise logs an open-gym
 * visit.
 */
export async function checkIn(input: {
  gymId: string;
  staffId: string | null;
  code?: string;
  memberId?: string;
  now?: Date;
}): Promise<CheckinResult> {
  const now = input.now ?? new Date();
  const member = await db.query.member.findFirst({
    where: and(
      eq(schema.member.gymId, input.gymId),
      input.code ? eq(schema.member.checkinCode, input.code.trim().toUpperCase()) : eq(schema.member.id, input.memberId ?? ""),
    ),
  });
  if (!member) throw new BookingError("No member with that code at this gym.");

  const windowMs = CHECKIN_WINDOW_MIN * 60_000;
  const [match] = await db
    .select({ booking: schema.booking, cls: schema.classSession })
    .from(schema.booking)
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.booking.classSessionId))
    .where(
      and(
        eq(schema.booking.memberId, member.id),
        eq(schema.booking.status, "booked"),
        gte(schema.classSession.startsAt, new Date(now.getTime() - windowMs)),
        lte(schema.classSession.startsAt, new Date(now.getTime() + windowMs)),
      ),
    )
    .orderBy(asc(schema.classSession.startsAt))
    .limit(1);

  if (match) {
    await db
      .update(schema.booking)
      .set({ status: "attended", updatedAt: now })
      .where(eq(schema.booking.id, match.booking.id));
  }
  const hadEntitlement = member.status === "active" && (!!match || (await hasEntitlement(db, member.id, now)));
  await db.insert(schema.checkin).values({
    gymId: input.gymId,
    memberId: member.id,
    bookingId: match?.booking.id ?? null,
    byStaffId: input.staffId,
    hadEntitlement,
    createdAt: now,
  });
  return { member, classTitle: match?.cls.title ?? null, hadEntitlement };
}
