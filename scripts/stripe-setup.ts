/**
 * Creates the Chalk Pro product and price in your Stripe test account and
 * prints the price id for STRIPE_PRO_PRICE_ID. Safe to rerun.
 *
 *   npm run stripe:setup
 *
 * Pass a deployed app URL to also (re)create its webhook endpoint and print
 * the signing secret for STRIPE_WEBHOOK_SECRET:
 *
 *   npm run stripe:setup -- https://your-app.vercel.app
 */
import "dotenv/config";
import Stripe from "stripe";

const LOOKUP_KEY = "chalk_pro_monthly";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) throw new Error("Set STRIPE_SECRET_KEY to a test-mode key (sk_test_...)");
  const stripe = new Stripe(key);

  const existing = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], limit: 1 });
  let price = existing.data[0];
  if (!price) {
    const product = await stripe.products.create({
      name: "Chalk Pro",
      description: "Unlimited members, online payments and priority support.",
    });
    price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: 4900,
      recurring: { interval: "month" },
      lookup_key: LOOKUP_KEY,
    });
  }
  console.log(`STRIPE_PRO_PRICE_ID=${price.id}`);

  const appUrl = process.argv[2];
  if (appUrl) {
    const url = new URL("/api/webhooks/stripe", appUrl).toString();
    // Signing secrets are only returned on creation, so replace any existing endpoint.
    const existing = (await stripe.webhookEndpoints.list({ limit: 100 })).data.filter((e) => e.url === url);
    for (const e of existing) await stripe.webhookEndpoints.del(e.id);
    const endpoint = await stripe.webhookEndpoints.create({
      url,
      description: "Chalk",
      enabled_events: [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "account.updated",
      ],
    });
    console.log(`STRIPE_WEBHOOK_SECRET=${endpoint.secret}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
