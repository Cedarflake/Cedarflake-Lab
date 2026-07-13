import type {
  ContractViolation,
  RepositoryContractResult,
} from "./types.ts"
import { validateWorkbenchContract } from "./workbenchContract.ts"
import { validateWorkflowContract } from "./workflowContract.ts"

export function sortViolations(
  violations: readonly ContractViolation[],
): ContractViolation[] {
  return [...violations].sort((left, right) => {
    const codeOrder = left.code.localeCompare(right.code)

    if (codeOrder !== 0) {
      return codeOrder
    }

    const pathOrder = left.path.localeCompare(right.path)

    if (pathOrder !== 0) {
      return pathOrder
    }

    return left.message.localeCompare(right.message)
  })
}

export async function validateRepositoryContract(
  repositoryRoot: string,
): Promise<RepositoryContractResult> {
  const [workbench, workflows] = await Promise.all([
    validateWorkbenchContract(repositoryRoot),
    validateWorkflowContract(repositoryRoot),
  ])

  return {
    summary: {
      ...workbench.summary,
      ...workflows.summary,
    },
    violations: sortViolations([
      ...workbench.violations,
      ...workflows.violations,
    ]),
  }
}
