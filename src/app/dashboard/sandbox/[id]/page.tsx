import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function SandboxPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/api/auth/login");
  const { id } = await params;
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Sandbox {id}</h1>
      <p className="text-gray-600 mt-4">Signed in as {session.sub}</p>
      <div className="mt-6">
        <Link
          href={`/dashboard/sandbox/${id}/terminal`}
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Open Terminal
        </Link>
      </div>
    </main>
  );
}