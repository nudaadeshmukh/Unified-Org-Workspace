// card-feature-light: canvas bg, rounded-lg (12px), 1px hairline border.
// padding defaults to 32px per the design system but is overridable for
// denser app-shell usage (e.g. list rows) via className.
export default function Card({ children, className = '', ...props }) {
  return (
    <div className={`rounded-lg border border-hairline bg-canvas p-8 ${className}`} {...props}>
      {children}
    </div>
  );
}
