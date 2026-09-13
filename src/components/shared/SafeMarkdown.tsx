/**
 * SafeMarkdown — renders a markdown string with the SAME renderer and config
 * used for documentation (`ShuffleMarkdown`), so plugins, link handling and
 * sanitization stay identical everywhere.
 *
 * Strictness guarantees (defense in depth):
 *  - Raw HTML is never enabled (no rehype-raw) and rehype-sanitize runs on the
 *    resulting tree, so script/iframe/style/event handlers can never appear.
 *  - Link and image URLs are additionally checked here: only http(s), mailto,
 *    relative app paths and `data:image/*` are allowed. Anything else
 *    (javascript:, vbscript:, data:text/html, ...) is rendered as plain text.
 *  - Nothing may set styles: inline `style` is not part of the sanitizer
 *    schema, and our own components only apply theme tokens.
 *
 * Images stored in the Shuffle file API are fetched with the current session
 * (same approach as the email renderer) so they render without an
 * unauthenticated request to the file content URL.
 */

import { useEffect, useState } from 'react';
import { Box, BoxProps } from '@mui/material';
import { ShuffleMarkdown } from '@/components/shared/Markdown';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';

const isApiFileUrl = (src: string) => src.includes('/api/v1/files/');

/** Only allow URLs that cannot execute script when rendered. */
const isSafeUrl = (raw?: unknown): raw is string => {
  if (typeof raw !== 'string') return false;
  const url = raw.trim();
  if (!url) return false;
  // Relative paths and fragments are fine.
  if (/^[/#?]/.test(url)) return true;
  // Scheme-less values (e.g. "example.com/x") never execute.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return true;
  return /^(https?:|mailto:)/i.test(url);
};

/** Images may additionally be inline image data (pasted screenshots). */
const isSafeImageUrl = (raw?: unknown): raw is string => {
  if (typeof raw !== 'string') return false;
  const url = raw.trim();
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(url)) return true;
  return isSafeUrl(url);
};

/** Image that loads Shuffle file-API images through the authenticated session. */
const MarkdownImage = ({ src, alt, title }: { src?: unknown; alt?: string; title?: string }) => {
  const safeSrc = isSafeImageUrl(src) ? src.trim() : undefined;
  const [resolved, setResolved] = useState<string | undefined>(
    safeSrc && isApiFileUrl(safeSrc) ? undefined : safeSrc,
  );

  useEffect(() => {
    if (!safeSrc || !isApiFileUrl(safeSrc)) {
      setResolved(safeSrc);
      return;
    }
    let objectUrl = '';
    let cancelled = false;
    (async () => {
      try {
        const url = safeSrc.startsWith('http') ? safeSrc : getApiUrl(safeSrc);
        const resp = await fetch(url, { credentials: 'include', headers: getAuthHeader() });
        if (!resp.ok) return;
        const blob = await resp.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved(objectUrl);
      } catch {
        // Leave the image unresolved; the alt text stays visible.
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [safeSrc]);

  if (!resolved) {
    return (
      <Box
        component="span"
        sx={{ display: 'inline-block', color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}
      >
        {alt || 'Image'}
      </Box>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt || ''}
      title={title}
      loading="lazy"
      style={{ maxWidth: '100%', height: 'auto', borderRadius: 6, display: 'block', margin: '12px 0' }}
    />
  );
};

const components = {
  a: ({ href, children }: any) =>
    isSafeUrl(href) ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(event) => event.stopPropagation()}
        style={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ src, alt, title }: any) => <MarkdownImage src={src} alt={alt} title={title} />,
};

interface SafeMarkdownProps extends Omit<BoxProps, 'children'> {
  text: string;
}

export const SafeMarkdown = ({ text, sx, ...boxProps }: SafeMarkdownProps) => (
  <Box {...boxProps} sx={{ fontSize: '0.95rem', lineHeight: 1.8, ...sx }}>
    <ShuffleMarkdown components={components}>{text}</ShuffleMarkdown>
  </Box>
);

export default SafeMarkdown;
