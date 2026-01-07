import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'mistralai/pixtral-large-2411';

const URL_DETECTION_PROMPT = `You are a URL detection assistant. Analyze the provided text and extract ALL URLs.

IMPORTANT:
- Extract all URLs from the text (http://, https://, www., etc.)
- Return the URLs as an array
- Return the remaining text with URLs removed
- Preserve the structure and formatting of non-URL content

If no URLs are found, return an empty array for urls and set hasUrls to false.`;

interface URLDetectionResult {
  urls: string[];
  remainingText: string;
  hasUrls: boolean;
}

type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type OpenRouterToolCall = {
  function: {
    name: string;
    arguments: string;
  };
};

interface OpenRouterResponse {
  choices: Array<{
    message: {
      tool_calls?: OpenRouterToolCall[];
    };
  }>;
  error?: {
    message?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY environment variable is not set');
    }

    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const tools: ToolDefinition[] = [
      {
        type: 'function',
        function: {
          name: 'extract_urls',
          description: 'Extract URLs from text and return structured result',
          parameters: {
            type: 'object',
            properties: {
              urls: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of extracted URLs',
              },
              remainingText: {
                type: 'string',
                description: 'Text with URLs removed',
              },
              hasUrls: {
                type: 'boolean',
                description: 'Whether any URLs were found',
              },
            },
            required: ['urls', 'remainingText', 'hasUrls'],
          },
        },
      },
    ];

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'event-every',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'user',
            content: `${URL_DETECTION_PROMPT}\n\nExtract URLs from this text:\n${text}`,
          },
        ],
        tools,
        tool_choice: {
          type: 'function',
          function: { name: 'extract_urls' },
        },
      }),
    });

    const data = (await response.json()) as OpenRouterResponse;

    if (!response.ok) {
      const errorMessage = data.error?.message || 'OpenRouter API error';
      throw new Error(errorMessage);
    }

    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      throw new Error('No tool calls found in OpenRouter response');
    }

    const result = JSON.parse(toolCalls[0].function.arguments) as URLDetectionResult;

    return NextResponse.json(result);
  } catch (error) {
    console.error('URL detection API error:', error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while detecting URLs';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
