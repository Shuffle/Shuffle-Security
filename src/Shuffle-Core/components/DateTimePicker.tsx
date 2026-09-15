import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Popover,
  Select,
  MenuItem,
  type SxProps,
  type Theme,
} from '@mui/material';
import dayjs, { Dayjs } from 'dayjs';

export type DateTimePickerMode = 'datetime' | 'date' | 'time';

export interface DateTimePreset {
  label: string;
  getValue: () => Dayjs;
}

export interface DateTimePickerProps {
  /** Mode: full datetime, date only, or time only. Defaults to 'datetime'. */
  mode?: DateTimePickerMode;
  /** Label for the text field input */
  label?: string;
  /** Placeholder for text input */
  placeholder?: string;
  /** Current value as Dayjs, Date, ISO string, timestamp number, or null */
  value: Dayjs | Date | string | number | null | undefined;
  /** Callback fired when value changes */
  onChange: (value: Dayjs | null, formattedStr?: string) => void;
  /** Custom display and parsing format */
  format?: string;
  /** Use 12-hour AM/PM format (defaults to false / 24h engineering time) */
  ampm?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is read-only */
  readOnly?: boolean;
  /** Whether input shows error state */
  error?: boolean;
  /** Helper text displayed below input */
  helperText?: React.ReactNode;
  /** Size variant: 'small' or 'medium' */
  size?: 'small' | 'medium';
  /** Full width text field */
  fullWidth?: boolean;
  /** Custom presets array, or boolean to toggle default presets (defaults to true) */
  presets?: boolean | DateTimePreset[];
  /** Minimum selectable date */
  minDate?: Dayjs | Date | string;
  /** Maximum selectable date */
  maxDate?: Dayjs | Date | string;
  /** Additional SX styles for the root input */
  sx?: SxProps<Theme>;
  /** Additional SX styles for the popover surface */
  popoverSx?: SxProps<Theme>;
  /** Passthrough props for MUI TextField slot */
  slotProps?: {
    textField?: Record<string, any>;
  };
  /** Custom trigger render function (e.g. for compact toolbar buttons, chips, badges) */
  renderTrigger?: (props: {
    value: Dayjs | null;
    formattedValue: string;
    open: boolean;
    onClick: (e: React.MouseEvent<HTMLElement>) => void;
    onClear: (e?: React.MouseEvent) => void;
  }) => React.ReactNode;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Standard relative presets tailored for SecOps, logs, and workflow debugging.
 */
const getDefaultPresets = (mode: DateTimePickerMode): DateTimePreset[] => {
  if (mode === 'date') {
    return [
      { label: 'Today', getValue: () => dayjs().startOf('day') },
      { label: 'Yesterday', getValue: () => dayjs().subtract(1, 'day').startOf('day') },
      { label: '-7d', getValue: () => dayjs().subtract(7, 'day').startOf('day') },
      { label: '-30d', getValue: () => dayjs().subtract(30, 'day').startOf('day') },
    ];
  }
  if (mode === 'time') {
    return [
      { label: 'Now', getValue: () => dayjs() },
      { label: 'Start of Day', getValue: () => dayjs().startOf('day') },
      { label: 'Noon', getValue: () => dayjs().hour(12).minute(0).second(0) },
      { label: 'End of Day', getValue: () => dayjs().hour(23).minute(59).second(59) },
    ];
  }
  // mode === 'datetime'
  return [
    { label: 'Now', getValue: () => dayjs() },
    { label: '-15m', getValue: () => dayjs().subtract(15, 'minute') },
    { label: '-1h', getValue: () => dayjs().subtract(1, 'hour') },
    { label: '-24h', getValue: () => dayjs().subtract(24, 'hour') },
    { label: '-7d', getValue: () => dayjs().subtract(7, 'day') },
    { label: 'Today', getValue: () => dayjs().startOf('day') },
  ];
};

/**
 * Coerce any accepted value prop into a valid Dayjs object or null.
 */
const toDayjs = (val: Dayjs | Date | string | number | null | undefined): Dayjs | null => {
  if (!val) return null;
  if (dayjs.isDayjs(val)) {
    return val.isValid() ? val : null;
  }
  const parsed = dayjs(val);
  return parsed.isValid() ? parsed : null;
};

/**
 * Lightweight, zero-dependency, highly extendible DateTimePicker for Shuffle-Core.
 * Completely replaces @mui/x-date-pickers and AdapterDayjs.
 */
export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  mode = 'datetime',
  label,
  placeholder,
  value,
  onChange,
  format: customFormat,
  ampm = false,
  disabled = false,
  readOnly = false,
  error = false,
  helperText,
  size = 'small',
  fullWidth = false,
  presets = true,
  minDate,
  maxDate,
  sx,
  popoverSx,
  slotProps,
  renderTrigger,
}) => {
  const defaultFormat = useMemo(() => {
    if (customFormat) return customFormat;
    if (mode === 'date') return 'YYYY-MM-DD';
    if (mode === 'time') return ampm ? 'hh:mm:ss A' : 'HH:mm:ss';
    return ampm ? 'YYYY-MM-DD hh:mm:ss A' : 'YYYY-MM-DD HH:mm:ss';
  }, [customFormat, mode, ampm]);

  const parsedValue = useMemo(() => toDayjs(value), [value]);

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  // Active viewing month and year for calendar navigation
  const [viewDate, setViewDate] = useState<Dayjs>(() => parsedValue || dayjs());

  // Text representation in input field
  const [textInput, setTextInput] = useState<string>(() =>
    parsedValue ? parsedValue.format(defaultFormat) : ''
  );

  // Synchronize internal text whenever parsedValue changes externally
  useEffect(() => {
    setTextInput(parsedValue ? parsedValue.format(defaultFormat) : '');
  }, [parsedValue, defaultFormat]);

  // When popover opens, sync view date to current value or today
  const handleOpenPopover = (event: React.MouseEvent<HTMLElement>) => {
    if (disabled || readOnly) return;
    setViewDate(parsedValue || dayjs());
    setAnchorEl(event.currentTarget);
  };

  const handleClosePopover = () => {
    setAnchorEl(null);
  };

  const minDayjs = useMemo(() => toDayjs(minDate), [minDate]);
  const maxDayjs = useMemo(() => toDayjs(maxDate), [maxDate]);

  const isDateDisabled = useCallback(
    (d: Dayjs) => {
      if (minDayjs && d.isBefore(minDayjs, 'day')) return true;
      if (maxDayjs && d.isAfter(maxDayjs, 'day')) return true;
      return false;
    },
    [minDayjs, maxDayjs]
  );

  // Manual typing handler
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTextInput(raw);

    if (!raw.trim()) {
      onChange(null, '');
      return;
    }

    const candidate = dayjs(raw);
    if (candidate.isValid()) {
      onChange(candidate, candidate.format(defaultFormat));
      setViewDate(candidate);
    }
  };

  const handleClear = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTextInput('');
    onChange(null, '');
  };

  const handleSelectDay = (dayNumber: number) => {
    const base = parsedValue || dayjs();
    const updated = viewDate
      .date(dayNumber)
      .hour(base.hour())
      .minute(base.minute())
      .second(base.second());

    onChange(updated, updated.format(defaultFormat));
    if (mode === 'date') {
      handleClosePopover();
    }
  };

  const handlePresetSelect = (preset: DateTimePreset) => {
    const val = preset.getValue();
    onChange(val, val.format(defaultFormat));
    setViewDate(val);
  };

  // Time components adjustment
  const handleTimePartChange = (part: 'hour' | 'minute' | 'second', newNum: number) => {
    const base = parsedValue || dayjs();
    const updated = base.set(part, newNum);
    onChange(updated, updated.format(defaultFormat));
  };

  // Calendar grid calculations
  const daysInCurrentMonth = viewDate.daysInMonth();
  const firstDayOfMonthWeekday = viewDate.startOf('month').day(); // 0 = Sunday
  const prevMonthDaysCount = viewDate.subtract(1, 'month').daysInMonth();

  const prevMonthCells = Array.from(
    { length: firstDayOfMonthWeekday },
    (_, i) => prevMonthDaysCount - firstDayOfMonthWeekday + 1 + i
  );

  const currentMonthCells = Array.from(
    { length: daysInCurrentMonth },
    (_, i) => i + 1
  );

  const totalCellsSoFar = prevMonthCells.length + currentMonthCells.length;
  const nextMonthCellsNeeded = totalCellsSoFar % 7 === 0 ? 0 : 7 - (totalCellsSoFar % 7);
  const nextMonthCells = Array.from(
    { length: nextMonthCellsNeeded },
    (_, i) => i + 1
  );

  // Active presets list
  const activePresets = useMemo(() => {
    if (presets === false) return [];
    if (Array.isArray(presets)) return presets;
    return getDefaultPresets(mode);
  }, [presets, mode]);

  // Year choices for quick selection
  const yearOptions = useMemo(() => {
    const curYear = dayjs().year();
    const list: number[] = [];
    for (let y = curYear - 10; y <= curYear + 10; y++) {
      list.push(y);
    }
    return list;
  }, []);

  const inputSize = slotProps?.textField?.size || size;
  const inputSx = slotProps?.textField?.sx || sx;

  return (
    <>
      {renderTrigger ? (
        renderTrigger({
          value: parsedValue,
          formattedValue: textInput,
          open,
          onClick: handleOpenPopover,
          onClear: handleClear,
        })
      ) : (
        <TextField
          label={label}
          placeholder={placeholder || defaultFormat}
          value={textInput}
          onChange={handleTextChange}
          onClick={handleOpenPopover}
          disabled={disabled}
          size={inputSize}
          fullWidth={fullWidth}
          error={error}
          helperText={helperText}
          InputProps={{
            readOnly,
            endAdornment: (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {textInput && !disabled && !readOnly && (
                  <Button
                    size="small"
                    onClick={handleClear}
                    sx={{
                      minWidth: 0,
                      px: 0.8,
                      py: 0.2,
                      fontSize: '0.7rem',
                      textTransform: 'none',
                      color: 'text.secondary',
                      '&:hover': { color: 'text.primary' },
                    }}
                  >
                    Clear
                  </Button>
                )}
                <Button
                  size="small"
                  onClick={handleOpenPopover}
                  disabled={disabled}
                  sx={{
                    minWidth: 0,
                    px: 0.8,
                    py: 0.2,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    bgcolor: open ? 'action.selected' : 'action.hover',
                    color: 'text.primary',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    '&:hover': { bgcolor: 'action.selected', borderColor: 'primary.main' },
                  }}
                >
                  {mode === 'time' ? 'Time' : 'Date'}
                </Button>
              </Box>
            ),
          }}
          InputLabelProps={{ shrink: true }}
          sx={{
            minWidth: 180,
            '& .MuiInputBase-root': { cursor: 'pointer' },
            ...inputSx,
          }}
          {...slotProps?.textField}
        />
      )}

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClosePopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ zIndex: 10025 }}
        PaperProps={{
          sx: {
            p: 1.5,
            width: mode === 'time' ? 240 : 310,
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '8px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
            ...popoverSx,
          },
        }}
      >
        {/* Presets Row */}
        {activePresets.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
              mb: 1.5,
              pb: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            {activePresets.map((p) => (
              <Button
                key={p.label}
                size="small"
                variant="outlined"
                onClick={() => handlePresetSelect(p)}
                sx={{
                  py: 0.2,
                  px: 0.8,
                  fontSize: '0.7rem',
                  textTransform: 'none',
                  borderRadius: 1,
                  borderColor: 'divider',
                  color: 'text.primary',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'action.hover',
                  },
                }}
              >
                {p.label}
              </Button>
            ))}
          </Box>
        )}

        {/* Calendar View (for datetime and date modes) */}
        {mode !== 'time' && (
          <Box>
            {/* Header: Month and Year selector + Prev/Next buttons */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1,
                gap: 1,
              }}
            >
              <Button
                size="small"
                onClick={() => setViewDate(viewDate.subtract(1, 'month'))}
                sx={{
                  minWidth: 28,
                  height: 28,
                  p: 0,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                &lt;
              </Button>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Select
                  size="small"
                  value={viewDate.month()}
                  onChange={(e) => setViewDate(viewDate.month(Number(e.target.value)))}
                  MenuProps={{ sx: { zIndex: 10035 } }}
                  sx={{
                    fontSize: '0.75rem',
                    height: 28,
                    '& .MuiSelect-select': { py: 0.4, px: 1 },
                  }}
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <MenuItem key={m} value={idx} sx={{ fontSize: '0.75rem' }}>
                      {m}
                    </MenuItem>
                  ))}
                </Select>

                <Select
                  size="small"
                  value={viewDate.year()}
                  onChange={(e) => setViewDate(viewDate.year(Number(e.target.value)))}
                  MenuProps={{ sx: { zIndex: 10035 } }}
                  sx={{
                    fontSize: '0.75rem',
                    height: 28,
                    '& .MuiSelect-select': { py: 0.4, px: 1 },
                  }}
                >
                  {yearOptions.map((y) => (
                    <MenuItem key={y} value={y} sx={{ fontSize: '0.75rem' }}>
                      {y}
                    </MenuItem>
                  ))}
                </Select>
              </Box>

              <Button
                size="small"
                onClick={() => setViewDate(viewDate.add(1, 'month'))}
                sx={{
                  minWidth: 28,
                  height: 28,
                  p: 0,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                &gt;
              </Button>
            </Box>

            {/* Weekday headers */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                textAlign: 'center',
                mb: 0.5,
              }}
            >
              {WEEK_DAYS.map((wd) => (
                <Typography
                  key={wd}
                  variant="caption"
                  sx={{
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    color: 'text.secondary',
                    py: 0.3,
                  }}
                >
                  {wd}
                </Typography>
              ))}
            </Box>

            {/* Day Cells Grid */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 0.3,
              }}
            >
              {/* Previous month trailing days */}
              {prevMonthCells.map((day) => (
                <Box
                  key={`prev-${day}`}
                  sx={{
                    textAlign: 'center',
                    py: 0.6,
                    fontSize: '0.72rem',
                    color: 'text.disabled',
                    borderRadius: 1,
                  }}
                >
                  {day}
                </Box>
              ))}

              {/* Current month days */}
              {currentMonthCells.map((day) => {
                const cellDate = viewDate.date(day);
                const isSelected =
                  parsedValue &&
                  parsedValue.year() === viewDate.year() &&
                  parsedValue.month() === viewDate.month() &&
                  parsedValue.date() === day;
                const isToday =
                  dayjs().year() === viewDate.year() &&
                  dayjs().month() === viewDate.month() &&
                  dayjs().date() === day;
                const disabledCell = isDateDisabled(cellDate);

                return (
                  <Box
                    key={`cur-${day}`}
                    onClick={() => !disabledCell && handleSelectDay(day)}
                    sx={{
                      textAlign: 'center',
                      py: 0.6,
                      fontSize: '0.72rem',
                      fontWeight: isSelected || isToday ? 700 : 400,
                      cursor: disabledCell ? 'not-allowed' : 'pointer',
                      borderRadius: 1,
                      border: isToday && !isSelected ? '1px solid' : 'none',
                      borderColor: 'primary.main',
                      bgcolor: isSelected
                        ? 'primary.main'
                        : 'transparent',
                      color: isSelected
                        ? 'primary.contrastText'
                        : disabledCell
                        ? 'text.disabled'
                        : 'text.primary',
                      '&:hover': {
                        bgcolor: isSelected
                          ? 'primary.dark'
                          : disabledCell
                          ? 'transparent'
                          : 'action.hover',
                      },
                    }}
                  >
                    {day}
                  </Box>
                );
              })}

              {/* Next month leading days */}
              {nextMonthCells.map((day) => (
                <Box
                  key={`next-${day}`}
                  sx={{
                    textAlign: 'center',
                    py: 0.6,
                    fontSize: '0.72rem',
                    color: 'text.disabled',
                    borderRadius: 1,
                  }}
                >
                  {day}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Time Selector (for datetime and time modes) */}
        {mode !== 'date' && (
          <Box
            sx={{
              mt: mode === 'datetime' ? 1.5 : 0,
              pt: mode === 'datetime' ? 1 : 0,
              borderTop: mode === 'datetime' ? '1px solid' : 'none',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.8 }}>
              <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary' }}>
                Time (24h)
              </Typography>
              <Button
                size="small"
                onClick={() => {
                  const now = dayjs();
                  handleTimePartChange('hour', now.hour());
                  handleTimePartChange('minute', now.minute());
                  handleTimePartChange('second', now.second());
                }}
                sx={{
                  py: 0.1,
                  px: 0.6,
                  fontSize: '0.68rem',
                  textTransform: 'none',
                }}
              >
                Set to Now
              </Button>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TextField
                size="small"
                type="number"
                label="HH"
                value={parsedValue ? String(parsedValue.hour()).padStart(2, '0') : '00'}
                onChange={(e) => {
                  let v = parseInt(e.target.value, 10);
                  if (isNaN(v)) v = 0;
                  if (v < 0) v = 0;
                  if (v > 23) v = 23;
                  handleTimePartChange('hour', v);
                }}
                inputProps={{ min: 0, max: 23 }}
                InputLabelProps={{ shrink: true }}
                sx={{
                  width: 62,
                  '& input': {
                    textAlign: 'center',
                    py: 0.6,
                    fontSize: '0.75rem',
                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                  },
                }}
              />
              <Typography variant="caption" sx={{ fontWeight: 700 }}>:</Typography>
              <TextField
                size="small"
                type="number"
                label="MM"
                value={parsedValue ? String(parsedValue.minute()).padStart(2, '0') : '00'}
                onChange={(e) => {
                  let v = parseInt(e.target.value, 10);
                  if (isNaN(v)) v = 0;
                  if (v < 0) v = 0;
                  if (v > 59) v = 59;
                  handleTimePartChange('minute', v);
                }}
                inputProps={{ min: 0, max: 59 }}
                InputLabelProps={{ shrink: true }}
                sx={{
                  width: 62,
                  '& input': {
                    textAlign: 'center',
                    py: 0.6,
                    fontSize: '0.75rem',
                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                  },
                }}
              />
              <Typography variant="caption" sx={{ fontWeight: 700 }}>:</Typography>
              <TextField
                size="small"
                type="number"
                label="SS"
                value={parsedValue ? String(parsedValue.second()).padStart(2, '0') : '00'}
                onChange={(e) => {
                  let v = parseInt(e.target.value, 10);
                  if (isNaN(v)) v = 0;
                  if (v < 0) v = 0;
                  if (v > 59) v = 59;
                  handleTimePartChange('second', v);
                }}
                inputProps={{ min: 0, max: 59 }}
                InputLabelProps={{ shrink: true }}
                sx={{
                  width: 62,
                  '& input': {
                    textAlign: 'center',
                    py: 0.6,
                    fontSize: '0.75rem',
                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                  },
                }}
              />
            </Box>
          </Box>
        )}

        {/* Footer Actions */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mt: 1.5,
            pt: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Button
            size="small"
            onClick={handleClear}
            sx={{
              py: 0.2,
              px: 1,
              fontSize: '0.72rem',
              textTransform: 'none',
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' },
            }}
          >
            Clear
          </Button>

          <Button
            size="small"
            variant="contained"
            onClick={handleClosePopover}
            sx={{
              py: 0.3,
              px: 1.5,
              fontSize: '0.72rem',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: 1,
              bgcolor: 'primary.main',
              color: '#FFFFFF',
              boxShadow: (theme) => `0 2px 8px ${theme.palette.primary.main}40`,
              '&:hover': {
                bgcolor: 'primary.main',
                opacity: 0.9,
              },
            }}
          >
            Done
          </Button>
        </Box>
      </Popover>
    </>
  );
};

/** Specialized Date-only picker */
export const DatePicker: React.FC<Omit<DateTimePickerProps, 'mode'>> = (props) => (
  <DateTimePicker mode="date" {...props} />
);

/** Specialized Time-only picker */
export const TimePicker: React.FC<Omit<DateTimePickerProps, 'mode'>> = (props) => (
  <DateTimePicker mode="time" {...props} />
);

export interface DateRangePickerProps {
  startDate: Dayjs | Date | string | number | null | undefined;
  endDate: Dayjs | Date | string | number | null | undefined;
  onRangeChange: (start: Dayjs | null, end: Dayjs | null) => void;
  startLabel?: string;
  endLabel?: string;
  mode?: DateTimePickerMode;
  size?: 'small' | 'medium';
  disabled?: boolean;
  ampm?: boolean;
  sx?: SxProps<Theme>;
}

/** Paired Start/End date and time picker */
export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onRangeChange,
  startLabel = 'From',
  endLabel = 'To',
  mode = 'datetime',
  size = 'small',
  disabled = false,
  ampm = false,
  sx,
}) => {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ...sx }}>
      <DateTimePicker
        mode={mode}
        label={startLabel}
        value={startDate}
        onChange={(val) => onRangeChange(val, toDayjs(endDate))}
        maxDate={toDayjs(endDate) || undefined}
        size={size}
        disabled={disabled}
        ampm={ampm}
      />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
        to
      </Typography>
      <DateTimePicker
        mode={mode}
        label={endLabel}
        value={endDate}
        onChange={(val) => onRangeChange(toDayjs(startDate), val)}
        minDate={toDayjs(startDate) || undefined}
        size={size}
        disabled={disabled}
        ampm={ampm}
      />
    </Box>
  );
};

/**
 * Drop-in backward-compatibility shims for legacy @mui/x-date-pickers usages
 * in consuming packages (e.g. Shaffuru).
 */
export const LocalizationProvider: React.FC<{
  children?: React.ReactNode;
  dateAdapter?: any;
  [key: string]: any;
}> = ({ children }) => <>{children}</>;

export class AdapterDayjs {
  constructor(..._args: any[]) {}
}

export default DateTimePicker;

