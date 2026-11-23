import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent third-party browser extension injection errors (e.g. chrome-extension://)
// from crashing or polluting app error handlers.
window.addEventListener(
  'error',
  (event) => {
    if (
      event.filename &&
      (event.filename.startsWith('chrome-extension://') ||
        event.filename.startsWith('moz-extension://'))
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);

createRoot(document.getElementById('root')!).render(<App />);
