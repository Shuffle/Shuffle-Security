import { useEffect, useRef, useState } from 'react';
import { TextField, TextFieldProps } from '@mui/material';
import { MentionInput } from '@/components/incidents/MentionInput';

/**
 * Text inputs that keep their own draft state while the user types and only
 * push the value upwards on blur. Used on the incident pages where every
 * keystroke otherwise re-renders the whole (very large) page and feels laggy.
 */

type DeferredTextFieldProps = Omit<TextFieldProps, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
};

export const DeferredTextField = ({ value, onCommit, onFocus, onBlur, ...props }: DeferredTextFieldProps) => {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  // Accept external updates (reloads, resyncs) only while not being edited.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return (
    <TextField
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => {
        focused.current = true;
        onFocus?.(event);
      }}
      onBlur={(event) => {
        focused.current = false;
        if (draft !== value) onCommit(draft);
        onBlur?.(event);
      }}
    />
  );
};

type DeferredMentionInputProps = Omit<TextFieldProps, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
};

export const DeferredMentionInput = ({ value, onCommit, onBlur, ...props }: DeferredMentionInputProps) => {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setDraft(value);
  }, [value]);

  return (
    <MentionInput
      {...props}
      value={draft}
      onChange={(next) => {
        dirty.current = true;
        setDraft(next);
      }}
      onBlur={(event) => {
        dirty.current = false;
        if (draft !== value) onCommit(draft);
        onBlur?.(event);
      }}
    />
  );
};
