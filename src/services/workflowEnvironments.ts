import { getApiUrl, getAuthHeader } from "@/Shuffle-MCPs/api";
import { WorkflowSummary } from "@/hooks/useWorkflows";

export interface UpdateWorkflowEnvResult {
  success: boolean;
  reason?: string;
}

/**
 * Updates a workflow's runtime location across the workflow root, actions, and triggers.
 * Fetches the full workflow definition first to ensure coordinates, branches, and configs are preserved.
 */
export const updateWorkflowEnvironment = async (
  workflowId: string,
  newEnvName: string,
  fallbackWorkflow?: WorkflowSummary | Record<string, unknown>,
): Promise<UpdateWorkflowEnvResult> => {
  try {
    // 1. Fetch full workflow to ensure all branches, nodes, triggers are preserved
    let fullWorkflow: Record<string, unknown> = (fallbackWorkflow as Record<
      string,
      unknown
    >) || { id: workflowId };

    try {
      const getRes = await fetch(
        getApiUrl(`/api/v1/workflows/${workflowId}`),
        {
          credentials: "include",
          headers: { ...getAuthHeader() },
        },
      );
      if (getRes.ok) {
        const fetched = (await getRes.json()) as Record<string, unknown>;
        if (fetched?.id === workflowId) {
          fullWorkflow = fetched;
        }
      }
    } catch {
      // Fall back to provided object
    }

    // 2. Update environment at workflow level, actions level, and triggers level
    const updatedWorkflow: Record<string, unknown> = {
      ...fullWorkflow,
      environment: newEnvName,
      actions: Array.isArray(fullWorkflow.actions)
        ? fullWorkflow.actions.map((act: Record<string, unknown>) => ({
            ...act,
            environment: newEnvName,
          }))
        : fullWorkflow.actions,
      triggers: Array.isArray(fullWorkflow.triggers)
        ? fullWorkflow.triggers.map((trig: Record<string, unknown>) => ({
            ...trig,
            environment:
              newEnvName.toLowerCase() === "cloud" &&
              (trig.environment === "cloud" ||
                trig.trigger_type === "SCHEDULE")
                ? "cloud"
                : newEnvName,
          }))
        : fullWorkflow.triggers,
    };

    // 3. Persist update
    const putRes = await fetch(
      getApiUrl(`/api/v1/workflows/${workflowId}`),
      {
        method: "PUT",
        credentials: "include",
        headers: {
          ...getAuthHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(updatedWorkflow),
      },
    );

    const rawText = await putRes.text().catch(() => "");
    let resJson: {
      success?: boolean;
      reason?: string;
      error?: string;
      message?: string;
    } | null = null;
    try {
      if (rawText) resJson = JSON.parse(rawText);
    } catch {
      // Not JSON
    }

    if (!putRes.ok) {
      const reason =
        (resJson && typeof resJson.reason === "string" && resJson.reason) ||
        (resJson && typeof resJson.error === "string" && resJson.error) ||
        (resJson && typeof resJson.message === "string" && resJson.message) ||
        rawText.trim() ||
        `HTTP ${putRes.status}`;
      return { success: false, reason };
    }

    if (
      resJson &&
      (resJson.success === false || typeof resJson.reason === "string")
    ) {
      const reason =
        (typeof resJson.reason === "string" && resJson.reason) ||
        (typeof resJson.error === "string" && resJson.error) ||
        "Failed to update workflow environment";
      return { success: false, reason };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      reason: err instanceof Error ? err.message : "Network error",
    };
  }
};
