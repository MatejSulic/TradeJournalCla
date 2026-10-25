import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import TradeList from './pages/TradeList';
import TradeDetail from './pages/TradeDetail';
import TradeForm from './pages/TradeForm';
import SeriesPage from './pages/Series';
import Expenses from './pages/Expenses';
import AiAnalyst from './pages/AiAnalyst';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/trades" element={<TradeList />} />
            <Route path="/trades/new" element={<TradeForm />} />
            <Route path="/trades/:id" element={<TradeDetail />} />
            <Route path="/trades/:id/edit" element={<TradeForm />} />
            <Route path="/series" element={<SeriesPage />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/ai" element={<AiAnalyst />} />
            <Route path="/ai/:id" element={<AiAnalyst />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
