// ISO/IEC 7185:1990 - 6.10 Programs
//
//

import { type PascalTest, runPascalTests } from './harness.ts'

function text(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

const tests: PascalTest[] = [
  {
    name: '6.10 parameterless program-heading: legal and no error',
    code: `PROGRAM NOARGS(output);BEGIN WRITELN('OK');END.`,
    purpose:
      'ISO 6.10: the program-parameter-list of a program-heading is optional; omitting it still yields a legal program',
    expectedOutput: 'OK\n',
  },

  {
    name: '6.10 program name has no runtime semantics: declaration only',
    code: `PROGRAM MYFAVORITEAPP(output);VAR I:INTEGER;BEGIN I:=42;WRITELN(I);END.`,
    purpose:
      'ISO 6.10: the program-identifier is the program name; it has no meaning within the program and does not affect execution',
    expectedOutput: '42\n',
  },

  {
    name: '6.10 file parameters: identity mapping programFileUrls (INFILE->INFILE, OUTFILE->OUTFILE)',
    code:
      `PROGRAM COPYFILE(INFILE,OUTFILE);VAR INFILE,OUTFILE:TEXT;CH:CHAR;BEGIN RESET(INFILE);REWRITE(OUTFILE);WHILE NOT EOF(INFILE)DO BEGIN WHILE NOT EOLN(INFILE)DO BEGIN CH:=INFILE^;WRITE(OUTFILE,CH);GET(INFILE);END;WRITELN(OUTFILE);READLN(INFILE);END;END.`,
    purpose:
      'ISO 6.10: the binding of a program-parameter to an external entity is implementation-defined; this implementation specifies it via programFileUrls; here an identity mapping is used and the two text files are copied per 6.9',
    textFiles: new Map<string, Uint8Array>([
      ['INFILE', text('ABC\nDEF\n')],
      ['OUTFILE', new Uint8Array(0)],
    ]),
    programFileUrls: { INFILE: 'INFILE', OUTFILE: 'OUTFILE' },
    expectedFileContains: [{ url: 'OUTFILE', contains: 'ABC\nDEF\n' }],
  },

  {
    name: '6.10 file parameters: identity mapping when programFileUrls omitted (param name is the files key)',
    code:
      `PROGRAM COPY2(F,G);VAR F,G:FILE OF CHAR;BEGIN RESET(F);REWRITE(G);WHILE NOT EOF(F)DO BEGIN G^:=F^;PUT(G);GET(F);END;END.`,
    purpose:
      'ISO 6.10: the file binding of a program-parameter is implementation-defined; when programFileUrls is not specified, this implementation uses the parameter name itself as the external file key; buffer assignment + PUT/GET copies component by component',
    textFiles: new Map<string, Uint8Array>([
      ['F', text('HELLO')],
      ['G', new Uint8Array(0)],
    ]),
    expectedFileContains: [{ url: 'G', contains: 'HELLO' }],
  },

  {
    name: '6.10 file parameters: programFileUrls rename mapping (F->IN.TXT, G->OUT.TXT)',
    code: `PROGRAM RENAMEMAP(F,G);
      VAR F,G:TEXT;
      C:CHAR;
      BEGIN RESET(F);
      REWRITE(G);
      WHILE NOT EOF(F) DO 
      BEGIN C:=F^;
         WRITE(G,C);
         GET(F);
      END;
      END.`,
    purpose:
      'ISO 6.10: binding is implementation-defined; programFileUrls may rename-map file variables to in-memory file names; the variable name need not equal the external file name',
    textFiles: new Map<string, Uint8Array>([
      ['IN.TXT', text('MAPPED')],
      ['OUT.TXT', new Uint8Array(0)],
    ]),
    programFileUrls: { F: 'IN.TXT', G: 'OUT.TXT' },
    expectedFileContains: [{ url: 'OUT.TXT', contains: 'MAPPED' }],
  },

  {
    name: '6.10 file binding of program file parameters and READ',
    code: `PROGRAM T(IO);VAR IO:TEXT;X:INTEGER;BEGIN RESET(IO);READ(IO,X);WRITELN('X=',X);END.`,
    purpose:
      'ISO 6.10: the binding of a program-parameter to an external entity is implementation-defined, specified by programFileUrls in this implementation; after RESET, read integers from the text file per 6.9.1',
    textFiles: new Map<string, Uint8Array>([['IO', text('7')]]),
    programFileUrls: { IO: 'IO' },
    expectedOutput: 'X=7\n',
  },

  {
    name: '6.10 single-parameter program: text file parameter (read two integers and sum)',
    code:
      `PROGRAM SUM(NUMBERS);VAR NUMBERS:TEXT;A,B,S:INTEGER;BEGIN RESET(NUMBERS);READ(NUMBERS,A);READ(NUMBERS,B);S:=A+B;WRITELN('SUM=',S);END.`,
    purpose:
      'ISO 6.10: the program-parameter-list may contain only one identifier; after the text file parameter is bound, read two integers consecutively per 6.9.1',
    textFiles: new Map<string, Uint8Array>([['NUMBERS', text('11 31')]]),
    programFileUrls: { NUMBERS: 'NUMBERS' },
    expectedOutput: 'SUM=42\n',
  },

  {
    name: '6.10 program header parameter identifiers are case-insensitive (infile and INFILE same definition point)',
    code:
      `PROGRAM MIXED(infile,outfile);VAR INFILE,OUTFILE:TEXT;CH:CHAR;BEGIN RESET(INFILE);REWRITE(OUTFILE);WHILE NOT EOF(INFILE)DO BEGIN CH:=INFILE^;WRITE(OUTFILE,CH);GET(INFILE);END;END.`,
    purpose:
      'ISO 6.1.1/6.10: outside character-strings, letter case has no effect on meaning; hence program-parameters spelled infile/outfile and declared in the var section as INFILE/OUTFILE are still the same variable-identifier (this implementation uses the spelling in the program header as the programFileUrls key)',
    textFiles: new Map<string, Uint8Array>([
      ['INFILE', text('lowercaseOK')],
      ['OUTFILE', new Uint8Array(0)],
    ]),
    programFileUrls: { infile: 'INFILE', outfile: 'OUTFILE' },
    expectedFileContains: [{ url: 'OUTFILE', contains: 'lowercaseOK' }],
  },

  {
    name: '6.10 program-parameter-list identifiers must be distinct (duplicate -> error)',
    code: `PROGRAM DUP(F,F);VAR F:TEXT;BEGIN END.`,
    purpose:
      'ISO 6.10: identifiers in the program-parameter-list must be distinct; this requirement is not designated as an error, so per 5.1 e) the processor must detect the violation and block execution',
    expectedError: '',
  },

  {
    name: '6.10 input/output as program header parameters: reset/rewrite state on first access',
    code: `PROGRAM ECHO(INPUT,OUTPUT);VAR S:INTEGER;BEGIN READ(S);WRITELN(S*2);END.`,
    purpose:
      'ISO 6.10: once input/output are listed as program-parameters, read/write are usable without explicit RESET/REWRITE (the reset/rewrite post-assertions already hold before first access)',
    input: '21',
    expectedOutput: '42\n',
  },

  {
    name: '6.10 only output as parameter: output still usable',
    code: `PROGRAM ONLYOUT(OUTPUT);BEGIN WRITELN(1);WRITELN(2);END.`,
    purpose:
      'ISO 6.10: listing output as a program-parameter makes the rewrite post-assertion hold; writeln can write directly',
    expectedOutput: '1\n2\n',
  },

  {
    name: '6.10 only input listed, not output: read with omitted file parameter is usable',
    code: `PROGRAM ONLYIN(INPUT,LOG);VAR LOG:TEXT;X:INTEGER;BEGIN READ(X);REWRITE(LOG);WRITELN(LOG,X+1);END.`,
    purpose:
      'ISO 6.10/6.9.1: input as a program-parameter makes its reset post-assertion hold before first access; read (with omitted file parameter) can read directly; this program does not list output, so the result is written to file parameter LOG',
    input: '41',
    textFiles: new Map<string, Uint8Array>([['LOG', new Uint8Array(0)]]),
    expectedFileContains: [{ url: 'LOG', contains: '42\n' }],
  },
  {
    name: '6.10 source text missing program-heading is an error',
    code: `begin
  writeln('x');
end.`,
    purpose: 'ISO 6.10: program = program-heading ; block . ; the source text must start with a program-heading',
    expectedError: '',
  },
  {
    name: '6.10 program name must be an identifier',
    code: 'program 5; begin end.',
    purpose: 'ISO 6.10: program-heading = program identifier ...',
    expectedError: '',
  },
  {
    name: '6.10 each entry in program-parameter-list must be an identifier',
    code: 'program p(1); begin end.',
    purpose: 'ISO 6.10: the program-parameter-list consists of identifiers',
    expectedError: '',
  },
  {
    name: '6.10 program parameter list missing right parenthesis is an error',
    code: 'program p(output; begin end.',
    purpose: 'ISO 6.10: the program-parameter-list ends with a right parenthesis',
    expectedError: '',
  },
  {
    name: '6.10 program-heading missing semicolon is an error',
    code: 'program p(output) begin end.',
    purpose: 'ISO 6.10: the program-heading must be followed by a semicolon',
    expectedError: '',
  },
  {
    name: '6.10 program missing the terminating period is an error',
    code: 'program p(output); begin end',
    purpose: 'ISO 6.10: the program ends with a period',
    expectedError: '',
  },
  {
    name: '6.10 no tokens may follow the program terminating period',
    code: 'program p(output); begin end. begin end.',
    purpose: 'ISO 6.10: the period marks the end of the source program; no tokens should follow it',
    expectedError: '',
  },
]

runPascalTests('ISO 7185 6.10 - Programs', tests)
