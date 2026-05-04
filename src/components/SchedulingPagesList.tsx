import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Box,
  Typography,
  IconButton,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AddIcon from "@mui/icons-material/Add";
import { useSchedulingPages } from "../stores/schedulingPages";
import { ROUTES, getSchedulingPageEditUrl } from "../utils/routingHelper";
import { useIntl } from "react-intl";

interface SchedulingPagesListProps {
  /** When provided, called after navigation to close a parent drawer */
  onNavigate?: () => void;
}

export const SchedulingPagesList = ({
  onNavigate,
}: SchedulingPagesListProps) => {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();
  const { pages, isLoaded, deletePage, getNAddr, getPageUrl } =
    useSchedulingPages();
  const [pageToDelete, setPageToDelete] = useState<string | null>(null);

  const handleCreate = () => {
    navigate(ROUTES.SchedulingPageCreate);
    onNavigate?.();
  };

  const handleEdit = (pageId: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    navigate(getSchedulingPageEditUrl(getNAddr(page)));
    onNavigate?.();
  };

  const handleCopyLink = (pageId: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    const url = getPageUrl(page);
    navigator.clipboard.writeText(url);
  };

  const handleDelete = (pageId: string) => {
    setPageToDelete(pageId);
  };

  const handleConfirmDelete = async () => {
    if (!pageToDelete) return;
    await deletePage(pageToDelete);
    setPageToDelete(null);
  };

  const handleCancelDelete = () => {
    setPageToDelete(null);
  };

  if (!isLoaded) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          {formatMessage({id: "scheduling.sidebarTitle"})}
        </Typography>
        <IconButton size="small" onClick={handleCreate}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>

      {pages.length === 0 ? (
        <Box py={1} textAlign="center">
          <Typography variant="body2" color="text.secondary">
            {formatMessage({ id: "scheduling.noSchedulingPages" })}
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleCreate}
            sx={{ mt: 0.5 }}
          >
            {formatMessage({ id: "scheduling.createPage" })}
          </Button>
        </Box>
      ) : (
        <List dense disablePadding>
          {pages.map((page) => (
            <ListItem
              key={page.id}
              sx={{
                px: 0.5,
                borderRadius: 1,
                "&:hover": { backgroundColor: "action.hover" },
              }}
            >
              <ListItemText
                primary={page.title}
                primaryTypographyProps={{ variant: "body2", noWrap: true }}
              />
              <ListItemSecondaryAction>
                <Tooltip title={formatMessage({ id: "scheduling.copyLink" })}>
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => handleCopyLink(page.id)}
                  >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={formatMessage({ id: "scheduling.openLink" })}>
                  <IconButton
                    size="small"
                    component="a"
                    href={getPageUrl(page)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <OpenInNewIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={formatMessage({ id: "navigation.edit" })}>
                  <IconButton size="small" onClick={() => handleEdit(page.id)}>
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={formatMessage({ id: "navigation.delete" })}>
                  <IconButton
                    size="small"
                    onClick={() => handleDelete(page.id)}
                  >
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      {/* Link to bookings page */}
      <Button
        size="small"
        fullWidth
        sx={{ mt: 1, justifyContent: "flex-start" }}
        onClick={() => {
          navigate(ROUTES.Bookings);
          onNavigate?.();
        }}
      >
        {formatMessage({ id: "scheduling.viewBookings" })}
      </Button>

      <Dialog
        open={pageToDelete !== null}
        onClose={handleCancelDelete}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {formatMessage({ id: "scheduling.deletePageTitle" })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {formatMessage({ id: "scheduling.deletePageWarning" })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>
            {formatMessage({ id: "navigation.cancel" })}
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            {formatMessage({ id: "navigation.delete" })}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
