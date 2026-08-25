import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, CircleAlert, TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

export type ConfirmationTone = "primary" | "warning" | "danger";

export type ConfirmationOptions = {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmationTone;
};

type ConfirmationRequest = (options: ConfirmationOptions) => Promise<boolean>;

const ConfirmationContext = createContext<ConfirmationRequest | null>(null);

const toneStyles: Record<
  ConfirmationTone,
  { icon: typeof CheckCircle2; iconBox: string; iconColor: string; action: string }
> = {
  primary: {
    icon: CheckCircle2,
    iconBox: "bg-blue-50",
    iconColor: "text-[#1d4ed8]",
    action: "bg-[#1e3a8a] hover:bg-[#1d4ed8] focus-visible:ring-[#1d4ed8]",
  },
  warning: {
    icon: CircleAlert,
    iconBox: "bg-amber-50",
    iconColor: "text-amber-600",
    action: "bg-[#1e3a8a] hover:bg-[#1d4ed8] focus-visible:ring-[#1d4ed8]",
  },
  danger: {
    icon: TriangleAlert,
    iconBox: "bg-red-50",
    iconColor: "text-red-600",
    action: "bg-red-600 hover:bg-red-700 focus-visible:ring-red-600",
  },
};

export function ConfirmationDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationOptions | null>(null);
  const lastRequestRef = useRef<ConfirmationOptions | null>(null);
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null);

  const settle = useCallback((accepted: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(accepted);
  }, []);

  const requestConfirmation = useCallback<ConfirmationRequest>((options) => {
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      const nextRequest: ConfirmationOptions = {
        tone: "primary",
        confirmLabel: "Confirmar",
        cancelLabel: "Cancelar",
        ...options,
      };
      resolverRef.current = resolve;
      lastRequestRef.current = nextRequest;
      setRequest(nextRequest);
    });
  }, []);

  useEffect(
    () => () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    },
    []
  );

  const visibleRequest = request || lastRequestRef.current;
  const tone = visibleRequest?.tone || "primary";
  const style = toneStyles[tone];
  const Icon = style.icon;

  return (
    <ConfirmationContext.Provider value={requestConfirmation}>
      {children}
      <AlertDialog
        open={request != null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.iconBox}`}
              >
                <Icon className={`h-5 w-5 ${style.iconColor}`} />
              </div>
              <AlertDialogHeader className="flex-1 gap-1.5 pt-0.5 text-left">
                <AlertDialogTitle className="text-base font-bold text-gray-900">
                  {visibleRequest?.title || "Confirmar acción"}
                </AlertDialogTitle>
                <AlertDialogDescription className="whitespace-pre-line text-sm leading-6 text-gray-500">
                  {visibleRequest?.description}
                </AlertDialogDescription>
              </AlertDialogHeader>
            </div>
          </div>
          <AlertDialogFooter className="flex-row justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
            <AlertDialogCancel
              onClick={() => settle(false)}
              className="mt-0 h-10 min-w-24 rounded-lg border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              {visibleRequest?.cancelLabel || "Cancelar"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={`h-10 min-w-24 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm ${style.action}`}
            >
              {visibleRequest?.confirmLabel || "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmationContext.Provider>
  );
}

export function useConfirmationDialog() {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error("useConfirmationDialog debe usarse dentro de ConfirmationDialogProvider");
  }
  return context;
}
