import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The app is published under a path, not at a domain root, so asset URLs have to carry that
// prefix. Left at the default "/" the bundle asks for /assets/... and gets the main ProofLines
// site's 404 page, which fails as a blank screen rather than as a visible error.
export default defineConfig({
  base: '/monad/agent-trust/',
  plugins: [react()],
})
