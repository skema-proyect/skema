import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import VoiceStudio from "@/pages/VoiceStudio";
import Documents from "@/pages/Documents";
import Sketch from "@/pages/Sketch";
import Normativa from "@/pages/Normativa";
import Research from "@/pages/Research";

function ProtectedRoute({ session, children }: { session: Session | null; children: React.ReactNode }) {
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-skema-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-skema-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute session={session}>
              <Layout session={session} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="voz" element={<VoiceStudio />} />
          <Route path="documentos" element={<Documents />} />
          <Route path="planos" element={<Sketch />} />
          <Route path="normativa" element={<Normativa />} />
          <Route path="investigacion" element={<Research />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
