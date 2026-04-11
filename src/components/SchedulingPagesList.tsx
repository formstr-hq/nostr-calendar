import React from "react";
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
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import AddIcon from "@mui/icons-material/Add";
import { useSchedulingPages } from "../stores/schedulingPages";
import { ROUTES, getSchedulingPageEditUrl } from "../utils/routingHelper";

interface SchedulingPagesListProps {
  /** When provided, called after navigation to close a parent drawer */
  onNavigate?: () => void;
}

export const SchedulingPagesList = ({
  onNavigate,
}: SchedulingPagesListProps) => {
  const navigate = useNavigate();
  const { pages, isLoaded, deletePage, getNAddr } = useSchedulingPages();

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
    const url = `${window.location.origin}/schedule/${getNAddr(page)}`;
    navigator.clipboard.writeText(url);
  };

  const handleDelete = async (pageId: string) => {
    await deletePage(pageId);
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
          Scheduling
        </Typography>
        <IconButton size="small" onClick={handleCreate}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>

      {pages.length === 0 ? (
        <Box py={1} textAlign="center">
          <Typography variant="body2" color="text.secondary">
            No scheduling pages
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleCreate}
            sx={{ mt: 0.5 }}
          >
            Create Page
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
                <Tooltip title="Copy link">
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => handleCopyLink(page.id)}
                  >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => handleEdit(page.id)}>
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
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
        View Bookings
      </Button>
    </Box>
  );
};
