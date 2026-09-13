/**
 * MarkdownDescriptionEditor — plain-text markdown editing with a Medium-style
 * floating format bar.
 *
 * The underlying value stays markdown text (so it round-trips through the
 * datastore unchanged), but selecting text pops a small bar that wraps the
 * selection in the matching markdown syntax. Pasting or dropping an image
 * uploads it through the Shuffle file API and inserts a markdown image link.
 *
 * Like the other incident inputs, the draft is local while typing and only
 * pushed upwards on blur to keep the (very large) incident page responsive.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Tooltip } from '@mui/material';
import { MentionInput } from '@/components/incidents/MentionInput';
import { createAndUploadFile } from '@/services/files';

type Action =
  | { id: string; label: string; title: string; wrap: [string, string] }
  | { id: string; label: string; title: string; prefix: string };

const ACTIONS: Action[] = [
  { id: 'bold', label: 'B', title: 'Bold', wrap: ['**', '**'] },
  { id: 'italic', label: 'I', title: 'Italic', wrap: ['_', '_'] },
  { id: 'strike', label: 'S', title: 'Strikethrough', wrap: ['~~', '~~'] },
  { id: 'code', label: 'Code', title: 'Inline code', wrap: ['`', '`'] },
  { id: 'link', label: 'Link', title: 'Link', wrap: ['[', '](url)'] },
  { id: 'h2', label: 'H2', title: 'Heading', prefix: '## ' },
  { id: 'quote', label: 'Quote', title: 'Quote', prefix: '> ' },
  { id: 'list', label: 'List', title: 'Bullet list', prefix: '- ' },
];

interface MarkdownDescriptionEditorProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  minRows?: number;
}

export const MarkdownDescriptionEditor = ({
  value,
  onCommit,
  placeholder = 'Add a description...',
  autoFocus,
  readOnly,
  minRows = 5,
}: MarkdownDescriptionEditorProps) => {
  const [draft, setDraft] = useState(value);
  const [bar, setBar] = useState<{ top: number; left: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const dirty = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dirty.current) setDraft(value);
  }, [value]);

  const getTextarea = useCallback(
    () => containerRef.current?.querySelector('textarea') as HTMLTextAreaElement | null,
    [],
  );

  const update = useCallback(
    (next: string, selStart: number, selEnd: number) => {
      dirty.current = true;
      setDraft(next);
      requestAnimationFrame(() => {
        const el = getTextarea();
        if (!el) return;
        el.focus();
        el.setSelectionRange(selStart, selEnd);
      });
    },
    [getTextarea],
  );

  /** Position the format bar just above the start of the selection. */
  const refreshBar = useCallback(() => {
    const el = getTextarea();
    if (!el || readOnly) return setBar(null);
    const { selectionStart, selectionEnd } = el;
    if (selectionStart === selectionEnd) return setBar(null);

    const style = window.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6;
    const before = el.value.slice(0, selectionStart);
    const lines = before.split('\n');
    const lineIndex = lines.length - 1;
    const currentLine = lines[lineIndex] || '';

    let textWidth = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      textWidth = ctx.measureText(currentLine).width;
    }

    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const maxLeft = Math.max(el.clientWidth - 24, 0);

    setBar({
      top: paddingTop + lineIndex * lineHeight - el.scrollTop - 8,
      left: Math.min(paddingLeft + textWidth, maxLeft),
    });
  }, [getTextarea, readOnly]);

  const applyAction = useCallback(
    (action: Action) => {
      const el = getTextarea();
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = draft.slice(start, end);

      if ('wrap' in action) {
        const [open, close] = action.wrap;
        const alreadyWrapped =
          draft.slice(start - open.length, start) === open && draft.slice(end, end + close.length) === close;
        if (alreadyWrapped) {
          const next =
            draft.slice(0, start - open.length) + selected + draft.slice(end + close.length);
          update(next, start - open.length, end - open.length);
          return;
        }
        const next = draft.slice(0, start) + open + selected + close + draft.slice(end);
        update(next, start + open.length, start + open.length + selected.length);
        return;
      }

      // Line prefix actions apply to every selected line.
      const lineStart = draft.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = draft.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? draft.length : lineEndIdx;
      const block = draft.slice(lineStart, lineEnd);
      const allPrefixed = block.split('\n').every((line) => line.startsWith(action.prefix));
      const nextBlock = block
        .split('\n')
        .map((line) => (allPrefixed ? line.slice(action.prefix.length) : action.prefix + line))
        .join('\n');
      const next = draft.slice(0, lineStart) + nextBlock + draft.slice(lineEnd);
      update(next, lineStart, lineStart + nextBlock.length);
    },
    [draft, getTextarea, update],
  );

  const insertImages = useCallback(
    async (files: File[]) => {
      if (!files.length || readOnly) return;
      setUploading(true);
      try {
        const el = getTextarea();
        const caret = el ? el.selectionStart : draft.length;
        const snippets: string[] = [];
        for (const file of files) {
          const result = await createAndUploadFile(file, 'incidents', ['description-image']);
          if (result.success && result.file?.id) {
            snippets.push(`![${file.name}](/api/v1/files/${result.file.id}/content)`);
          }
        }
        if (!snippets.length) return;
        const insert = `${snippets.join('\n')}\n`;
        const next = draft.slice(0, caret) + insert + draft.slice(caret);
        update(next, caret + insert.length, caret + insert.length);
      } finally {
        setUploading(false);
      }
    },
    [draft, getTextarea, readOnly, update],
  );

  const imagesFromDataTransfer = (data: DataTransfer | null) =>
    Array.from(data?.files || []).filter((f) => f.type.startsWith('image/'));

  return (
    <Box ref={containerRef} sx={{ position: 'relative' }}>
      <MentionInput
        value={draft}
        onChange={(next) => {
          dirty.current = true;
          setDraft(next);
          setBar(null);
        }}
        fullWidth
        multiline
        minRows={minRows}
        placeholder={placeholder}
        variant="standard"
        autoFocus={autoFocus}
        inputProps={{ readOnly }}
        onBlur={() => {
          setBar(null);
          if (draft !== value) onCommit(draft);
        }}
        onSelect={refreshBar}
        onKeyUp={refreshBar}
        onMouseUp={refreshBar}
        onScroll={() => setBar(null)}
        onPaste={(event) => {
          const images = imagesFromDataTransfer(event.clipboardData);
          if (images.length) {
            event.preventDefault();
            void insertImages(images);
          }
        }}
        onDrop={(event) => {
          const images = imagesFromDataTransfer(event.dataTransfer);
          if (images.length) {
            event.preventDefault();
            void insertImages(images);
          }
        }}
        sx={{
          '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
          '& textarea': { fontSize: '0.95rem', lineHeight: 1.8 },
        }}
      />

      {bar && (
        <Box
          onMouseDown={(event) => event.preventDefault()}
          sx={{
            position: 'absolute',
            top: bar.top,
            left: bar.left,
            transform: 'translate(-50%, -100%)',
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            px: 0.5,
            py: 0.25,
            borderRadius: 1.5,
            bgcolor: 'hsl(var(--background-elevated, var(--card)))',
            boxShadow: '0 6px 20px hsl(var(--foreground) / 0.18)',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}
        >
          {ACTIONS.map((action) => (
            <Tooltip key={action.id} title={action.title} arrow>
              <Box
                component="button"
                type="button"
                onClick={() => applyAction(action)}
                sx={{
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  fontSize: '0.78rem',
                  fontWeight: action.id === 'bold' ? 700 : 500,
                  fontStyle: action.id === 'italic' ? 'italic' : 'normal',
                  textDecoration: action.id === 'strike' ? 'line-through' : 'none',
                  color: 'hsl(var(--foreground))',
                  '&:hover': { bgcolor: 'hsl(var(--muted))' },
                }}
              >
                {action.label}
              </Box>
            </Tooltip>
          ))}
        </Box>
      )}

      {uploading && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 1,
            fontSize: '0.8rem',
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          <CircularProgress size={12} />
          Uploading image...
        </Box>
      )}
    </Box>
  );
};

export default MarkdownDescriptionEditor;
