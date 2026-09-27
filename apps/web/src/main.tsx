import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './routes/router';
import './styles/index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container #root was not found in index.html');
}

const router = createBrowserRouter(routes);

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
