import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";
import ChatView from "@/pages/ChatView";
import NotesView from "@/pages/NotesView";
import AgendaView from "@/pages/AgendaView";
import AuthPage from "@/pages/AuthPage";
import AdminPage from "@/pages/AdminPage";

function AppRoutes() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-s-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-s-border border-t-s-text rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<ChatView />} />
        <Route path="notas"  element={<NotesView />} />
        <Route path="agenda" element={<AgendaView />} />
        {profile?.role === "admin" && (
          <Route path="admin" element={<AdminPage />} />
        )}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
