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
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-800 rounded-full animate-spin" />
          </div>
        }
      >
        <RouterProvider router={router} />
      </Suspense>
      <Toaster />
    </ConfirmationDialogProvider>
  );
}
