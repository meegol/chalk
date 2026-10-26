"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { bookClass, BookingError, cancelBooking, cancelClass, markAttendance, setCapacity } from "@/lib/booking";
import { sendMail } from "@/lib/mail";
import { generateClasses } from "@/lib/schedule";
import { requireStaff } from "@/lib/tenant";
import { formatDateTime, zonedToUtc } from "@/lib/time";
import type { ActionState } from "@/lib/utils";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a start time");
const coachId = z
  .string()
  .optional()
  .transform((v) => v || null);

const templateSchema = z.object({
  title: z.string().trim().min(2, "Name the class").max(40),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pick at least one day"),
  startTime: time,
  durationMin: z.coerce.number().int().min(15).max(240),
  capacity: z.coerce.number().int().min(1).max(100),
  coachId,
});

async function isCoachOf(gymId: string, id: string | null) {
  if (!id) return true;
  const row = await db.query.staff.findFirst({ where: and(eq(schema.staff.id, id), eq(schema.staff.gymId, gymId)) });
  return !!row;
}

export async function createTemplates(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug);
  const parsed = templateSchema.safeParse({ ...Object.fromEntries(form), weekdays: form.getAll("weekdays") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { weekdays, ...t } = parsed.data;
  if (!(await isCoachOf(gym.id, t.coachId))) return { error: "Pick a coach from this gym" };
  await db.insert(schema.classTemplate).values(weekdays.map((weekday) => ({ ...t, weekday, gymId: gym.id })));
  const created = await generateClasses(gym);
  await audit(gym.id, user.id, "template.created", { title: t.title, weekdays });
  revalidatePath(`/g/${slug}/admin/schedule`, "layout");
  return { ok: `Added. ${created} upcoming class${created === 1 ? "" : "es"} scheduled.` };
}

export async function deleteTemplate(slug: string, templateId: string) {
  const { gym, user } = await requireStaff(slug);
  // Past and already-booked classes stay; the template just stops producing new ones.
  await db
    .update(schema.classTemplate)
    .set({ active: false })
    .where(and(eq(schema.classTemplate.id, templateId), eq(schema.classTemplate.gymId, gym.id)));
  await audit(gym.id, user.id, "template.removed", { templateId });
  revalidatePath(`/g/${slug}/admin/schedule/templates`);
}

export async function generateNow(slug: string, _: ActionState): Promise<ActionState> {
  const { gym } = await requireStaff(slug);
  const n = await generateClasses(gym);
  revalidatePath(`/g/${slug}/admin/schedule`, "layout");
  return { ok: n ? `${n} new class${n === 1 ? "" : "es"} added.` : "Schedule is already up to date." };
}

const oneOffSchema = z.object({
  title: z.string().trim().min(2, "Name the class").max(40),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  startTime: time,
  durationMin: z.coerce.number().int().min(15).max(240),
  capacity: z.coerce.number().int().min(1).max(100),
  coachId,
});

export async function createOneOff(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug);
  const parsed = oneOffSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { day, startTime, ...c } = parsed.data;
  const startsAt = zonedToUtc(day, startTime, gym.timezone);
  if (startsAt <= new Date()) return { error: "That time has already passed" };
  if (!(await isCoachOf(gym.id, c.coachId))) return { error: "Pick a coach from this gym" };
  const [cls] = await db.insert(schema.classSession).values({ ...c, startsAt, gymId: gym.id }).returning();
  await audit(gym.id, user.id, "class.created", { classId: cls.id });
  redirect(`/g/${slug}/admin/schedule/${cls.id}`);
}

async function notifyPromoted(gymName: string, timeZone: string, classId: string, memberIds: string[]) {
  if (!memberIds.length) return;
  const cls = await db.query.classSession.findFirst({ where: eq(schema.classSession.id, classId) });
  const members = await db.query.member.findMany({ where: (m, { inArray }) => inArray(m.id, memberIds) });
  for (const m of members) {
    await sendMail(
      m.email,
      `You're in: ${cls?.title}`,
      `A spot opened up at ${gymName}. You're booked for ${cls?.title} on ${cls ? formatDateTime(cls.startsAt, timeZone) : ""}.`,
    );
  }
}

export async function updateCapacity(slug: string, classId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug);
  const capacity = z.coerce.number().int().min(1).max(100).safeParse(form.get("capacity"));
  if (!capacity.success) return { error: "Capacity must be 1–100" };
  try {
    const promoted = await setCapacity({ gymId: gym.id, classSessionId: classId, capacity: capacity.data });
    await notifyPromoted(gym.name, gym.timezone, classId, promoted);
    await audit(gym.id, user.id, "class.capacity", { classId, capacity: capacity.data, promoted: promoted.length });
    revalidatePath(`/g/${slug}/admin/schedule/${classId}`);
    return { ok: promoted.length ? `Saved. ${promoted.length} moved off the waitlist.` : "Saved" };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
}

export async function cancelWholeClass(slug: string, classId: string) {
  const { gym, user } = await requireStaff(slug);
  const affected = await cancelClass({ gymId: gym.id, classSessionId: classId });
  const members = affected.length
    ? await db.query.member.findMany({ where: (m, { inArray }) => inArray(m.id, affected) })
    : [];
  for (const m of members) await sendMail(m.email, "Class cancelled", `Your class at ${gym.name} was cancelled. Your credit is back.`);
  await audit(gym.id, user.id, "class.cancelled", { classId, affected: affected.length });
  revalidatePath(`/g/${slug}/admin/schedule/${classId}`);
}

export async function staffBook(slug: string, classId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug);
  const memberId = String(form.get("memberId") ?? "");
  try {
    const r = await bookClass({ gymId: gym.id, memberId, classSessionId: classId });
    await audit(gym.id, user.id, "booking.staff", { classId, memberId, status: r.status });
    revalidatePath(`/g/${slug}/admin/schedule/${classId}`);
    return { ok: r.status === "booked" ? "Booked" : `Class is full. Added to waitlist at #${r.position}.` };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
}

export async function staffCancel(slug: string, classId: string, bookingId: string, waive: boolean) {
  const { gym, user } = await requireStaff(slug);
  try {
    const r = await cancelBooking({ gymId: gym.id, bookingId, waiveLateFee: waive });
    await notifyPromoted(gym.name, gym.timezone, classId, r.promoted);
    await audit(gym.id, user.id, "booking.cancelled", { bookingId, by: "staff", waive });
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
  }
  revalidatePath(`/g/${slug}/admin/schedule/${classId}`);
}

export async function setAttendance(slug: string, classId: string, bookingId: string, attended: boolean) {
  const { gym } = await requireStaff(slug);
  await markAttendance({ gymId: gym.id, bookingId, attended });
  revalidatePath(`/g/${slug}/admin/schedule/${classId}`);
}
