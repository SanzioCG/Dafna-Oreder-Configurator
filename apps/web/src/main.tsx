import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ManagerPage } from './manager/ManagerPage';
import { ThemeProvider } from './theme/ThemeProvider';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
// D-19: the manager's price page (own PIN); everything else is the kiosk
const manager = window.location.pathname.replace(/\/+$/, '') === '/manager';
createRoot(root).render(
  <StrictMode>
    {manager ? (
      <ThemeProvider>
        <ManagerPage />
      </ThemeProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
