import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { Call } from './screens/Call.js';
import { ShareBar } from './screens/ShareBar.js';
import './styles.css';
import { applyTheme, getTheme, resetTheme } from './theme.js';

// Applied before the first paint so the window never flashes the wrong colours.
applyTheme(getTheme());

// Hard rule 9: the appearance reset is bound before any user config is applied
// and cannot be intercepted by a theme, because a theme is only ever data.
window.addEventListener(
  'keydown',
  (event) => {
    if (event.ctrlKey && event.altKey && event.code === 'KeyR') {
      event.preventDefault();
      resetTheme();
    }
  },
  { capture: true },
);

const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing');

// The shell registers Ctrl+Alt+R globally, so the reset works even when the
// window is not focused; this applies it inside the page.
window.bmf?.onResetAppearance(() => resetTheme());

/**
 * The call runs in a second window of the same bundle. Same origin, so it shares
 * the session and talks to the API itself — nothing has to be handed across.
 * Which window this is comes from the URL the shell opened.
 */
const params = new URLSearchParams(window.location.search);
const callId = params.get('call');
// The third window: the block that floats over a shared screen. It carries no
// media of its own — it presses buttons in the call window above.
const shareBar = params.get('share-bar');

createRoot(root).render(
  <StrictMode>
    {shareBar ? <ShareBar /> : callId ? <Call callId={callId} /> : <App />}
  </StrictMode>,
);
