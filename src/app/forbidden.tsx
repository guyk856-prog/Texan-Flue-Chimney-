import Link from "next/link";
export default function Forbidden() {
  return (
    <div className="auth panel">
      <h1>Access restricted</h1>
      <p>Your role cannot access this page.</p>
      <Link href="/dashboard">Back to dashboard</Link>
    </div>
  );
}
