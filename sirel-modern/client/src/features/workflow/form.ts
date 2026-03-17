import { workflowMoveInputSchema } from "@sirel/shared/schemas/workflow";

export function validateWorkflowMoveForm(input: unknown) {
  return workflowMoveInputSchema.safeParse(input);
}
