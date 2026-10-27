import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (key.startsWith("sk_live_")) throw new Error("Chalk only runs against Stripe test mode");
  client ??= new Stripe(key);
  return client;
}

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** Chalk's cut of member payments, in percent. */
export const PLATFORM_FEE_PERCENT = 2;
export const PRO_PRICE_CENTS = 4900;
