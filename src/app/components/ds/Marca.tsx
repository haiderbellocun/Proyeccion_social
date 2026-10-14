/** Marca de ProySocial: un nodo (iniciativa) conectado a su seguimiento. */
export function Marca({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="7" cy="12" r="3" fill="currentColor" />
      <circle cx="18" cy="6" r="2.25" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="18" r="2.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.6 10.6 15.9 7M9.6 13.4l6.3 3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
