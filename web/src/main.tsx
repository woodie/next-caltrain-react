import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@progress/kendo-theme-default/dist/default-main-dark.css'
import './styles.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
