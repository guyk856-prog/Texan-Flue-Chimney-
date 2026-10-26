"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
const transitions: Record<string, string[]> = {
  LEAD: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
export function JobControls({
  id,
  status,
  technicians,
  assignments,
  appointments,
  admin,
}: {
  id: string;
  status: string;
  technicians: { id: string; name: string }[];
  assignments: { userId: string; user: { name: string } }[];
  appointments: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    note: string | null;
  }[];
  admin: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(action: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/data/jobs/${id}/${action}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error);
      else router.refresh();
    } catch {
      setError("Connection failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <h2>Status: {status.replaceAll("_", " ")}</h2>
        <div className="actions">
          {transitions[status].map((s) => (
            <Button
              key={s}
              disabled={busy}
              variant="outline"
              onClick={() => send("status", { status: s })}
            >
              {s.replaceAll("_", " ")}
            </Button>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Technician assignments</h2>
        {assignments.map((a) => (
          <div className="rowlink" key={a.userId}>
            {a.user.name}
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => send(`assignments/${a.userId}`, {}, "DELETE")}
            >
              Unassign
            </Button>
          </div>
        ))}
        <form
          className="actions"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            send("assignments", { userId: f.get("userId") });
          }}
        >
          <label>
            Technician
            <select name="userId" required>
              <option value="">Select technician…</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy}>Assign</Button>
        </form>
      </section>
      <section className="panel">
        <h2>Appointments</h2>
        <p className="muted">
          Enter times in your browser&apos;s local time zone. Times are stored
          as UTC.
        </p>
        {appointments.map((a) => (
          <div className="rowlink" key={a.id}>
            <span>
              {new Date(a.startsAt).toLocaleString()} –{" "}
              {new Date(a.endsAt).toLocaleString()} {a.note}
            </span>
            {admin && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => send(`appointments/${a.id}`, {}, "DELETE")}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            send("appointments", {
              startsAt: new Date(String(f.get("startsAt"))).toISOString(),
              endsAt: new Date(String(f.get("endsAt"))).toISOString(),
              note: f.get("note"),
            });
          }}
        >
          <div className="fields">
            <label>
              Starts
              <input type="datetime-local" name="startsAt" required />
            </label>
            <label>
              Ends
              <input type="datetime-local" name="endsAt" required />
            </label>
            <label>
              Appointment note
              <input name="note" maxLength={250} />
            </label>
          </div>
          <Button disabled={busy}>Add appointment</Button>
        </form>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
