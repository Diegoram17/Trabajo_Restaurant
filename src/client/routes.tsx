import { Route, Routes } from 'react-router';
import { Estacion } from './pages/Estacion';
import { Kds } from './pages/Kds';
import { Cocina } from './pages/Cocina';
import { Admin } from './pages/Admin';

/**
 * Exactly the four domain routes ADR-0001 names (spec: Four Placeholder
 * Routes) — no route beyond these four exists, and no domain UI belongs
 * here yet.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/estacion" element={<Estacion />} />
      <Route path="/kds" element={<Kds />} />
      <Route path="/cocina" element={<Cocina />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}
