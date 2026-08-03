export interface ScrapedContent {
  url: string;
  text: string;
  title?: string;
  error?: string;
  status: 'success' | 'error';
}

export interface BatchScrapedContent {
  results: ScrapedContent[];
  successCount: number;
  errorCount: number;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function scrapeURL(url: string, signal?: AbortSignal, resolverCapability?: string): Promise<ScrapedContent> {
  const requestId = crypto.randomUUID();
  try {
    let response!: Response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch('/api/scrape-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, requestId, resolverCapability }),
        signal,
      });
      if (response.status !== 429 || attempt === 2) break;
      const retry = await response.clone().json().catch(() => null) as { code?: string; retryAfterSeconds?: number } | null;
      if (retry?.code !== 'resolver_busy' || !Number.isInteger(retry.retryAfterSeconds)) break;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, Math.max(1, Math.min(10, retry.retryAfterSeconds!)) * 1_000);
        signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
      });
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to scrape URL' }));
      throw new Error(errorData.error || 'Failed to scrape URL');
    }

    const result = await response.json();

    if (result.status === 'error') {
      throw new Error(result.error || 'Failed to scrape URL');
    }

    return {
      url: result.url,
      text: result.text,
      title: result.title,
      status: 'success',
    };
  } catch (error) {
    if (signal?.aborted || isAbort(error)) {
      throw error;
    }
    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to fetch URL';

    return {
      url,
      text: '',
      error: errorMessage,
      status: 'error',
    };
  }
}

export async function scrapeURLsBatch(urls: string[], signal?: AbortSignal, _resolverCapability?: string): Promise<BatchScrapedContent> {
  const resolveOne = (url: string) => scrapeURL(url, signal, _resolverCapability);
const results = await mapWithConcurrency(urls, 2, resolveOne);

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return {
    results,
    successCount,
    errorCount,
  };
}

export async function scrapeSingleURL(url: string, signal?: AbortSignal): Promise<ScrapedContent> {
  return scrapeURL(url, signal);
}

async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const run = async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}
