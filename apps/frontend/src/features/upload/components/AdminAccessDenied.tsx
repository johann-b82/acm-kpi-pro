import { ShieldOff } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Fallback card shown on /upload when the signed-in user is not an Admin.
 * Rendered by UploadPage inside ProtectedRoute. (D-05, UP-07)
 */
export function AdminAccessDenied() {
  return (
    <Card
      aria-live="polite"
      className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20"
    >
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <ShieldOff className="h-5 w-5 text-red-600 dark:text-red-500" />
        <CardTitle className="text-lg">Admin access required</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Uploading new data is restricted to administrators. Contact your ACM
          admin to refresh the dashboard.
        </p>
      </CardContent>
    </Card>
  );
}
