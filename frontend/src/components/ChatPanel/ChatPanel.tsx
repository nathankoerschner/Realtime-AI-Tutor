import { useState, useEffect, useRef } from 'react';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  pending?: boolean;
  timestamp: number;
};

type ChatPanelProps = {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  suggestedTopics?: readonly string[];
  disabled?: boolean;
};

export function ChatPanel({ messages, onSend, suggestedTopics = [], disabled }: ChatPanelProps) {
  const [value, setValue] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
  }

  return (
    <aside className="chat-panel" aria-label="Chat">
      <header className="chat-panel-header">
        <h2>Chat</h2>
      </header>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Messages will appear here as you talk with the tutor.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-bubble chat-bubble-${msg.role}${msg.streaming ? ' chat-bubble-streaming' : ''}${msg.pending ? ' chat-bubble-pending' : ''}`}
          >
            <span className="chat-bubble-role">{msg.role === 'user' ? 'You' : 'Tutor'}</span>
            <p className="chat-bubble-text">{msg.pending ? '…' : msg.text || '\u00A0'}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {suggestedTopics.length > 0 && (
        <div className="chat-topic-suggestions" aria-label="Suggested starting topics">
          <span className="chat-topic-suggestions-label">Start with</span>
          <div className="chat-topic-suggestions-list">
            {suggestedTopics.map((topic) => (
              <button
                key={topic}
                type="button"
                className="secondary lesson-topic-button"
                disabled={disabled}
                onClick={() => onSend(`Can you teach me about ${topic}?`)}
              >
                Learn about {topic}
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type a message…"
          disabled={disabled}
        />
        <button type="submit" disabled={disabled || !value.trim()} aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </aside>
  );
}
