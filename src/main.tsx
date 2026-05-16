import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { attachGestureGuard } from './ui/sound/sound';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

// Wire AudioContext bootstrap to any user gesture, so SFX survive a
// returning user (no KeyEntry visit) and a backgrounded-then-resumed tab
// (browser auto-suspends the context).
attachGestureGuard();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
