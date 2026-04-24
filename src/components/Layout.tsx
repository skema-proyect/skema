import { useState, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";

export default function Layout() {
  const navigate = useNavigate();
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [refresh,       setRefresh]       = useState(0);

  const bump = useCallback(() => setRefresh(r => r + 1), []);

  const handleNewChat = useCallback(() => {
    setCurrentConvId(null);
    navigate("/");
    setSidebarOpen(false);
    bump();
  }, [navigate, bump]);

  const handleSelectConv = useCallback((id: string) => {
    setCurrentConvId(id);
    setSidebarOpen(false);
    bump();
  }, [bump]);

  const handleServiceSelect = useCallback((prompt: string) => {
    setCurrentConvId(null);
    navigate("/", { state: { initialPrompt: prompt } });
    setSidebarOpen(false);
    bump();
  }, [navigate, bump]);

  return (
    <div className="flex h-screen overflow-hidden bg-s-bg text-s-text font-inter">

      {/* Sidebar — desktop */}
      <div className="hidden lg:flex w-64 flex-shrink-0 flex-col">
        <Sidebar
          currentConvId={currentConvId}
          onSelectConv={handleSelectConv}
          onNewChat={handleNewChat}
          onServiceSelect={handleServiceSelect}
          refresh={refresh}
        />
      </div>

      {/* Sidebar — mobile fullscreen */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <Sidebar
            currentConvId={currentConvId}
            onSelectConv={handleSelectConv}
            onNewChat={handleNewChat}
            onServiceSelect={handleServiceSelect}
            onClose={() => setSidebarOpen(false)}
            refresh={refresh}
          />
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center gap-3 px-4 h-12 border-b border-s-border bg-s-bg">
          <button onClick={() => setSidebarOpen(true)} className="text-s-muted hover:text-s-text">
            <Menu size={20} />
          </button>
          <button onClick={handleNewChat}>
            <img src="/logo-skema.png" alt="SKEMA" className="h-5 w-auto hover:opacity-70 transition-opacity" />
          </button>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-hidden">
          <Outlet context={{ currentConvId, setCurrentConvId, bump }} />
        </div>
      </div>
    </div>
  );
}
