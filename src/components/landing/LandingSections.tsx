"use client";

const STEPS: { n: string; verb: string; desc: string }[] = [
  { n: "01", verb: "Drop it.", desc: "Images, some text, or a link." },
  {
    n: "02",
    verb: "Scan it.",
    desc: "Title, time, and place — pulled out for you.",
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
    a: "All of them. It’s a standard .ics file — Apple, Google, Outlook, anything.",
  },
  {
    q: "What can it read?",
    a: "Flyers, screenshots, emails, links, plain text. If it names a time and a place, it works.",
  },
  {
    q: "Where does my data go?",
    a: "Nowhere. Your history stays on your device, in your browser — nothing is kept on our servers. Anonymized data is sent to processors.",
  },
  {
    q: "What does it cost?",
    a: "Free, on a shared daily limit. It’s community-sponsored.",
  },
];

export function SiteNav({ showHow }: { showHow: boolean }) {
  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-white/55 border-b border-black/10">
      <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
        <a
          href="#top"
          className="wordmark text-lg"
          aria-label="Event Every — back to top"
        >
          Event Every
        </a>
        {showHow && (
          <a
            href="#how"
            className="eyebrow text-black/45 hover:text-black transition-colors"
          >
            How it works
          </a>
        )}
      </div>
    </nav>
  );
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

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-black/10">
      <div className="max-w-2xl mx-auto px-6 py-8 flex items-center justify-between text-sm">
        <span className="wordmark text-black/80">Event Every</span>
        <span className="text-gray-500">
          made by{" "}
          <a
            href="https://mannan.is"
            className="text-black underline-offset-4 hover:underline"
          >
            Mannan
          </a>
        </span>
      </div>
    </footer>
  );
}
