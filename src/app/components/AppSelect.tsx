import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "./ui/utils";

export type AppSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type AppSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  size?: "sm" | "default";
  /** Radix no admite value="" en items; usa este valor sentinela para “sin selección”. */
  emptyValue?: string;
};

/**
 * Select estilizado alineado con los inputs de ProySocial.
 * Reemplazo drop-in de <select> nativos: value + onValueChange + options.
 */
export function AppSelect({
  value,
  onValueChange,
  options,
  placeholder = "Seleccionar…",
  disabled = false,
  className,
  triggerClassName,
  size = "default",
  emptyValue,
}: AppSelectProps) {
  const resolvedValue =
    value === "" && emptyValue != null
      ? emptyValue
      : value || undefined;

  return (
    <Select
      value={resolvedValue}
      onValueChange={(next) => {
        if (emptyValue != null && next === emptyValue) {
          onValueChange("");
          return;
        }
        onValueChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger size={size} className={cn(className, triggerClassName)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
