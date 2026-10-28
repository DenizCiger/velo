import { useCallback, useRef } from "react";
import { EmailList } from "./EmailList";
import { ReadingPane } from "./ReadingPane";
import { useUIStore } from "@/stores/uiStore";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useIsCompact } from "@/hooks/useLayoutMode";
import { useSelectedThreadId } from "@/hooks/useRouteNavigation";
import { useThreadStore } from "@/stores/threadStore";
import { ThreadView } from "../email/ThreadView";
import { navigateBack } from "@/router/navigate";
import { ArrowLeft } from "lucide-react";

/**
 * Phone layout: one screen at a time. The list stays mounted underneath (so
 * its scroll position survives) and the open thread slides in over it as a
 * full-screen page. Back (button or Android Back) returns to the list.
 */
function CompactMailLayout() {
  const selectedThreadId = useSelectedThreadId();
  const thread = useThreadStore((s) => (selectedThreadId ? s.threadMap.get(selectedThreadId) ?? null : null));

  return (
    <div className="relative flex flex-1 min-w-0 overflow-hidden">
      <div className="flex flex-1 min-w-0" inert={selectedThreadId ? true : undefined}>
        <ErrorBoundary name="EmailList">
          <EmailList compact />
        </ErrorBoundary>
      </div>
      {selectedThreadId && (
        <div key={selectedThreadId} className="absolute inset-0 z-30 flex flex-col bg-surface page-enter pl-[var(--safe-left)] pr-[var(--safe-right)]">
          <ErrorBoundary name="ThreadView">
            {thread ? (
              <ThreadView thread={thread} />
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex items-center px-1 pt-[var(--safe-top)] h-[calc(3.5rem+var(--safe-top))]">
                  <button
                    onClick={() => navigateBack()}
                    className="w-12 h-12 flex items-center justify-center rounded-full text-text-secondary active:bg-bg-hover"
                    aria-label="Back"
                  >
                    <ArrowLeft size={22} />
                  </button>
                </div>
                <div className="flex-1 flex items-center justify-center text-sm text-text-tertiary px-8 text-center">
                  This conversation is no longer in this folder.
                </div>
              </div>
            )}
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}

function ResizableEmailLayout() {
  const emailListWidth = useUIStore((s) => s.emailListWidth);
  const setEmailListWidth = useUIStore((s) => s.setEmailListWidth);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = listRef.current?.offsetWidth ?? emailListWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newWidth = Math.min(800, Math.max(240, startWidth + delta));
      if (listRef.current) listRef.current.style.width = `${newWidth}px`;
    };

    const handleMouseUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const delta = ev.clientX - startX;
      const finalWidth = Math.min(800, Math.max(240, startWidth + delta));
      setEmailListWidth(finalWidth);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [emailListWidth, setEmailListWidth]);

  return (
    <div ref={containerRef} className="flex flex-1 min-w-0 flex-row">
      <EmailList width={emailListWidth} listRef={listRef} />
      <div
        onMouseDown={handleMouseDown}
        className="w-1 cursor-col-resize bg-border-primary hover:bg-accent/50 active:bg-accent transition-colors shrink-0"
      />
      <ReadingPane />
    </div>
  );
}

export function MailLayout() {
  const readingPanePosition = useUIStore((s) => s.readingPanePosition);
  const compact = useIsCompact();

  if (compact) return <CompactMailLayout />;

  if (readingPanePosition === "right") {
    return (
      <ErrorBoundary name="EmailLayout">
        <ResizableEmailLayout />
      </ErrorBoundary>
    );
  }

  return (
    <div className={`flex flex-1 min-w-0 ${readingPanePosition === "bottom" ? "flex-col" : "flex-row"}`}>
      <ErrorBoundary name="EmailList">
        <EmailList />
      </ErrorBoundary>
      {readingPanePosition !== "hidden" && (
        <ErrorBoundary name="ReadingPane">
          <ReadingPane />
        </ErrorBoundary>
      )}
    </div>
  );
}
