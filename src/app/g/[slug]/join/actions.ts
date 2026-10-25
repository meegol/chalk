"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { createMember, LimitError } from "@/lib/members";
import { requireUser } from "@/lib/session";
import { getGymBySlug } from "@/lib/tenant";
import type { ActionState } from "@/lib/utils";

export async function joinGym(slug: string, _: ActionState): Promise<ActionState> {
  const user = await requireUser(`/g/${slug}/join`);
  const gym = await getGymBySlug(slug);
  if (!gym) redirect("/home");
  try {
    const m = await createMember(gym, { name: user.name, email: user.email, userId: user.id });
    await audit(gym.id, user.id, "member.joined", { memberId: m.id });
  } catch (e) {
    if (e instanceof LimitError) return { error: `${gym.name} isn't taking new online signups right now. Ask at the front desk.` };
    throw e;
  }
  redirect(`/g/${slug}`);
}
