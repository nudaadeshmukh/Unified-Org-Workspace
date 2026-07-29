// Placeholder only — real component library comes in Phase 7.
export default function Card({ children, className = '', ...props }) {
  return (
    <div className={`rounded-lg border border-neutral-200 bg-white p-8 ${className}`} {...props}>
      {children}
    </div>
  );
}
