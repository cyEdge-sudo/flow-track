"use client";

import React, { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ViewMode = "login" | "register";

type LoginForm = {
  email: string;
  password: string;
};

type RegisterForm = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: "user" | "manager";
};

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<ViewMode>("login");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [notice, setNotice] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [loginForm, setLoginForm] = useState<LoginForm>({
    email: "",
    password: "",
  });

  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "user",
  });

  const isLogin = mode === "login";

  const title = isLogin ? "Welcome back" : "Create your account";
  const subtitle = isLogin
    ? "Sign in to your productivity space."
    : "Join us and start tracking what matters.";

  function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validateAuth(): boolean {
    const newErrors: Record<string, string> = {};
    if (mode === "login") {
      if (!loginForm.email || !validateEmail(loginForm.email)) {
        newErrors.email = "Please enter a valid email address.";
      }
      if (!loginForm.password || loginForm.password.length < 8) {
        newErrors.password = "Password must be at least 8 characters.";
      }
    } else {
      if (!registerForm.name.trim()) {
        newErrors.name = "Please enter your full name.";
      }
      if (!registerForm.email || !validateEmail(registerForm.email)) {
        newErrors.email = "Please enter a valid email address.";
      }
      if (!registerForm.password || registerForm.password.length < 8) {
        newErrors.password = "Password must be at least 8 characters.";
      }
      if (registerForm.confirmPassword !== registerForm.password) {
        newErrors.confirmPassword = "Passwords do not match.";
      }
      if (!["user", "manager"].includes(registerForm.role)) {
        newErrors.role = "Please select a role.";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice("");
    if (!validateAuth()) return;

    setLoading(true);
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      });
      setLoading(false);
      if (error) {
        setNotice(error.message);
        return;
      }
      // Middleware will redirect to /tasks for logged-in users
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: registerForm.email,
        password: registerForm.password,
        options: {
          data: {
            name: registerForm.name,
            role: registerForm.role,
          },
          emailRedirectTo: undefined,
        },
      });
      setLoading(false);
      if (error) {
        setNotice(error.message);
        return;
      }
      if (data?.user && !data.user.confirmed_at) {
        setNotice("Registration successful. Please check your email to confirm your account.");
      } else {
        setNotice("Registration successful.");
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="mx-auto max-w-6xl px-6 pt-10 pb-24">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center">
              <span className="text-xl">⚡</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">FlowTrack</h1>
              <p className="text-xs text-white/60">Focus. Share. Deliver.</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-white/80">
            <a className="hover:text-white transition-colors" href="#">
              About
            </a>
            <span className="opacity-30">•</span>
            <a className="hover:text-white transition-colors" href="#">
              Help
            </a>
          </div>
        </header>

        <main className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          <section className="hidden lg:flex flex-col justify-between rounded-3xl p-10 bg-white/5 ring-1 ring-white/10">
            <div>
              <h2 className="text-4xl font-semibold leading-tight text-balance">
                Productivity that empowers teams and individuals
              </h2>
              <p className="mt-4 text-white/70 text-balance">
                Plan your day, share tasks effortlessly, and keep your team aligned with gentle nudges.
                Managers get clear daily reports without spreadsheet chaos.
              </p>
              <ul className="mt-8 space-y-4 text-white/80">
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">✓</span>
                  <div>
                    <p className="font-medium">Simple account roles</p>
                    <p className="text-sm text-white/60">Choose Manager or User during sign up—no complexity.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30">✓</span>
                  <div>
                    <p className="font-medium">Task sharing</p>
                    <p className="text-sm text-white/60">Collaborate with colleagues while staying in control.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30">✓</span>
                  <div>
                    <p className="font-medium">Smart nudges</p>
                    <p className="text-sm text-white/60">Friendly reminders to keep you and your team on track.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="mt-10 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-6 ring-1 ring-white/10">
              <p className="text-sm text-white/70">
                "FlowTrack makes it easy for my team to stay aligned. The daily report is my 2‑minute morning ritual."
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-white/20 ring-1 ring-white/30" />
                <div>
                  <p className="text-sm font-medium">Alex Morgan</p>
                  <p className="text-xs text-white/60">Engineering Manager</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-6 sm:p-8 lg:p-10 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full bg-white/5 p-1 ring-1 ring-white/10 w-full max-w-xl">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setErrors({});
                  setNotice("");
                }}
                className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
                  mode === "login" ? "bg-white text-slate-900 shadow" : "text-white/80"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setErrors({});
                  setNotice("");
                }}
                className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
                  mode === "register" ? "bg-white text-slate-900 shadow" : "text-white/80"
                }`}
              >
                Create account
              </button>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
              <p className="mt-1 text-sm text-white/70">{subtitle}</p>
            </div>

            {notice && (
              <div className="mt-6 rounded-xl bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-400/30 px-4 py-3 text-sm">
                {notice}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {mode === "register" && (
                <div>
                  <label htmlFor="name" className="block text-sm font-medium">Full name</label>
                  <div className="mt-2 relative">
                    <input
                      id="name"
                      type="text"
                      value={registerForm.name}
                      onChange={(e) => setRegisterForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Taylor Johnson"
                      className={`w-full rounded-xl bg-white/5 px-4 py-3 outline-none ring-1 transition placeholder:text-white/40 ${
                        errors.name ? "ring-rose-400/60 focus:ring-rose-300" : "ring-white/10 focus:ring-white/30"
                      }`}
                    />
                    {errors.name && <p className="mt-2 text-xs text-rose-300">{errors.name}</p>}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium">Email</label>
                <div className="mt-2 relative">
                  <input
                    id="email"
                    type="email"
                    value={isLogin ? loginForm.email : registerForm.email}
                    onChange={(e) =>
                      isLogin
                        ? setLoginForm((p) => ({ ...p, email: e.target.value }))
                        : setRegisterForm((p) => ({ ...p, email: e.target.value }))
                    }
                    placeholder="you@company.com"
                    className={`w-full rounded-xl bg-white/5 px-4 py-3 outline-none ring-1 transition placeholder:text-white/40 ${
                      errors.email ? "ring-rose-400/60 focus:ring-rose-300" : "ring-white/10 focus:ring-white/30"
                    }`}
                  />
                  {errors.email && <p className="mt-2 text-xs text-rose-300">{errors.email}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium">Password</label>
                <div className="mt-2 relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={isLogin ? loginForm.password : registerForm.password}
                    onChange={(e) =>
                      isLogin
                        ? setLoginForm((p) => ({ ...p, password: e.target.value }))
                        : setRegisterForm((p) => ({ ...p, password: e.target.value }))
                    }
                    placeholder="********"
                    className={`w-full rounded-xl bg-white/5 px-4 py-3 pr-12 outline-none ring-1 transition placeholder:text-white/40 ${
                      errors.password ? "ring-rose-400/60 focus:ring-rose-300" : "ring-white/10 focus:ring-white/30"
                    }`}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-1.5 text-xs bg-white/10 ring-1 ring-white/15 hover:bg-white/15"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                  {errors.password && <p className="mt-2 text-xs text-rose-300">{errors.password}</p>}
                </div>
              </div>

              {mode === "register" && (
                <>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium">Confirm password</label>
                    <div className="mt-2 relative">
                      <input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        value={registerForm.confirmPassword}
                        onChange={(e) =>
                          setRegisterForm((p) => ({ ...p, confirmPassword: e.target.value }))
                        }
                        placeholder="********"
                        className={`w-full rounded-xl bg-white/5 px-4 py-3 outline-none ring-1 transition placeholder:text-white/40 ${
                          errors.confirmPassword ? "ring-rose-400/60 focus:ring-rose-300" : "ring-white/10 focus:ring-white/30"
                        }`}
                      />
                      {errors.confirmPassword && (
                        <p className="mt-2 text-xs text-rose-300">{errors.confirmPassword}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="block text-sm font-medium">Select role</span>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRegisterForm((p) => ({ ...p, role: "user" }))}
                        className={`group rounded-2xl p-4 text-left ring-1 transition ${
                          registerForm.role === "user"
                            ? "bg-emerald-400 text-slate-900 ring-emerald-300"
                            : "bg-white/5 text-white ring-white/10 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-semibold">User</p>
                          <span
                            className={`h-5 w-5 rounded-full border ${
                              registerForm.role === "user"
                                ? "border-slate-900 bg-slate-900/20"
                                : "border-white/30"
                            }`}
                          />
                        </div>
                        <p
                          className={`mt-1 text-xs ${
                            registerForm.role === "user" ? "text-slate-800/90" : "text-white/70"
                          }`}
                        >
                          Track and share tasks, receive nudges.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRegisterForm((p) => ({ ...p, role: "manager" }))}
                        className={`group rounded-2xl p-4 text-left ring-1 transition ${
                          registerForm.role === "manager"
                            ? "bg-sky-400 text-slate-900 ring-sky-300"
                            : "bg-white/5 text-white ring-white/10 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-semibold">Manager</p>
                          <span
                            className={`h-5 w-5 rounded-full border ${
                              registerForm.role === "manager"
                                ? "border-slate-900 bg-slate-900/20"
                                : "border-white/30"
                            }`}
                          />
                        </div>
                        <p className={`mt-1 text-xs ${registerForm.role === "manager" ? "text-slate-800/90" : "text-white/70"}`}>
                          View daily reports.
                        </p>
                      </button>
                    </div>
                    {errors.role && <p className="mt-2 text-xs text-rose-300">{errors.role}</p>}
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-white text-slate-900 font-medium px-4 py-3 shadow hover:shadow-md transition disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? "Processing..." : isLogin ? "Sign in" : "Create account"}
              </button>

              <div className="flex items-center justify-center gap-2 text-sm text-white/70">
                <span>{isLogin ? "Don't have an account?" : "Already have an account?"}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode(isLogin ? "register" : "login");
                    setErrors({});
                    setNotice("");
                  }}
                  className="text-white underline underline-offset-4 hover:text-white/90"
                >
                  {isLogin ? "Create one" : "Sign in"}
                </button>
              </div>

              <p className="text-xs text-center text-white/50">By continuing you agree to our Terms and Privacy Policy.</p>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
