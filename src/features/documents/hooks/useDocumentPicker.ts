import { useEffect, useRef, useState } from "react";
import { fetchMyDocuments, checkDocument } from "../../../nostr/documents";
import type { DocumentSummary } from "../../../nostr/documentDiscovery";
import { useRelayStore } from "../../../stores/relays";
import { useUser } from "../../../stores/user";
import {
  documentAddress,
  parseDocumentInput,
} from "../../../utils/documentLink";
import type { IDocumentAttachment } from "../../../utils/types";

export function useDocumentPicker(
  attached: IDocumentAttachment[],
  onChange: (docs: IDocumentAttachment[]) => void,
  isPrivate: boolean,
) {
  const relays = useRelayStore((s) => s.relays);
  const pubkey = useUser((s) => s.user?.pubkey);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incomplete, setIncomplete] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setDocuments([]);
    setLoading(false);
    setChecking(false);
    setError(null);
    return () => {
      generation.current++;
    };
  }, [pubkey]);
  const load = async () => {
    const current = generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMyDocuments(relays);
      if (current !== generation.current) return;
      setDocuments(result.documents);
      setIncomplete(result.incomplete);
    } catch {
      if (current === generation.current) setError("documents.loadError");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  };
  const addUrl = async (input: string, authorize: boolean) => {
    const doc = parseDocumentInput(input);
    setError(null);
    if (!doc) {
      setError("documents.invalid");
      return false;
    }
    if (
      attached.some(
        (d) => documentAddress(d.naddr) === documentAddress(doc.naddr),
      )
    ) {
      setError("documents.duplicate");
      return false;
    }
    if (doc.viewKey && (!isPrivate || !authorize)) {
      setError("documents.authorizationRequired");
      return false;
    }
    const current = generation.current;
    setChecking(true);
    try {
      const resolved = await checkDocument(doc, relays);
      if (current !== generation.current) return false;
      if (!resolved) {
        setError("documents.unavailable");
        return false;
      }
      onChange([
        ...attached,
        {
          naddr: doc.naddr,
          title: resolved.title,
          ...(doc.viewKey ? { viewKey: doc.viewKey } : {}),
        },
      ]);
      return true;
    } catch {
      if (current === generation.current) setError("documents.unavailable");
      return false;
    } finally {
      if (current === generation.current) setChecking(false);
    }
  };
  return { documents, loading, checking, error, incomplete, load, addUrl };
}
