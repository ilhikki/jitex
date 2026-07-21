import * as fs from 'fs'
import * as path from 'path'
import { parse, ProgramNode, BlockNode } from '@/index'
import {
  readResource,
  TANGLE_PAS,
} from './_helper'

describe.skip('Tangle Official Verification - SKIPPED until Phase 7', () => {
  const source = readResource(TANGLE_PAS)
  const result = parse(source)

  test('parse succeeds', () => {
    expect(result.success).toBe(true)
  })

  test('has program structure', () => {
    expect(result.success).toBe(true)
    if (!result.success) return

    const program = result.astNode as ProgramNode
    expect(program.kind).toBe('Program')
    expect(program.name.name).toBe('TANGLE')
    expect(program.parameters).toHaveLength(4)
    expect(program.parameters[0].name).toBe('WEBFILE')
    expect(program.parameters[1].name).toBe('CHANGEFILE')
    expect(program.parameters[2].name).toBe('PASCALFILE')
    expect(program.parameters[3].name).toBe('POOL')
  })

  test('has block with declarations', () => {
    expect(result.success).toBe(true)
    if (!result.success) return

    const program = result.astNode as ProgramNode
    const block = program.block as BlockNode

    expect(block.labelDeclarations).not.toBeNull()
    expect(block.labelDeclarations!.labels).toHaveLength(1)
    expect(block.labelDeclarations!.labels[0].value).toBe(9999)

    expect(block.constDeclarations.length).toBeGreaterThanOrEqual(12)
    const constNames = block.constDeclarations.map((c) => c.name.name)
    expect(constNames).toContain('BUFSIZE')
    expect(constNames).toContain('MAXBYTES')
    expect(constNames).toContain('MAXTOKS')
    expect(constNames).toContain('MAXNAMES')
    expect(constNames).toContain('MAXTEXTS')
    expect(constNames).toContain('HASHSIZE')
    expect(constNames).toContain('LINELENGTH')

    expect(block.typeDeclarations.length).toBeGreaterThanOrEqual(7)
    const typeNames = block.typeDeclarations.map((t) => t.name.name)
    expect(typeNames).toContain('ASCIICODE')
    expect(typeNames).toContain('TEXTFILE')
    expect(typeNames).toContain('EIGHTBITS')
    expect(typeNames).toContain('SIXTEENBITS')
    expect(typeNames).toContain('NAMEPOINTER')
    expect(typeNames).toContain('TEXTPOINTER')
    expect(typeNames).toContain('OUTPUTSTATE')

    expect(block.variableDeclarations.length).toBeGreaterThanOrEqual(20)

    expect(block.procedureDeclarations.length).toBeGreaterThan(0)
    const procNames = block.procedureDeclarations.map((p) => p.name.name)
    expect(procNames).toContain('DEBUGHELP')
    expect(procNames).toContain('ERROR')
    expect(procNames).toContain('JUMPOUT')
    expect(procNames).toContain('INITIALIZE')
    expect(procNames).toContain('OPENINPUT')

    expect(block.functionDeclarations.length).toBeGreaterThan(0)
    const funcNames = block.functionDeclarations.map((f) => f.name.name)
    expect(funcNames).toContain('INPUTLN')
    expect(funcNames).toContain('IDLOOKUP')
  })

  test('has compound statement', () => {
    expect(result.success).toBe(true)
    if (!result.success) return

    const program = result.astNode as ProgramNode
    const block = program.block as BlockNode

    expect(block.compound.kind).toBe('CompoundStatement')
    expect(block.compound.statements.length).toBeGreaterThan(0)
  })

  test('all procedures have blocks', () => {
    expect(result.success).toBe(true)
    if (!result.success) return

    const program = result.astNode as ProgramNode
    const block = program.block as BlockNode

    const nonForwardProcs = block.procedureDeclarations.filter((p) => !p.isForward)
    nonForwardProcs.forEach((proc) => {
      expect(proc.block).not.toBeNull()
      expect(proc.block!.compound.statements.length).toBeGreaterThan(0)
    })
  })

  test('all functions have blocks', () => {
    expect(result.success).toBe(true)
    if (!result.success) return

    const program = result.astNode as ProgramNode
    const block = program.block as BlockNode

    const nonForwardFuncs = block.functionDeclarations.filter((f) => !f.isForward)
    nonForwardFuncs.forEach((func) => {
      expect(func.block).not.toBeNull()
    })
  })
})
