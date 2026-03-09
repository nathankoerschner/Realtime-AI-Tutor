import { useState } from 'react';

type TextInputProps = {
  disabled?: boolean;
  onSubmit: (text: string) => Promise<void> | void;
};

export function TextInput({ disabled, onSubmit }: TextInputProps) {
  const [value, setValue] = useState('');

  return (
    <form
      className="text-input"
      onSubmit={async (event) => {
        event.preventDefault();
        const text = value.trim();
        if (!text) return;
        await onSubmit(text);
        setValue('');
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Ask a question or steer the lesson…"
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Send
      </button>
    </form>
  );
}
