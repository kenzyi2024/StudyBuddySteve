module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['@typescript-eslint', 'react-refresh'],
  // This config lints the Vite frontend. The gateway (server/) and parser
  // (ai-parser/) are separate packages with their own tooling.
  ignorePatterns: ['dist', 'node_modules', 'server', 'ai-parser'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // TypeScript checks props; runtime prop-types would be redundant.
    'react/prop-types': 'off',
    // `any` is used deliberately at the API boundary (untyped JSON) and a few
    // interop points; keep it as a warning rather than a hard error.
    '@typescript-eslint/no-explicit-any': 'off',
    // The Vite JSX runtime + generated types make some of these noisy; the real
    // safety net for this codebase is `tsc --noEmit`.
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
}
