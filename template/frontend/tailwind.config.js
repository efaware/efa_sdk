/** @type {import('tailwindcss').Config} */
export default {
  // Das SDK-UI-Kit (`@efa-one/sdk/frontend/ui`) bringt Komponenten mit eigenen
  // Tailwind-Klassen mit. Tailwind scannt `node_modules` nicht von selbst — ohne den
  // dritten Eintrag fehlen Klassen, die nur im SDK vorkommen (`fixed`, `z-50`, …), und
  // Dialoge rendern unsichtbar im Seitenfluss. Glob auf `.js`: das Paket liefert kompiliert aus.
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
