import { useCallback, useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Chip,
  TextField,
  Typography,
  CircularProgress,
} from "@mui/material";
import { Cloud, Server, MonitorSmartphone } from "lucide-react";
import { getApiUrl, getAuthHeader } from "@/Shuffle-MCPs/api";
import { toast } from "@/lib/toast";

export interface EnvironmentItem {
  Name: string;
  Type: string;
  id: string;
  default?: boolean;
  archived?: boolean;
  sensor_group?: boolean;
  checkin?: number;
  queue?: number;
  [key: string]: unknown;
}

/** Cloud is always considered running; others check in every few minutes. */
export const isRunning = (env: EnvironmentItem): boolean => {
  if (env.Type === "cloud") return true;
  const now = Math.floor(Date.now() / 1000);
  return (env.checkin ?? 0) > 0 && now - (env.checkin ?? 0) < 300;
};

export const TypeIcon = ({ env }: { env: EnvironmentItem }) => {
  const color = "hsl(var(--muted-foreground))";
  if (env.sensor_group)
    return <MonitorSmartphone size={14} style={{ color, flexShrink: 0 }} />;
  if (env.Type === "cloud")
    return <Cloud size={14} style={{ color, flexShrink: 0 }} />;
  return <Server size={14} style={{ color, flexShrink: 0 }} />;
};

export const RunningChip = ({ running }: { running: boolean }) => (
  <Chip
    label={running ? "Running" : "Stopped"}
    size="small"
    sx={{
      height: 18,
      fontSize: "0.6rem",
      fontWeight: 600,
      flexShrink: 0,
      bgcolor: running ? "rgba(34, 197, 94, 0.15)" : "hsl(var(--muted))",
      color: running ? "#22c55e" : "hsl(var(--muted-foreground))",
      "& .MuiChip-label": { px: 0.75 },
    }}
  />
);

export const DefaultEnvironmentSelector = () => {
  const [environments, setEnvironments] = useState<EnvironmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchEnvironments = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/v1/getenvironments"), {
        credentials: "include",
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error("Failed to load runtime locations");
      const data = await res.json();
      setEnvironments(Array.isArray(data) ? data : []);
    } catch {
      setEnvironments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  const selected = environments.find((e) => e.default);

  // The API replaces the whole list, so we send every environment back with
  // only the `default` flag swapped over to the new selection.
  const handleSelect = async (next: EnvironmentItem | null) => {
    if (!next || next.id === selected?.id) return;
    const payload = environments.map((env) => ({
      ...env,
      default: env.id === next.id,
    }));
    setSaving(true);
    try {
      const res = await fetch(getApiUrl("/api/v1/setenvironments"), {
        method: "PUT",
        credentials: "include",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update default runtime location");
      setEnvironments(payload);
      toast.success(`Default runtime location set to ${next.Name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
      fetchEnvironments();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ minWidth: { xs: "100%", sm: 280 }, maxWidth: { sm: 340 } }}>
      <Autocomplete
        key={selected?.id ?? "none"}
        value={selected}
        loading={loading}
        disabled={loading || saving}
        onChange={(_, newValue) => handleSelect(newValue)}
        options={environments}
        getOptionLabel={(option) => option?.Name || ""}
        getOptionDisabled={(option) =>
          option.archived === true || option.sensor_group === true
        }
        isOptionEqualToValue={(option, value) => option?.id === value?.id}
        size="small"
        disableClearable
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Select runtime location"
            slotProps={{
              input: {
                ...params.InputProps,
                startAdornment: selected ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      ml: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    <TypeIcon env={selected} />
                    <RunningChip running={isRunning(selected)} />
                  </Box>
                ) : null,
                endAdornment: (
                  <>
                    {saving ? (
                      <CircularProgress
                        size={14}
                        sx={{ color: "hsl(var(--primary))" }}
                      />
                    ) : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              },
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                backgroundColor: "hsl(var(--card))",
                borderRadius: 1.5,
                fontSize: "0.8125rem",
                py: 0.25,
                "& fieldset": { borderColor: "hsl(var(--border))" },
                "&:hover fieldset": { borderColor: "hsl(var(--primary))" },
                "&.Mui-focused fieldset": {
                  borderColor: "hsl(var(--primary))",
                },
              },
              "& .MuiInputBase-input": {
                color: "hsl(var(--foreground))",
                fontWeight: 500,
                fontSize: "0.8125rem",
              },
            }}
          />
        )}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 1.5,
              mt: 0.5,
              minWidth: 300,
              maxHeight: 280,
              overflow: "auto",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              "& .MuiAutocomplete-listbox": { padding: 0, maxHeight: "none" },
            },
          },
        }}
        renderOption={(props, option) => {
          const { key, ...restProps } = props;
          const isCurrent = option.id === selected?.id;
          return (
            <Box
              component="li"
              key={option.id}
              {...restProps}
              sx={{
                fontSize: "0.8125rem",
                color: isCurrent
                  ? "hsl(var(--primary))"
                  : "hsl(var(--foreground))",
                backgroundColor: isCurrent
                  ? "rgba(255, 102, 0, 0.1)"
                  : "hsl(var(--card))",
                py: 0.75,
                borderLeft: isCurrent
                  ? "2px solid hsl(var(--primary))"
                  : "2px solid transparent",
                "&:hover": {
                  backgroundColor: isCurrent
                    ? "rgba(255, 102, 0, 0.15) !important"
                    : "hsl(var(--muted)) !important",
                },
                "&.Mui-focused": {
                  backgroundColor: isCurrent
                    ? "rgba(255, 102, 0, 0.15) !important"
                    : "hsl(var(--muted)) !important",
                },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  width: "100%",
                }}
              >
                <RunningChip running={isRunning(option)} />
                <TypeIcon env={option} />
                <Typography
                  noWrap
                  sx={{ fontSize: "0.8125rem", color: "inherit", flex: 1 }}
                >
                  {option.Name}
                </Typography>
                {(option.archived || option.sensor_group) && (
                  <Typography
                    sx={{
                      fontSize: "0.7rem",
                      color: "hsl(var(--muted-foreground))",
                    }}
                  >
                    {option.archived ? "Archived" : "Sensor group"}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        }}
      />
    </Box>
  );
};

export default DefaultEnvironmentSelector;
