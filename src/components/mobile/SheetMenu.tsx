import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { ContextMenuItem } from "@/components/ui/ContextMenu";
import { BottomSheet } from "./BottomSheet";

interface SheetMenuProps {
  items: ContextMenuItem[];
  onClose: () => void;
  title?: ReactNode;
}

/**
 * Touch presentation of a context menu: the same `ContextMenuItem[]` model as
 * the desktop `ContextMenu`, shown as a bottom sheet with 48dp rows.
 * Submenus expand inline; checkable children (e.g. labels) stay open for
 * multi-apply, mirroring the desktop submenu behaviour.
 */
export function SheetMenu({ items, onClose, title }: SheetMenuProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Drop leading/trailing/double separators left over after filtering
  const visible = items.filter((item, i, arr) => {
    if (!item.separator) return true;
    const prev = arr[i - 1];
    return i > 0 && i < arr.length - 1 && prev && !prev.separator;
  });

  return (
    <BottomSheet open onClose={onClose} title={title} ariaLabel="Actions">
      <div role="menu" className="px-2">
        {visible.map((item) => {
          if (item.separator) {
            return <div key={item.id} role="separator" className="my-1 mx-3 border-t border-border-secondary" />;
          }
          const Icon = item.icon;
          const isOpen = expanded === item.id;
          return (
            <div key={item.id}>
              <button
                role="menuitem"
                disabled={item.disabled}
                aria-expanded={item.children ? isOpen : undefined}
                onClick={() => {
                  if (item.disabled) return;
                  if (item.children) {
                    setExpanded(isOpen ? null : item.id);
                    return;
                  }
                  item.action?.();
                  onClose();
                }}
                className={`flex items-center gap-4 w-full min-h-12 px-3 rounded-xl text-left text-[0.9375rem] active:bg-bg-hover transition-colors ${
                  item.disabled ? "text-text-tertiary" : item.danger ? "text-danger" : "text-text-primary"
                }`}
              >
                <span className="w-6 h-6 flex items-center justify-center shrink-0 text-text-secondary">
                  {item.checked != null ? (item.checked ? <Check size={20} className="text-accent" /> : null) : Icon ? <Icon size={20} className={item.danger ? "text-danger" : undefined} /> : null}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.children && (
                  <ChevronDown size={18} className={`text-text-tertiary transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                )}
              </button>
              {item.children && isOpen && (
                <div className="ml-10 mb-1 border-l border-border-secondary pl-1">
                  {item.children.length === 0 && (
                    <div className="px-3 py-2 text-sm text-text-tertiary">Nothing here</div>
                  )}
                  {item.children.map((child) => {
                    const ChildIcon = child.icon;
                    return (
                      <button
                        key={child.id}
                        role="menuitem"
                        disabled={child.disabled}
                        onClick={() => {
                          if (child.disabled) return;
                          child.action?.();
                          if (child.checked == null) onClose();
                        }}
                        className={`flex items-center gap-3 w-full min-h-11 px-3 rounded-xl text-left text-[0.875rem] active:bg-bg-hover ${
                          child.disabled ? "text-text-tertiary" : "text-text-primary"
                        }`}
                      >
                        <span className="w-5 h-5 flex items-center justify-center shrink-0 text-text-secondary">
                          {child.checked != null ? (child.checked ? <Check size={18} className="text-accent" /> : null) : ChildIcon ? <ChildIcon size={18} /> : null}
                        </span>
                        <span className="flex-1 truncate">{child.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}
