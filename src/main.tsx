import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { attachGestureGuard } from './ui/sound/sound';
import { applyJadeOverrideAtBoot } from './jade/storage';
import { installDebugCounters } from './debug/install';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

// Wire AudioContext bootstrap to any user gesture, so SFX survive a
// returning user (no KeyEntry visit) and a backgrounded-then-resumed tab
// (browser auto-suspends the context).
attachGestureGuard();

// If the user has been editing the dialogue tree in Jade, make the live
// survey use her local copy from the very first mount.
applyJadeOverrideAtBoot();

// Wire console.error + global-error listeners → debug overlay counters.
installDebugCounters();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
