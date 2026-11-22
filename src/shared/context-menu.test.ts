import { describe, expect, it } from 'vitest'
import {
  contextTicketSelection, jsonContextItems, listContextItems, nativeTextContextItems,
  parseContextMenuRequest, pinContextItems, projectContextItems,
  selectionContextItems, ticketContextItems
} from './context-menu'

describe('right-click selection contracts', () => {
  it('keeps a multi-selection when right-clicking any selected ticket', () => {
    expect(contextTicketSelection('b', ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('targets only a previously unselected ticket without opening it', () => {
    const selected = ['a', 'b']
    expect(contextTicketSelection('c', selected)).toEqual(['c'])
    expect(selected).toEqual(['a', 'b'])
  })

  it('offers multi-ticket operations and disables destructive ones while busy', () => {
    const menu = ticketContextItems(3, true)
    expect(menu).toContainEqual({
      kind: 'action', action: 'ticket.copy', label: 'Copy 3 tickets as JSON', enabled: false
    })
    expect(menu).toContainEqual({
      kind: 'action', action: 'ticket.delete', label: 'Delete 3 tickets…', enabled: false
    })
    expect(ticketContextItems(1, false)).toContainEqual({
      kind: 'action', action: 'ticket.copy', label: 'Copy ticket JSON', enabled: true
    })
  })

  it('uses the clicked project, with switch disabled only on the active tab', () => {
    expect(projectContextItems(true, false).find(x =>
      x.kind === 'action' && x.action === 'project.switch'
    )).toMatchObject({ enabled: false })
    expect(projectContextItems(false, false).find(x =>
      x.kind === 'action' && x.action === 'project.switch'
    )).toMatchObject({ enabled: true })
  })

  it('offers pin repositioning only within boundaries', () => {
    expect(pinContextItems('Save ticket', false, 0, 3)).toContainEqual({
      kind: 'action', action: 'pin.run', label: 'Run Save ticket', enabled: false
    })
    expect(pinContextItems('Save ticket', false, 0, 3).find(x =>
      x.kind === 'action' && x.action === 'pin.moveLeft'
    )).toMatchObject({ enabled: false })
    expect(pinContextItems('Save ticket', true, 2, 3).find(x =>
      x.kind === 'action' && x.action === 'pin.moveRight'
    )).toMatchObject({ enabled: false })
  })

  it('offers context-appropriate JSON and native editing commands', () => {
    expect(jsonContextItems(false, true, false, false).find(x =>
      x.kind === 'action' && x.action === 'json.cut'
    )).toMatchObject({ enabled: false })
    expect(jsonContextItems(false, true, false, false).find(x =>
      x.kind === 'action' && x.action === 'json.redo'
    )).toMatchObject({ enabled: true })
    expect(nativeTextContextItems().filter(x => x.kind === 'role')).toHaveLength(6)
    expect(selectionContextItems()).toEqual([{ kind: 'role', role: 'copy' }])
    expect(listContextItems(false, false, 0).find(x =>
      x.kind === 'action' && x.action === 'list.new'
    )).toMatchObject({ enabled: false })
  })
})

describe('native context-menu IPC validation', () => {
  it('accepts allowlisted action and native editing role without changing types', () => {
    const input = { items: [
      { kind: 'action', action: 'ticket.open', label: 'Open ticket', enabled: true },
      { kind: 'separator' }, { kind: 'role', role: 'copy' }
    ], x: 12.4, y: 31.8 }
    expect(parseContextMenuRequest(input)).toEqual({
      items: input.items, x: 12, y: 32
    })
  })

  it('rejects commands, injected labels, wrong flags and malformed requests', () => {
    const invalid = [
      { items: [] },
      { items: [{ kind: 'action', action: 'shell.execute', label: 'Launch' }] },
      { items: [{ kind: 'role', role: 'openDevTools' }] },
      { items: [{ kind: 'action', action: 'ticket.open', label: 'Open\\nInjected' }] },
      { items: [{ kind: 'action', action: 'ticket.open', label: 'Open', enabled: 'true' }] },
      { items: [{ kind: 'separator' }], x: 3, y: Infinity },
      { items: Array.from({ length: 33 }, () => ({ kind: 'separator' })) },
      null
    ]
    for (const input of invalid) expect(() => parseContextMenuRequest(input)).toThrow()
  })
})
