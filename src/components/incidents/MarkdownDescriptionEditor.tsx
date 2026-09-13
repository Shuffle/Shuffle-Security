/**
 * MarkdownDescriptionEditor — WYSIWYG markdown editing.
 *
 * The value stored on the incident stays markdown text (so it round-trips
 * through the datastore unchanged), but editing happens on the *rendered*
 * document: bold text looks bold, headings look like headings, links look like
 * links. A small "Raw" toggle switches to the plain markdown source for people
 * who want to see or paste the syntax directly.
 *
 * Selecting text pops a small Medium-style bar. "Link" asks for the URL in the
 * bar itself instead of dumping markdown syntax into the text. Pasting or
 * dropping an image uploads it through the Shuffle file API and inserts it.
 *
 * Like the other incident inputs, the draft is local while typing and only
 * pushed upwards on blur to keep the (very large) incident page responsive.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, TextField, Tooltip } from '@mui/material';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { createAndUploadFile } from '@/services/files';

interface MarkdownDescriptionEditorProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  minRows?: number;
}

type BarAction = {
  id: string;
  label: string;
  title: string;
  run: (editor: Editor) => void;
  active: (editor: Editor) => boolean;
};

/** Only http(s), mailto and relative app paths may become links. */
const isSafeHref = (raw: string): boolean => {
  const href = (raw || '').trim();
  if (!href) return false;
  if (/^[/#?]/.test(href)) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) return true;
  return /^(https?:|mailto:)/i.test(href);
};

const ACTIONS: BarAction[] = [
  {
    id: 'bold',
    label: 'B',
    title: 'Bold',
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive('bold'),
  },
  {
    id: 'italic',
    label: 'I',
    title: 'Italic',
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive('italic'),
  },
  {
    id: 'strike',
    label: 'S',
    title: 'Strikethrough',
    run: (e) => e.chain().focus().toggleStrike().run(),
    active: (e) => e.isActive('strike'),
  },
  {
    id: 'code',
    label: 'Code',
    title: 'Inline code',
    run: (e) => e.chain().focus().toggleCode().run(),
    active: (e) => e.isActive('code'),
  },
  {
    id: 'h2',
    label: 'H2',
    title: 'Heading',
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.isActive('heading', { level: 2 }),
  },
  {
    id: 'quote',
    label: 'Quote',
    title: 'Quote',
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive('blockquote'),
  },
  {
    id: 'list',
    label: 'List',
    title: 'Bullet list',
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive('bulletList'),
  },
];

const barButtonSx = (activeState: boolean) => ({
  border: 0,
  background: activeState ? 'hsl(var(--muted))' : 'transparent',
  cursor: 'pointer',
  px: 0.75,
  py: 0.25,
  borderRadius: 1,
  fontSize: '0.78rem',
  fontWeight: 500,
  color: 'hsl(var(--foreground))',
  '&:hover': { bgcolor: 'hsl(var(--muted))' },
});

export const MarkdownDescriptionEditor = ({
  value,
  onCommit,
  placeholder = 'Add a description...',
  autoFocus,
  readOnly,
  minRows = 5,
}: MarkdownDescriptionEditorProps) => {
  const [raw, setRaw] = useState(false);
  const [rawDraft, setRawDraft] = useState(value);
  const [bar, setBar] = useState<{ top: number; left: number } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const latest = useRef(value);
  const valueRef = useRef(value);
  valueRef.current = value;

  const commit = useCallback(
    (next: string) => {
      latest.current = next;
      if (next !== valueRef.current) onCommit(next);
    },
    [onCommit],
  );

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? 'end' : false,
    editable: !readOnly,
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
        validate: (href: string) => isSafeHref(href),
      }),
      Image,
      Placeholder.configure({ placeholder }),
      Markdown.configure({ html: false, transformPastedText: true, linkify: true, breaks: true }),
    ],
    content: value,
    onUpdate: ({ editor: instance }) => {
      latest.current = instance.storage.markdown.getMarkdown();
    },
    onBlur: ({ editor: instance }) => {
      commit(instance.storage.markdown.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: 'markdown-wysiwyg',
      },
    },
  });

  // Keep the editor in sync when the incident value changes from the outside
  // (a reload, a merge, another user's save) without clobbering local edits.
  useEffect(() => {
    if (!editor || raw) return;
    if (value === latest.current) return;
    editor.commands.setContent(value, false);
    latest.current = value;
  }, [editor, value, raw]);

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  /** Position the format bar just above the current selection. */
  const refreshBar = useCallback(() => {
    if (!editor || readOnly) return setBar(null);
    const { from, to, empty } = editor.state.selection;
    if (empty || from === to) {
      setBar(null);
      setLinkOpen(false);
      return;
    }
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to, -1);
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    setBar({
      top: start.top - box.top - 8,
      left: Math.min(Math.max((start.left + end.right) / 2 - box.left, 24), box.width - 24),
    });
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    const handler = () => refreshBar();
    editor.on('selectionUpdate', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('selectionUpdate', handler);
      editor.off('transaction', handler);
    };
  }, [editor, refreshBar]);

  const openLink = useCallback(() => {
    if (!editor) return;
    setLinkUrl(editor.getAttributes('link').href || '');
    setLinkOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const href = linkUrl.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  const insertImages = useCallback(
    async (files: File[]) => {
      if (!files.length || readOnly || !editor) return;
      setUploading(true);
      try {
        for (const file of files) {
          const result = await createAndUploadFile(file, 'incidents', ['description-image']);
          if (result.success && result.file?.id) {
            editor
              .chain()
              .focus()
              .setImage({ src: `/api/v1/files/${result.file.id}/content`, alt: file.name })
              .run();
          }
        }
        latest.current = editor.storage.markdown.getMarkdown();
      } finally {
        setUploading(false);
      }
    },
    [editor, readOnly],
  );

  const imagesFromDataTransfer = (data: DataTransfer | null) =>
    Array.from(data?.files || []).filter((f) => f.type.startsWith('image/'));

  /** Switch between rendered editing and the plain markdown source. */
  const toggleRaw = useCallback(() => {
    if (!raw) {
      setRawDraft(latest.current);
      setRaw(true);
      setBar(null);
      setLinkOpen(false);
      return;
    }
    latest.current = rawDraft;
    editor?.commands.setContent(rawDraft, false);
    commit(rawDraft);
    setRaw(false);
  }, [commit, editor, raw, rawDraft]);

  return (
    <Box ref={containerRef} sx={{ position: 'relative' }}>
      {!readOnly && (
        <Box
          component="button"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleRaw}
          sx={{
            position: 'absolute',
            top: -4,
            right: 0,
            zIndex: 5,
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            px: 0.75,
            py: 0.25,
            borderRadius: 1,
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: raw ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            '&:hover': { bgcolor: 'hsl(var(--muted))' },
          }}
        >
          Raw
        </Box>
      )}

      {raw ? (
        <TextField
          value={rawDraft}
          onChange={(event) => setRawDraft(event.target.value)}
          onBlur={() => {
            latest.current = rawDraft;
            commit(rawDraft);
          }}
          fullWidth
          multiline
          minRows={minRows}
          placeholder={placeholder}
          variant="standard"
          autoFocus
          inputProps={{ readOnly }}
          sx={{
            '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
            '& textarea': {
              fontSize: '0.9rem',
              lineHeight: 1.7,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            },
          }}
        />
      ) : (
        <Box
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
            '& .markdown-wysiwyg': {
              outline: 'none',
              fontSize: '0.95rem',
              lineHeight: 1.8,
              minHeight: minRows * 28,
              color: 'hsl(var(--foreground))',
            },
            '& .markdown-wysiwyg p': { m: 0, mb: 1.25 },
            '& .markdown-wysiwyg p:last-child': { mb: 0 },
            '& .markdown-wysiwyg h1, & .markdown-wysiwyg h2, & .markdown-wysiwyg h3': {
              fontWeight: 700,
              lineHeight: 1.35,
              mt: 2,
              mb: 1,
            },
            '& .markdown-wysiwyg h1': { fontSize: '1.25rem' },
            '& .markdown-wysiwyg h2': { fontSize: '1.1rem' },
            '& .markdown-wysiwyg h3': { fontSize: '1rem' },
            '& .markdown-wysiwyg ul, & .markdown-wysiwyg ol': { pl: 3, mt: 0, mb: 1.25 },
            '& .markdown-wysiwyg li p': { mb: 0.25 },
            '& .markdown-wysiwyg blockquote': {
              borderLeft: '2px solid hsl(var(--border))',
              pl: 1.5,
              ml: 0,
              color: 'hsl(var(--muted-foreground))',
            },
            '& .markdown-wysiwyg code': {
              bgcolor: 'hsl(var(--muted))',
              px: 0.5,
              borderRadius: 0.75,
              fontSize: '0.85em',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            },
            '& .markdown-wysiwyg pre': {
              bgcolor: 'hsl(var(--muted))',
              p: 1.5,
              borderRadius: 1,
              overflowX: 'auto',
            },
            '& .markdown-wysiwyg pre code': { bgcolor: 'transparent', p: 0 },
            '& .markdown-wysiwyg a': { color: 'hsl(var(--primary))', textDecoration: 'underline' },
            '& .markdown-wysiwyg img': { maxWidth: '100%', borderRadius: 6 },
            '& .markdown-wysiwyg hr': { border: 0, borderTop: '1px solid hsl(var(--border))' },
            '& .markdown-wysiwyg p.is-editor-empty:first-of-type::before': {
              content: 'attr(data-placeholder)',
              color: 'hsl(var(--muted-foreground))',
              float: 'left',
              height: 0,
              pointerEvents: 'none',
            },
          }}
        >
          <EditorContent editor={editor} />
        </Box>
      )}

      {bar && editor && !raw && (
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
          {linkOpen ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5 }}>
              <TextField
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyLink();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setLinkOpen(false);
                  }
                }}
                placeholder="Paste or type a URL"
                variant="standard"
                autoFocus
                sx={{
                  width: 220,
                  '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
                  '& input': { fontSize: '0.78rem' },
                }}
              />
              <Box component="button" type="button" onClick={applyLink} sx={barButtonSx(false)}>
                Apply
              </Box>
              <Box
                component="button"
                type="button"
                onClick={() => setLinkOpen(false)}
                sx={barButtonSx(false)}
              >
                Cancel
              </Box>
            </Box>
          ) : (
            <>
              {ACTIONS.map((action) => (
                <Tooltip key={action.id} title={action.title} arrow>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => action.run(editor)}
                    sx={{
                      ...barButtonSx(action.active(editor)),
                      fontWeight: action.id === 'bold' ? 700 : 500,
                      fontStyle: action.id === 'italic' ? 'italic' : 'normal',
                      textDecoration: action.id === 'strike' ? 'line-through' : 'none',
                    }}
                  >
                    {action.label}
                  </Box>
                </Tooltip>
              ))}
              <Tooltip title="Link" arrow>
                <Box
                  component="button"
                  type="button"
                  onClick={openLink}
                  sx={barButtonSx(editor.isActive('link'))}
                >
                  Link
                </Box>
              </Tooltip>
            </>
          )}
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
