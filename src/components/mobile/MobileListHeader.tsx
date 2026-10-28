import { useRef, useState } from "react";
import { Menu, ArrowLeft, X, Search, Archive, Trash2, MailOpen, MoreVertical, CheckCheck } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { useAccountStore } from "@/stores/accountStore";
import { useThreadStore } from "@/stores/threadStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { useMailSearch } from "@/components/search/SearchBar";
import { useBackHandler } from "@/hooks/useBackHandler";
import { archiveThread, trashThread, markThreadRead } from "@/services/emailActions";

interface MobileListHeaderProps {
  title: string;
  count: number;
  unreadCount: number;
  readFilter: "all" | "read" | "unread";
  onReadFilterChange: (f: "all" | "read" | "unread") => void;
  /** Bulk delete isn't offered in Trash (it would be permanent) */
  allowBulkDelete: boolean;
}

const iconBtn =
  "w-12 h-12 shrink-0 flex items-center justify-center rounded-full text-text-secondary active:bg-bg-hover transition-colors";

/**
 * Phone app bar for mail lists:
 *  - normal: a rounded search field with the drawer button and account avatar,
 *    followed by the list title, count and read filter;
 *  - selection mode (after a long-press): a contextual action bar.
 */
export function MobileListHeader({ title, count, unreadCount, readFilter, onReadFilterChange, allowBulkDelete }: MobileListHeaderProps) {
  const setDrawerOpen = useUIStore((s) => s.setMobileDrawerOpen);
  const account = useAccountStore((s) => s.accounts.find((a) => a.id === s.activeAccountId));
  const selectedIds = useThreadStore((s) => s.selectedThreadIds);
  const clearMultiSelect = useThreadStore((s) => s.clearMultiSelect);
  const selectAll = useThreadStore((s) => s.selectAll);
  const openMenu = useContextMenuStore((s) => s.openMenu);
  const { searchQuery, handleChange, clear } = useMailSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const selecting = selectedIds.size > 0;
  const searching = focused || searchQuery.length > 0;

  const exitSearch = () => {
    clear();
    inputRef.current?.blur();
    setFocused(false);
  };

  useBackHandler(selecting, clearMultiSelect);
  useBackHandler(searching && !selecting, exitSearch);

  const bulk = (fn: (accountId: string, id: string) => Promise<unknown>) => async () => {
    const accountId = useAccountStore.getState().activeAccountId;
    if (!accountId) return;
    const ids = [...useThreadStore.getState().selectedThreadIds];
    clearMultiSelect();
    for (const id of ids) {
      try {
        await fn(accountId, id);
      } catch (err) {
        console.error("Bulk action failed:", err);
      }
    }
  };

  if (selecting) {
    const anyUnread = useThreadStore.getState().threads.some((t) => selectedIds.has(t.id) && !t.isRead);
    return (
      <div className="shrink-0 pt-[var(--safe-top)] bg-accent/10 border-b border-border-primary">
        <div className="flex items-center h-14 px-1 gap-0.5">
          <button onClick={clearMultiSelect} className={iconBtn} aria-label="Clear selection">
            <X size={22} />
          </button>
          <span className="flex-1 text-lg font-medium text-text-primary pl-1 tabular-nums">{selectedIds.size}</span>
          {selectedIds.size < count && (
            <button onClick={selectAll} className={iconBtn} aria-label="Select all" title="Select all">
              <CheckCheck size={21} />
            </button>
          )}
          <button onClick={bulk((a, id) => archiveThread(a, id, []))} className={iconBtn} aria-label="Archive selected">
            <Archive size={21} />
          </button>
          {allowBulkDelete && (
            <button onClick={bulk((a, id) => trashThread(a, id, []))} className={iconBtn} aria-label="Delete selected">
              <Trash2 size={21} />
            </button>
          )}
          <button
            onClick={bulk((a, id) => markThreadRead(a, id, [], anyUnread))}
            className={iconBtn}
            aria-label={anyUnread ? "Mark selected read" : "Mark selected unread"}
          >
            <MailOpen size={21} />
          </button>
          <button
            onClick={() => {
              const first = [...selectedIds][0];
              if (first) openMenu("thread", { x: 0, y: 0 }, { threadId: first });
            }}
            className={iconBtn}
            aria-label="More actions"
          >
            <MoreVertical size={21} />
          </button>
        </div>
      </div>
    );
  }

  const initial = (account?.displayName?.[0] ?? account?.email?.[0] ?? "?").toUpperCase();

  return (
    <div className="shrink-0 pt-[calc(var(--safe-top)+0.5rem)] px-3">
      {/* Search pill */}
      <div className="flex items-center h-12 rounded-full bg-bg-tertiary/80 border border-border-secondary pl-1 pr-1.5 gap-1">
        {searching ? (
          <button onClick={exitSearch} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-text-secondary active:bg-bg-hover" aria-label="Close search">
            <ArrowLeft size={22} />
          </button>
        ) : (
          <button onClick={() => setDrawerOpen(true)} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-text-secondary active:bg-bg-hover" aria-label="Open navigation">
            <Menu size={22} />
          </button>
        )}
        <label className="flex-1 min-w-0 flex items-center">
          <span className="sr-only">Search mail</span>
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={searchQuery}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search in mail"
            className="w-full bg-transparent text-base text-text-primary placeholder:text-text-tertiary outline-none [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        {searchQuery ? (
          <button onClick={() => { clear(); inputRef.current?.focus(); }} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-text-secondary active:bg-bg-hover" aria-label="Clear search">
            <X size={20} />
          </button>
        ) : searching ? (
          <Search size={20} className="mx-2.5 text-text-tertiary shrink-0" />
        ) : (
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 shrink-0 rounded-full bg-accent text-white text-sm font-semibold flex items-center justify-center overflow-hidden"
            aria-label={`Account: ${account?.email ?? "none"}`}
          >
            {account?.avatarUrl ? <img src={account.avatarUrl} alt="" className="w-full h-full object-cover" /> : initial}
          </button>
        )}
      </div>

      {/* Title row */}
      <div className="flex items-end justify-between gap-3 pt-4 pb-2 pl-2 pr-1">
        <div className="min-w-0">
          <h1 className="text-[1.375rem] leading-tight font-semibold text-text-primary truncate">
            {searchQuery.trim().length >= 2 ? "Search results" : title}
          </h1>
          <p className="text-xs text-text-tertiary mt-0.5 tabular-nums">
            {count} conversation{count !== 1 ? "s" : ""}
            {unreadCount > 0 && <span className="text-accent font-medium"> · {unreadCount} unread</span>}
          </p>
        </div>
        <label className="shrink-0">
          <span className="sr-only">Filter</span>
          <select
            value={readFilter}
            onChange={(e) => onReadFilterChange(e.target.value as "all" | "read" | "unread")}
            className="h-9 rounded-full bg-bg-tertiary/80 border border-border-secondary text-sm text-text-secondary pl-3.5"
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </label>
      </div>
    </div>
  );
}
