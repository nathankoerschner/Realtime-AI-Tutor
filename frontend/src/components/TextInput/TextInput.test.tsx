import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TextInput } from './TextInput';

describe('TextInput', () => {
  it('submits trimmed text and clears the field', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const inputRef = createRef<HTMLInputElement>();

    render(<TextInput onSubmit={onSubmit} inputRef={inputRef} />);

    const input = screen.getByPlaceholderText(/Ask a question or steer the lesson/i);
    fireEvent.change(input, { target: { value: '   fractions please   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('fractions please'));
    expect(input).toHaveValue('');
    expect(inputRef.current).toBe(input);
  });

  it('does not submit blank input and respects disabled state', () => {
    const onSubmit = vi.fn();

    const { rerender } = render(<TextInput onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText(/Ask a question or steer the lesson/i);
    const button = screen.getByRole('button', { name: 'Send message' });

    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(button.closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(<TextInput onSubmit={onSubmit} disabled />);
    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
  });
});
