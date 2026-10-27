import type Stripe from "stripe";
import { handleStripeEvent } from "@/lib/billing";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Webhook not configured", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  const result = await handleStripeEvent(event);
  return Response.json({ received: true, result });
}
