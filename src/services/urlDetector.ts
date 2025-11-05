export interface URLDetectionResult {
  urls: string[];
  remainingText: string;
  hasUrls: boolean;
}

export async function detectURLs(text: string): Promise<URLDetectionResult> {
  try {
    const response = await fetch('/api/detect-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to detect URLs' }));
      throw new Error(errorData.error || 'Failed to detect URLs');
    }

    const result = await response.json() as URLDetectionResult;
    return result;
  } catch (error) {
    console.error('URL detection error:', error);
    throw error instanceof Error
      ? error
      : new Error('Failed to detect URLs');
  }
}
