"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { BookingError, checkIn } from "@/lib/booking";
import { requireStaff } from "@/lib/tenant";

export type CheckinOutcome =
  | { ok: true; name: string; classTitle: string | null; hadEntitlement: boolean; status: string }
  | { ok: false; error: string };

export async function checkInMember(slug: string, input: { code?: string; memberId?: string }): Promise<CheckinOutcome> {
  const { gym, staff, user } = await requireStaff(slug);
  try {
    const r = await checkIn({ gymId: gym.id, staffId: staff.id, code: input.code, memberId: input.memberId });
    await audit(gym.id, user.id, "checkin", { memberId: r.member.id, class: r.classTitle, ok: r.hadEntitlement });
    revalidatePath(`/g/${slug}/admin/check-in`);
    return { ok: true, name: r.member.name, classTitle: r.classTitle, hadEntitlement: r.hadEntitlement, status: r.member.status };
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, error: e.message };
    throw e;
  }
}
