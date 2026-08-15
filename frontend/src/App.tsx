import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { MetalRateReminder } from './components/MetalRateReminder';
import { Navbar } from './components/Navbar';
import { ConfigProvider } from './context/ConfigContext';
import {
  subscribeAuthEvents,
} from './utils/auth';
import { apiClient } from './api/client';
import { useShop } from './context/ShopContext';
import { useNetworkState } from './utils/network';
import './index.css';

const Dashboard = lazy(() => import('./pages/Dashboard').then(({ Dashboard }) => ({ default: Dashboard })));
const CashierDashboard = lazy(() => import('./pages/CashierDashboard').then(({ CashierDashboard }) => ({ default: CashierDashboard })));
const POS = lazy(() => import('./pages/POS').then(({ POS }) => ({ default: POS })));
const Items = lazy(() => import('./pages/Items').then(({ Items }) => ({ default: Items })));
const CashierInventory = lazy(() => import('./pages/CashierInventory').then(({ CashierInventory }) => ({ default: CashierInventory })));
const MetalRates = lazy(() => import('./pages/MetalRates').then(({ MetalRates }) => ({ default: MetalRates })));
const Analytics = lazy(() => import('./pages/Analytics').then(({ Analytics }) => ({ default: Analytics })));
const CashierAnalytics = lazy(() => import('./pages/CashierAnalytics').then(({ CashierAnalytics }) => ({ default: CashierAnalytics })));
const Transactions = lazy(() => import('./pages/History').then(({ Transactions }) => ({ default: Transactions })));
const Login = lazy(() => import('./pages/Login').then(({ Login }) => ({ default: Login })));
const Subscription = lazy(() => import('./pages/Subscription').then(({ Subscription }) => ({ default: Subscription })));
const Account = lazy(() => import('./pages/Account').then(({ Account }) => ({ default: Account })));
const ManageShop = lazy(() => import('./pages/Staff').then(({ ManageShop }) => ({ default: ManageShop })));
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center" role="status">
    Loading…
  </div>
);

const InventoryRoute: React.FC = () => {
  const { activeMembership } = useShop();
  return activeMembership?.role === 'CASHIER' ? <CashierInventory /> : <Items />;
};

const DashboardRoute: React.FC = () => {
  const { activeMembership } = useShop();
  return activeMembership?.role === 'CASHIER' ? <CashierDashboard /> : <Dashboard />;
};

const AnalyticsRoute: React.FC = () => {
  const { activeMembership } = useShop();
  return activeMembership?.role === 'CASHIER' ? <CashierAnalytics /> : <Analytics />;
};

const ManagerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeMembership } = useShop();
  return activeMembership?.role === 'CASHIER' ? <Navigate to="/" replace /> : <>{children}</>;
};

const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isOnline = useNetworkState();

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell app-shell--collapsed">
      {!isOnline && (
        <div className="network-status" role="status">
          You are offline. Changes will resume when the network returns.
        </div>
      )}
      <Header
        navigationOpen={mobileSidebarOpen}
        onOpenSidebar={() => setMobileSidebarOpen(true)}
      />
      <Navbar
        collapsed
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <MetalRateReminder />
      <div className="app-shell__content">
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const location = useLocation();
  const { reload } = useShop();

  useEffect(() => {
    let active = true;
    setIsAuthenticated(null);
    void apiClient.restoreSession()
      .then(async (authenticated) => {
        if (authenticated) await reload();
        if (active) setIsAuthenticated(authenticated);
      });
    const unsubscribe = subscribeAuthEvents(() => {
      if (active) setIsAuthenticated(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [location.pathname, reload]);

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
                      <Route path="/" element={<DashboardRoute />} />
                      <Route path="/pos" element={<POS />} />
                      <Route path="/items" element={<InventoryRoute />} />
                      <Route path="/rates" element={<MetalRates />} />
                      <Route path="/transactions" element={<Transactions />} />
                      <Route path="/analytics" element={<AnalyticsRoute />} />
                      <Route path="/subscription" element={<ManagerRoute><Subscription /></ManagerRoute>} />
                      <Route path="/account" element={<Account />} />
                      <Route path="/manage-shop" element={<ManagerRoute><ManageShop /></ManagerRoute>} />
                      <Route path="/history" element={<Navigate to="/transactions" replace />} />
                      <Route
                        path="/invoices"
                        element={<Navigate to="/transactions?tab=invoices" replace />}
                      />
                      <Route
                        path="/staff"
                        element={<Navigate to="/manage-shop?tab=staff" replace />}
                      />
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
