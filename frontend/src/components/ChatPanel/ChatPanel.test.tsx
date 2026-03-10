import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatPanel, type ChatMessage } from './ChatPanel';

describe('ChatPanel', () => {
  it('renders empty state when no messages', () => {
    render(<ChatPanel messages={[]} onSend={vi.fn()} />);
    expect(screen.getByText('Messages will appear here as you talk with the tutor.')).toBeInTheDocument();
  });

  it('renders streaming and pending message styles', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', text: '', pending: true, timestamp: 1 },
      { id: '2', role: 'assistant', text: 'Hello', streaming: true, timestamp: 2 },
      { id: '3', role: 'user', text: 'Hi there', timestamp: 3 },
      { id: '4', role: 'assistant', text: '', timestamp: 4 },
    ];

    const { container } = render(<ChatPanel messages={messages} onSend={vi.fn()} />);

    // Pending message shows "…"
    expect(screen.getByText('…')).toBeInTheDocument();
    expect(container.querySelector('.chat-bubble-pending')).toBeInTheDocument();

    // Streaming message has streaming class
    expect(container.querySelector('.chat-bubble-streaming')).toBeInTheDocument();

    // Normal messages render text
    expect(screen.getByText('Hi there')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('does not submit when disabled', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} disabled={true} />);

    const input = screen.getByPlaceholderText('Type a message…');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not submit when input is empty or whitespace', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} />);

    const input = screen.getByPlaceholderText('Type a message…');

    // Empty submit
    fireEvent.submit(input.closest('form')!);
    expect(onSend).not.toHaveBeenCalled();

    // Whitespace-only submit
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('submits and clears input on valid send', () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} onSend={onSend} />);

    const input = screen.getByPlaceholderText('Type a message…');
    fireEvent.change(input, { target: { value: 'Hello!' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).toHaveBeenCalledWith('Hello!');
    expect(input).toHaveValue('');
  });
});
