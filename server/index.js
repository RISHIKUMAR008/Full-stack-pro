const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const OPENAI_MODELS = new Set([
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
]);

const GEMINI_MODELS = new Set([
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
]);

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

const startedAt = Date.now();
const stats = {
  totalChats: 0,
  liveChats: 0,
  demoChats: 0,
  failedRequests: 0,
  latencySumMs: 0,
  lastLatencyMs: 0,
  promptTokens: 0,
  completionTokens: 0,
};

/** Prefer Gemini when `GEMINI_API_KEY` is set; otherwise OpenAI if configured. */
function getProvider() {
  if (GEMINI_API_KEY) return 'gemini';
  if (OPENAI_API_KEY) return 'openai';
  return null;
}

function isLive() {
  return getProvider() !== null;
}

let geminiClient;
function getGemini() {
  if (!geminiClient) {
    // API key defaults from `process.env.GEMINI_API_KEY` when omitted.
    geminiClient = new GoogleGenAI({});
  }
  return geminiClient;
}

function pickModel(requested, provider) {
  if (provider === 'gemini') {
    if (typeof requested === 'string' && GEMINI_MODELS.has(requested)) return requested;
    return DEFAULT_GEMINI_MODEL;
  }
  if (typeof requested === 'string' && OPENAI_MODELS.has(requested)) return requested;
  return DEFAULT_OPENAI_MODEL;
}

function validateMessages(body) {
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, error: 'messages must be a non-empty array' };
  }
  for (const m of body.messages) {
    if (!m || typeof m !== 'object') return { ok: false, error: 'invalid message entry' };
    if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'system') {
      return { ok: false, error: 'message role must be user, assistant, or system' };
    }
    if (typeof m.content !== 'string' || !m.content.trim()) {
      return { ok: false, error: 'each message needs non-empty string content' };
    }
  }
  return { ok: true };
}

function demoReply(messages) {
  const last = messages.filter((m) => m.role === 'user').pop();
  const raw = last ? last.content.trim() : '';
  const snippet = raw.length > 280 ? `${raw.slice(0, 280)}…` : raw;
  return [
    '**Demo mode** — no API key is configured on the server.',
    '',
    snippet ? `You asked:\n${snippet}` : 'Send a message to see it echoed here.',
    '',
    'To use **Gemini**: set `GEMINI_API_KEY` (see `@google/genai` / `GoogleGenAI`).',
    'To use **OpenAI** instead: set `OPENAI_API_KEY`, then restart `npm run server`.',
    '',
    'If both are set, Gemini is used first.',
  ].join('\n');
}

function messagesToGeminiContents(messages) {
  const systemTexts = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean);
  const systemInstruction =
    systemTexts.length > 0 ? systemTexts.join('\n\n') : undefined;

  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    const role = m.role === 'assistant' ? 'model' : 'user';
    contents.push({ role, parts: [{ text: m.content }] });
  }

  return { systemInstruction, contents };
}

async function geminiChat(messages, model) {
  const ai = getGemini();
  const { systemInstruction, contents } = messagesToGeminiContents(messages);

  const response = await ai.models.generateContent({
    model,
    contents,
    config: systemInstruction ? { systemInstruction } : undefined,
  });

  const text = response.text;
  if (typeof text !== 'string' || !text.trim()) {
    const err = new Error('Empty or invalid response from Gemini');
    err.status = 502;
    throw err;
  }

  const u = response.usageMetadata;
  return {
    content: text,
    usage: {
      prompt_tokens: u?.promptTokenCount ?? 0,
      completion_tokens: u?.candidatesTokenCount ?? 0,
    },
  };
}

async function openaiChat(messages, model) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      (typeof data?.error === 'string' ? data.error : null) ||
      `OpenAI request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }

  const responseText = data?.choices?.[0]?.message?.content;
  if (typeof responseText !== 'string') {
    const err = new Error('Unexpected response from model');
    err.status = 502;
    throw err;
  }

  const usage = data.usage || {};
  return {
    content: responseText,
    usage: {
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
    },
  };
}

app.get('/api/health', (_req, res) => {
  const provider = getProvider();
  res.json({
    ok: true,
    mode: isLive() ? 'live' : 'demo',
    provider,
    defaultModel: provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL,
  });
});

app.get('/api/models', (_req, res) => {
  const provider = getProvider();
  if (provider === 'gemini') {
    return res.json({
      models: Array.from(GEMINI_MODELS),
      defaultModel: DEFAULT_GEMINI_MODEL,
      provider: 'gemini',
    });
  }
  if (provider === 'openai') {
    return res.json({
      models: Array.from(OPENAI_MODELS),
      defaultModel: DEFAULT_OPENAI_MODEL,
      provider: 'openai',
    });
  }
  return res.json({
    models: Array.from(GEMINI_MODELS),
    defaultModel: DEFAULT_GEMINI_MODEL,
    provider: null,
  });
});

app.get('/api/stats', (_req, res) => {
  const n = stats.totalChats || 0;
  res.json({
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    totalChats: stats.totalChats,
    liveChats: stats.liveChats,
    demoChats: stats.demoChats,
    failedRequests: stats.failedRequests,
    avgLatencyMs: n ? Math.round(stats.latencySumMs / n) : 0,
    lastLatencyMs: stats.lastLatencyMs,
    promptTokens: stats.promptTokens,
    completionTokens: stats.completionTokens,
    mode: isLive() ? 'live' : 'demo',
    provider: getProvider(),
  });
});

app.post('/api/chat', async (req, res) => {
  const checked = validateMessages(req.body);
  if (!checked.ok) {
    return res.status(400).json({ error: checked.error });
  }

  const provider = getProvider();
  const { messages } = req.body;
  const model = pickModel(req.body.model, provider || 'openai');
  const t0 = process.hrtime.bigint();

  try {
    stats.totalChats += 1;

    if (!provider) {
      const content = demoReply(messages);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      stats.demoChats += 1;
      stats.latencySumMs += ms;
      stats.lastLatencyMs = Math.round(ms);

      return res.json({
        role: 'assistant',
        content,
        model,
        provider: null,
        mode: 'demo',
        usage: null,
        latencyMs: Math.round(ms),
      });
    }

    let result;
    if (provider === 'gemini') {
      result = await geminiChat(messages, model);
    } else {
      result = await openaiChat(messages, model);
    }

    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    stats.liveChats += 1;
    stats.latencySumMs += ms;
    stats.lastLatencyMs = Math.round(ms);
    stats.promptTokens += result.usage.prompt_tokens;
    stats.completionTokens += result.usage.completion_tokens;

    return res.json({
      role: 'assistant',
      content: result.content,
      model,
      provider,
      mode: 'live',
      usage: result.usage,
      latencyMs: Math.round(ms),
    });
  } catch (err) {
    stats.failedRequests += 1;
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({
      error: err.message || 'Chat request failed',
    });
  }
});

app.listen(PORT, () => {
  const p = getProvider();
  const label = p === 'gemini' ? 'Gemini' : p === 'openai' ? 'OpenAI' : 'demo';
  console.log(`AI API on http://localhost:${PORT} (${label})`);
});
