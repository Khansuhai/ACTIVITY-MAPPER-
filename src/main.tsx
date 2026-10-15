import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Shell } from './app/Shell';
import { ErrorBoundary } from './app/ErrorBoundary';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  </StrictMode>,
);
