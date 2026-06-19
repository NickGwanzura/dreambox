import type { VercelRequest, VercelResponse } from '@vercel/node';
import Groq from 'groq-sdk';
import { requireAuth, cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';

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
  cors(res, req);
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

  // Hard ceiling per request — prevents Railway worker timeout (30s) from
  // being reached before we can return a clean error to the client.
  const AI_TIMEOUT_MS = 12_000;

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

    const completion = await groq.chat.completions.create(
      { ...params, stream: false },
      { timeout: AI_TIMEOUT_MS }
    );
    const content = completion.choices[0]?.message?.content || '';
    return res.status(200).json({ content });
  } catch (e: any) {
    const isTimeout = e?.name === 'APIConnectionTimeoutError' || e?.code === 'ETIMEDOUT' || e?.message?.includes('timeout');
    const upstreamStatus =
      typeof e?.status === 'number'
        ? e.status
        : typeof e?.response?.status === 'number'
          ? e.response.status
          : isTimeout ? 504 : 502;

    const errorMessage = e?.error?.message || e?.message || String(e);
    log.warn('[api/ai] GROQ error', {
      status: upstreamStatus,
      message: errorMessage,
      name: e?.name,
      timeout: isTimeout,
    });

    // Set Cache-Control to prevent proxies from caching/replacing error responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (upstreamStatus === 429) {
      return res.status(429).json({ error: 'AI service is temporarily busy. Please try again shortly.' });
    }
    if (isTimeout || upstreamStatus === 504) {
      return res.status(504).json({ error: 'AI request timed out. Dashboard will use fallback content.' });
    }
    return res.status(502).json({
      error: 'AI service unavailable. Please try again later.',
      detail: errorMessage.slice(0, 200),
      code: upstreamStatus,
    });
  }
}
