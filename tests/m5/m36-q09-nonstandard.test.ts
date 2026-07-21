import { LegacyTestCompat, runLegacyTest } from './_helper'

const tests: LegacyTestCompat[] = [
  {
    name: 'string type should not be supported',
    code: `program test;
var s: string;
begin
  s := 'hello';
  writeln(s);
end.`,
    purpose: 'Pascal82 没有 string 类型，解释器不应默认支持',
    features: ['string_type'],
    expectedError: true,
  },
]

describe('Q09: Non-standard features should be rejected', () => {
  tests.forEach((t) => {
    test(t.name, async () => {
      const result = await runLegacyTest(t)
      if (!result.passed) {
        console.error(`FAIL: ${t.name}: ${result.message}`)
      }
      expect(result.passed).toBe(true)
    })
  })
})
