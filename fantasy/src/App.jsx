import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LeagueProvider } from './context/LeagueContext';
import { AuctionProvider } from './context/AuctionContext';
import Layout from './components/layout/Layout';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MyTeam from './pages/MyTeam';
import Market from './pages/Market';
import Standings from './pages/Standings';
import Bracket from './pages/Bracket';
import Auction from './pages/Auction';
import Transfers from './pages/Transfers';
import History from './pages/History';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/my-team" element={<ProtectedRoute><MyTeam /></ProtectedRoute>} />
        <Route path="/market" element={<ProtectedRoute><Market /></ProtectedRoute>} />
        <Route path="/standings" element={<ProtectedRoute><Standings /></ProtectedRoute>} />
        <Route path="/bracket" element={<ProtectedRoute><Bracket /></ProtectedRoute>} />
        <Route path="/auction" element={<ProtectedRoute><Auction /></ProtectedRoute>} />
        <Route path="/transfers" element={<ProtectedRoute><Transfers /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
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
