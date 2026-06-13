import { emitIfCommunityLimited } from '@/utils/communityLimit';

interface SummarizeResult {
  summary: string;
}

// Best-effort 2-3 word label for a saved input. Never throws and never rejects —
// a failed/slow summary must never disrupt event extraction, so the caller simply
// gets an empty string and leaves the Recent card without a label.
export async function summarizeInput(params: {
  text?: string;
  eventTitles?: string[];
}): Promise<string> {
  try {
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: params.text ?? '',
        eventTitles: params.eventTitles ?? [],
      }),
    });
    if (!response.ok) {
      await emitIfCommunityLimited(response);
      return '';
    }
    const data = (await response.json()) as SummarizeResult;
    return typeof data.summary === 'string' ? data.summary : '';
  } catch {
    return '';
  }
}
