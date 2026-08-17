/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Colors are chosen dynamically (bg-${color}, text-${color}, shadow-chunk-${color}),
  // so Tailwind's scanner can't see them at build time. Safelist them explicitly.
  safelist: [
    { pattern: /(bg|text|border)-(magenta|cyan|lime|amber|grape|crt|beige)/ },
    'shadow-chunk',
    'shadow-chunk-lg',
    'shadow-chunk-magenta',
    'shadow-chunk-cyan',
  ],
  theme: {
    // We intentionally REPLACE (not extend) parts of the default theme to strip
    // out the modern SaaS feel and enforce a chunky, high-contrast retro look.
    extend: {
      colors: {
        // Nostalgic arcade palette on a dark CRT background
        void: '#0d0b1f',       // deep CRT background
        dusk: '#1a1533',       // panel background
        beige: '#e8e0c8',      // classic early-web off-white
        ink: '#0a0812',        // near-black for borders / text on light
        magenta: '#ff2e97',    // hot arcade pink
        cyan: '#22e0ff',       // electric cyan
        lime: '#b8ff2e',       // radioactive green
        amber: '#ffb020',      // CRT amber
        grape: '#7b2ff7',      // synth purple
        crt: '#4dffb8',        // phosphor green (Steve's screen)
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],   // headings / display
        mono: ['"VT323"', 'monospace'],             // terminal / labels
        body: ['"Space Grotesk"', 'system-ui', 'sans-serif'], // readable body
      },
      boxShadow: {
        // Chunky, hard-edged drop shadows — no blur, pure offset blocks
        chunk: '6px 6px 0 0 #0a0812',
        'chunk-lg': '10px 10px 0 0 #0a0812',
        'chunk-magenta': '6px 6px 0 0 #ff2e97',
        'chunk-cyan': '6px 6px 0 0 #22e0ff',
        'chunk-inset': 'inset 4px 4px 0 0 rgba(0,0,0,0.35)',
        glow: '0 0 24px 0 rgba(34,224,255,0.55)',
      },
      borderWidth: {
        3: '3px',
        5: '5px',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '93%': { opacity: '0.72' },
          '94%': { opacity: '1' },
          '97%': { opacity: '0.85' },
          '98%': { opacity: '1' },
        },
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        'steve-bob': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'press-in': {
          '0%': { transform: 'translate(0,0)' },
          '100%': { transform: 'translate(3px,3px)' },
        },
      },
      animation: {
        flicker: 'flicker 6s infinite',
        blink: 'blink 1s step-end infinite',
        'steve-bob': 'steve-bob 2.4s ease-in-out infinite',
        scan: 'scan 2.2s linear infinite',
      },
    },
  },
  plugins: [],
}
