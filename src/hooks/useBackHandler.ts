import { useEffect, useRef } from "react";
import { pushBackHandler } from "@/router/backNavigation";

/**
 * While `active`, make the Android Back button call `onBack` (topmost overlay
 * wins). No effect on desktop, where nothing dispatches the back stack.
 */
export function useBackHandler(active: boolean, onBack: () => void): void {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => ref.current());
  }, [active]);
}
