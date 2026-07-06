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
  provider?: 'groq' | 'deepseek';
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
  const payload = await requireAuth(req, res);
  if (!payload) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseRequestBody(req);
  if (!body) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { messages, model, temperature, max_tokens, response_format, provider } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const AI_TIMEOUT_MS = 12_000;

  // ── DeepSeek provider ─────────────────────────────────────────────────────
  if (provider === 'deepseek') {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekKey) return res.status(503).json({ error: 'DeepSeek not configured' });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

      const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deepseekKey}` },
        body: JSON.stringify({
          model: model || 'deepseek-chat',
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens || 400,
          ...(response_format ? { response_format } : {}),
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!dsRes.ok) {
        const errText = await dsRes.text().catch(() => '');
        log.warn('[api/ai] DeepSeek error', { status: dsRes.status, body: errText.slice(0, 200) });
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        if (dsRes.status === 429) return res.status(429).json({ error: 'DeepSeek is temporarily busy. Please try again shortly.' });
        return res.status(502).json({ error: 'DeepSeek unavailable.', code: dsRes.status });
      }

      const dsData = await dsRes.json();
      const content = dsData.choices?.[0]?.message?.content || '';
      return res.status(200).json({ content });
    } catch (e: any) {
      const isTimeout = e?.name === 'AbortError' || e?.code === 'ETIMEDOUT';
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      log.warn('[api/ai] DeepSeek exception', { message: e?.message, timeout: isTimeout });
      if (isTimeout) return res.status(504).json({ error: 'DeepSeek request timed out.' });
      return res.status(502).json({ error: 'DeepSeek unavailable. Please try again later.' });
    }
  }

  // ── Groq provider (default) ───────────────────────────────────────────────
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
    log.warn('[api/ai] GROQ error', { status: upstreamStatus, message: errorMessage, timeout: isTimeout });
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (upstreamStatus === 429) return res.status(429).json({ error: 'AI service is temporarily busy. Please try again shortly.' });
    if (isTimeout || upstreamStatus === 504) return res.status(504).json({ error: 'AI request timed out. Dashboard will use fallback content.' });
    return res.status(502).json({ error: 'AI service unavailable. Please try again later.', detail: errorMessage.slice(0, 200), code: upstreamStatus });
  }
}
