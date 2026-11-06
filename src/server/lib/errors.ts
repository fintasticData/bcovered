export type ToolErrorCode =
  | 'validation'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'approval_required'
  | 'approval_stale'
  | 'cancelled'
  | 'internal'

const HTTP_STATUS: Record<ToolErrorCode, number> = {
  validation: 422,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  approval_required: 409,
  approval_stale: 409,
  cancelled: 409,
  internal: 500,
}

export class ToolError extends Error {
  readonly status: number

  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ToolError'
    this.status = HTTP_STATUS[code]
  }
}

export class JobCancelledError extends ToolError {
  constructor() {
    super('cancelled', 'Job was cancelled; no further actions were taken.')
    this.name = 'JobCancelledError'
  }
}
