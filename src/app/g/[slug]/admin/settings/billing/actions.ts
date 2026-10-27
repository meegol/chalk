"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { billingPortalUrl, connectDashboardUrl, connectOnboardingUrl, ConnectNotEnabledError, startProCheckout } from "@/lib/billing";
import { requireStaff } from "@/lib/tenant";
import type { ActionState } from "@/lib/utils";

export async function upgrade(slug: string): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug, ["owner"]);
  if (gym.saasPlan === "pro") redirect(`/g/${slug}/admin/settings/billing`);
  const url = await startProCheckout(gym, user.email);
  await audit(gym.id, user.id, "billing.checkout_started");
  redirect(url);
}

export async function manageBilling(slug: string): Promise<ActionState> {
  const { gym } = await requireStaff(slug, ["owner"]);
  if (!gym.stripeCustomerId) return { error: "No billing account yet" };
  redirect(await billingPortalUrl(gym.stripeCustomerId, `/g/${slug}/admin/settings/billing`));
}

export async function setUpPayouts(slug: string): Promise<ActionState> {
  const { gym, user } = await requireStaff(slug, ["owner"]);
  let url: string;
  try {
    url = await connectOnboardingUrl(gym, user.email);
  } catch (e) {
    if (e instanceof ConnectNotEnabledError) {
      return { error: "Stripe Connect isn't enabled on the platform account yet. Turn it on in the Stripe dashboard under Connect." };
    }
    throw e;
  }
  await audit(gym.id, user.id, "connect.onboarding_started");
  redirect(url);
}

export async function openPayoutDashboard(slug: string): Promise<ActionState> {
  const { gym } = await requireStaff(slug, ["owner"]);
  const url = await connectDashboardUrl(gym);
  if (!url) return { error: "Set up payouts first" };
  redirect(url);
}
