/**
 * Seeds the demo gym. See src/lib/demo.ts.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { DEMO_PASSWORD, seedDemo } from "../src/lib/demo";

seedDemo()
  .then((r) => {
    console.log(`Seeded ${r.gym}: ${r.members} members, ${r.classes} classes.`);
    console.log(`Logins (password "${DEMO_PASSWORD}"): owner@chalk.dev, coach@chalk.dev, member@chalk.dev`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
