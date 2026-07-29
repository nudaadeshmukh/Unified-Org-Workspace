// Placeholder only — the real shared component library (design tokens from
// reference/frontend_reference.md) is built in Phase 7.
export default function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors';
  const variants = {
    primary: 'bg-emerald-400 text-neutral-900 hover:bg-emerald-500',
    secondary: 'bg-white text-neutral-900 border border-neutral-300 hover:bg-neutral-50',
  };

  return (
    <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}
