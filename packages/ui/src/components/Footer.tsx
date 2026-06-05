export function Footer() {
  return (
    <footer className="mt-auto py-4 text-center text-body-sm text-muted border-t border-border">
      <div className="flex items-center justify-center gap-4">
        <a href="/" className="hover:text-tertiary transition-colors">
          Inicio
        </a>
        <span>•</span>
        <a href="/polla/" className="hover:text-tertiary transition-colors">
          Polla
        </a>
        <span>•</span>
        <a href="/fantasy/" className="hover:text-tertiary transition-colors">
          Fantasy
        </a>
      </div>
      <p className="mt-2 text-muted">
        Mundial 2026 • 11 de junio – 19 de julio de 2026
      </p>
      <p className="text-muted">
        Hecho con ❤️ por{" "}
        <a
          href="https://github.com/lstuckyb"
          className="hover:text-tertiary transition-colors"
        >
          Lucas Stucky
        </a>{" "}
        y{" "}
        <a
          href="https://github.com/suabochica"
          className="hover:text-tertiary transition-colors"
        >
          suabochica
        </a>
      </p>
    </footer>
  );
}
