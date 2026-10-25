"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { requireStaff } from "@/lib/tenant";
import { appUrl } from "@/lib/url";
import { randomToken, type ActionState } from "@/lib/utils";

const INVITE_DAYS = 7;

export async function updateGym(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug, ["owner"]);
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(60),
      timezone: z.string().refine((tz) => tz === "UTC" || Intl.supportedValuesOf("timeZone").includes(tz)),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Check the name and timezone" };
  await db.update(schema.gym).set(parsed.data).where(eq(schema.gym.id, gym.id));
  await audit(gym.id, user.id, "gym.updated", parsed.data);
  revalidatePath(`/g/${slug}`, "layout");
  return { ok: "Saved" };
}

export async function inviteStaff(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug, ["owner"]);
  const parsed = z.email("Enter a valid email").safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const email = parsed.data.toLowerCase();
  const token = randomToken();
  await db.insert(schema.invite).values({
    gymId: gym.id,
    email,
    role: "coach",
    token,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  });
  const link = appUrl(`/invite/${token}`);
  await sendMail(email, `Coach at ${gym.name} on Chalk`, `${user.name} invited you to coach at ${gym.name}.\n\n${link}`);
  await audit(gym.id, user.id, "invite.sent", { email, role: "coach" });
  revalidatePath(`/g/${slug}/admin/settings`);
  return { ok: `Invite sent to ${email}. You can also copy the link below.` };
}

export async function revokeInvite(slug: string, inviteId: string) {
  const { gym, user } = await requireStaff(slug, ["owner"]);
  await db
    .delete(schema.invite)
    .where(and(eq(schema.invite.id, inviteId), eq(schema.invite.gymId, gym.id), isNull(schema.invite.acceptedAt)));
  await audit(gym.id, user.id, "invite.revoked", { inviteId });
  revalidatePath(`/g/${slug}/admin/settings`);
}

export async function removeStaff(slug: string, staffId: string) {
  const { gym, user, staff: me } = await requireStaff(slug, ["owner"]);
  if (staffId === me.id) return;
  await db
    .delete(schema.staff)
    .where(and(eq(schema.staff.id, staffId), eq(schema.staff.gymId, gym.id), eq(schema.staff.role, "coach")));
  await audit(gym.id, user.id, "staff.removed", { staffId });
  revalidatePath(`/g/${slug}/admin/settings`);
}
