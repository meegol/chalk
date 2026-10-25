"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/tenant";
import type { ActionState } from "@/lib/utils";

const planSchema = z
  .object({
    name: z.string().trim().min(2, "Name the plan").max(40),
    kind: z.enum(["monthly", "pack", "dropin"]),
    price: z.coerce.number().min(1, "Price must be at least $1").max(10_000),
    credits: z.coerce.number().int().min(1).max(200).optional(),
    validDays: z.coerce.number().int().min(1).max(730).optional(),
    description: z.string().trim().max(160).optional(),
  })
  .transform((p) => ({
    name: p.name,
    kind: p.kind,
    priceCents: Math.round(p.price * 100),
    credits: p.kind === "monthly" ? null : p.kind === "dropin" ? 1 : (p.credits ?? 10),
    validDays: p.kind === "monthly" ? null : (p.validDays ?? (p.kind === "dropin" ? 30 : 90)),
    description: p.description || null,
  }));

function parse(form: FormData) {
  const raw = Object.fromEntries([...form].filter(([, v]) => v !== ""));
  return planSchema.safeParse(raw);
}

export async function createPlan(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug, ["owner"]);
  const parsed = parse(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [p] = await db.insert(schema.plan).values({ ...parsed.data, gymId: gym.id }).returning();
  await audit(gym.id, user.id, "plan.created", { planId: p.id, name: p.name });
  revalidatePath(`/g/${slug}/admin/plans`);
  return { ok: `${p.name} created` };
}

export async function updatePlan(slug: string, planId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug, ["owner"]);
  const parsed = parse(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Existing memberships keep the terms they bought; edits only affect new sales.
  await db
    .update(schema.plan)
    .set({ ...parsed.data, stripePriceId: null })
    .where(and(eq(schema.plan.id, planId), eq(schema.plan.gymId, gym.id)));
  await audit(gym.id, user.id, "plan.updated", { planId });
  revalidatePath(`/g/${slug}/admin/plans`);
  return { ok: "Saved" };
}

export async function togglePlan(slug: string, planId: string, active: boolean) {
  const { gym, user } = await requireStaff(slug, ["owner"]);
  await db
    .update(schema.plan)
    .set({ active })
    .where(and(eq(schema.plan.id, planId), eq(schema.plan.gymId, gym.id)));
  await audit(gym.id, user.id, active ? "plan.activated" : "plan.archived", { planId });
  revalidatePath(`/g/${slug}/admin/plans`);
}
