import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Stack, TextField, Typography, Paper, Divider } from "@mui/material";
import { Event } from "nostr-tools";
import { useIntl } from "react-intl";
import { ICalendarEvent } from "../utils/types";
import { fetchEventComments, publishEventComment } from "../common/nostr";
import { useUser } from "../stores/user";
import { Participant } from "./Participant";

interface EventCommentsProps {
  event: ICalendarEvent;
}

export function EventComments({ event }: EventCommentsProps) {
  const intl = useIntl();
  const { user } = useUser();
  const [comments, setComments] = useState<Event[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Derive the a-tag coordinate: "<kind>:<pubkey>:<d-identifier>"
  const aTagString = `${event.kind}:${event.user}:${event.id}`;

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setComments([]);

    // Open subscription
    const sub = fetchEventComments(aTagString, (fetchedEvent) => {
      if (mounted) {
        setComments((prev) => {
          // Prevent duplicates
          if (prev.find((c) => c.id === fetchedEvent.id)) return prev;
          // Return newly sorted array (oldest first)
          return [...prev, fetchedEvent].sort((a, b) => a.created_at - b.created_at);
        });
      }
    });

    // We consider loading finished quickly after init
    const timeout = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 1500);

    return () => {
      mounted = false;
      sub.unsubscribe();
      clearTimeout(timeout);
    };
  }, [aTagString]);

  const handleSubmit = async () => {
    if (!newComment.trim() || !user) return;
    setIsSubmitting(true);
    try {
      await publishEventComment(aTagString, newComment.trim());
      setNewComment("");
    } catch (e) {
      console.error("Failed to post comment:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box mt={4} mb={2}>
      <Typography variant="h6" gutterBottom>
        {intl.formatMessage({ id: "comments.title", defaultMessage: "Comments" })}
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, minHeight: 100 }}>
        {isLoading && comments.length === 0 ? (
          <Box display="flex" justifyContent="center" p={2}>
            <CircularProgress size={24} />
          </Box>
        ) : comments.length === 0 ? (
          <Typography variant="body2" color="text.secondary" p={2} textAlign="center">
            {intl.formatMessage({ id: "comments.empty", defaultMessage: "No comments yet. Be the first to add one!" })}
          </Typography>
        ) : (
          <Stack spacing={2} divider={<Divider />}>
            {comments.map((comment) => (
              <Box key={comment.id}>
                <Box mb={1}>
                  <Participant pubKey={comment.pubkey} isAuthor={comment.pubkey === event.user} />
                </Box>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {comment.content}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                  {new Date(comment.created_at * 1000).toLocaleString()}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}

        {user ? (
          <Box pt={3}>
            <Stack spacing={1}>
              <TextField
                multiline
                rows={2}
                fullWidth
                size="small"
                placeholder={intl.formatMessage({ id: "comments.placeholder", defaultMessage: "Add a comment..." })}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                disabled={isSubmitting}
              />
              <Box display="flex" justifyContent="flex-end">
                <Button
                  variant="contained"
                  disabled={!newComment.trim() || isSubmitting}
                  onClick={handleSubmit}
                  size="small"
                >
                  {isSubmitting
                    ? intl.formatMessage({ id: "comments.posting", defaultMessage: "Posting..." })
                    : intl.formatMessage({ id: "comments.post", defaultMessage: "Post Comment" })}
                </Button>
              </Box>
            </Stack>
          </Box>
        ) : (
          <Box pt={2}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {intl.formatMessage({ id: "comments.loginPrompt", defaultMessage: "Please log in to add a comment." })}
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
