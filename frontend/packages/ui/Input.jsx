// text-input: canvas bg, rounded-sm (6px), 1px hairline border, body-md type.
export function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-hairline-strong focus:outline-none ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={`w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Label({ children, className = '', ...props }) {
  return (
    <label className={`mb-1 block text-xs font-medium text-ink-mute ${className}`} {...props}>
      {children}
    </label>
  );
}
