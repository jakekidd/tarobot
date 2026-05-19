import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { attachGestureGuard } from './ui/sound/sound';
import { installDebugCounters } from './debug/install';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

// Wire AudioContext bootstrap to any user gesture, so SFX survive a
// returning user (no KeyEntry visit) and a backgrounded-then-resumed tab
// (browser auto-suspends the context).
attachGestureGuard();

// One-time cleanup of the legacy Jade-editor localStorage entry. The
// in-app survey editor is gone; SURVEY.md on GitHub is the source of
// truth now. Safe to call every boot — the key simply won't exist for
// most users.
try { localStorage.removeItem('tarobot:jade:tree'); } catch { /* ignore */ }

// Wire console.error + global-error listeners → debug overlay counters.
installDebugCounters();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
