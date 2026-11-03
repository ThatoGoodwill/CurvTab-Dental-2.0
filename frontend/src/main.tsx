import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './App'
import './newlook.css'
import { AuthProvider } from './auth/AuthProvider'
import { AuthGate } from './auth/AuthGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Makes authentication information available throughout React. */}
    <AuthProvider>
      {/* Checks whether the user is allowed into the dashboard. */}
      <AuthGate>
        {/* Your existing premium CurvTab dashboard remains intact. */}
        <App />
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)