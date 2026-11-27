import { useEffect, useRef, useState } from "react";
import { fetchMyDocuments, createDocument } from "../../../nostr/documents";
import type { DocumentSummary } from "../../../nostr/documentDiscovery";
import { useRelayStore } from "../../../stores/relays";
import { useUser } from "../../../stores/user";
import type { IDocumentAttachment } from "../../../utils/types";

export function useDocumentPicker(
  attached: IDocumentAttachment[],
  onChange: (docs: IDocumentAttachment[]) => void,
) {
  const relays = useRelayStore((s) => s.relays);
  const pubkey = useUser((s) => s.user?.pubkey);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const generation = useRef(0);
  const loadingRef = useRef(false);
  useEffect(() => {
    generation.current++;
    loadingRef.current = false;
    setDocuments([]);
    setLoading(false);
    setCreating(false);
    setError(null);
    setQueued(false);
    return () => {
      generation.current++;
    };
  }, [pubkey]);
  const load = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const current = generation.current;
    setLoading(true);
    setDocuments([]);
    setError(null);
    try {
      const result = await fetchMyDocuments(relays, (doc) => {
        if (current === generation.current)
          setDocuments((previous) => [...previous, doc]);
      });
      if (current !== generation.current) return;
      setDocuments(result.documents);
      setIncomplete(result.incomplete);
    } catch {
      if (current === generation.current) setError("documents.loadError");
    } finally {
      if (current === generation.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  };
  const create = async (title: string, body: string) => {
    if (!pubkey || creating) return false;
    const current = generation.current;
    setCreating(true);
    setError(null);
    try {
      const result = await createDocument(title, body, pubkey);
      if (current !== generation.current) return false;
      onChange([...attached, result.document]);
      setQueued(result.queued);
      return true;
    } catch {
      if (current === generation.current) setError("documents.createError");
      return false;
    } finally {
      if (current === generation.current) setCreating(false);
    }
  };
  return {
    documents,
    loading,
    creating,
    error,
    incomplete,
    queued,
    load,
    create,
  };
}
