// Variants match reference/frontend_reference.md's button-* components
// exactly: rounded-sm (6px), button-md type, near-black text on the green
// fill (not white — the brand's deliberate choice).
export default function Button({ children, variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const variants = {
    primary: 'bg-primary text-ink hover:bg-primary-deep',
    secondary: 'bg-canvas text-ink border border-hairline-strong hover:bg-canvas-soft',
    'on-dark': 'bg-canvas-night text-white hover:bg-canvas-night-soft',
    link: 'bg-transparent text-ink underline-offset-2 hover:underline px-0 py-0',
    danger: 'bg-canvas text-red-600 border border-red-200 hover:bg-red-50',
  };

  return (
    <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}
