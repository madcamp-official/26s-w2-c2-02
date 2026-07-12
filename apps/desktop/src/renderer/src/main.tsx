import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';
import './styles/onboarding.css';
import './styles/waiting.css';
import './styles/break.css';
import './styles/retrospective.css';
import './styles/create-room.css';
import './styles/study.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
