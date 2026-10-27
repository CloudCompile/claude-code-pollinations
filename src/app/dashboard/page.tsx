import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { e2bProvider } from "@/lib/sandbox";
import Link from "next/link";

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/api/auth/login");
  const sandboxes = await e2bProvider.list({ apiKey: session.sk, sub: session.sub });
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-gray-600">Signed in as {session.sub}</p>
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Your Sandboxes</h2>
        {sandboxes.length === 0 ? (
          <p className="text-gray-500">No sandboxes yet. Create one via the API.</p>
        ) : (
          <ul className="space-y-2">
            {sandboxes.map((s) => (
              <li key={s.sandboxId} className="border p-4 rounded flex justify-between items-center">
                <div>
                  <Link href={`/dashboard/sandbox/${s.sandboxId}`} className="font-mono text-blue-600 hover:underline">
                    {s.sandboxId}
                  </Link>
                  <span className="ml-2 text-sm text-gray-500">({s.templateId ?? "unknown"})</span>
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs ${s.state === "running" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                    {s.state ?? "unknown"}
                  </span>
                </div>
                <div className="text-sm text-gray-500">
                  {s.endAt ? `Until ${new Date(s.endAt).toLocaleString()}` : "No timeout"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}