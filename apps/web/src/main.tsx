import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import RouteError from './components/RouteError'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './styles.css'
import './tailwind.css'
import './studio.css'
import './product/product.css'

const router = createBrowserRouter([{ path: '*', element: <App />, errorElement: <RouteError /> }])
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
