export type SourceFormat = 'json' | 'jsonl'

export type JsonPath = Array<string | number>

export interface TicketLocation {
  number: number
  ticketId: string
  path: JsonPath
  pointer: string
}

export interface TicketValidation {
  valid: boolean
  errors: string[]
}

export interface WorkspaceSummary {
  projectCount: number
  ticketCount: number
}

export interface TicketsEditorBridge {
  getVersion(): Promise<string>
  getSummary(): Promise<WorkspaceSummary>
}
