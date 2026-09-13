/**
 * Outbound email, through Cloudflare Email Sending.
 *
 * THE DISTINCTION THAT COSTS A DAY
 *
 * Cloudflare has two email products, configured with the same `send_email`
 * binding name:
 *
 *   Email Routing   inbound. Can only deliver to *verified destination
 *                   addresses* — fine for mailing yourself, useless for mailing
 *                   someone who just typed their address into a form.
 *   Email Sending   outbound transactional mail. The domain is onboarded once
 *                   and after that the Worker may send to anybody.
 *
 * The failure is nasty: you test with your own address, which happens to be a
 * verified destination, it works, and every other person gets nothing with no
 * error raised. This uses Email Sending, onboarded on `mail.eventevery.com` —
 * a subdomain, so the Resend/SES records already on `send.eventevery.com` are
 * untouched and the planned inbound work (task-192) still has them.
 *
 * `EMAIL_PROVIDER=console` writes the whole message — magic link included — to
 * the Worker log instead of sending. That is what makes the sign-in flow
 * testable with no inbox and no network.
 */

export interface EmailSendBinding {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
  }): Promise<unknown>;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  send(message: OutboundEmail): Promise<void>;
}

class ConsoleEmailSender implements EmailSender {
  constructor(private readonly from: string) {}

  async send(message: OutboundEmail): Promise<void> {
    console.log(
      [
        '',
        '─── email (NOT SENT — EMAIL_PROVIDER=console) ───',
        `From:    ${this.from}`,
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        '',
        message.text,
        '────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
  }
}

class CloudflareEmailSender implements EmailSender {
  constructor(
    private readonly binding: EmailSendBinding,
    private readonly from: { email: string; name?: string },
  ) {}

  async send(message: OutboundEmail): Promise<void> {
    await this.binding.send({
      to: message.to,
      // `email`, not `address`. The REST API for this same product uses
      // `address`; the binding uses `email`. Mixing them up fails at runtime.
      from: this.from,
      subject: message.subject,
      text: message.text,
      // Some clients render only HTML and some only text. Send both, and keep
      // them saying the same thing.
      html: message.html ?? textAsHtml(message.text),
    });
  }
}

function textAsHtml(text: string): string {
  return `<pre style="font:14px/1.55 ui-sans-serif,system-ui,sans-serif;white-space:pre-wrap;margin:0">${escapeHtml(text)}</pre>`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Split `Name <a@b.c>` into the shape the binding wants. */
export function parseFrom(value: string): { email: string; name?: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (match) return { name: match[1] || undefined, email: match[2].trim() };
  return { email: value.trim() };
}

export function getEmailSender(env: {
  EMAIL_PROVIDER?: string;
  EMAIL_FROM?: string;
  EMAIL?: EmailSendBinding;
}): EmailSender {
  const from = env.EMAIL_FROM ?? 'Event Every <no-reply@mail.eventevery.com>';
  switch (env.EMAIL_PROVIDER) {
    case 'console':
      return new ConsoleEmailSender(from);
    case 'cloudflare':
      if (!env.EMAIL) {
        throw new Error(
          'EMAIL binding is missing. Add `"send_email": [{ "name": "EMAIL" }]` to wrangler.jsonc.',
        );
      }
      return new CloudflareEmailSender(env.EMAIL, parseFrom(from));
    default:
      // Fail loudly rather than silently dropping mail somebody is waiting on.
      throw new Error(
        `Unknown EMAIL_PROVIDER "${env.EMAIL_PROVIDER}". Use 'console' or 'cloudflare'.`,
      );
  }
}

/**
 * The sign-in link.
 *
 * A heading, one line of why, a button, and the raw URL underneath for clients
 * that will not render a button. Nothing else: this message exists to be acted
 * on within twenty minutes and then never read again.
 */
export function signInEmail(args: { to: string; url: string }): OutboundEmail {
  const heading = 'Continue to Event Every';
  const body = 'Click the button below to continue to Event Every. This link expires in 20 minutes.';

  const html = `<!doctype html>
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#000">
  <h2 style="margin:0 0 16px;font-size:18px;font-weight:600">${escapeHtml(heading)}</h2>
  <p style="margin:0 0 24px;line-height:1.55;font-size:15px">${escapeHtml(body)}</p>
  <p style="margin:0 0 8px"><a href="${escapeHtml(args.url)}" style="display:inline-block;padding:10px 18px;background:#000;color:#fff;text-decoration:none;font-size:14px;font-weight:600">Continue with email</a></p>
  <p style="margin:0;color:#666;font-size:12px;line-height:1.5;max-width:380px">If the button doesn't work, paste this URL into your browser:<br><span style="word-break:break-all">${escapeHtml(args.url)}</span></p>
</div>`;

  return {
    to: args.to,
    subject: heading,
    text: `${body}\n\n${args.url}\n\nThe link works once. If you didn't request it, ignore this email.`,
    html,
  };
}
