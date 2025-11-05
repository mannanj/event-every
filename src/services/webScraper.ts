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

async function scrapeURL(url: string): Promise<ScrapedContent> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EventEvery/1.0; +https://event-every.com)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;

    const text = bodyContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    return {
      url,
      text,
      title,
      status: 'success',
    };
  } catch (error) {
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

export async function scrapeURLsBatch(urls: string[]): Promise<BatchScrapedContent> {
  const results = await Promise.all(
    urls.map(url => scrapeURL(url))
  );

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return {
    results,
    successCount,
    errorCount,
  };
}

export async function scrapeSingleURL(url: string): Promise<ScrapedContent> {
  return scrapeURL(url);
}
