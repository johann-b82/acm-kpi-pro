import { Header } from "../components/Header.js";

export function DocsStubPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-screen-xl px-4 py-8">
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Documentation — coming in Phase 7
          </p>
        </div>
      </main>
    </div>
  );
}
