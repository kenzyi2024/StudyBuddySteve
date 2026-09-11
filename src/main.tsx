import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Optional error tracking — lazy-loaded only when a DSN is configured, so it
// stays out of the bundle for anyone not using it.
if (import.meta.env?.VITE_SENTRY_DSN) {
  import('@sentry/react')
    .then((Sentry) => Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN }))
    .catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
