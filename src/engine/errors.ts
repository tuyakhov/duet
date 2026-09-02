/** Error codes surfaced to WebMCP tools and the UI. */
export type DuetErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_STEP'
  | 'INVALID_PITCH'
  | 'INVALID_DURATION'
  | 'INVALID_VELOCITY'
  | 'UNKNOWN_INSTRUMENT'
  | 'DUPLICATE_INSTRUMENT'
  | 'INSTRUMENT_NOT_PRESENT'
  | 'INSTRUMENT_PROTECTED'
  | 'UNSUPPORTED_VALUE'
  | 'WRONG_MODE'
  | 'CONTRACT_VIOLATION'
  | 'AUDIO_PERMISSION_REQUIRED'
  | 'SHARE_DATA_INVALID'
  | 'PUBLISH_CANCELLED'
  | 'PUBLISH_PENDING'

export class DuetError extends Error {
  code: DuetErrorCode

  constructor(code: DuetErrorCode, message: string) {
    super(message)
    this.name = 'DuetError'
    this.code = code
  }
}

export function invalid(code: DuetErrorCode, message: string): never {
  throw new DuetError(code, message)
}
