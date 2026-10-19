/** @type {import('tailwindcss').Config} */
export default {
  // Tailwind v4: diese Datei wird per `@config` aus `src/index.css` geladen (Theme +
  // darkMode). Den SDK-Pfad trägt `@source` in `src/index.css` ein — ohne ihn fehlen
  // Klassen, die nur im SDK vorkommen (`fixed`, `z-50`, …), und Dialoge rendern
  // unsichtbar im Seitenfluss.
  content: ['./index.html', './src/**/*.{ts,tsx}'],
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
