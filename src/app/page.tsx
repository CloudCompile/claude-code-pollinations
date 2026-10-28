import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex items-center gap-3">
        <span className="text-4xl">⌾</span>
        <h1 className="text-4xl font-bold tracking-tight">Claude Code Cloud</h1>
      </div>
      <p className="max-w-md text-zinc-400">
        Your own cloud dev environment running Claude Code. Sign in with Pollinations —
        sandbox runtime and model usage bill to your Pollen balance.
      </p>
      <Link
        href="/api/auth/login"
        className="rounded-lg bg-white px-6 py-3 font-medium text-zinc-950 hover:bg-zinc-200"
      >
        Sign in with Pollinations
      </Link>
    </main>
  );
}
