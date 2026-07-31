'use client';

import type { ScannerIssue } from '@event-every/scanner';

type ReviewIssuesProps = Readonly<{
  label: string;
  ownerId: string;
  issues: readonly ScannerIssue[];
}>;

function renderedKey(issue: ScannerIssue): string {
  return [issue.field, issue.code, issue.kind, issue.severity, issue.message].join('\u0000');
}

export default function ReviewIssues({ label, ownerId, issues }: ReviewIssuesProps) {
  const uniqueIssues = issues.filter((issue, index) =>
    issues.findIndex((candidate) => renderedKey(candidate) === renderedKey(issue)) === index,
  );

  return (
    <section aria-label={`${label} for ${ownerId}`} className="mt-3">
      <h4 className="font-semibold text-sm">{label} for {ownerId}</h4>
      {uniqueIssues.length === 0 ? (
        <p className="text-sm text-gray-600">None</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {uniqueIssues.map((issue) => (
            <li key={renderedKey(issue)} className={issue.severity === 'blocker' ? 'text-red-700' : 'text-amber-800'}>
              <span className="font-medium">{issue.field} · {issue.code}</span>: {issue.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
