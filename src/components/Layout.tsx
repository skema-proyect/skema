import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Mic,
  FileText,
  PenTool,
  BookOpen,
  Search,
  LogOut,
} from "lucide-react";

const navItems = [
  { label: "Dashboard",      icon: LayoutDashboard, to: "/"            },
  { label: "Estudio de Voz", icon: Mic,             to: "/voz"         },
  { label: "Documentos",     icon: FileText,        to: "/documentos"  },
  { label: "Planos",         icon: PenTool,         to: "/planos"      },
  { label: "Normativa",      icon: BookOpen,        to: "/normativa"   },
  { label: "Investigación",  icon: Search,          to: "/investigacion"},
];

export default function Layout({ session }: { session: Session | null }) {
  const navigate  = useNavigate();
  const location  = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const userEmail = session?.user?.email ?? "";
  const initials  = userEmail.slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen bg-skema-bg">

      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-skema-surface border-r border-skema-border flex flex-col">

        {/* Logo */}
        <div className="px-6 py-5 border-b border-skema-border">
          <p className="text-skema-accent font-inter font-semibold text-xl tracking-widest">SKEMA</p>
          <p className="text-skema-muted text-[10px] tracking-wider mt-0.5">Asistente de Dirección</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ label, icon: Icon, to }) => {
            const active = location.pathname === to;
            return (
              <button
                key={to}
                onClick={() => navigate(to)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 font-inter text-[13px] ${
                  active
                    ? "bg-skema-accent/10 text-skema-accent"
                    : "text-skema-muted hover:bg-skema-border/50 hover:text-skema-text"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-skema-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-skema-accent/20 flex items-center justify-center text-skema-accent text-[11px] font-semibold">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-skema-text text-[11px] truncate">{userEmail}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-skema-muted hover:text-skema-danger transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
