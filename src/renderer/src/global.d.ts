import type { TicketsEditorBridge } from '../../shared/contracts'

declare global {
  interface Window {
    ticketsEditor: TicketsEditorBridge
  }
}
export {}
