import "server-only";

/**
 * Transactional mail. v1 logs to the server console; swap the body for Resend,
 * Postmark or SES without touching callers.
 */
export async function sendMail(to: string, subject: string, text: string) {
  console.info(`\n[mail] to=${to}\n[mail] subject=${subject}\n${text}\n`);
}
