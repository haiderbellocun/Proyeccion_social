import { Suspense } from "react";
import { RouterProvider } from "react-router";
import { ConfirmationDialogProvider } from "./components/ConfirmationDialog";
import { Toaster } from "./components/ui/sonner";
import { router } from "./routes";

export default function App() {
  return (
    <ConfirmationDialogProvider>
      <Suspense
        fallback={
          <div className="flex min-h-dvh items-center justify-center bg-canvas" role="status" aria-label="Cargando">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-line-strong border-t-brand" />
          </div>
        }
      >
        <RouterProvider router={router} />
      </Suspense>
      <Toaster />
    </ConfirmationDialogProvider>
  );
}
