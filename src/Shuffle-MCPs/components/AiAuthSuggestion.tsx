import React from 'react';
import { Box, Button, Typography, type SxProps, type Theme } from '@mui/material';

export interface AiAuthSuggestionProps {
  /** Callback invoked when the user clicks the action button to open the Local LLM tab. */
  onOpenLocalLlm: () => void;
  /** Optional custom SX styling overrides. */
  sx?: SxProps<Theme>;
}

/**
 * Clean, plain-text suggestion card displayed when an AI credential failure is detected.
 * Provides a direct affordance to open the Local LLM drawer area and update authentication.
 *
 * Adheres strictly to the project rules: zero emojis and zero decorative icons.
 */
export const AiAuthSuggestion: React.FC<AiAuthSuggestionProps> = ({
  onOpenLocalLlm,
  sx,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1.25,
        p: 1.5,
        borderRadius: 1.5,
        border: '1px solid hsla(var(--severity-critical) / 0.35)',
        bgcolor: 'hsla(var(--severity-critical) / 0.08)',
        ...(sx || {}),
      }}
    >
      <Box sx={{ width: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
          <Box
            component="span"
            sx={{
              fontSize: '0.66rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              px: 0.75,
              py: 0.15,
              borderRadius: '4px',
              bgcolor: 'hsla(var(--severity-critical) / 0.2)',
              color: 'hsl(var(--severity-critical))',
              border: '1px solid hsla(var(--severity-critical) / 0.35)',
            }}
          >
            Suggestion
          </Box>
          <Typography
            sx={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'hsl(var(--foreground))',
            }}
          >
            Reconfigure Local LLM Authentication
          </Typography>
        </Box>
        <Typography
          sx={{
            fontSize: '0.78rem',
            color: 'hsl(var(--muted-foreground))',
            lineHeight: 1.45,
          }}
        >
          The AI model provider rejected the request due to invalid or expired credentials. Update your API key or model endpoint in Local LLM to continue.
        </Typography>
      </Box>

      <Button
        variant="contained"
        size="small"
        disableElevation
        onClick={(e) => {
          e.stopPropagation();
          onOpenLocalLlm();
        }}
        sx={{
          height: 30,
          px: 1.5,
          textTransform: 'none',
          fontSize: '0.78rem',
          fontWeight: 600,
          bgcolor: 'hsl(var(--severity-critical))',
          color: 'hsl(var(--background))',
          '&:hover': {
            bgcolor: 'hsla(var(--severity-critical) / 0.88)',
          },
        }}
      >
        Change authentication
      </Button>
    </Box>
  );
};

export default AiAuthSuggestion;
