import { useState, useEffect } from "react";
import type { Thread } from "@/stores/threadStore";
import { useThreadStore } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { archiveThread, trashThread, permanentDeleteThread, markThreadRead, starThread, spamThread } from "@/services/emailActions";
import { deleteThread as deleteThreadFromDb, pinThread as pinThreadDb, unpinThread as unpinThreadDb, muteThread as muteThreadDb, unmuteThread as unmuteThreadDb } from "@/services/db/threads";
import { deleteDraftsForThread } from "@/services/gmail/draftDeletion";
import { snoozeThread } from "@/services/snooze/snoozeManager";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { SnoozeDialog } from "./SnoozeDialog";
import { FollowUpDialog } from "./FollowUpDialog";
import { Archive, Trash2, MailOpen, Mail, Star, Clock, Ban, Pin, MailMinus, BellRing, VolumeX, Reply, ReplyAll, Forward, FolderInput, Printer, Download, ExternalLink, PanelRightClose, PanelRightOpen, ListTodo, ArrowLeft, MoreVertical } from "lucide-react";
import { SheetMenu } from "@/components/mobile/SheetMenu";
import type { ContextMenuItem } from "@/components/ui/ContextMenu";
import { navigateBack } from "@/router/navigate";
import { isMobilePlatform } from "@/utils/platform";
import { archiveThreadWithUndo, trashThreadWithUndo, snoozeThreadWithUndo } from "@/services/threadActionsWithUndo";
import type { DbMessage } from "@/services/db/messages";
import { insertFollowUpReminder, getFollowUpForThread, cancelFollowUpForThread } from "@/services/db/followUpReminders";
import { Button } from "@/components/ui/Button";

interface ActionBarProps {
  thread: Thread;
  messages?: DbMessage[];
  noReply?: boolean;
  defaultReplyMode?: "reply" | "replyAll";
  contactSidebarVisible?: boolean;
  taskSidebarVisible?: boolean;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onPrint?: () => void;
  onExport?: () => void;
  onPopOut?: () => void;
  onToggleContactSidebar?: () => void;
  onToggleTaskSidebar?: () => void;
  /** "mobile": phone top app bar with back button + overflow sheet */
  variant?: "default" | "mobile";
}

function Separator() {
  return <div className="w-px h-5 bg-border-secondary mx-1 shrink-0" />;
}

export function ActionBar({ thread, messages, noReply, defaultReplyMode = "reply", contactSidebarVisible, taskSidebarVisible, onReply, onReplyAll, onForward, onPrint, onExport, onPopOut, onToggleContactSidebar, onToggleTaskSidebar, variant = "default" }: ActionBarProps) {
  const [showMore, setShowMore] = useState(false);
  const updateThread = useThreadStore((s) => s.updateThread);
  const removeThread = useThreadStore((s) => s.removeThread);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const activeLabel = useActiveLabel();
  const [showSnooze, setShowSnooze] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [hasFollowUp, setHasFollowUp] = useState(false);
  const isSpamView = activeLabel === "spam";
  const hasLastMessage = !!messages?.length;

  // Check if thread has an active follow-up reminder
  useEffect(() => {
    if (!activeAccountId) return;
    getFollowUpForThread(activeAccountId, thread.id)
      .then((r) => setHasFollowUp(r !== null))
      .catch(() => setHasFollowUp(false));
  }, [activeAccountId, thread.id]);

  const handleToggleRead = async () => {
    if (!activeAccountId) return;
    await markThreadRead(activeAccountId, thread.id, [], !thread.isRead);
  };

  const handleToggleStar = async () => {
    if (!activeAccountId) return;
    await starThread(activeAccountId, thread.id, [], !thread.isStarred);
  };

  const handleArchive = async () => {
    if (!activeAccountId) return;
    await archiveThread(activeAccountId, thread.id, []);
  };

  const handleDelete = async () => {
    if (!activeAccountId) return;
    const isTrashView = activeLabel === "trash";
    const isDraftsView = activeLabel === "drafts";
    if (isTrashView) {
      await permanentDeleteThread(activeAccountId, thread.id, []);
      await deleteThreadFromDb(activeAccountId, thread.id);
    } else if (isDraftsView) {
      removeThread(thread.id);
      try {
        const client = await getGmailClient(activeAccountId);
        await deleteDraftsForThread(client, activeAccountId, thread.id);
      } catch (err) {
        console.error("Failed to delete drafts:", err);
      }
    } else {
      await trashThread(activeAccountId, thread.id, []);
    }
  };

  const handleSnooze = async (until: number) => {
    if (!activeAccountId) return;
    setShowSnooze(false);
    if (variant === "mobile") {
      navigateBack();
      snoozeThreadWithUndo(activeAccountId, thread, until);
      return;
    }
    try {
      await snoozeThread(activeAccountId, thread.id, until);
      removeThread(thread.id);
    } catch (err) {
      console.error("Failed to snooze:", err);
    }
  };

  const handleSpam = async () => {
    if (!activeAccountId) return;
    await spamThread(activeAccountId, thread.id, [], !isSpamView);
  };

  // Find the first message with an unsubscribe header
  const unsubscribeMessage = messages?.find((m) => m.list_unsubscribe);
  const hasUnsubscribe = !!unsubscribeMessage?.list_unsubscribe;
  const [unsubscribeStatus, setUnsubscribeStatus] = useState<"idle" | "loading" | "done">("idle");

  const handleUnsubscribe = async () => {
    if (!unsubscribeMessage?.list_unsubscribe || !activeAccountId) return;
    setUnsubscribeStatus("loading");
    try {
      const { executeUnsubscribe } = await import("@/services/unsubscribe/unsubscribeManager");
      const result = await executeUnsubscribe(
        activeAccountId,
        thread.id,
        unsubscribeMessage.from_address ?? "unknown",
        unsubscribeMessage.from_name,
        unsubscribeMessage.list_unsubscribe,
        unsubscribeMessage.list_unsubscribe_post,
      );
      if (result.success) {
        setUnsubscribeStatus("done");
        // Auto-archive after successful unsubscribe
        await archiveThread(activeAccountId, thread.id, []);
      } else {
        setUnsubscribeStatus("idle");
      }
    } catch (err) {
      console.error("Failed to unsubscribe:", err);
      setUnsubscribeStatus("idle");
    }
  };

  const handleTogglePin = async () => {
    if (!activeAccountId) return;
    const newPinned = !thread.isPinned;
    updateThread(thread.id, { isPinned: newPinned });
    try {
      if (newPinned) {
        await pinThreadDb(activeAccountId, thread.id);
      } else {
        await unpinThreadDb(activeAccountId, thread.id);
      }
    } catch (err) {
      console.error("Failed to toggle pin:", err);
      updateThread(thread.id, { isPinned: !newPinned });
    }
  };

  const handleToggleMute = async () => {
    if (!activeAccountId) return;
    const newMuted = !thread.isMuted;
    if (newMuted) {
      // Mute: mark as muted and archive
      updateThread(thread.id, { isMuted: true });
      try {
        await muteThreadDb(activeAccountId, thread.id);
        await archiveThread(activeAccountId, thread.id, []);
      } catch (err) {
        console.error("Failed to mute:", err);
        await unmuteThreadDb(activeAccountId, thread.id);
        updateThread(thread.id, { isMuted: false });
      }
    } else {
      // Unmute
      updateThread(thread.id, { isMuted: false });
      try {
        await unmuteThreadDb(activeAccountId, thread.id);
      } catch (err) {
        console.error("Failed to unmute:", err);
        updateThread(thread.id, { isMuted: true });
      }
    }
  };

  const handleFollowUp = async (remindAt: number) => {
    if (!activeAccountId || !messages || messages.length === 0) return;
    setShowFollowUp(false);
    const lastMsg = messages[messages.length - 1]!;
    try {
      await insertFollowUpReminder(activeAccountId, thread.id, lastMsg.id, remindAt);
      setHasFollowUp(true);
    } catch (err) {
      console.error("Failed to set follow-up reminder:", err);
    }
  };

  const handleCancelFollowUp = async () => {
    if (!activeAccountId) return;
    try {
      await cancelFollowUpForThread(activeAccountId, thread.id);
      setHasFollowUp(false);
    } catch (err) {
      console.error("Failed to cancel follow-up:", err);
    }
  };

  const dialogs = (
    <>
      <SnoozeDialog
        isOpen={showSnooze}
        onSnooze={handleSnooze}
        onClose={() => setShowSnooze(false)}
      />
      <FollowUpDialog
        isOpen={showFollowUp}
        onSetReminder={handleFollowUp}
        onClose={() => setShowFollowUp(false)}
      />
    </>
  );

  if (variant === "mobile") {
    // Leaving actions: go back to the list first (so the screen never shows a
    // vanished thread), then act. Archive/delete get a 5s Undo snackbar.
    const andBack = (fn: () => Promise<void>) => () => {
      navigateBack();
      fn().catch((err) => console.error("Thread action failed:", err));
    };
    const isPlainList = activeLabel !== "trash" && activeLabel !== "drafts";
    const handleArchiveMobile = () => {
      navigateBack();
      if (activeAccountId) archiveThreadWithUndo(activeAccountId, thread);
    };
    const handleDeleteMobile = isPlainList
      ? () => {
          navigateBack();
          if (activeAccountId) trashThreadWithUndo(activeAccountId, thread);
        }
      : andBack(handleDelete);
    const moreItems: ContextMenuItem[] = [
      ...(hasLastMessage
        ? [
            { id: "reply", label: "Reply", icon: Reply, disabled: noReply, action: onReply },
            { id: "reply-all", label: "Reply all", icon: ReplyAll, disabled: noReply, action: onReplyAll },
            { id: "forward", label: "Forward", icon: Forward, action: onForward },
            { id: "sep-1", label: "", separator: true },
          ]
        : []),
      { id: "star", label: thread.isStarred ? "Remove star" : "Add star", icon: Star, action: handleToggleStar },
      { id: "snooze", label: "Snooze…", icon: Clock, action: () => setShowSnooze(true) },
      {
        id: "move",
        label: "Move to…",
        icon: FolderInput,
        action: () => window.dispatchEvent(new CustomEvent("velo-move-to-folder", { detail: { threadIds: [thread.id] } })),
      },
      { id: "pin", label: thread.isPinned ? "Unpin" : "Pin to top", icon: Pin, action: handleTogglePin },
      { id: "mute", label: thread.isMuted ? "Unmute" : "Mute conversation", icon: VolumeX, action: handleToggleMute },
      hasFollowUp
        ? { id: "follow-up", label: "Cancel follow-up reminder", icon: BellRing, action: handleCancelFollowUp }
        : { id: "follow-up", label: "Remind me if no reply…", icon: BellRing, disabled: !hasLastMessage, action: () => setShowFollowUp(true) },
      ...(hasUnsubscribe
        ? [{
            id: "unsubscribe",
            label: unsubscribeStatus === "done" ? "Unsubscribed" : unsubscribeStatus === "loading" ? "Unsubscribing…" : "Unsubscribe",
            icon: MailMinus,
            disabled: unsubscribeStatus !== "idle",
            action: handleUnsubscribe,
          }]
        : []),
      { id: "sep-2", label: "", separator: true },
      { id: "spam", label: isSpamView ? "Not spam" : "Report spam", icon: Ban, danger: !isSpamView, action: andBack(handleSpam) },
      ...(isMobilePlatform() ? [] : [{ id: "export", label: "Export as .eml", icon: Download, action: onExport }]),
    ];

    const iconBtn = "w-12 h-12 flex items-center justify-center rounded-full text-text-secondary active:bg-bg-hover transition-colors";
    return (
      <>
        <div className="sticky top-0 z-20 flex items-center gap-0.5 px-1 pt-[var(--safe-top)] min-h-[calc(3.5rem+var(--safe-top))] shrink-0 bg-bg-primary/85 backdrop-blur-xl">
          <button onClick={() => navigateBack()} className={iconBtn} aria-label="Back" title="Back">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1" />
          <button onClick={handleArchiveMobile} className={iconBtn} aria-label="Archive" title="Archive">
            <Archive size={21} />
          </button>
          <button onClick={handleDeleteMobile} className={iconBtn} aria-label="Delete" title="Delete">
            <Trash2 size={21} />
          </button>
          <button
            onClick={() => {
              // "Mark unread" means "later" — go back to the list like Gmail does
              if (thread.isRead) navigateBack();
              handleToggleRead().catch((err) => console.error("Failed to toggle read:", err));
            }}
            className={iconBtn}
            aria-label={thread.isRead ? "Mark unread" : "Mark read"}
            title={thread.isRead ? "Mark unread" : "Mark read"}
          >
            {thread.isRead ? <Mail size={21} /> : <MailOpen size={21} />}
          </button>
          <button onClick={() => setShowMore(true)} className={iconBtn} aria-label="More actions" title="More">
            <MoreVertical size={21} />
          </button>
        </div>
        {showMore && <SheetMenu items={moreItems} onClose={() => setShowMore(false)} title={thread.subject ?? "(No subject)"} />}
        {dialogs}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1 px-3 py-3 border-b border-border-secondary bg-bg-secondary">
        {/* Reply / Forward group */}
        {hasLastMessage && (
          <>
            <Button
              variant="secondary"
              iconOnly
              icon={defaultReplyMode === "replyAll" ? <ReplyAll size={15} /> : <Reply size={15} />}
              onClick={defaultReplyMode === "replyAll" ? onReplyAll : onReply}
              disabled={noReply}
              title={noReply ? "This sender does not accept replies" : defaultReplyMode === "replyAll" ? "Reply All (r)" : "Reply (r)"}
              className="disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            />
            <Button
              variant="secondary"
              iconOnly
              icon={defaultReplyMode === "replyAll" ? <Reply size={15} /> : <ReplyAll size={15} />}
              onClick={defaultReplyMode === "replyAll" ? onReply : onReplyAll}
              disabled={noReply}
              title={noReply ? "This sender does not accept replies" : defaultReplyMode === "replyAll" ? "Reply (a)" : "Reply All (a)"}
              className="disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            />
            <Button
              variant="secondary"
              iconOnly
              icon={<Forward size={15} />}
              onClick={onForward}
              title="Forward (f)"
            />
            <Separator />
          </>
        )}

        {/* Core actions group */}
        <Button variant="secondary" iconOnly icon={<Archive size={15} />} onClick={handleArchive} title="Archive (e)" />
        <Button variant="secondary" iconOnly icon={<Trash2 size={15} />} onClick={handleDelete} title="Delete (#)" />
        <Button
          variant="secondary"
          iconOnly
          icon={thread.isRead ? <Mail size={15} /> : <MailOpen size={15} />}
          onClick={handleToggleRead}
          title={thread.isRead ? "Mark unread" : "Mark read"}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<Star size={15} className={thread.isStarred ? "fill-current" : ""} />}
          onClick={handleToggleStar}
          title={thread.isStarred ? "Unstar (s)" : "Star (s)"}
          className={thread.isStarred ? "text-warning" : ""}
        />
        <Button variant="secondary" iconOnly icon={<Clock size={15} />} onClick={() => setShowSnooze(true)} title="Snooze (h)" />
        <Button
          variant="secondary"
          iconOnly
          icon={<Ban size={15} />}
          onClick={handleSpam}
          title={isSpamView ? "Not Spam (!)" : "Report Spam (!)"}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<FolderInput size={15} />}
          onClick={() => {
            if (!activeAccountId) return;
            window.dispatchEvent(new CustomEvent("velo-move-to-folder", { detail: { threadIds: [thread.id] } }));
          }}
          title="Move to folder (v)"
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<Pin size={15} className={thread.isPinned ? "fill-current" : ""} />}
          onClick={handleTogglePin}
          title={thread.isPinned ? "Unpin (p)" : "Pin (p)"}
          className={thread.isPinned ? "text-accent" : ""}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<VolumeX size={15} className={thread.isMuted ? "fill-current" : ""} />}
          onClick={handleToggleMute}
          title={thread.isMuted ? "Unmute (m)" : "Mute (m)"}
          className={thread.isMuted ? "text-warning" : ""}
        />
        {hasFollowUp ? (
          <Button
            variant="secondary"
            iconOnly
            icon={<BellRing size={15} className="fill-current" />}
            onClick={handleCancelFollowUp}
            title="Cancel follow-up reminder"
            className="text-accent"
          />
        ) : (
          <Button
            variant="secondary"
            iconOnly
            icon={<BellRing size={15} />}
            onClick={() => setShowFollowUp(true)}
            title="Remind me if no reply"
          />
        )}
        {hasUnsubscribe && (
          <Button
            variant="secondary"
            iconOnly
            icon={<MailMinus size={15} />}
            onClick={handleUnsubscribe}
            title={unsubscribeStatus === "loading" ? "Unsubscribing..." : unsubscribeStatus === "done" ? "Unsubscribed" : "Unsubscribe (u)"}
            className={unsubscribeStatus === "done" ? "text-success" : ""}
          />
        )}

        {/* Spacer */}
        <div className="ml-auto" />

        {/* Utility group */}
        {/* Print and pop-out windows don't exist in the mobile WebView */}
        {!isMobilePlatform() && (
          <>
            <Button variant="secondary" iconOnly icon={<Printer size={15} />} onClick={onPrint} title="Print" />
            <Button variant="secondary" iconOnly icon={<Download size={15} />} onClick={onExport} title="Export as .eml" />
            <Button variant="secondary" iconOnly icon={<ExternalLink size={15} />} onClick={onPopOut} title="Open in new window" />
          </>
        )}
        <Button
          variant="secondary"
          iconOnly
          icon={<ListTodo size={15} className={taskSidebarVisible ? "text-accent" : ""} />}
          onClick={onToggleTaskSidebar}
          title={taskSidebarVisible ? "Hide task panel" : "Show task panel"}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={contactSidebarVisible ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          onClick={onToggleContactSidebar}
          title={contactSidebarVisible ? "Hide contact sidebar" : "Show contact sidebar"}
        />
      </div>

      {dialogs}
    </>
  );
}
