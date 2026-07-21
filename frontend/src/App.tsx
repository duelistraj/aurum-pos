import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Navbar } from './components/Navbar';
import { ConfigProvider } from './context/ConfigContext';
import { ApiSetup } from './pages/ApiSetup';
import { getAccessToken } from './utils/auth';
import { hasConfiguredApiUrl } from './utils/apiConfig';
import './index.css';

const Dashboard = lazy(() => import('./pages/Dashboard').then(({ Dashboard }) => ({ default: Dashboard })));
const POS = lazy(() => import('./pages/POS').then(({ POS }) => ({ default: POS })));
const Items = lazy(() => import('./pages/Items').then(({ Items }) => ({ default: Items })));
const MetalRates = lazy(() => import('./pages/MetalRates').then(({ MetalRates }) => ({ default: MetalRates })));
const Analytics = lazy(() => import('./pages/Analytics').then(({ Analytics }) => ({ default: Analytics })));
const History = lazy(() => import('./pages/History').then(({ History }) => ({ default: History })));
const Login = lazy(() => import('./pages/Login').then(({ Login }) => ({ default: Login })));
const Subscription = lazy(() => import('./pages/Subscription').then(({ Subscription }) => ({ default: Subscription })));
const Staff = lazy(() => import('./pages/Staff').then(({ Staff }) => ({ default: Staff })));
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center" role="status">
    Loading…
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    void getAccessToken().then((token) => setIsAuthenticated(Boolean(token)));
  }, [location.pathname]);

  if (isAuthenticated === null) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
};

function App() {
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    void hasConfiguredApiUrl().then(setApiConfigured);
  }, []);

  if (apiConfigured === null) return <PageLoader />;

  if (!apiConfigured) {
    return (
      <ConfigProvider>
        <Suspense fallback={<PageLoader />}>
          <ApiSetup onConfigured={() => setApiConfigured(true)} />
        </Suspense>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider>
      <Router>
        <Suspense fallback={<PageLoader />}>
          <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 transition-colors duration-200">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <div className="flex flex-col min-h-screen w-full bg-slate-50 dark:bg-slate-950 pb-28 transition-colors duration-200">
                      <Header />
                      <main className="flex-1 min-w-0">
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/pos" element={<POS />} />
                          <Route path="/items" element={<Items />} />
                          <Route path="/rates" element={<MetalRates />} />
                          <Route path="/history" element={<History />} />
                          <Route path="/analytics" element={<Analytics />} />
                          <Route path="/subscription" element={<Subscription />} />
                          <Route path="/staff" element={<Staff />} />
                        </Routes>
                      </main>
                      <Navbar />
                    </div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </Suspense>
      </Router>
    </ConfigProvider>
  );
}

export default App;
