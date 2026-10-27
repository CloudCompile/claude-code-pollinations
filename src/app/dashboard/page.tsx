import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/api/auth/login");
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-gray-600">Signed in as {session.sub}</p>
      <p className="mt-4 text-sm text-gray-500">
        Sandbox + chat UI coming next. Use the API routes to manage sandboxes.
      </p>
    </main>
  );
}