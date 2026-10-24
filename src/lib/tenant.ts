import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { getCurrentUser, requireUser, type CurrentUser } from "./session";

export type Gym = typeof schema.gym.$inferSelect;
export type StaffRow = typeof schema.staff.$inferSelect;
export type MemberRow = typeof schema.member.$inferSelect;
export type StaffRole = StaffRow["role"];

export const getGymBySlug = cache(async (slug: string) => {
  const gym = await db.query.gym.findFirst({ where: eq(schema.gym.slug, slug) });
  return gym ?? null;
});

const getStaffRow = cache(async (gymId: string, userId: string) => {
  const row = await db.query.staff.findFirst({
    where: and(eq(schema.staff.gymId, gymId), eq(schema.staff.userId, userId)),
  });
  return row ?? null;
});

const getMemberRow = cache(async (gymId: string, userId: string) => {
  const row = await db.query.member.findFirst({
    where: and(eq(schema.member.gymId, gymId), eq(schema.member.userId, userId)),
  });
  return row ?? null;
});

export type StaffContext = { user: CurrentUser; gym: Gym; staff: StaffRow };
export type MemberContext = { user: CurrentUser; gym: Gym; member: MemberRow; staff: StaffRow | null };

/**
 * Resolve the gym and make sure the caller is staff there. Every admin page and
 * action goes through this, so gym_id always comes from the server.
 */
export async function requireStaff(slug: string, roles?: StaffRole[]): Promise<StaffContext> {
  const user = await requireUser(`/g/${slug}/admin`);
  const gym = await getGymBySlug(slug);
  if (!gym) notFound();
  const staff = await getStaffRow(gym.id, user.id);
  if (!staff) redirect(`/g/${slug}`);
  if (roles && !roles.includes(staff.role)) redirect(`/g/${slug}/admin`);
  return { user, gym, staff };
}

export async function requireMember(slug: string): Promise<MemberContext> {
  const user = await requireUser(`/g/${slug}`);
  const gym = await getGymBySlug(slug);
  if (!gym) notFound();
  const [member, staff] = await Promise.all([getMemberRow(gym.id, user.id), getStaffRow(gym.id, user.id)]);
  if (!member) redirect(staff ? `/g/${slug}/admin` : `/g/${slug}/join`);
  return { user, gym, member, staff };
}

/** Like requireMember but returns null instead of redirecting. */
export async function getViewer(slug: string) {
  const user = await getCurrentUser();
  const gym = await getGymBySlug(slug);
  if (!gym) notFound();
  if (!user) return { user: null, gym, member: null, staff: null };
  const [member, staff] = await Promise.all([getMemberRow(gym.id, user.id), getStaffRow(gym.id, user.id)]);
  return { user, gym, member, staff };
}
