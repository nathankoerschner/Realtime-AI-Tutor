import { useState, type RefObject } from 'react';

type TextInputProps = {
  disabled?: boolean;
  onSubmit: (text: string) => Promise<void> | void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

export function TextInput({ disabled, onSubmit, inputRef }: TextInputProps) {
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
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Ask a question or steer the lesson… (press Enter to send)"
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !value.trim()} aria-label="Send message">
        Send
      </button>
    </form>
  );
}
