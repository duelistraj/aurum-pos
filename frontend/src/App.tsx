import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { POS } from './pages/POS';
import { Items } from './pages/Items';
import { MetalRates } from './pages/MetalRates';
import { Analytics } from './pages/Analytics';
import { History } from './pages/History';
import { Login } from './pages/Login';
import { ApiSetup } from './pages/ApiSetup';
import { getAccessToken } from './utils/auth';
import { hasConfiguredApiUrl } from './utils/apiConfig';
import { ConfigProvider } from './context/ConfigContext';
import './index.css';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    getAccessToken().then(token => {
      setIsAuthenticated(!!token);
    });
  }, [location]);

  if (isAuthenticated === null) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

function App() {
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    hasConfiguredApiUrl().then(setApiConfigured);
  }, []);

  if (apiConfigured === null) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!apiConfigured) {
    return (
      <ConfigProvider>
        <ApiSetup onConfigured={() => setApiConfigured(true)} />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider>
      <Router>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 transition-colors duration-200">
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/*" element={
              <ProtectedRoute>
                <div className="flex flex-col min-h-screen w-full bg-slate-50 dark:bg-slate-950 pb-28 transition-colors duration-200">
                  <Header />
                  <div className="flex-1 min-w-0">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/pos" element={<POS />} />
                      <Route path="/items" element={<Items />} />
                      <Route path="/rates" element={<MetalRates />} />
                      <Route path="/history" element={<History />} />
                      <Route path="/analytics" element={<Analytics />} />
                    </Routes>
                  </div>
                  <Navbar />
                </div>
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </Router>
    </ConfigProvider>
  );
}

export default App;
