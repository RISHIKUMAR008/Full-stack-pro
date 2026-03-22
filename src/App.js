import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [modelOptions, setModelOptions] = useState([
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
  ]);
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listEndRef = useRef(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scrollToBottom = () => {
    listEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  };

  const refreshMeta = useCallback(async () => {
    try {
      const [h, s, m] = await Promise.all([
        fetch('/api/health').then((r) => r.json()),
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/models').then((r) => r.json()),
      ]);
      setHealth(h);
      setStats(s);
      if (Array.isArray(m.models) && m.models.length) {
        setModelOptions(m.models);
        if (m.defaultModel) {
          setModel((cur) => (m.models.includes(cur) ? cur : m.defaultModel));
        }
      }
    } catch {
      setHealth({ ok: false, mode: 'unknown' });
    }
  }, []);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const send = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setError('');
    const previous = messagesRef.current;
    const nextMessages = [...previous, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, model }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Request failed');
        setMessages(previous);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.content, meta: data },
      ]);
      refreshMeta();
    } catch {
      setError('Network error — is the API running? Try `npm run server`.');
      setMessages(previous);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError('');
  };

  const mode = health?.mode || '…';
  const modeClass = mode === 'live' ? 'pill pill--live' : 'pill pill--demo';
  const liveLabel =
    mode === 'live'
      ? health?.provider === 'gemini'
        ? 'Gemini live'
        : health?.provider === 'openai'
          ? 'OpenAI live'
          : 'Live'
      : 'Demo mode';

  return (
    <div className="dash">
      <header className="dash__header">
        <div>
          <h1 className="dash__title">AI dashboard</h1>
          <p className="dash__tagline">Chat with the backend; stats update after each reply.</p>
        </div>
        <div className="dash__header-actions">
          <span className={modeClass} title="Configured on the server">
            {liveLabel}
          </span>
          <button type="button" className="btn btn--ghost" onClick={refreshMeta}>
            Refresh stats
          </button>
        </div>
      </header>

      <div className="dash__grid">
        <section className="panel panel--chat" aria-label="Chat">
          <div className="panel__head">
            <h2 className="panel__title">Assistant</h2>
            <label className="model-select">
              <span className="sr-only">Model</span>
              <select value={model} onChange={(e) => setModel(e.target.value)} disabled={loading}>
                {modelOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="thread" role="log" aria-live="polite">
            {messages.length === 0 && !loading ? (
              <p className="thread__empty">Ask anything. The assistant replies through your Express API.</p>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={`${i}-${m.role}`}
                className={`bubble bubble--${m.role}`}
              >
                <span className="bubble__label">{m.role === 'user' ? 'You' : 'Assistant'}</span>
                <div className="bubble__body">{m.content}</div>
              </div>
            ))}
            {loading ? (
              <div className="bubble bubble--assistant bubble--typing">
                <span className="bubble__label">Assistant</span>
                <div className="typing" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : null}
            <div ref={listEndRef} />
          </div>

          {error ? (
            <p className="banner banner--error" role="alert">
              {error}
            </p>
          ) : null}

          <form className="composer" onSubmit={send}>
            <textarea
              className="composer__input"
              rows={2}
              placeholder="Message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(e);
                }
              }}
              disabled={loading}
            />
            <div className="composer__actions">
              <button type="button" className="btn btn--ghost" onClick={clearChat} disabled={loading}>
                Clear
              </button>
              <button type="submit" className="btn btn--primary" disabled={loading || !input.trim()}>
                Send
              </button>
            </div>
          </form>
        </section>

        <aside className="panel panel--metrics" aria-label="Usage metrics">
          <h2 className="panel__title">Session metrics</h2>
          <ul className="metrics">
            <li>
              <span className="metrics__k">Uptime</span>
              <span className="metrics__v">
                {stats != null ? `${stats.uptimeSeconds}s` : '—'}
              </span>
            </li>
            <li>
              <span className="metrics__k">Provider</span>
              <span className="metrics__v">
                {stats == null
                  ? '—'
                  : stats.provider === 'gemini'
                    ? 'Gemini'
                    : stats.provider === 'openai'
                      ? 'OpenAI'
                      : 'Demo'}
              </span>
            </li>
            <li>
              <span className="metrics__k">Total chats</span>
              <span className="metrics__v">{stats?.totalChats ?? '—'}</span>
            </li>
            <li>
              <span className="metrics__k">Live / demo</span>
              <span className="metrics__v">
                {stats != null ? `${stats.liveChats} / ${stats.demoChats}` : '—'}
              </span>
            </li>
            <li>
              <span className="metrics__k">Avg latency</span>
              <span className="metrics__v">
                {stats?.totalChats ? `${stats.avgLatencyMs} ms` : '—'}
              </span>
            </li>
            <li>
              <span className="metrics__k">Last latency</span>
              <span className="metrics__v">
                {stats?.lastLatencyMs != null && stats.lastLatencyMs > 0
                  ? `${stats.lastLatencyMs} ms`
                  : '—'}
              </span>
            </li>
            <li>
              <span className="metrics__k">Tokens (prompt / out)</span>
              <span className="metrics__v">
                {stats != null ? `${stats.promptTokens} / ${stats.completionTokens}` : '—'}
              </span>
            </li>
            <li>
              <span className="metrics__k">Failed requests</span>
              <span className="metrics__v">{stats?.failedRequests ?? '—'}</span>
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

export default App;
