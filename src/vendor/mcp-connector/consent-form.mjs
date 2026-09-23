// GENERATED FROM @mannan/mcp-connector/consent-form.mjs - DO NOT EDIT HERE.
// Edit ~/Documents/mcp-connector and re-run: node bin/sync.mjs <this dir>
/**
 * Read the consent page's form the way a browser would, for verify scripts.
 *
 * Plain JavaScript so a `node scripts/verify-*.mjs` can import it with no build.
 * One parser instead of one regex per app: the action attribute is HTML, so
 * `&amp;` must become `&` before it is a URL, and an app that unescaped it in
 * one read but not the next failed at /callback while its first check passed.
 *
 *   const { action, fields } = parseConsentForm(html, pageUrl);
 *   await fetch(action, { method: 'POST', body: new URLSearchParams(fields), ... });
 */

const unescapeHtml = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The form's absolute action URL and its hidden fields. Throws if there is no form. */
export function parseConsentForm(html, pageUrl) {
  const form = /<form method="POST" action="([^"]*)">([\s\S]*?)<\/form>/.exec(html);
  if (!form) throw new Error('parseConsentForm: no consent form on the page');
  const fields = {};
  for (const [, name, value] of form[2].matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)">/g)) {
    fields[unescapeHtml(name)] = unescapeHtml(value);
  }
  return { action: new URL(unescapeHtml(form[1]), pageUrl), fields };
}
