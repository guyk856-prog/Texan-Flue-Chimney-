"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "./ui/button";
export function AuthForm({
  mode,
  token = "",
}: {
  mode: "login" | "request" | "reset";
  token?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth panel">
      <div className="eyebrow">Texan Flue Chimney</div>
      <h1>{mode === "login" ? "Welcome back." : "Reset password"}</h1>
      <p className="muted">
        {mode === "login"
          ? "Your team's workspace, from first call to final visit."
          : "Use a password of 12–72 characters."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setMessage("");
          setBusy(true);
          const form = new FormData(e.currentTarget);
          try {
            if (mode === "login") {
              const result = await signIn("credentials", {
                email: form.get("email"),
                password: form.get("password"),
                redirect: false,
              });
              if (result?.error)
                setError(
                  "Unable to sign in. Check your details or try again later.",
                );
              else {
                router.push("/dashboard");
                router.refresh();
              }
            } else {
              const r = await fetch(`/api/password/${mode}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(
                  mode === "request"
                    ? { email: form.get("email") }
                    : { token, password: form.get("password") },
                ),
              });
              const data = await r.json();
              if (!r.ok) setError(data.error);
              else setMessage(data.message);
            }
          } catch {
            setError("Unable to connect. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode !== "reset" && (
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              maxLength={254}
            />
          </label>
        )}
        {mode !== "request" && (
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={mode === "reset" ? 12 : 1}
              maxLength={72}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </label>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="success">
            {message}
          </div>
        )}
        <Button disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : mode === "request"
                ? "Send reset link"
                : "Update password"}
        </Button>
        <Link
          className="muted"
          href={mode === "login" ? "/forgot-password" : "/login"}
        >
          {mode === "login" ? "Forgot password?" : "Back to sign in"}
        </Link>
      </form>
    </div>
  );
}
