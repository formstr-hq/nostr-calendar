import { useCallback, useMemo, useState } from "react";
import type { IFormAttachment } from "../utils/types";

export type AcceptWithFormsStartParams<TContext> = {
  calendarId: string;
  giftWrapId?: string;
  attachments: IFormAttachment[];
  context: TContext;
};

export type PendingAcceptWithForms<TContext> =
  AcceptWithFormsStartParams<TContext> & {
    formIndex: number;
  };

export function createPendingAcceptWithForms<TContext>(
  params: AcceptWithFormsStartParams<TContext>,
): PendingAcceptWithForms<TContext> | null {
  if (params.attachments.length === 0) {
    return null;
  }

  return {
    ...params,
    formIndex: 0,
  };
}

export function getNextPendingAcceptWithForms<TContext>(
  pendingAccept: PendingAcceptWithForms<TContext>,
): PendingAcceptWithForms<TContext> | null {
  const nextIndex = pendingAccept.formIndex + 1;
  if (nextIndex >= pendingAccept.attachments.length) {
    return null;
  }

  return {
    ...pendingAccept,
    formIndex: nextIndex,
  };
}

type UseAcceptWithFormsFlowParams<TContext> = {
  onFinalize: (params: {
    calendarId: string;
    giftWrapId?: string;
  }) => Promise<void>;
  onCancel?: (pendingAccept: PendingAcceptWithForms<TContext>) => void;
};

export function useAcceptWithFormsFlow<TContext>({
  onFinalize,
  onCancel,
}: UseAcceptWithFormsFlowParams<TContext>) {
  const [pendingAccept, setPendingAccept] =
    useState<PendingAcceptWithForms<TContext> | null>(null);

  const startAccept = useCallback(
    async (params: AcceptWithFormsStartParams<TContext>) => {
      if (!params.calendarId) {
        return false;
      }

      const nextPendingAccept = createPendingAcceptWithForms(params);
      if (!nextPendingAccept) {
        await onFinalize({
          calendarId: params.calendarId,
          giftWrapId: params.giftWrapId,
        });
        return false;
      }

      setPendingAccept(nextPendingAccept);
      return true;
    },
    [onFinalize],
  );

  const advanceAccept = useCallback(async () => {
    if (!pendingAccept) {
      return;
    }

    const nextPendingAccept = getNextPendingAcceptWithForms(pendingAccept);
    if (nextPendingAccept) {
      setPendingAccept(nextPendingAccept);
      return;
    }

    const { calendarId, giftWrapId } = pendingAccept;
    setPendingAccept(null);
    await onFinalize({ calendarId, giftWrapId });
  }, [onFinalize, pendingAccept]);

  const cancelAccept = useCallback(() => {
    if (!pendingAccept) {
      return;
    }

    setPendingAccept(null);
    onCancel?.(pendingAccept);
  }, [onCancel, pendingAccept]);

  const pendingForm = useMemo(() => {
    if (!pendingAccept) {
      return null;
    }

    return pendingAccept.attachments[pendingAccept.formIndex] ?? null;
  }, [pendingAccept]);

  return {
    pendingAccept,
    pendingForm,
    formCount: pendingAccept?.attachments.length ?? 0,
    startAccept,
    advanceAccept,
    cancelAccept,
  };
}
