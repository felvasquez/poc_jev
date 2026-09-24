import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-semibold text-zinc-900 dark:text-zinc-50">
          mini-derivador
        </Link>
        <div className="flex gap-4 text-sm">
          <Link href="/" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
            Chat
          </Link>
          <Link
            href="/historial"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Historial
          </Link>
          <Link
            href="/dashboard"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Métricas
          </Link>
          <Link
            href="/configuracion"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Configuración
          </Link>
        </div>
      </nav>
    </header>
  );
}
