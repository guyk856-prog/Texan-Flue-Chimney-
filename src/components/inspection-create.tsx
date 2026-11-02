"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function InspectionCreate({
  jobs,
  technicians,
  isTechnician,
  initialDate,
}: {
  jobs: { id: string; title: string; customerId: string; propertyId: string }[];
  technicians: { id: string; name: string }[];
  isTechnician: boolean;
  initialDate: string;
}) {
  const timeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const now = new Date();
    if (timeRef.current)
      timeRef.current.value = new Date(
        now.getTime() - now.getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16);
  }, []);
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const job = jobs.find((j) => j.id === f.get("jobId"));
        if (!job) return;
        setBusy(true);
        try {
          const r = await fetch("/api/workflow/inspections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jobId: job.id,
              customerId: job.customerId,
              propertyId: job.propertyId,
              ...(!isTechnician ? { technicianId: f.get("technicianId") } : {}),
              kind: f.get("kind"),
              performedAt: new Date(String(f.get("performedAt"))).toISOString(),
              weather: f.get("weather"),
            }),
          });
          const d = await r.json();
          if (r.ok) {
            router.push(`/inspections/${d.id}`);
            router.refresh();
          } else setError(d.error);
        } catch {
          setError(
            "The inspection was not created. Your entries remain here. Check your connection and retry.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="fields">
        <label>
          Assigned job
          <select name="jobId" required>
            <option value="">Select…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
        {!isTechnician && (
          <label>
            Inspection technician
            <select name="technicianId" required>
              <option value="">Select an assigned technician…</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Checklist
          <select name="kind">
            <option value="CHIMNEY">Chimney</option>
            <option value="DRYER_VENT">Dryer vent</option>
          </select>
        </label>
        <label>
          Performed at (your local time)
          <input
            ref={timeRef}
            type="datetime-local"
            name="performedAt"
            required
            defaultValue={initialDate}
          />
        </label>
        <label>
          Weather
          <input name="weather" maxLength={250} />
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button disabled={busy}>Create inspection draft</Button>
    </form>
  );
}
