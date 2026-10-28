import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
        <Image
          className="dark:invert h-5 w-[100px]"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex items-center gap-3">
          <span className="text-4xl">⌾</span>
          <h1 className="text-4xl font-bold tracking-tight">Claude Code Cloud</h1>
        </div>
        <p className="max-w-md text-zinc-400">
          Your own cloud dev environment running Claude Code. Sign in with
          Pollinations — sandbox runtime and model usage bill to your Pollen
          balance.
        </p>
        <Link
          href="/api/auth/login"
          className="rounded-lg bg-white px-6 py-3 font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Sign in with Pollinations
        </Link>
      </main>
      <section className="flex flex-col items-center gap-4 p-8">
        <h1 className="text-3xl font-bold">Claude Code Cloud</h1>
        <p className="text-gray-600">
          Sign in with Pollinations to get a cloud dev environment.
        </p>
        <Link
          href="/api/auth/login"
          className="rounded-lg bg-white px-6 py-3 font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Sign in with Pollinations
        </Link>
      </section>
    </div>
  );
}
