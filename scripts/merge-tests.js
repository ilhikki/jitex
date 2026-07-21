const fs = require('fs')
const path = require('path')

// Merge mapping: [pXX file, m36 file, output file, describe name]
const merges = [
  ['p01-basics.test.ts', 'm36-q05-operations.test.ts', 'compiler/p01-basics.test.ts', 'Phase 1: Basics and Operations'],
  ['p02-control-flow.test.ts', 'm36-q07-control.test.ts', 'compiler/p01-control-flow.test.ts', 'Phase 1: Control Flow'],
  ['p09-io.test.ts', 'm36-q06-io.test.ts', 'compiler/p01-io.test.ts', 'Phase 1: I/O'],
  ['p07-array-record.test.ts', 'm36-q04-array-record.test.ts', 'compiler/p03-array-record.test.ts', 'Phase 3: Array and Record'],
  ['p08-range.test.ts', 'm36-q10-range.test.ts', 'compiler/p03-range.test.ts', 'Phase 3: Range'],
  ['p04-scope.test.ts', 'm36-q01-scope.test.ts', 'compiler/p04-scope.test.ts', 'Phase 4: Scope'],
  ['p05-parameters.test.ts', 'm36-q02-parameters.test.ts', 'compiler/p04-parameters.test.ts', 'Phase 4: Parameters'],
  ['p06-goto.test.ts', 'm36-q03-goto.test.ts', 'compiler/p04-goto.test.ts', 'Phase 4: Goto'],
  ['p15-nonstandard.test.ts', 'm36-q09-nonstandard.test.ts', 'compiler/p15-nonstandard.test.ts', 'Phase 5: Non-standard'],
]

const baseDir = path.join(__dirname, '..', 'tests', 'integration')

function extractTests(content, isLegacy) {
  // Find the tests array
  const testsMatch = content.match(/const tests:\s*\w+\[\][\s\S]*?^\]/m)
  if (!testsMatch) return null
  return testsMatch[0]
}

function convertLegacyToPascal(testsContent) {
  // Replace LegacyTestCompat with PascalTest
  let result = testsContent.replace(/const tests:\s*LegacyTestCompat\[\]/, 'const tests: PascalTest[]')
  // Convert expectedError: true/false to string/undefined
  result = result.replace(/expectedError:\s*true/g, "expectedError: ''")
  result = result.replace(/expectedError:\s*false/g, '')
  return result
}

for (const [pFile, m36File, outFile, describeName] of merges) {
  const pPath = path.join(baseDir, pFile)
  const m36Path = path.join(baseDir, m36File)
  const outPath = path.join(baseDir, outFile)

  const pContent = fs.readFileSync(pPath, 'utf-8')
  const m36Content = fs.readFileSync(m36Path, 'utf-8')

  const pTests = extractTests(pContent, false)
  const m36TestsRaw = extractTests(m36Content, true)
  const m36Tests = m36TestsRaw ? convertLegacyToPascal(m36TestsRaw) : null

  let output = `import { describe, it, expect } from '@jest/globals'\n`
  output += `import { runPascalTest, type PascalTest } from '../_helper'\n\n`
  output += `describe('${describeName}', () => {\n`

  if (pTests) {
    output += `  // Original pXX tests\n`
    output += `  ${pTests.replace('const tests:', 'const pTests:')}\n\n`
  }

  if (m36Tests) {
    output += `  // Original m36 tests\n`
    output += `  ${m36Tests.replace('const tests:', 'const m36Tests:')}\n\n`
  }

  output += `  const tests: PascalTest[] = [\n`
  if (pTests) output += `    ...pTests,\n`
  if (m36Tests) output += `    ...m36Tests,\n`
  output += `  ]\n\n`

  output += `  it('should pass all tests', async () => {\n`
  output += `    for (const test of tests) {\n`
  output += `      const result = await runPascalTest(test)\n`
  output += `      if (!result.passed) {\n`
  output += `        console.error(\`FAIL: \${test.name}: \${result.message}\`)\n`
  output += `      }\n`
  output += `      expect(result.passed).toBe(true)\n`
  output += `    }\n`
  output += `  })\n`
  output += `})\n`

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, output)
  console.log(`Merged: ${outFile}`)
}

console.log('Done!')
