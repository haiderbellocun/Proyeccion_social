import { Category, categoryConfig } from "../data/matrizConstants";

interface CategoryTagProps {
  category: Category;
  compact?: boolean;
}

export function CategoryTag({ category, compact }: CategoryTagProps) {
  const cfg = categoryConfig[category];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${cfg.badge} whitespace-nowrap`}
      style={{ fontWeight: 500 }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {compact ? cfg.label.split(" ")[0] : cfg.label}
    </span>
  );
}
