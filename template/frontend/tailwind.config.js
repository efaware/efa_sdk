/** @type {import('tailwindcss').Config} */
export default {
  // Das SDK-ui-Kit bringt Tailwind-Klassen mit (Arbitrary-Werte wie
  // `text-[var(--color-danger-text)]`) — ohne diesen Pfad fehlen sie im CSS.
  content: ['./index.html', './src/**/*.{ts,tsx}', './node_modules/@efa-one/sdk/frontend/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      borderRadius: {
        none: '0px',
        sm: 'var(--border-radius-sm)',
        DEFAULT: 'var(--border-radius-md)',
        md: 'var(--border-radius-md)',
        lg: 'var(--border-radius-lg)',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
