"use client";
import SiteHeader from '@/components/SiteHeader';
import StandardFooter from '@/components/SiteFooter';

const STEPS: { n: string; verb: string; desc: string }[] = [
  { n: "1", verb: "Drop it", desc: "Add your images, text or more." },
  { n: "2", verb: "Pop it", desc: "Click the button and download the file." },
  { n: "3", verb: "Stop it", desc: "Stop what you're doing and enjoy the event." },
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
    a: "Your data is sent to 3rd party LLM providers. If you aren't signed up, we never collect your data. With an account, your data is stored encrypted - and we never sell or access your data.",
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
      <div className="grid gap-5 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="border-2 border-black bg-white p-5 offset-shadow">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-black bg-white text-sm font-bold">
              {s.n}
            </span>
            <h3 className="display text-xl text-black leading-tight mt-4">{s.verb}</h3>
            <p className="text-gray-600 text-sm mt-1">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" className="pt-16">
      <p className="eyebrow text-black/40 mb-2">Frequently Asked Questions</p>
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
export function SiteFooter({ tight = false }: { tight?: boolean }) {
  return <StandardFooter tight={tight} />;
}
