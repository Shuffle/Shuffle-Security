import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
  Typography,
} from "@mui/material";
import { Cloud, Server, MonitorSmartphone } from "lucide-react";
import { getApiUrl, getAuthHeader } from "@/Shuffle-MCPs/api";
import { toast } from "@/lib/toast";
import { useWorkflows, WorkflowSummary } from "@/hooks/useWorkflows";
import { updateWorkflowEnvironment } from "@/services/workflowEnvironments";

export interface DefaultEnvironmentSelectorProps {
  onSelected?: (newEnv: EnvironmentItem) => void;
  workflows?: WorkflowSummary[];
}

export interface WorkflowLocationMatch {
  workflow: WorkflowSummary;
  isExplicit: boolean;
}

export const getWorkflowsUsingLocation = (
  allWorkflows: WorkflowSummary[],
  envName: string,
  isCurrentDefault: boolean,
): WorkflowLocationMatch[] => {
  const norm = envName.toLowerCase();
  const matches: WorkflowLocationMatch[] = [];

  for (const wf of allWorkflows) {
    const actionEnv = wf.actions?.find((a) => a?.environment)?.environment;
    const triggerEnv = wf.triggers?.find((t) => t?.environment)?.environment;
    const explicitEnv = wf.environment || actionEnv || triggerEnv;
    const isExplicit = Boolean(
      explicitEnv && explicitEnv.toLowerCase() === norm,
    );

    if (isExplicit) {
      matches.push({ workflow: wf, isExplicit: true });
    } else if (isCurrentDefault && !explicitEnv) {
      matches.push({ workflow: wf, isExplicit: false });
    }
  }

  return matches;
};

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

export const DefaultEnvironmentSelector = ({
  onSelected,
  workflows: workflowsProp,
}: DefaultEnvironmentSelectorProps = {}) => {
  const queryClient = useQueryClient();
  const { data: fetchedWorkflows = [], refetch: refetchWorkflows } =
    useWorkflows();
  const workflowList = workflowsProp || fetchedWorkflows;

  const [environments, setEnvironments] = useState<EnvironmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Confirmation modal state for updating affected workflows
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSelection, setPendingSelection] =
    useState<EnvironmentItem | null>(null);
  const [matchingWorkflows, setMatchingWorkflows] = useState<
    WorkflowLocationMatch[]
  >([]);
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<Set<string>>(
    new Set(),
  );
  const [updatingWorkflows, setUpdatingWorkflows] = useState(false);
  const [workflowProgress, setWorkflowProgress] = useState({
    current: 0,
    total: 0,
  });

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

  const executeDefaultChange = async (
    next: EnvironmentItem,
    changeWorkflows: boolean,
    workflowsToUpdate: WorkflowLocationMatch[],
  ) => {
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

      const rawText = await res.text().catch(() => "");
      let resData: Record<string, unknown> | unknown[] | null = null;
      try {
        if (rawText) resData = JSON.parse(rawText);
      } catch {
        // Not JSON
      }

      if (!res.ok) {
        const reason =
          (resData &&
            typeof resData === "object" &&
            !Array.isArray(resData) &&
            typeof resData.reason === "string" &&
            resData.reason) ||
          (resData &&
            typeof resData === "object" &&
            !Array.isArray(resData) &&
            typeof resData.error === "string" &&
            resData.error) ||
          (resData &&
            typeof resData === "object" &&
            !Array.isArray(resData) &&
            typeof resData.message === "string" &&
            resData.message) ||
          rawText.trim() ||
          `Failed to update default runtime location (HTTP ${res.status})`;
        throw new Error(reason);
      }

      if (resData && typeof resData === "object" && !Array.isArray(resData)) {
        if (resData.success === false || typeof resData.reason === "string") {
          throw new Error(
            (typeof resData.reason === "string" && resData.reason) ||
              (typeof resData.error === "string" && resData.error) ||
              "Failed to update default runtime location",
          );
        }
      }

      setEnvironments(payload);

      let updatedCount = 0;
      const failedWorkflows: string[] = [];

      if (changeWorkflows && workflowsToUpdate.length > 0) {
        setUpdatingWorkflows(true);
        setWorkflowProgress({ current: 0, total: workflowsToUpdate.length });
        for (let i = 0; i < workflowsToUpdate.length; i++) {
          const item = workflowsToUpdate[i];
          setWorkflowProgress({
            current: i + 1,
            total: workflowsToUpdate.length,
          });
          const updateRes = await updateWorkflowEnvironment(
            item.workflow.id,
            next.Name,
            item.workflow,
          );
          if (updateRes.success) {
            updatedCount++;
          } else {
            failedWorkflows.push(
              `${item.workflow.name || item.workflow.id} (${updateRes.reason || "Failed"})`,
            );
          }
        }
      }

      if (changeWorkflows && workflowsToUpdate.length > 0) {
        if (failedWorkflows.length === 0) {
          toast.success(
            `Default runtime location and ${updatedCount} workflow(s) updated to ${next.Name}`,
          );
        } else {
          toast.warning(
            `Default updated to ${next.Name}. Updated ${updatedCount} workflow(s), but ${failedWorkflows.length} failed.`,
          );
        }
      } else {
        toast.success(`Default runtime location set to ${next.Name}`);
      }

      queryClient.invalidateQueries({
        queryKey: ["incident-runtime-health-environments"],
      });
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      refetchWorkflows();
      onSelected?.(next);
      setConfirmOpen(false);
      setPendingSelection(null);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to update default runtime location",
      );
      fetchEnvironments();
    } finally {
      setSaving(false);
      setUpdatingWorkflows(false);
    }
  };

  const handleSelect = async (next: EnvironmentItem | null) => {
    if (!next || next.id === selected?.id) return;

    if (selected) {
      const matches = getWorkflowsUsingLocation(
        workflowList,
        selected.Name,
        Boolean(selected.default),
      );
      if (matches.length > 0) {
        setPendingSelection(next);
        setMatchingWorkflows(matches);
        setSelectedWorkflowIds(new Set(matches.map((m) => m.workflow.id)));
        setConfirmOpen(true);
        return;
      }
    }

    await executeDefaultChange(next, false, []);
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

      <Dialog
        open={confirmOpen}
        onClose={
          saving || updatingWorkflows
            ? undefined
            : () => {
                setConfirmOpen(false);
                setPendingSelection(null);
              }
        }
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            border: "1px solid hsl(var(--border))",
            bgcolor: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))",
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, fontSize: "1.05rem", fontWeight: 600 }}>
          Change Default Runtime Location
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography
            variant="body2"
            sx={{ color: "hsl(var(--muted-foreground))", mb: 2 }}
          >
            You are changing the tenant default runtime location from{" "}
            <strong style={{ color: "hsl(var(--foreground))" }}>
              {selected?.Name}
            </strong>{" "}
            to{" "}
            <strong style={{ color: "hsl(var(--foreground))" }}>
              {pendingSelection?.Name}
            </strong>
            .
          </Typography>

          <Box
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: 1.5,
              bgcolor: "hsl(var(--muted) / 0.4)",
              border: "1px solid hsl(var(--border))",
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontWeight: 500, color: "hsl(var(--foreground))" }}
            >
              {matchingWorkflows.length} existing workflow
              {matchingWorkflows.length === 1 ? "" : "s"} currently use{" "}
              {selected?.Name}.
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "hsl(var(--muted-foreground))",
                display: "block",
                mt: 0.5,
              }}
            >
              Choose whether to update existing workflows using this location to{" "}
              {pendingSelection?.Name}, or keep them as-is.
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
              px: 0.5,
            }}
          >
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={
                    selectedWorkflowIds.size === matchingWorkflows.length &&
                    matchingWorkflows.length > 0
                  }
                  indeterminate={
                    selectedWorkflowIds.size > 0 &&
                    selectedWorkflowIds.size < matchingWorkflows.length
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedWorkflowIds(
                        new Set(matchingWorkflows.map((m) => m.workflow.id)),
                      );
                    } else {
                      setSelectedWorkflowIds(new Set());
                    }
                  }}
                  disabled={saving || updatingWorkflows}
                />
              }
              label={
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  Select all ({matchingWorkflows.length})
                </Typography>
              }
            />
            <Typography
              variant="caption"
              sx={{ color: "hsl(var(--muted-foreground))" }}
            >
              {selectedWorkflowIds.size} selected
            </Typography>
          </Box>

          <Box
            sx={{
              maxHeight: 220,
              overflowY: "auto",
              border: "1px solid hsl(var(--border))",
              borderRadius: 1.5,
              p: 0.5,
              bgcolor: "hsl(var(--background))",
            }}
          >
            {matchingWorkflows.map((m) => {
              const isChecked = selectedWorkflowIds.has(m.workflow.id);
              return (
                <Box
                  key={m.workflow.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    py: 0.75,
                    px: 1,
                    borderRadius: 1,
                    "&:hover": { bgcolor: "hsl(var(--muted) / 0.5)" },
                  }}
                >
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={isChecked}
                        onChange={() => {
                          const nextSet = new Set(selectedWorkflowIds);
                          if (isChecked) {
                            nextSet.delete(m.workflow.id);
                          } else {
                            nextSet.add(m.workflow.id);
                          }
                          setSelectedWorkflowIds(nextSet);
                        }}
                        disabled={saving || updatingWorkflows}
                      />
                    }
                    label={
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, fontSize: "0.8125rem" }}
                        >
                          {m.workflow.name || "Untitled Workflow"}
                        </Typography>
                        {m.workflow.description && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: "hsl(var(--muted-foreground))",
                              display: "-webkit-box",
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              fontSize: "0.6875rem",
                            }}
                          >
                            {m.workflow.description}
                          </Typography>
                        )}
                      </Box>
                    }
                    sx={{ flexGrow: 1, mr: 1 }}
                  />
                  <Chip
                    label={m.isExplicit ? "Explicit" : "Inherited"}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: "0.625rem",
                      fontWeight: 600,
                      bgcolor: m.isExplicit
                        ? "hsla(var(--primary) / 0.1)"
                        : "hsl(var(--muted))",
                      color: m.isExplicit
                        ? "hsl(var(--primary))"
                        : "hsl(var(--muted-foreground))",
                      "& .MuiChip-label": { px: 0.75 },
                    }}
                  />
                </Box>
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, gap: 1 }}>
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => {
              setConfirmOpen(false);
              setPendingSelection(null);
            }}
            disabled={saving || updatingWorkflows}
            size="small"
          >
            Cancel
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              if (pendingSelection) {
                executeDefaultChange(pendingSelection, false, []);
              }
            }}
            disabled={saving || updatingWorkflows}
            size="small"
          >
            No, Change Default Only
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              if (pendingSelection) {
                const toUpdate = matchingWorkflows.filter((m) =>
                  selectedWorkflowIds.has(m.workflow.id),
                );
                executeDefaultChange(pendingSelection, true, toUpdate);
              }
            }}
            disabled={
              saving || updatingWorkflows || selectedWorkflowIds.size === 0
            }
            size="small"
          >
            {updatingWorkflows
              ? `Updating (${workflowProgress.current}/${workflowProgress.total})...`
              : "Yes, Change Workflows & Default"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DefaultEnvironmentSelector;
