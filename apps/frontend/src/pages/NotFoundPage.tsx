import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link to="/" className="text-sm text-primary underline underline-offset-4">
        Return to dashboard
      </Link>
    </div>
  );
}
