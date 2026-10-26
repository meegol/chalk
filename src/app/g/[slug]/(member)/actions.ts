"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { bookClass, BookingError, cancelBooking } from "@/lib/booking";
import { requireMember } from "@/lib/tenant";
import type { ActionState } from "@/lib/utils";

export async function book(slug: string, classId: string, _: ActionState): Promise<ActionState> {
  const { gym, member, user } = await requireMember(slug);
  try {
    const r = await bookClass({ gymId: gym.id, memberId: member.id, classSessionId: classId });
    await audit(gym.id, user.id, "booking.created", { classId, status: r.status });
    revalidatePath(`/g/${slug}`, "layout");
    return { ok: r.status === "booked" ? "You're in" : `On the waitlist at #${r.position}` };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
}

export async function cancel(slug: string, bookingId: string, _: ActionState): Promise<ActionState> {
  const { gym, member, user } = await requireMember(slug);
  try {
    const r = await cancelBooking({ gymId: gym.id, bookingId, memberId: member.id });
    await audit(gym.id, user.id, "booking.cancelled", { bookingId, status: r.status });
    revalidatePath(`/g/${slug}`, "layout");
    return { ok: r.status === "late_cancel" ? "Cancelled. Late cancel, so the credit is used." : "Cancelled" };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
}
