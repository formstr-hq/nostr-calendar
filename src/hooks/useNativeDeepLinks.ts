import { useEffect } from "react";
import { useNavigate } from "react-router";
import { extractAppRouteFromUrl } from "../utils/deepLinks";
import { isNative } from "../utils/platform";

export function useNativeDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative) return;

    let cancelled = false;
    let lastHandledUrl: string | null = null;
    let cleanup: (() => void) | undefined;

    const handleIncomingUrl = (
      incomingUrl: string | undefined,
      options?: { replace?: boolean },
    ) => {
      if (!incomingUrl || incomingUrl === lastHandledUrl) return;
      const route = extractAppRouteFromUrl(incomingUrl);
      if (!route) return;
      lastHandledUrl = incomingUrl;
      navigate(route, { replace: options?.replace ?? false });
    };

    import("@capacitor/app").then(async ({ App: CapApp }) => {
      const launchUrl = await CapApp.getLaunchUrl();
      if (!cancelled) {
        handleIncomingUrl(launchUrl?.url, { replace: true });
      }

      const listener = CapApp.addListener("appUrlOpen", ({ url }) => {
        if (!cancelled) {
          handleIncomingUrl(url);
        }
      });

      cleanup = () => {
        listener.then((l) => l.remove());
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [navigate]);
}
