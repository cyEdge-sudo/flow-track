// Minimal server-only mailer abstraction.
// In production, integrate with your email provider (e.g., Resend, AWS SES, SMTP).
// This stub logs outgoing emails for development and returns success.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<{ ok: boolean }> {
  // Example: integrate conditionally if an API key exists
  // const apiKey = process.env.RESEND_API_KEY;
  // if (apiKey) {
  //   // call provider...
  // }

  // Fallback: log to server console for dev/demo
  // eslint-disable-next-line no-console
  console.log("==== Email (DEV LOG) ====");
  // eslint-disable-next-line no-console
  console.log("To:", to);
  // eslint-disable-next-line no-console
  console.log("Subject:", subject);
  // eslint-disable-next-line no-console
  console.log("Body:\n", html);
  // eslint-disable-next-line no-console
  console.log("=========================");
  return { ok: true };
}
