"use client";
import { FormEvent, useEffect, useRef, useState } from "react";

type Props = { returnTo?: string };
type TelegramLink = {
  status: "PENDING" | "LINKED" | "USED";
  telegramId: string | null;
  telegramUsername: string | null;
};

function getPasswordStrength(password: string) {
  if (!password) return { level: 0, label: "", bars: 0 };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: "WEAK", bars: 1 };
  if (score <= 3) return { level: 2, label: "FAIR", bars: 2 };
  if (score === 4) return { level: 3, label: "STRONG", bars: 3 };
  return { level: 4, label: "PERFECT", bars: 4 };
}

export default function V1124Auth({ returnTo = "/" }: Props) {
  const [mode, setMode] = useState<"choice" | "signin" | "signup">("choice");
  const [recovery, setRecovery] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [linkId, setLinkId] = useState("");
  const [telegram, setTelegram] = useState<TelegramLink | null>(null);
  const [linking, setLinking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function startTelegramLink() {
    setError("");
    setLinking(true);

    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "telegram-link-start" }),
      });

      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.error || "TELEGRAM CONNECTION FAILED.");
      }

      setLinkId(d.linkId);
      window.open(d.telegramUrl, "_blank", "noopener,noreferrer");

      if (pollRef.current) clearInterval(pollRef.current);

      pollRef.current = setInterval(async () => {
        try {
          const statusResponse = await fetch("/api/auth", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "telegram-link-status",
              linkId: d.linkId,
            }),
            cache: "no-store",
          });

          const statusData = await statusResponse.json();

          if (!statusResponse.ok) {
            if (pollRef.current) clearInterval(pollRef.current);
            setLinking(false);
            setError(
              statusData.error || "TELEGRAM CONNECTION FAILED."
            );
            return;
          }

          const link = statusData.link as TelegramLink;

          if (link.status === "LINKED") {
            if (pollRef.current) clearInterval(pollRef.current);
            setTelegram(link);
            setLinking(false);
          }
        } catch {
          // Keep polling while the user completes the Telegram step.
        }
      }, 1000);
    } catch (x) {
      setLinking(false);
      setError(
        x instanceof Error
          ? x.message
          : "TELEGRAM CONNECTION FAILED."
      );
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "signup") {
      if (password !== confirm) {
        setError("PASSWORDS DO NOT MATCH.");
        return;
      }

      if (
        !telegram?.telegramId ||
        telegram.status !== "LINKED" ||
        !linkId
      ) {
        setError("TELEGRAM MUST BE CONNECTED.");
        return;
      }
    }

    setBusy(true);

    try {
      const body =
        mode === "signup"
          ? {
              action: "signup",
              username,
              password,
              linkId,
            }
          : {
              action: "signin",
              username,
              password,
            };

      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.error || "AUTHENTICATION FAILED.");
      }

      window.location.href =
        mode === "signup" ? "/" : returnTo;
    } catch (x) {
      setError(
        x instanceof Error
          ? x.message
          : "AUTHENTICATION FAILED."
      );
    } finally {
      setBusy(false);
    }
  }

  async function recover(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "recovery",
          username,
        }),
      });

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.error || "RECOVERY REQUEST FAILED."
        );
      }

      setSent(true);
    } catch (x) {
      setError(
        x instanceof Error
          ? x.message
          : "RECOVERY REQUEST FAILED."
      );
    } finally {
      setBusy(false);
    }
  }

  const signupReady =
    !!username &&
    password.length >= 8 &&
    confirm.length >= 8 &&
    password === confirm;

  const passwordStrength = getPasswordStrength(password);

  return (
    <main className="min-h-screen bg-[#030505] px-5 py-6 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md items-center justify-center">
        <section className="w-full rounded-[28px] border border-white/10 bg-black/80 p-6 shadow-[0_0_60px_rgba(0,0,0,.45)] sm:p-8">
          <img
            src="/v1124-auth-logo.png"
            alt="v1124 AUTH"
            className="mx-auto mb-5 h-auto max-h-24 w-auto max-w-full object-contain"
          />

          <p className="mb-6 text-center text-xs font-black tracking-[0.2em] text-white/55">
            SECURED ACCESS. ONE ACCOUNT.
          </p>

          {mode === "choice" && !recovery ? (
            <div className="grid gap-3">
              <button
                onClick={() => setMode("signin")}
                className="rounded-xl bg-white px-5 py-4 text-xs font-black tracking-[0.18em] text-black"
              >
                SIGN IN
              </button>

              <button
                onClick={() => setMode("signup")}
                className="rounded-xl border border-white/20 bg-black px-5 py-4 text-xs font-black tracking-[0.18em] text-white"
              >
                SIGN UP
              </button>
            </div>
          ) : !recovery ? (
            <form onSubmit={submit} className="space-y-3.5">
              <label className="block">
                <span className="text-[9px] font-black tracking-[0.16em] text-white/55">
                  USERNAME
                </span>

                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#090b0b] px-4 py-3 outline-none"
                />
              </label>

              <label className="block">
                <span className="text-[9px] font-black tracking-[0.16em] text-white/55">
                  PASSWORD
                </span>

                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#090b0b] px-4 py-3 outline-none"
                />

                {mode === "signup" && password && (
                  <div className="mt-2" aria-live="polite">
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4].map((bar) => (
                        <div
                          key={bar}
                          className="h-1.5 flex-1 rounded-full transition-all"
                          style={{
                            backgroundColor:
                              bar <= passwordStrength.bars
                                ? passwordStrength.level === 1
                                  ? "#f87171"
                                  : passwordStrength.level === 2
                                    ? "#fb923c"
                                    : passwordStrength.level === 3
                                      ? "#fde047"
                                      : "#4ade80"
                                : "rgba(255,255,255,0.10)",
                          }}
                        />
                      ))}
                    </div>

                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[8px] font-black tracking-[0.16em] text-white/35">
                        PASSWORD STRENGTH
                      </span>

                      <span
                        className={`text-[8px] font-black tracking-[0.16em] ${
                          passwordStrength.level === 1
                            ? "text-red-400"
                            : passwordStrength.level === 2
                              ? "text-orange-400"
                              : passwordStrength.level === 3
                                ? "text-yellow-300"
                                : "text-green-400"
                        }`}
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                  </div>
                )}
              </label>

              {mode === "signup" && (
                <>
                  <label className="block">
                    <span className="text-[9px] font-black tracking-[0.16em] text-white/55">
                      CONFIRM PASSWORD
                    </span>

                    <input
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      type="password"
                      required
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#090b0b] px-4 py-3 outline-none"
                    />
                  </label>

                  {!telegram ? (
                    <div className="pt-3">
                      <button
                        type="button"
                        disabled={!signupReady || linking}
                        onClick={startTelegramLink}
                        className="mt-4 flex w-full items-center justify-center gap-3 rounded-xl border border-white bg-black px-5 py-4 text-xs font-black tracking-[0.14em] text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/35"
                      >
                        <svg
                          width="19"
                          height="19"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M21.8 4.2 18.7 19c-.23 1.04-.85 1.3-1.72.81l-4.75-3.5-2.29 2.2c-.25.25-.46.46-.94.46l.34-4.83 8.8-7.95c.38-.34-.08-.53-.59-.19L6.68 12.9l-4.65-1.46c-1.01-.32-1.03-1.01.21-1.5L20.4 3.4c.83-.3 1.56.19 1.4.8Z" />
                        </svg>

                        {linking
                          ? "CONNECTING TO TELEGRAM…"
                          : "CONNECT TO TELEGRAM"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-3">
                      <div className="rounded-xl border border-[#229ED9]/40 bg-[#229ED9]/10 px-4 py-3">
                        <p className="text-[9px] font-black tracking-[0.16em] text-[#229ED9]">
                          ✓ TELEGRAM CONNECTED
                        </p>
                      </div>

                      <label className="block">
                        <span className="text-[9px] font-black tracking-[0.16em] text-white/55">
                          TELEGRAM ID
                        </span>

                        <input
                          value={telegram.telegramId || ""}
                          readOnly
                          className="mt-2 w-full rounded-xl border border-white/10 bg-[#090b0b] px-4 py-3 text-white/70 outline-none"
                        />
                      </label>

                      <label className="block">
                        <span className="text-[9px] font-black tracking-[0.16em] text-white/55">
                          TELEGRAM USERNAME
                        </span>

                        <input
                          value={
                            telegram.telegramUsername
                              ? `@${telegram.telegramUsername.replace(/^@/, "")}`
                              : "(NO USERNAME)"
                          }
                          readOnly
                          className="mt-2 w-full rounded-xl border border-white/10 bg-[#090b0b] px-4 py-3 text-white/70 outline-none"
                        />
                      </label>

                      <button
                        disabled={busy}
                        className="w-full rounded-xl bg-white px-5 py-4 text-xs font-black tracking-[0.18em] text-black"
                      >
                        {busy
                          ? "PLEASE WAIT…"
                          : "CREATE ACCOUNT"}
                      </button>
                    </div>
                  )}

                  {mode === "signup" && !telegram && (
                    <div
                      className="h-0 overflow-hidden"
                      aria-hidden="true"
                    />
                  )}
                </>
              )}

              {mode === "signup" && (
                <button
                  type="button"
                  onClick={() => {
                    if (pollRef.current) clearInterval(pollRef.current);
                    setMode("signin");
                    setRecovery(false);
                    setLinking(false);
                    setTelegram(null);
                    setLinkId("");
                    setPassword("");
                    setConfirm("");
                    setError("");
                  }}
                  className="mt-4 w-full pb-2 text-[10px] font-black tracking-[0.14em] text-white/35"
                >
                  BACK TO SIGN IN
                </button>
              )}

              {mode === "signin" && (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setRecovery(true)}
                    className="mb-4 w-full text-xs font-bold text-white/55 underline"
                  >
                    Forgot Password?
                  </button>

                  <button
                    disabled={busy}
                    className="mt-4 w-full rounded-xl bg-white px-5 py-4 text-xs font-black tracking-[0.18em] text-black"
                  >
                    {busy ? "PLEASE WAIT…" : "SIGN IN"}
                  </button>
                </div>
              )}

              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => setMode("choice")}
                  className="w-full text-[10px] font-black tracking-[0.14em] text-white/35"
                >
                  BACK
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={recover} className="space-y-3.5">
              {sent ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/70">
                  RECOVERY REQUEST COMPLETED.
                  THE TEMPORARY PASSWORD HAS BEEN SENT TO THE AUTHENTICATED TELEGRAM ACCOUNT.

                  SIGN IN WITH IT AND CHANGE YOUR PASSWORD IMMEDIATELY.
                </div>
              ) : (
                <>
                  <label className="block">
                    <span className="text-[9px] font-black tracking-[0.16em] text-white/55">
                      USERNAME
                    </span>

                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#090b0b] px-4 py-3 outline-none"
                    />
                  </label>

                  <button
                    disabled={busy}
                    className="mt-4 w-full rounded-xl bg-white px-5 py-4 text-xs font-black tracking-[0.18em] text-black"
                  >
                    {busy
                      ? "PLEASE WAIT…"
                      : "SUBMIT RECOVERY REQUEST"}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setRecovery(false);
                  setSent(false);
                }}
                className="mt-4 w-full pb-2 text-[10px] font-black tracking-[0.14em] text-white/35"
              >
                BACK TO SIGN IN
              </button>
            </form>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs font-bold text-red-300">
              {error}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}