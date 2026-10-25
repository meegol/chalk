"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { createMember, LimitError } from "@/lib/members";
import { grantMembership } from "@/lib/memberships";
import { requireStaff } from "@/lib/tenant";
import type { ActionState } from "@/lib/utils";

const addSchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  email: z.email("Enter a valid email"),
});

export async function addMember(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug);
  const parsed = addSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let id: string;
  try {
    const m = await createMember(gym, parsed.data);
    id = m.id;
  } catch (e) {
    if (e instanceof LimitError) return { error: e.message };
    throw e;
  }
  await audit(gym.id, user.id, "member.added", { memberId: id, email: parsed.data.email });
  redirect(`/g/${slug}/admin/members/${id}`);
}

export async function setMemberStatus(slug: string, memberId: string, form: FormData) {
  const { gym, user } = await requireStaff(slug);
  const status = z.enum(["active", "paused", "cancelled"]).parse(form.get("status"));
  await db
    .update(schema.member)
    .set({ status })
    .where(and(eq(schema.member.id, memberId), eq(schema.member.gymId, gym.id)));
  await audit(gym.id, user.id, "member.status", { memberId, status });
  revalidatePath(`/g/${slug}/admin/members/${memberId}`);
}

export async function recordCashPayment(slug: string, memberId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug);
  const planId = String(form.get("planId") ?? "");
  const [member, plan] = await Promise.all([
    db.query.member.findFirst({ where: and(eq(schema.member.id, memberId), eq(schema.member.gymId, gym.id)) }),
    db.query.plan.findFirst({ where: and(eq(schema.plan.id, planId), eq(schema.plan.gymId, gym.id)) }),
  ]);
  if (!member || !plan) return { error: "Pick a plan" };
  await grantMembership(db, { gymId: gym.id, memberId, plan, paidVia: "cash" });
  await audit(gym.id, user.id, "membership.cash", { memberId, planId, priceCents: plan.priceCents });
  revalidatePath(`/g/${slug}/admin/members/${memberId}`);
  return { ok: `${plan.name} added` };
}

export async function cancelMembership(slug: string, memberId: string, membershipId: string) {
  const { gym, user } = await requireStaff(slug);
  await db
    .update(schema.membership)
    .set({ status: "cancelled" })
    .where(and(eq(schema.membership.id, membershipId), eq(schema.membership.gymId, gym.id)));
  await audit(gym.id, user.id, "membership.cancelled", { memberId, membershipId });
  revalidatePath(`/g/${slug}/admin/members/${memberId}`);
}
