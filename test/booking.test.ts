import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import {
  bookClass,
  BookingError,
  cancelBooking,
  cancelClass,
  checkIn,
  closeFinishedClasses,
  setCapacity,
} from "@/lib/booking";
import { credits, makeClass, makeGym, makeMember, resetDb } from "./factories";

const HOUR = 3_600_000;
const now = new Date("2026-11-02T12:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * HOUR);

async function bookingOf(classSessionId: string, memberId: string) {
  return db.query.booking.findFirst({
    where: and(eq(schema.booking.classSessionId, classSessionId), eq(schema.booking.memberId, memberId)),
  });
}

beforeEach(resetDb);
afterAll(resetDb);

describe("bookClass", () => {
  it("books a seat and takes a credit from a pack", async () => {
    const { gym, pack } = await makeGym();
    const { member, membership } = await makeMember(gym.id, pack);
    const cls = await makeClass(gym.id, inHours(24));

    expect(await bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now })).toEqual({
      status: "booked",
    });
    expect(await credits(membership!.id)).toBe(9);
  });

  it("uses an unlimited membership before a pack", async () => {
    const { gym, monthly, pack } = await makeGym();
    const { member, membership: packMembership } = await makeMember(gym.id, pack);
    await db.insert(schema.membership).values({
      gymId: gym.id,
      memberId: member.id,
      planId: monthly.id,
      paidVia: "cash",
      expiresAt: inHours(24 * 30),
    });
    const cls = await makeClass(gym.id, inHours(24));

    await bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now });
    expect(await credits(packMembership!.id)).toBe(10);
  });

  it("refuses members with no pass", async () => {
    const { gym } = await makeGym();
    const { member } = await makeMember(gym.id);
    const cls = await makeClass(gym.id, inHours(24));
    await expect(bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now })).rejects.toThrow(
      BookingError,
    );
  });

  it("refuses classes that already started", async () => {
    const { gym, monthly } = await makeGym();
    const { member } = await makeMember(gym.id, monthly);
    const cls = await makeClass(gym.id, inHours(-0.5));
    await expect(bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now })).rejects.toThrow(
      /already started/,
    );
  });

  it("waitlists once the class is full", async () => {
    const { gym, monthly } = await makeGym();
    const cls = await makeClass(gym.id, inHours(24), 1);
    const a = await makeMember(gym.id, monthly);
    const b = await makeMember(gym.id, monthly);
    const c = await makeMember(gym.id, monthly);

    await bookClass({ gymId: gym.id, memberId: a.member.id, classSessionId: cls.id, now });
    expect(await bookClass({ gymId: gym.id, memberId: b.member.id, classSessionId: cls.id, now })).toEqual({
      status: "waitlisted",
      position: 1,
    });
    expect(
      await bookClass({ gymId: gym.id, memberId: c.member.id, classSessionId: cls.id, now: new Date(now.getTime() + 1000) }),
    ).toEqual({ status: "waitlisted", position: 2 });
  });

  it("is idempotent for a member who is already booked", async () => {
    const { gym, pack } = await makeGym();
    const { member, membership } = await makeMember(gym.id, pack);
    const cls = await makeClass(gym.id, inHours(24));
    await bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now });
    await bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now });
    expect(await credits(membership!.id)).toBe(9);
  });

  it("never oversells under concurrent bookings", async () => {
    const { gym, monthly } = await makeGym();
    const cls = await makeClass(gym.id, inHours(24), 12);
    const members = await Promise.all(Array.from({ length: 20 }, () => makeMember(gym.id, monthly)));

    const results = await Promise.all(
      members.map(({ member }) => bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now })),
    );

    expect(results.filter((r) => r.status === "booked")).toHaveLength(12);
    expect(results.filter((r) => r.status === "waitlisted")).toHaveLength(8);
    const rows = await db.query.booking.findMany({ where: eq(schema.booking.classSessionId, cls.id) });
    expect(rows.filter((r) => r.status === "booked")).toHaveLength(12);
  });

  it("can't book a class at another gym", async () => {
    const { gym, monthly } = await makeGym();
    const other = await makeGym();
    const { member } = await makeMember(gym.id, monthly);
    const cls = await makeClass(other.gym.id, inHours(24));
    await expect(bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now })).rejects.toThrow(
      /isn't running/,
    );
  });
});

describe("cancelBooking", () => {
  it("refunds the credit when cancelled early", async () => {
    const { gym, pack } = await makeGym();
    const { member, membership } = await makeMember(gym.id, pack);
    const cls = await makeClass(gym.id, inHours(24));
    await bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now });
    const b = await bookingOf(cls.id, member.id);

    const r = await cancelBooking({ gymId: gym.id, bookingId: b!.id, memberId: member.id, now });
    expect(r).toMatchObject({ status: "cancelled", refunded: true });
    expect(await credits(membership!.id)).toBe(10);
  });

  it("keeps the credit on a late cancel", async () => {
    const { gym, pack } = await makeGym();
    const { member, membership } = await makeMember(gym.id, pack);
    const cls = await makeClass(gym.id, inHours(1));
    await bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now });
    const b = await bookingOf(cls.id, member.id);

    const r = await cancelBooking({ gymId: gym.id, bookingId: b!.id, now });
    expect(r).toMatchObject({ status: "late_cancel", refunded: false });
    expect(await credits(membership!.id)).toBe(9);
  });

  it("lets staff waive the late fee", async () => {
    const { gym, pack } = await makeGym();
    const { member, membership } = await makeMember(gym.id, pack);
    const cls = await makeClass(gym.id, inHours(1));
    await bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now });
    const b = await bookingOf(cls.id, member.id);

    await cancelBooking({ gymId: gym.id, bookingId: b!.id, waiveLateFee: true, now });
    expect(await credits(membership!.id)).toBe(10);
  });

  it("promotes the oldest waitlisted member and charges them", async () => {
    const { gym, pack } = await makeGym();
    const cls = await makeClass(gym.id, inHours(24), 1);
    const a = await makeMember(gym.id, pack);
    const b = await makeMember(gym.id, pack);
    const c = await makeMember(gym.id, pack);
    await bookClass({ gymId: gym.id, memberId: a.member.id, classSessionId: cls.id, now });
    await bookClass({ gymId: gym.id, memberId: b.member.id, classSessionId: cls.id, now: new Date(now.getTime() + 1) });
    await bookClass({ gymId: gym.id, memberId: c.member.id, classSessionId: cls.id, now: new Date(now.getTime() + 2) });
    expect(await credits(b.membership!.id)).toBe(10);

    const booking = await bookingOf(cls.id, a.member.id);
    const r = await cancelBooking({ gymId: gym.id, bookingId: booking!.id, now });

    expect(r.promoted).toEqual([b.member.id]);
    expect((await bookingOf(cls.id, b.member.id))?.status).toBe("booked");
    expect((await bookingOf(cls.id, c.member.id))?.status).toBe("waitlisted");
    expect(await credits(b.membership!.id)).toBe(9);
  });

  it("skips waitlisted members whose pass ran out", async () => {
    const { gym, pack } = await makeGym();
    const cls = await makeClass(gym.id, inHours(24), 1);
    const a = await makeMember(gym.id, pack);
    const b = await makeMember(gym.id, pack, 1);
    const c = await makeMember(gym.id, pack);
    const other = await makeClass(gym.id, inHours(30), 5);
    await bookClass({ gymId: gym.id, memberId: a.member.id, classSessionId: cls.id, now });
    await bookClass({ gymId: gym.id, memberId: b.member.id, classSessionId: cls.id, now: new Date(now.getTime() + 1) });
    await bookClass({ gymId: gym.id, memberId: c.member.id, classSessionId: cls.id, now: new Date(now.getTime() + 2) });
    // b spends their last credit elsewhere while waiting.
    await bookClass({ gymId: gym.id, memberId: b.member.id, classSessionId: other.id, now });

    const booking = await bookingOf(cls.id, a.member.id);
    const r = await cancelBooking({ gymId: gym.id, bookingId: booking!.id, now });

    expect(r.promoted).toEqual([c.member.id]);
    expect((await bookingOf(cls.id, b.member.id))?.status).toBe("cancelled");
  });

  it("won't let a member cancel someone else's booking", async () => {
    const { gym, monthly } = await makeGym();
    const cls = await makeClass(gym.id, inHours(24));
    const a = await makeMember(gym.id, monthly);
    const b = await makeMember(gym.id, monthly);
    await bookClass({ gymId: gym.id, memberId: a.member.id, classSessionId: cls.id, now });
    const booking = await bookingOf(cls.id, a.member.id);
    await expect(cancelBooking({ gymId: gym.id, bookingId: booking!.id, memberId: b.member.id, now })).rejects.toThrow(
      BookingError,
    );
  });
});

describe("class changes", () => {
  it("fills new seats from the waitlist when capacity goes up", async () => {
    const { gym, monthly } = await makeGym();
    const cls = await makeClass(gym.id, inHours(24), 1);
    const a = await makeMember(gym.id, monthly);
    const b = await makeMember(gym.id, monthly);
    await bookClass({ gymId: gym.id, memberId: a.member.id, classSessionId: cls.id, now });
    await bookClass({ gymId: gym.id, memberId: b.member.id, classSessionId: cls.id, now });

    expect(await setCapacity({ gymId: gym.id, classSessionId: cls.id, capacity: 2, now })).toEqual([b.member.id]);
    await expect(setCapacity({ gymId: gym.id, classSessionId: cls.id, capacity: 1, now })).rejects.toThrow(/already booked/);
  });

  it("refunds everyone when a class is cancelled", async () => {
    const { gym, pack } = await makeGym();
    const cls = await makeClass(gym.id, inHours(1));
    const a = await makeMember(gym.id, pack);
    await bookClass({ gymId: gym.id, memberId: a.member.id, classSessionId: cls.id, now });

    await cancelClass({ gymId: gym.id, classSessionId: cls.id, now });
    expect(await credits(a.membership!.id)).toBe(10);
    expect((await bookingOf(cls.id, a.member.id))?.status).toBe("cancelled");
  });

  it("marks no-shows when a finished class is closed, once", async () => {
    const { gym, monthly } = await makeGym();
    const cls = await makeClass(gym.id, inHours(2), 1);
    const a = await makeMember(gym.id, monthly);
    const b = await makeMember(gym.id, monthly);
    await bookClass({ gymId: gym.id, memberId: a.member.id, classSessionId: cls.id, now });
    await bookClass({ gymId: gym.id, memberId: b.member.id, classSessionId: cls.id, now });

    expect(await closeFinishedClasses(inHours(1))).toEqual({ closed: 0 });
    expect(await closeFinishedClasses(inHours(4))).toEqual({ closed: 1 });
    expect(await closeFinishedClasses(inHours(5))).toEqual({ closed: 0 });
    expect((await bookingOf(cls.id, a.member.id))?.status).toBe("no_show");
    expect((await bookingOf(cls.id, b.member.id))?.status).toBe("cancelled");
  });
});

describe("checkIn", () => {
  it("marks a booking for a class starting soon as attended", async () => {
    const { gym, monthly } = await makeGym();
    const cls = await makeClass(gym.id, inHours(0.5));
    const { member } = await makeMember(gym.id, monthly);
    await bookClass({ gymId: gym.id, memberId: member.id, classSessionId: cls.id, now });

    const r = await checkIn({ gymId: gym.id, staffId: null, code: member.checkinCode.toLowerCase(), now });
    expect(r).toMatchObject({ classTitle: "WOD", hadEntitlement: true });
    expect((await bookingOf(cls.id, member.id))?.status).toBe("attended");
  });

  it("logs an open-gym visit and flags members without a pass", async () => {
    const { gym } = await makeGym();
    const { member } = await makeMember(gym.id);
    const r = await checkIn({ gymId: gym.id, staffId: null, memberId: member.id, now });
    expect(r).toMatchObject({ classTitle: null, hadEntitlement: false });
  });

  it("rejects codes from another gym", async () => {
    const { gym } = await makeGym();
    const other = await makeGym();
    const { member } = await makeMember(other.gym.id);
    await expect(checkIn({ gymId: gym.id, staffId: null, code: member.checkinCode, now })).rejects.toThrow(/No member/);
  });
});
