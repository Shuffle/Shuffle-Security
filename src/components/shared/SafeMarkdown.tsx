/**
 * SafeMarkdown — renders a markdown string as sanitized HTML.
 *
 * Markdown is parsed with react-markdown + remark-gfm (tables, strikethrough,
 * task lists) and then hardened with rehype-sanitize, so pasted content from
 * an email or a report can never inject script, iframe or event handlers.
 *
 * Images are supported. Images stored in the Shuffle file API are fetched with
 * the current session so they render without exposing the file content URL to
 * an unauthenticated request.
 */

import { useEffect, useState } from 'react';
import { Box, BoxProps } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { getApiUrl, getAuthHeader } from '@/Shuffle-MCPs/api';

// Allow inline images (including data URIs written by a paste) while keeping
// the rest of the default GitHub-flavoured sanitizer schema intact.
const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src || []), 'data', 'blob'],
  },
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img || []), 'alt', 'title', 'width', 'height'],
  },
};

const isApiFileUrl = (src: string) => src.includes('/api/v1/files/');

/** Image that loads Shuffle file-API images through the authenticated session. */
const MarkdownImage = ({ src, alt, title }: { src?: string; alt?: string; title?: string }) => {
  const [resolved, setResolved] = useState<string | undefined>(
    src && isApiFileUrl(src) ? undefined : src,
  );

  useEffect(() => {
    if (!src || !isApiFileUrl(src)) {
      setResolved(src);
      return;
    }
    let objectUrl = '';
    let cancelled = false;
    (async () => {
      try {
        const url = src.startsWith('http') ? src : getApiUrl(src);
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
  }, [src]);

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
      style={{ maxWidth: '100%', height: 'auto', borderRadius: 6, display: 'block', margin: '12px 0' }}
    />
  );
};

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      style={{ color: 'hsl(var(--primary))', textDecoration: 'underline' }}
    >
      {children}
    </a>
  ),
  img: ({ src, alt, title }) => (
    <MarkdownImage src={typeof src === 'string' ? src : undefined} alt={alt} title={title} />
  ),
};

interface SafeMarkdownProps extends Omit<BoxProps, 'children'> {
  text: string;
}

export const SafeMarkdown = ({ text, sx, ...boxProps }: SafeMarkdownProps) => (
  <Box
    {...boxProps}
    sx={{
      fontSize: '0.95rem',
      lineHeight: 1.8,
      color: 'inherit',
      wordBreak: 'break-word',
      '& p': { m: 0, mb: 1.5 },
      '& p:last-child': { mb: 0 },
      '& h1, & h2, & h3, & h4': { mt: 2.5, mb: 1, fontWeight: 600, lineHeight: 1.3 },
      '& h1': { fontSize: '1.35rem' },
      '& h2': { fontSize: '1.15rem' },
      '& h3': { fontSize: '1rem' },
      '& ul, & ol': { pl: 3, mb: 1.5 },
      '& li': { mb: 0.5 },
      '& blockquote': {
        m: 0,
        mb: 1.5,
        pl: 2,
        borderLeft: '2px solid hsl(var(--border))',
        color: 'hsl(var(--muted-foreground))',
      },
      '& code': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.88em',
        px: 0.5,
        borderRadius: '3px',
        bgcolor: 'hsl(var(--muted))',
      },
      '& pre': {
        p: 1.5,
        borderRadius: 1,
        bgcolor: 'hsl(var(--muted))',
        overflow: 'auto',
        mb: 1.5,
      },
      '& pre code': { bgcolor: 'transparent', px: 0 },
      '& table': { borderCollapse: 'collapse', mb: 1.5, maxWidth: '100%' },
      '& th, & td': { textAlign: 'left', px: 1, py: 0.5, verticalAlign: 'top' },
      '& th': { color: 'hsl(var(--muted-foreground))', fontWeight: 600 },
      '& hr': { border: 0, borderTop: '1px solid hsl(var(--border))', my: 2 },
      ...sx,
    }}
  >
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeSanitize, schema]]}
      components={components}
    >
      {text}
    </ReactMarkdown>
  </Box>
);

export default SafeMarkdown;
