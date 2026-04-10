'use client';

import { useCallback, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import {
  type ChatMessage,
  type ChatResponse,
  fetchSignalChat,
} from '../../lib/api/fetch-signal-chat';

type SignalChatProps = {
  signalId: string;
  signalTitle: string;
};

type ChatMsgUI = ChatMessage & { id: string; citations?: string[] };
let msgCounter = 0;

export function SignalChat({ signalId, signalTitle }: SignalChatProps) {
  const [messages, setMessages] = useState<ChatMsgUI[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<'gemini' | 'perplexity'>('perplexity');
  const scrollRef = useRef<HTMLDivElement>(null);

  const doSend = useCallback(
    async (text: string) => {
      if (!text || loading) return;

      const userMsg: ChatMsgUI = { id: `msg-${++msgCounter}`, role: 'user', text };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      try {
        const history: ChatMessage[] = messages.map((m) => ({ role: m.role, text: m.text }));
        const result: ChatResponse = await fetchSignalChat(signalId, text, history, provider);
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${++msgCounter}`,
            role: 'model',
            text: result.reply,
            citations: result.citations,
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${++msgCounter}`,
            role: 'model',
            text: `**Error:** ${err instanceof Error ? err.message : 'Failed to get response.'}  \nPlease try again.`,
          },
        ]);
      } finally {
        setLoading(false);
        setTimeout(
          () =>
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: 'smooth',
            }),
          50,
        );
      }
    },
    [loading, messages, signalId, provider],
  );

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (text) doSend(text);
  }, [input, doSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const suggestions = [
    'What are the strategic implications?',
    'Who benefits and who is at risk?',
    'What is the likely timeline and next steps?',
    'How does this compare to recent industry trends?',
  ];

  return (
    <div className="signal-chat">
      <div className="signal-chat__header">
        <h3 className="signal-chat__title">Ask about this signal</h3>
        <div className="signal-chat__provider-toggle">
          <button
            type="button"
            className={`signal-chat__provider-btn ${provider === 'perplexity' ? 'signal-chat__provider-btn--active' : ''}`}
            onClick={() => setProvider('perplexity')}
            title="Web Search — includes live web sources and citations"
          >
            Web Search
          </button>
          <button
            type="button"
            className={`signal-chat__provider-btn ${provider === 'gemini' ? 'signal-chat__provider-btn--active' : ''}`}
            onClick={() => setProvider('gemini')}
            title="Deep Analysis — detailed reasoning from source documents"
          >
            Deep Analysis
          </button>
        </div>
      </div>

      <div className="signal-chat__messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="signal-chat__empty">
            <p className="signal-chat__empty-text">
              Ask anything about <strong>{signalTitle}</strong>
            </p>
            <div className="signal-chat__suggestions">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="signal-chat__suggestion"
                  onClick={() => doSend(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`signal-chat__msg signal-chat__msg--${msg.role}`}>
            <div className="signal-chat__msg-content signal-chat__markdown">
              {msg.role === 'model' ? <Markdown>{msg.text}</Markdown> : <p>{msg.text}</p>}
            </div>
            {msg.citations && msg.citations.length > 0 && (
              <div className="signal-chat__citations">
                <span className="signal-chat__citations-label">Sources:</span>
                {msg.citations.map((c, i) => (
                  <a
                    key={c}
                    href={c}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="signal-chat__citation-link"
                  >
                    [{i + 1}]
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="signal-chat__msg signal-chat__msg--model signal-chat__msg--loading">
            <div className="signal-chat__typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <div className="signal-chat__input-area">
        <textarea
          className="signal-chat__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          rows={1}
          disabled={loading}
        />
        <button
          type="button"
          className="signal-chat__send"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          aria-label="Send"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M14.5 1.5L7 9M14.5 1.5L10 14.5L7 9M14.5 1.5L1.5 6L7 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
