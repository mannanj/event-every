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

async function scrapeURL(url: string, signal?: AbortSignal): Promise<ScrapedContent> {
  try {
    const response = await fetch('/api/scrape-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    });

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

export async function scrapeURLsBatch(urls: string[], signal?: AbortSignal): Promise<BatchScrapedContent> {
  const results = await Promise.all(
    urls.map(url => scrapeURL(url, signal))
  );

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
