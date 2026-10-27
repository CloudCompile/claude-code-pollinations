import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function SandboxPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/api/auth/login");
  const { id } = await params;
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Sandbox {id}</h1>
      <p className="text-gray-600 mt-4">Terminal + chat UI coming next.</p>
      <p className="text-sm text-gray-500 mt-2">Signed in as {session.sub}</p>
    </main>
  );
}