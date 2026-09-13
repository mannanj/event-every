"use client";
import SiteHeader from '@/components/SiteHeader';
import StandardFooter from '@/components/SiteFooter';

const STEPS: { n: string; verb: string; desc: string }[] = [
  { n: "01", verb: "Drop it.", desc: "Images, some text, or a link." },
  {
    n: "02",
    verb: "Scan it.",
    desc: "Title, time, and place - pulled out for you.",
  },
  { n: "03", verb: "Keep it.", desc: "One or more files. Every calendar." },
];

const TRUST: { head: string; sub: string }[] = [
  { head: "Review before you save.", sub: "Keep what you want." },
  {
    head: "Stays on your device.",
    sub: "History never leaves your browser. We collect no data.",
  },
  { head: "No sign-up necessary.", sub: "Take it and go." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Which calendars?",
    a: "All of them. It’s a standard .ics file - Apple, Google, Outlook, anything.",
  },
  {
    q: "What can it read?",
    a: "Flyers, screenshots, emails, links, plain text. If it names a time and a place, it works.",
  },
  {
    q: "Where does my data go?",
    a: "Nowhere. Your history stays on your device, in your browser - nothing is kept on our servers. Anonymized data is sent to processors.",
  },
  {
    q: "What does it cost?",
    a: "Private owner access during this phase.",
  },
];

/**
 * Kept as a thin alias so the landing page keeps its own name for the bar,
 * while there is exactly one header implementation to change.
 */
export function SiteNav({ showHow }: { showHow: boolean }) {
  return <SiteHeader showHow={showHow} />;
}

export function HowItWorks() {
  return (
    <section id="how" className="pt-16">
      <p className="eyebrow text-black/40 mb-6">How it works</p>
      <div className="border-2 border-black bg-white offset-shadow">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="flex items-baseline gap-5 p-5 border-b-2 border-black last:border-b-0"
          >
            <span className="eyebrow text-black/25 pt-1">{s.n}</span>
            <div>
              <h3 className="display text-xl text-black leading-tight">
                {s.verb}
              </h3>
              <p className="text-gray-600 text-sm mt-1">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TrustPoints() {
  return (
    <section className="pt-12 grid gap-6 sm:grid-cols-3">
      {TRUST.map((t) => (
        <div key={t.head}>
          <h3 className="display text-base text-black leading-tight">
            {t.head}
          </h3>
          <p className="text-gray-500 text-sm mt-1">{t.sub}</p>
        </div>
      ))}
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" className="pt-16">
      <p className="eyebrow text-black/40 mb-2">Questions</p>
      <div>
        {FAQ.map((item) => (
          <details key={item.q} className="faq-item">
            <summary>{item.q}</summary>
            <div className="faq-body text-sm leading-relaxed text-gray-600">
              {item.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Kept as an alias so there is one footer implementation to change. */
export function SiteFooter() {
  return <StandardFooter />;
}
