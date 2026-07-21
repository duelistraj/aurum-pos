import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { queryClient } from './api/queryClient';
import { ShopProvider } from './context/ShopContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ShopProvider>
        <App />
      </ShopProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
