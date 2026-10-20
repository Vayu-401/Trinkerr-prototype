import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { canUseSurveys } from "../auth/guards";
import { Logo } from "../components/Layout";

/** Left panel shows what the product produces: a live-looking poll result. */
function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const sample = [
    { label: "Equity", pct: 62 },
    { label: "Mutual funds", pct: 48 },
    { label: "Gold", pct: 21 },
    { label: "Bonds", pct: 14 },
  ];
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <Logo light />
        <div className="max-w-md">
          <p className="text-3xl font-bold leading-tight">Where will verified investors put money next quarter?</p>
          <div className="mt-8 space-y-4">
            {sample.map((s) => (
              <div key={s.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-white/80">{s.label}</span>
                  <span className="num font-semibold">{s.pct}%</span>
                </div>
                <div className="h-3 rounded-sm bg-white/10">
                  <div className="h-3 rounded-sm bg-marigold" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-white/60">1,620 verified investors answered. Select-all questions can add up to more than 100%.</p>
        </div>
        <p className="text-sm text-white/50">Polls answered only by investors whose documents we've checked.</p>
      </section>
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <h1 className="mb-6">{title}</h1>
          {children}
        </div>
      </section>
    </div>
  );
}

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const u = await login(v.email, v.password);
      navigate(canUseSurveys(u) ? location.state?.from ?? "/" : "/verification", { replace: true });
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  return (
    <AuthShell title="Log in">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" {...register("email")} />
          {formState.errors.email && <p className="field-error">{formState.errors.email.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" className="input" {...register("password")} />
          {formState.errors.password && <p className="field-error">{formState.errors.password.message}</p>}
        </div>
        {formError && <p role="alert" className="rounded bg-brick-soft px-3 py-2 text-sm text-brick">{formError}</p>}
        <button className="btn-primary w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        New here? <Link to="/register" className="btn-link">Create an account</Link>
      </p>
    </AuthShell>
  );
}

const registerSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});

export function RegisterPage() {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await signUp(v.email, v.name, v.password);
      navigate("/verification", { replace: true });
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  return (
    <AuthShell title="Create your investor account">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" autoComplete="name" className="input" {...register("name")} />
          {formState.errors.name && <p className="field-error">{formState.errors.name.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" {...register("email")} />
          {formState.errors.email && <p className="field-error">{formState.errors.email.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" className="input" {...register("password")} />
          {formState.errors.password && <p className="field-error">{formState.errors.password.message}</p>}
        </div>
        {formError && <p role="alert" className="rounded bg-brick-soft px-3 py-2 text-sm text-brick">{formError}</p>}
        <button className="btn-primary w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Creating account…" : "Create account"}
        </button>
        <p className="text-sm text-muted">Next you'll upload a PAN card or demat statement so an admin can verify you.</p>
      </form>
      <p className="mt-6 text-sm text-muted">
        Already registered? <Link to="/login" className="btn-link">Log in</Link>
      </p>
    </AuthShell>
  );
}
