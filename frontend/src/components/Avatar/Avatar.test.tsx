import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Avatar } from './Avatar';

describe('Avatar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('renders with connection/speaking classes and current viseme mouth', () => {
    const { container } = render(<Avatar viseme="o" speaking connected connecting={false} />);

    const shell = container.querySelector('.avatar-shell');
    const mouth = container.querySelector('path[d^="M 114 139"]');

    expect(screen.getByLabelText('Tutor avatar')).toBeInTheDocument();
    expect(shell).toHaveClass('speaking', 'connected');
    expect(shell).not.toHaveClass('connecting');
    expect(mouth).toHaveAttribute('fill', '#5c1a2a');
  });

  it('blinks on the scheduled timer and reacts to mouse movement', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { container } = render(<Avatar viseme="rest" speaking={false} connected={false} connecting />);

    const wrapper = container.firstElementChild as HTMLElement;
    const shell = container.querySelector('.avatar-shell') as HTMLElement;
    expect(shell).toHaveClass('connecting');

    vi.spyOn(shell, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 100,
      top: 100,
      width: 200,
      height: 200,
      right: 300,
      bottom: 300,
      toJSON: () => ({}),
    });

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(container.querySelector('path[d="M 89 108 C 94 112 106 112 111 108"]')).toBeInTheDocument();

    fireEvent.mouseMove(window, { clientX: 190, clientY: 190 });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(wrapper.style.transform).not.toBe('');

    fireEvent.mouseMove(window, { clientX: 1000, clientY: 1000 });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    wrapper.firstElementChild?.remove();
    fireEvent.mouseMove(window, { clientX: 210, clientY: 210 });

    fireEvent.mouseLeave(document);
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(wrapper.style.transform).toContain('translate(0px, 0px)');
  });
});
