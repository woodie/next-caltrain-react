import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import kendoLight from '@progress/kendo-theme-default/dist/default-main.css?url'
import kendoDark from '@progress/kendo-theme-default/dist/default-main-dark.css?url'
import './styles.css'
import { App } from './App'

// Kendo's light and dark themes style the same classes, so each gets its own
// stylesheet that only applies under the matching system setting. They go
// first in <head>, so styles.css (the apps' own colors) still wins.
for (const [href, scheme] of [[kendoDark, 'dark'], [kendoLight, 'light']]) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.media = `(prefers-color-scheme: ${scheme})`
  document.head.prepend(link)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
