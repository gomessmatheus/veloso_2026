import { useState, useEffect } from "react";

/**
 * Returns true when viewport width < 768 px.
 * Reacts to resize events.
 */
export function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mob;
}
