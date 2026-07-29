/** @type {import('tailwindcss').Config} */
// Palette/radii sourced from reference/frontend_reference.md — keep in sync
// with support-hub's config; both apps must drift together, not apart.
module.exports = {
  content: ['./app/**/*.{js,jsx}', '../../packages/ui/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3ecf8e',
        'primary-deep': '#24b47e',
        'primary-soft': '#4ade80',
        ink: '#171717',
        'ink-secondary': '#212121',
        'ink-mute': '#707070',
        'ink-mute-2': '#9a9a9a',
        'ink-faint': '#b2b2b2',
        canvas: '#ffffff',
        'canvas-soft': '#fafafa',
        'canvas-night': '#1c1c1c',
        'canvas-night-soft': '#202020',
        hairline: '#dfdfdf',
        'hairline-strong': '#c7c7c7',
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
    },
  },
  plugins: [],
};
