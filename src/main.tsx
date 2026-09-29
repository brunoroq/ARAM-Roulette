import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
import { I18nProvider } from './i18n/I18n.tsx';

createRoot(document.getElementById('root')!).render(<StrictMode><I18nProvider><App /></I18nProvider></StrictMode>);
