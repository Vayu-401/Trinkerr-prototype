import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { canUseSurveys } from "../auth/guards";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-ink"}`}>
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill={light ? "#FFFFFF" : "#1B2A3A"} />
        <rect x="7" y="9" width="18" height="4" rx="2" fill="#E3A72F" />
        <rect x="7" y="15" width="12" height="4" rx="2" fill="#E3A72F" />
        <rect x="7" y="21" width="7" height="4" rx="2" fill="#E3A72F" />
      </svg>
      Trinkerr Polls
    </span>
  );
}

function NavItem({ to, children, end }: { to: string; children: ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `block rounded px-3 py-2 text-[15px] font-medium transition-colors ${
          isActive ? "bg-ink text-white" : "text-ink/80 hover:bg-line/60 hover:text-ink"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const verified = canUseSurveys(user);

  const nav = (
    <nav className="flex flex-col gap-1" onClick={() => setOpen(false)}>
      {verified ? (
        <>
          <NavItem to="/" end>Feed</NavItem>
          <NavItem to="/surveys" end>Surveys</NavItem>
          <NavItem to="/surveys/new">Create a survey</NavItem>
          <NavItem to="/my/surveys">My surveys</NavItem>
          <NavItem to="/dashboard">Dashboard</NavItem>
        </>
      ) : (
        <NavItem to="/verification">Verification</NavItem>
      )}
      {user.role === "admin" && (
        <>
          <div className="mt-4 px-3 pb-1 text-xs font-semibold text-muted">Admin</div>
          <NavItem to="/admin/investors">Investors</NavItem>
        </>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/95 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <button className="btn-secondary px-3 py-1.5" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Menu"}
        </button>
      </header>
      {open && <div className="border-b border-line bg-paper px-4 py-3 md:hidden">{nav}</div>}

      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-paper px-4 py-6 md:flex">
        <div className="px-3 pb-8">
          <Logo />
        </div>
        {nav}
        <div className="mt-auto border-t border-line px-3 pt-4">
          <div className="truncate text-sm font-semibold">{user.name}</div>
          <div className="truncate text-xs text-muted">{user.email}</div>
          <button
            className="btn-link mt-3"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-10 md:py-10">
        <Outlet />
        <div className="mt-16 border-t border-line pt-4 md:hidden">
          <span className="text-sm text-muted">Signed in as {user.email}. </span>
          <button
            className="btn-link"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Log out
          </button>
        </div>
      </main>
    </div>
  );
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1>{title}</h1>
        {intro && <p className="mt-2 text-muted">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
