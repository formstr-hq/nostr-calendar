import { Drawer } from "vaul";
import { radius } from "../../theme/tokens";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** vaul drawer anchored to the bottom, r20 top corners + grabber, native swipe-to-dismiss. */
export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            zIndex: 1300,
          }}
        />
        <Drawer.Content
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
            borderTopLeftRadius: radius.modal,
            borderTopRightRadius: radius.modal,
            backgroundColor: "var(--mui-palette-background-paper)",
            zIndex: 1301,
            outline: "none",
          }}
        >
          <Drawer.Handle
            style={{
              marginTop: 12,
              marginBottom: 4,
            }}
          />
          <div style={{ overflowY: "auto" }}>{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
