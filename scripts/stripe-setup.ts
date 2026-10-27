/**
 * Creates the Chalk Pro product and price in your Stripe test account and
 * prints the price id for STRIPE_PRO_PRICE_ID. Safe to rerun.
 *
 *   npm run stripe:setup
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
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
