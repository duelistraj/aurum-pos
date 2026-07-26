import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Navbar } from './components/Navbar';
import { ConfigProvider } from './context/ConfigContext';
import { getAccessToken } from './utils/auth';
import { getLocalValue, setLocalValue } from './utils/storage';
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

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => getLocalValue(SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setLocalValue(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className={`app-shell${sidebarCollapsed ? ' app-shell--collapsed' : ''}`}>
      <Header onOpenSidebar={() => setMobileSidebarOpen(true)} />
      <Navbar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div className="app-shell__content">
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
};

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
  return (
    <ConfigProvider>
      <Router>
        <Suspense fallback={<PageLoader />}>
          <div className="app-root">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppShell>
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
                  </AppShell>
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
