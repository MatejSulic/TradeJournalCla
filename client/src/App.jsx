import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import TradeList from './pages/TradeList';
import TradeDetail from './pages/TradeDetail';
import TradeForm from './pages/TradeForm';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/trades" element={<TradeList />} />
          <Route path="/trades/new" element={<TradeForm />} />
          <Route path="/trades/:id" element={<TradeDetail />} />
          <Route path="/trades/:id/edit" element={<TradeForm />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
