import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@predictor/supabase';
import { LeagueProvider } from './context/LeagueContext';
import { AuctionProvider } from './context/AuctionContext';
import Layout from './components/layout/Layout';

import Dashboard from './pages/Dashboard';
import MyTeam from './pages/MyTeam';
import Market from './pages/Market';
import Leaderboard from './pages/Leaderboard';
import Bracket from './pages/Bracket';
import Auction from './pages/Auction';
import History from './pages/History';
import Admin from './pages/Admin';
import Rules from './pages/Rules';
import NotFound from './pages/NotFound';

function redirectToGateway() {
  window.location.replace(import.meta.env.VITE_GATEWAY_URL ?? '/');

  return null;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral text-primary">
        Cargando…
      </div>
    );
  }
  if (!user) return redirectToGateway();
  return children;
}

function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!user) return redirectToGateway();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return redirectToGateway();
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/my-team" element={<ProtectedRoute><MyTeam /></ProtectedRoute>} />
        <Route path="/market" element={<ProtectedRoute><Market /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
        <Route path="/bracket" element={<ProtectedRoute><Bracket /></ProtectedRoute>} />
        <Route path="/auction" element={<ProtectedRoute><Auction /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/rules" element={<ProtectedRoute><Rules /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/fantasy">
      <AuthProvider>
        <LeagueProvider>
          <AuctionProvider>
            <AppRoutes />
          </AuctionProvider>
        </LeagueProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
