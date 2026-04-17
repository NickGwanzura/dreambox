import type { VercelRequest, VercelResponse } from '@vercel/node';
import Groq from 'groq-sdk';
import { requireAuth, cors } from '../lib/auth';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';

type AIRequestBody = {
  messages?: ChatCompletionMessageParam[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
};

function parseRequestBody(req: VercelRequest): AIRequestBody | null {
  if (!req.body) return null;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body as AIRequestBody;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const payload = requireAuth(req, res);
  if (!payload) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseRequestBody(req);
  if (!body) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { messages, model, temperature, max_tokens, response_format } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  const groq = new Groq({ apiKey });

  try {
    const params: Parameters<typeof groq.chat.completions.create>[0] = {
      messages,
      model: model || DEFAULT_MODEL,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens || 200,
    };

    if (response_format) {
      params.response_format = response_format;
    }

    const completion = await groq.chat.completions.create({ ...params, stream: false });
    const content = completion.choices[0]?.message?.content || '';
    return res.status(200).json({ content });
  } catch (e: any) {
    const upstreamStatus =
      typeof e?.status === 'number'
        ? e.status
        : typeof e?.response?.status === 'number'
          ? e.response.status
          : 502;
    const errorMessage =
      e?.error?.message ||
      e?.message ||
      'AI request failed';

    console.error('[api/ai] GROQ error:', {
      status: upstreamStatus,
      message: errorMessage,
      name: e?.name,
    });

    return res
      .status(upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 502)
      .json({ error: errorMessage });
  }
}
