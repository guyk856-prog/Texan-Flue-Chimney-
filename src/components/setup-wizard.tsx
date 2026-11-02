"use client";
import Image from "next/image";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { sendFile } from "@/lib/upload-client";
export function BootstrapForm() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <section className="auth panel">
      <h1>Welcome to Texan Flue</h1>
      <p>
        Create the owner account once. No demo customers, users or prices are
        added.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const form = new FormData(e.currentTarget);
          try {
            const data = Object.fromEntries(form);
            const r = await fetch("/api/bootstrap", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(data),
            });
            const d = await r.json();
            if (!r.ok) {
              setError(d.error);
              return;
            }
            const login = await signIn("credentials", {
              email: data.email,
              password: data.password,
              redirect: false,
            });
            if (login?.error)
              setError(
                "Your owner account was created. Sign in using your email and password.",
              );
            else {
              router.refresh();
              router.push("/setup");
            }
          } catch {
            setError(
              "Could not connect. Your entries are still here. Check your connection and try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Setup code
          <input name="token" type="password" required autoComplete="off" />
        </label>
        <label>
          Your name
          <input name="name" required autoComplete="name" />
        </label>
        <label>
          Owner email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Create password (16–72 characters)
          <input
            name="password"
            type="password"
            minLength={16}
            maxLength={72}
            required
            autoComplete="new-password"
          />
        </label>
        <Button disabled={busy}>
          {busy ? "Creating owner account…" : "Create owner account"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
export function SetupWizard({
  company,
}: {
  company: {
    name: string;
    phone: string;
    email: string;
    addrLine1: string;
    city: string;
    state: string;
    postal: string;
  };
}) {
  const [step, setStep] = useState(1),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <section className="legal">
      <h1>Your first morning with Texan Flue</h1>
      <p>Step {step} of 3. Set up your business; no invitations needed.</p>
      {step === 1 && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await fetch("/api/setup/company", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(
                  Object.fromEntries(new FormData(e.currentTarget)),
                ),
              });
              const d = await r.json();
              if (r.ok) {
                setConfirmed(true);
                setStep(2);
              } else setError(d.error);
            } catch {
              setError(
                "Connection lost. Your company details are still in the form. Try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Confirm company details</h2>
          <div className="fields">
            {Object.entries(company).map(([key, value]) => (
              <label key={key}>
                {
                  (
                    {
                      name: "Company name",
                      phone: "Phone",
                      email: "Office email",
                      addrLine1: "Street address",
                      city: "City",
                      state: "State",
                      postal: "Postal code",
                    } as Record<string, string>
                  )[key]
                }
                <input
                  name={key}
                  defaultValue={value}
                  required={key !== "email"}
                  type={key === "email" ? "email" : "text"}
                />
              </label>
            ))}
          </div>
          <Button disabled={busy}>Confirm company and continue</Button>
        </form>
      )}
      {step === 2 && (
        <section className="panel">
          <h2>Use your company logo</h2>
          <Image
            src="/brand/logo-mark.webp"
            width={90}
            height={106}
            alt="Texan Flue Chimney Service"
          />
          <p>
            The supplied transparent logo is ready. You can upload another PNG,
            JPEG or WebP.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const file = new FormData(e.currentTarget).get("file");
                if (!(file instanceof File)) return;
                const saved = await sendFile(
                  file,
                  { purpose: "FILE", metadata: {} },
                  () => {},
                );
                const r = await fetch("/api/setup/logo", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ fileId: saved.id }),
                });
                const d = await r.json();
                if (r.ok) setStep(3);
                else setError(d.error);
              } catch {
                setError(
                  "Logo upload failed. Select Retry or continue with the supplied logo.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Company logo
              <input
                type="file"
                name="file"
                required
                accept="image/png,image/jpeg,image/webp"
              />
            </label>
            <Button disabled={busy}>Upload logo and continue</Button>
          </form>
          <Button variant="outline" onClick={() => setStep(3)}>
            Keep supplied logo
          </Button>
        </section>
      )}
      {step === 3 && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await fetch("/api/setup/finish", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  companyConfirmed: confirmed,
                  libraryReviewed: true,
                  policyReviewed: true,
                }),
              });
              const d = await r.json();
              if (r.ok) {
                router.push("/dashboard");
                router.refresh();
              } else setError(d.error);
            } catch {
              setError(
                "Could not finish setup. Check your connection, then try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Review services and prices</h2>
          <p>
            The library contains scope descriptions, with no invented prices.
            Review them and set the prices you actually charge. Tax, fees and AI
            start disabled.
          </p>
          <a
            className="empty-action"
            href="/services"
            target="_blank"
            rel="noreferrer"
          >
            Review service library and enter prices
          </a>
          <label>
            <input type="checkbox" required />I reviewed the service library and
            understand that unpriced services require an explicit price.
          </label>
          <p>
            <a href="/legal/terms" target="_blank" rel="noreferrer">
              Terms
            </a>{" "}
            and{" "}
            <a href="/legal/privacy" target="_blank" rel="noreferrer">
              Privacy
            </a>{" "}
            are counsel-review drafts. The signing disclosure states the
            seven-year retention policy. Have these reviewed before customer
            use.
          </p>
          <label>
            <input type="checkbox" required />I reviewed the disclosure,
            retention policy and counsel-review notices.
          </label>
          <Button disabled={busy}>Finish setup and open dashboard</Button>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
