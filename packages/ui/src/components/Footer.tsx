export function Footer() {
  return (
    <footer className="mt-auto py-4 text-center text-body-sm text-muted border-t border-border">
      <div className="flex items-center justify-center gap-4">
        <a href="/" className="hover:text-tertiary transition-colors">
          Dashboard
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
        World Cup 2026 • June 11 – July 19, 2026
      </p>
      <p className="text-muted">
        Done with ❤️ by{" "}
        <a
          href="https://github.com/lstuckyb"
          className="hover:text-tertiary transition-colors"
        >
          Lucas Stucky
        </a>{" "}
        and{" "}
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
