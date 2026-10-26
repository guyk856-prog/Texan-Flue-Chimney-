import Link from "next/link";
export default function NotFound() {
  return (
    <div className="auth panel">
      <h1>Not found</h1>
      <p>This record is unavailable.</p>
      <Link href="/dashboard">Back to dashboard</Link>
    </div>
  );
}
