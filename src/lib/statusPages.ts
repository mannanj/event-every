/**
 * Status pages — one calendar, different states of not-quite-working.
 *
 * Shared shell so every failure looks like the same product rather than a
 * stack of unrelated defaults. Each state changes three things: what rises
 * from the calendar, the headline, and one line of explanation.
 *
 * Self-contained strings with no imports, so they render even when the app
 * bundle, D1 or R2 are unavailable — the pages that must never depend on the
 * things they may be covering for.
 */

const STYLE = `  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100svh;
    display: grid; place-items: center;
    /* The landing page's rainbow halo, pulled in behind the column instead of
       run across the whole viewport — the identity is a white page with a
       glow, not a tinted one. Corners stay pure white at every size. */
    background:
      radial-gradient(58% 46% at 50% 34%,
        rgba(255, 77, 77, 0.16) 0%,
        rgba(255, 216, 77, 0.13) 30%,
        rgba(67, 209, 122, 0.11) 52%,
        rgba(61, 165, 255, 0.10) 72%,
        rgba(155, 108, 255, 0.07) 88%,
        rgba(255, 255, 255, 0) 100%),
      #ffffff;
    color: #000000;
    font: 400 16px/1.6 ui-rounded, -apple-system, BlinkMacSystemFont, "SF Pro Rounded", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    padding: 2rem;
  }
  .wrap { text-align: center; max-width: 34rem; }
  svg { width: 168px; height: 168px; display: block; margin: 0 auto 1.75rem; overflow: visible; }
  /* Sun turns; a calendar has nowhere to rotate to, so the ambient signal is
     the landing page's bounce instead. */
  .pad { transform-origin: 66px 66px; animation: bob 4.4s ease-in-out infinite; }
  @keyframes bob { 0%, 100% { transform: translateY(0); } 48% { transform: translateY(-0.35rem); } }

  .rise { opacity: 0; fill: #000000; font-weight: 700;
          font-family: ui-rounded, system-ui, sans-serif;
          animation: drift 4.2s ease-in-out infinite; }
  .r2 { animation-delay: 1.4s; }
  .r3 { animation-delay: 2.8s; }
  @keyframes drift {
    0%   { opacity: 0; transform: translate(0, 6px) scale(.85); }
    30%  { opacity: .85; }
    100% { opacity: 0; transform: translate(6px, -22px) scale(1.15); }
  }
  /* The code rises once and stays put. Everything after is particles. */
  .code { animation: settle 1.5s cubic-bezier(.22,.9,.3,1) forwards; }
  @keyframes settle {
    from { opacity: 0; transform: translate(0, 12px) scale(.86); }
    to   { opacity: .95; transform: translate(0, 0) scale(1); }
  }

  h1 { font-size: 1.6rem; font-weight: 600; margin: 0 0 .6rem; letter-spacing: -.01em; }
  p  { margin: 0 auto; color: #4a4a4a; max-width: 27rem; }
  /* Matches the .6rem gap h1 leaves above the body line, so all three rows
     sit at equal intervals. */
  .small { margin-top: .6rem; font-size: .82rem; color: #8a8a8a; }
  a { color: #000000; text-decoration: none; border-bottom: 1px solid #c9c9c9; padding-bottom: 1px; }
  a:hover { border-bottom-color: #000000; }
  @media (prefers-reduced-motion: reduce) {
    .pad, .rise { animation: none; }
    .rise { opacity: .8; }
  }`;

export type StatusKind = "resting" | "notFound" | "serverError" | "rateLimited" | "offline";

interface StatusCopy {
  /** Browser tab. */
  title: string;
  headline: string;
  /** One sentence. Says what happened, not what the user did wrong. */
  body: string;
  /** What drifts up from the calendar. Empty renders the calendar alone. */
  rising: string;
  /** Sleeping face, or open eyes for states where the calendar is awake. */
  asleep: boolean;
  status: number;
  /** Seconds; omitted where retrying will not help. */
  retryAfter?: number;
}

const COPY: Record<StatusKind, StatusCopy> = {
  resting: {
    title: "Event Every is resting",
    headline: "Event Every is resting",
    body: "Your events are still on the calendar - ours will be back shortly.",
    rising: "z",
    asleep: true,
    status: 503,
    retryAfter: 3600,
  },
  notFound: {
    title: "Nothing here",
    headline: "Nothing at this address",
    body: "This page is off the calendar. Everything else is still where you left it.",
    rising: "404",
    asleep: false,
    status: 404,
  },
  serverError: {
    title: "Something slipped",
    headline: "Something slipped",
    body: "That one didn't make it through on our end. Try again in a moment.",
    rising: "500",
    asleep: false,
    status: 500,
    retryAfter: 30,
  },
  rateLimited: {
    title: "Slow down a little",
    headline: "That was a lot at once",
    body: "Give it a minute and we'll catch back up.",
    rising: "429",
    asleep: false,
    status: 429,
    retryAfter: 60,
  },
  offline: {
    title: "No connection",
    headline: "You're off the grid",
    body: "We can't reach our end of it. Check your connection and try again.",
    rising: "",
    asleep: true,
    status: 503,
    retryAfter: 60,
  },
};

function risingMarkup(rising: string): string {
  if (!rising) return "";
  // "z" drifts as three separate letters growing as they rise; a numeric code
  // rises once as a whole, since "4 0 4" staggered reads as gibberish.
  if (rising === "z") {
    return `
        <text class="rise r1" x="106" y="40" font-size="15">z</text>
        <text class="rise r2" x="114" y="27" font-size="19">z</text>
        <text class="rise r3" x="123" y="13" font-size="24">z</text>`;
  }
  return `
        <text class="rise code" x="104" y="24" font-size="20" letter-spacing="1">${rising}</text>`;
}

function facePath(asleep: boolean): string {
  return asleep
    ? `<path d="M52 66 q4 4 8 0" stroke="#000000" stroke-width="3" stroke-linecap="round" fill="none"/>
       <path d="M72 66 q4 4 8 0" stroke="#000000" stroke-width="3" stroke-linecap="round" fill="none"/>
       <path d="M61 79 q5 4 10 0" stroke="#000000" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".7"/>`
    : `<circle cx="56" cy="65" r="2.6" fill="#000000"/>
       <circle cx="76" cy="65" r="2.6" fill="#000000"/>
       <line x1="61" y1="78" x2="71" y2="78" stroke="#000000" stroke-width="2.5" stroke-linecap="round" opacity=".65"/>`;
}

/** Style block and markup, shared by the Worker string and the React pages. */
export function statusFragment(kind: StatusKind): string {
  const c = COPY[kind];
  return `<style>${STYLE}</style>
  <div class="wrap">
    <svg viewBox="0 0 132 116" role="img" aria-label="${c.headline}">
      <defs>
        <linearGradient id="ee-band" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stop-color="#ff4d4d"/>
          <stop offset="20%"  stop-color="#ff9a3d"/>
          <stop offset="40%"  stop-color="#ffd84d"/>
          <stop offset="60%"  stop-color="#43d17a"/>
          <stop offset="80%"  stop-color="#3da5ff"/>
          <stop offset="100%" stop-color="#9b6cff"/>
        </linearGradient>
        <clipPath id="ee-body">
          <rect x="32" y="34" width="68" height="62" rx="8"/>
        </clipPath>
      </defs>
      <g class="pad">
        <!-- Binding rings sit behind the pad so they read as passing through it. -->
        <line x1="48" y1="22" x2="48" y2="38" stroke="#000000" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="84" y1="22" x2="84" y2="38" stroke="#000000" stroke-width="3.5" stroke-linecap="round"/>
        <rect x="32" y="34" width="68" height="62" rx="8" fill="#ffffff"/>
        <rect x="32" y="34" width="68" height="15" fill="url(#ee-band)" clip-path="url(#ee-body)"/>
        <rect x="32" y="34" width="68" height="62" rx="8" fill="none" stroke="#000000" stroke-width="3.5"/>
        ${facePath(c.asleep)}
      </g>
      <g>${risingMarkup(c.rising)}</g>
    </svg>
    <h1>${c.headline}</h1>
    <p>${c.body}</p>
    <p class="small">${kind === "resting" ? "eventevery.com" : '<a href="/">Back to the start</a>'}</p>
  </div>`;
}

export function statusPage(kind: StatusKind): string {
  const c = COPY[kind];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${c.title}</title>
<meta name="robots" content="noindex">
</head>
<body>
${statusFragment(kind)}
</body>
</html>`;
}

export function statusResponse(kind: StatusKind): Response {
  const c = COPY[kind];
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  };
  if (c.retryAfter !== undefined) headers["retry-after"] = String(c.retryAfter);
  return new Response(statusPage(kind), { status: c.status, headers });
}

/** Kept so existing callers of the resting page keep working. */
export function maintenanceResponse(): Response {
  return statusResponse("resting");
}

export function maintenanceEnabled(env: { MAINTENANCE_MODE?: string }): boolean {
  return env.MAINTENANCE_MODE === "true";
}
