import { describe } from 'vitest'
import { type PascalTest, runPascalTests } from './_helper'

describe('Phase 3: Array and Record', () => {
  const tests: PascalTest[] = [
    // Array Basics
    {
      name: 'array declaration and access',
      code: 'program test; var arr: array[1..5] of integer; begin arr[1] := 10; arr[3] := 30; writeln(arr[1]); writeln(arr[3]); end.',
      purpose: '测试数组声明和元素访问',
      expectedOutput: '10\n30\n',
    },
    {
      name: 'array assignment',
      code: 'program test; var arr: array[0..2] of integer; begin arr[0] := 1; arr[1] := 2; arr[2] := 3; writeln(arr[0]+arr[1]+arr[2]); end.',
      purpose: '测试数组元素赋值',
      expectedOutput: '6\n',
    },
    {
      name: 'array individual assignment',
      code: 'program test; var arr: array[1..3] of integer; begin arr[1] := 10; arr[2] := 20; arr[3] := 30; writeln(arr[1]); writeln(arr[2]); writeln(arr[3]); end.',
      purpose: '测试数组逐个赋值（标准 Pascal 不支持初始化语法）',
      expectedOutput: '10\n20\n30\n',
    },
    {
      name: 'array as procedure parameter (value)',
      code: 'program test; var arr: array[1..3] of integer; procedure printArray(a: array[1..3] of integer); begin writeln(a[1]); writeln(a[2]); end; begin arr[1] := 100; arr[2] := 200; printArray(arr); end.',
      purpose: '测试数组作为过程参数（值传递）',
      expectedOutput: '100\n200\n',
    },
    {
      name: 'array as procedure parameter (var)',
      code: 'program test; var arr: array[1..3] of integer; procedure modifyArray(var a: array[1..3] of integer); begin a[1] := 999; end; begin arr[1] := 100; modifyArray(arr); writeln(arr[1]); end.',
      purpose: '测试数组作为过程参数（var传递）',
      expectedOutput: '999\n',
    },
    {
      name: 'array as function parameter',
      code: 'program test; var arr: array[1..3] of integer; function sumArray(a: array[1..3] of integer): integer; begin sumArray := a[1] + a[2] + a[3]; end; begin arr[1] := 1; arr[2] := 2; arr[3] := 3; writeln(sumArray(arr)); end.',
      purpose: '测试数组作为函数参数',
      expectedOutput: '6\n',
    },
    {
      name: 'multidimensional array',
      code: 'program test; var arr: array[1..2, 1..2] of integer; begin arr[1,1] := 1; arr[1,2] := 2; arr[2,1] := 3; arr[2,2] := 4; writeln(arr[1,1], arr[1,2]); writeln(arr[2,1], arr[2,2]); end.',
      purpose: '测试多维数组',
      expectedOutput: '12\n34\n',
    },
    {
      name: 'array bound check',
      code: 'program test; var arr: array[1..3] of integer; begin arr[5] := 10; end.',
      purpose: '测试数组边界检查',
      expectedError: '',
    },
    // Array Operations
    {
      name: 'array element as lvalue',
      code: 'program test; var arr: array[1..3] of integer; begin arr[2] := 42; writeln(arr[2]); end.',
      purpose: '测试数组元素作为左值',
      expectedOutput: '42\n',
    },
    {
      name: 'array element as rvalue',
      code: 'program test; var arr: array[1..3] of integer; x: integer; begin arr[1] := 10; x := arr[1]; writeln(x); end.',
      purpose: '测试数组元素作为右值',
      expectedOutput: '10\n',
    },
    {
      name: 'array element in expression',
      code: 'program test; var arr: array[1..3] of integer; begin arr[1] := 5; arr[2] := 3; writeln(arr[1] * arr[2] + 10); end.',
      purpose: '测试数组元素在表达式中',
      expectedOutput: '25\n',
    },
    {
      name: 'array as global variable',
      code: 'program test; var arr: array[1..3] of integer; procedure setArr; begin arr[1] := 100; end; begin setArr; writeln(arr[1]); end.',
      purpose: '测试数组作为全局变量',
      expectedOutput: '100\n',
    },
    {
      name: 'array as local variable',
      code: 'program test; procedure testLocal; var arr: array[1..2] of integer; begin arr[1] := 1; arr[2] := 2; writeln(arr[1]+arr[2]); end; begin testLocal; end.',
      purpose: '测试数组作为局部变量',
      expectedOutput: '3\n',
    },
    {
      name: 'array in nested procedure',
      code: 'program test; procedure outer; var arr: array[1..2] of integer; procedure inner; begin arr[1] := 99; end; begin arr[1] := 1; inner; writeln(arr[1]); end; begin outer; end.',
      purpose: '测试嵌套过程中的数组',
      expectedOutput: '99\n',
    },
    // Record Basics
    {
      name: 'record declaration',
      code: 'program test; type Point = record x, y: integer end; var p: Point; begin p.x := 10; p.y := 20; writeln(p.x, p.y); end.',
      purpose: '测试记录声明',
      expectedOutput: '1020\n',
    },
    {
      name: 'record field access',
      code: 'program test; type Person = record age: integer end; var p: Person; begin p.age := 30; writeln(p.age); end.',
      purpose: '测试记录字段访问',
      expectedOutput: '30\n',
    },
    {
      name: 'record field assignment',
      code: 'program test; type Rect = record width, height: integer end; var r: Rect; begin r.width := 100; r.height := 50; writeln(r.width * r.height); end.',
      purpose: '测试记录字段赋值',
      expectedOutput: '5000\n',
    },
    {
      name: 'record as procedure parameter (value)',
      code: 'program test; type Point = record x, y: integer end; var p: Point; procedure printPoint(pt: Point); begin writeln(pt.x); writeln(pt.y); end; begin p.x := 1; p.y := 2; printPoint(p); end.',
      purpose: '测试记录作为过程参数（值传递）',
      expectedOutput: '1\n2\n',
    },
    {
      name: 'record as procedure parameter (var)',
      code: 'program test; type Point = record x, y: integer end; var p: Point; procedure modifyPoint(var pt: Point); begin pt.x := 99; end; begin p.x := 1; modifyPoint(p); writeln(p.x); end.',
      purpose: '测试记录作为过程参数（var传递）',
      expectedOutput: '99\n',
    },
    {
      name: 'nested record',
      code: 'program test; type Point = record x, y: integer end; Circle = record center: Point; radius: integer end; var c: Circle; begin c.center.x := 10; c.center.y := 20; c.radius := 5; writeln(c.center.x); writeln(c.radius); end.',
      purpose: '测试嵌套记录',
      expectedOutput: '10\n5\n',
    },
    // WITH Statement
    {
      name: 'WITH single record',
      code: 'program test; type Point = record x, y: integer end; var p: Point; begin p.x := 0; p.y := 0; with p do begin x := 10; y := 20; end; writeln(p.x, p.y); end.',
      purpose: '测试WITH单记录',
      expectedOutput: '1020\n',
    },
    {
      name: 'WITH multiple records',
      code: 'program test; type Point = record x, y: integer end; var p1, p2: Point; begin p1.x := 1; p2.x := 2; with p1, p2 do writeln(x); end.',
      purpose: '测试WITH多记录',
      expectedOutput: '2\n',
    },
    {
      name: 'WITH modify fields',
      code: 'program test; type Person = record age: integer end; var p: Person; begin with p do begin age := 25; end; writeln(p.age); end.',
      purpose: '测试WITH修改字段',
      expectedOutput: '25\n',
    },
    {
      name: 'WITH call procedure',
      code: 'program test; type Point = record x, y: integer end; var p: Point; procedure setX(val: integer); begin p.x := val; end; begin with p do setX(42); writeln(p.x); end.',
      purpose: '测试WITH中调用过程',
      expectedOutput: '42\n',
    },
    {
      name: 'nested WITH',
      code: 'program test; type Point = record x, y: integer end; Rect = record topLeft, bottomRight: Point end; var r: Rect; begin with r do with topLeft do x := 10; writeln(r.topLeft.x); end.',
      purpose: '测试嵌套WITH（Pascal82 标准：单个 type 段）',
      expectedOutput: '10\n',
    },
    {
      name: 'WITH variable name conflict',
      code: 'program test; type Point = record x, y: integer end; var x: integer; p: Point; begin x := 100; p.x := 10; with p do writeln(x); end.',
      purpose: '测试WITH与变量名冲突（Pascal82 标准：单个 var 段）',
      expectedOutput: '10\n',
    },
    // Array and Record Combination
    {
      name: 'array of records',
      code: 'program test; type Point = record x, y: integer end; var arr: array[1..2] of Point; begin arr[1].x := 1; arr[1].y := 2; arr[2].x := 3; arr[2].y := 4; writeln(arr[1].x, arr[2].y); end.',
      purpose: '测试数组元素为记录',
      expectedOutput: '14\n',
    },
    {
      name: 'record field as array',
      code: 'program test; type Person = record scores: array[1..3] of integer end; var p: Person; begin p.scores[1] := 80; p.scores[2] := 90; p.scores[3] := 75; writeln(p.scores[1]+p.scores[2]+p.scores[3]); end.',
      purpose: '测试记录字段为数组',
      expectedOutput: '245\n',
    },
    {
      name: 'record array assignment',
      code: 'program test; type Point = record x, y: integer end; var arr: array[1..2] of Point; begin arr[1].x := 1; arr[1].y := 2; arr[2].x := 3; arr[2].y := 4; writeln(arr[1].x); writeln(arr[2].y); end.',
      purpose: '测试记录数组逐个赋值（标准 Pascal 不支持初始化语法）',
      expectedOutput: '1\n4\n',
    },
    {
      name: 'nested array record',
      code: 'program test; type Point = record x, y: integer end; var arr: array[1..2] of array[1..2] of Point; begin arr[1,1].x := 1; arr[2,2].y := 4; writeln(arr[1,1].x, arr[2,2].y); end.',
      purpose: '测试嵌套数组记录',
      expectedOutput: '14\n',
    },
    {
      name: 'array record as parameter',
      code: 'program test; type Point = record x, y: integer end; PointArray = array[1..2] of Point; var arr: PointArray; procedure printArray(pa: PointArray); begin writeln(pa[1].x); writeln(pa[2].y); end; begin arr[1].x := 10; arr[2].y := 20; printArray(arr); end.',
      purpose: '测试数组记录作为参数（Pascal82 标准：单个 type 段）',
      expectedOutput: '10\n20\n',
    },
  ]

  runPascalTests(tests)
})
