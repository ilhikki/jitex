import { Scanner, Token } from './scanner';
import { Range } from '../ast/types';
import {
  Program, Block, Identifier, NumericLiteral, StringLiteral, CharLiteral,
  ConstDeclaration, LabelDeclaration, TypeDeclaration, VariableDeclaration,
  SimpleType, RangeType, ArrayType, PackedArrayType, RecordType,
  FileType, PackedFileType, CompoundStatement, EmptyStatement, Assignment,
  IfStatement, WhileStatement, RepeatStatement, ForStatement, GotoStatement,
  WithStatement, WriteStatement, WriteLnStatement, WriteArgument,
  ReadStatement, ReadLnStatement, BinaryExpression, UnaryExpression,
  CallExpression, ArrayAccess, FieldAccess, ProcedureDeclaration,
  FunctionDeclaration, ParameterDeclaration
} from '../ast/nodes';

export class Parser {
  private readonly scanner: Scanner;

  constructor(source: string) {
    this.scanner = new Scanner(source);
  }

  parse(): Program {
    return this.parseProgram();
  }

  private parseProgram(): Program {
    const start = this.scanner.current().range.start;
    
    this.scanner.expectKeyword('PROGRAM');
    const name = this.parseIdentifier();
    
    this.scanner.expect('LPAREN');
    const parameters = this.parseIdentifierList();
    this.scanner.expect('RPAREN');
    
    this.scanner.expect('SEMICOLON');
    
    const block = this.parseBlock();
    
    this.scanner.expect('DOT');
    this.scanner.expect('EOF');
    
    const end = this.scanner.current().range.end;
    
    return new Program({ start, end }, name, parameters, block);
  }

  private parseBlock(): Block {
    const start = this.scanner.current().range.start;
    
    const labelDeclarations = this.parseLabelDeclarations();
    const constDeclarations = this.parseConstDeclarations();
    const typeDeclarations = this.parseTypeDeclarations();
    const variableDeclarations = this.parseVariableDeclarations();
    const procedureDeclarations = this.parseProcedureDeclarations();
    const functionDeclarations = this.parseFunctionDeclarations();
    const statements = this.parseStatements();
    
    const end = this.scanner.current().range.end;
    
    return new Block(
      { start, end },
      labelDeclarations,
      constDeclarations,
      typeDeclarations,
      variableDeclarations,
      procedureDeclarations,
      functionDeclarations,
      statements
    );
  }

  private parseLabelDeclarations(): LabelDeclaration[] {
    const declarations: LabelDeclaration[] = [];
    
    if (this.scanner.skipKeyword('LABEL')) {
      const labels: NumericLiteral[] = [];
      
      do {
        labels.push(this.parseNumericLiteral());
      } while (this.scanner.skip('COMMA'));
      
      this.scanner.expect('SEMICOLON');
      
      declarations.push(new LabelDeclaration(
        { start: labels[0].start, end: this.scanner.current().range.end },
        labels
      ));
    }
    
    return declarations;
  }

  private parseConstDeclarations(): ConstDeclaration[] {
    const declarations: ConstDeclaration[] = [];
    
    if (this.scanner.skipKeyword('CONST')) {
      while (!this.scanner.matchKeyword('TYPE') && 
             !this.scanner.matchKeyword('VAR') && 
             !this.scanner.matchKeyword('PROCEDURE') && 
             !this.scanner.matchKeyword('FUNCTION') && 
             !this.scanner.matchKeyword('BEGIN') &&
             !this.scanner.match('EOF')) {
        const start = this.scanner.current().range.start;
        const name = this.parseIdentifier();
        this.scanner.expect('EQUAL');
        const value = this.parseExpression();
        this.scanner.skip('SEMICOLON');
        const end = this.scanner.current().range.end;
        declarations.push(new ConstDeclaration({ start, end }, name, value));
      }
    }
    
    return declarations;
  }

  private parseTypeDeclarations(): TypeDeclaration[] {
    const declarations: TypeDeclaration[] = [];
    
    if (this.scanner.skipKeyword('TYPE')) {
      while (!this.scanner.matchKeyword('VAR') && 
             !this.scanner.matchKeyword('PROCEDURE') && 
             !this.scanner.matchKeyword('FUNCTION') && 
             !this.scanner.matchKeyword('BEGIN') &&
             !this.scanner.match('EOF')) {
        const start = this.scanner.current().range.start;
        const name = this.parseIdentifier();
        this.scanner.expect('EQUAL');
        const typeDefinition = this.parseType();
        this.scanner.skip('SEMICOLON');
        const end = this.scanner.current().range.end;
        declarations.push(new TypeDeclaration({ start, end }, name, typeDefinition));
      }
    }
    
    return declarations;
  }

  private parseVariableDeclarations(): VariableDeclaration[] {
    const declarations: VariableDeclaration[] = [];
    
    if (this.scanner.skipKeyword('VAR')) {
      while (!this.scanner.matchKeyword('PROCEDURE') && 
             !this.scanner.matchKeyword('FUNCTION') && 
             !this.scanner.matchKeyword('BEGIN') &&
             !this.scanner.match('EOF')) {
        const start = this.scanner.current().range.start;
        const names = this.parseIdentifierList();
        this.scanner.expect('COLON');
        const type = this.parseType();
        this.scanner.skip('SEMICOLON');
        const end = this.scanner.current().range.end;
        declarations.push(new VariableDeclaration({ start, end }, names, type));
      }
    }
    
    return declarations;
  }

  private parseProcedureDeclarations(): ProcedureDeclaration[] {
    const declarations: ProcedureDeclaration[] = [];
    
    while (this.scanner.matchKeyword('PROCEDURE')) {
      declarations.push(this.parseProcedureDeclaration());
    }
    
    return declarations;
  }

  private parseProcedureDeclaration(): ProcedureDeclaration {
    const start = this.scanner.current().range.start;
    
    this.scanner.expectKeyword('PROCEDURE');
    const name = this.parseIdentifier();
    
    const parameters: ParameterDeclaration[] = [];
    if (this.scanner.skip('LPAREN')) {
      parameters.push(...this.parseParameterList());
      this.scanner.expect('RPAREN');
    }
    
    this.scanner.expect('SEMICOLON');
    
    const isForward = this.scanner.skipKeyword('FORWARD');
    this.scanner.skip('SEMICOLON');
    
    let block: Block;
    if (!isForward) {
      block = this.parseBlock();
    } else {
      block = new Block(
        { start: name.end, end: name.end },
        [], [], [], [], [], [], []
      );
    }
    
    const end = isForward ? this.scanner.current().range.end : block.end;
    
    return new ProcedureDeclaration({ start, end }, name, parameters, block, isForward);
  }

  private parseFunctionDeclarations(): FunctionDeclaration[] {
    const declarations: FunctionDeclaration[] = [];
    
    while (this.scanner.matchKeyword('FUNCTION')) {
      declarations.push(this.parseFunctionDeclaration());
    }
    
    return declarations;
  }

  private parseFunctionDeclaration(): FunctionDeclaration {
    const start = this.scanner.current().range.start;
    
    this.scanner.expectKeyword('FUNCTION');
    const name = this.parseIdentifier();
    
    const parameters: ParameterDeclaration[] = [];
    if (this.scanner.skip('LPAREN')) {
      parameters.push(...this.parseParameterList());
      this.scanner.expect('RPAREN');
    }
    
    this.scanner.expect('COLON');
    const returnType = this.parseType();
    
    this.scanner.expect('SEMICOLON');
    
    const isForward = this.scanner.skipKeyword('FORWARD');
    this.scanner.skip('SEMICOLON');
    
    let block: Block;
    if (!isForward) {
      block = this.parseBlock();
    } else {
      block = new Block(
        { start: name.end, end: name.end },
        [], [], [], [], [], [], []
      );
    }
    
    const end = isForward ? this.scanner.current().range.end : block.end;
    
    return new FunctionDeclaration(
      { start, end },
      name,
      parameters,
      returnType,
      block,
      isForward
    );
  }

  private parseParameterList(): ParameterDeclaration[] {
    const parameters: ParameterDeclaration[] = [];
    
    do {
      const start = this.scanner.current().range.start;
      const isVar = this.scanner.skipKeyword('VAR');
      const names = this.parseIdentifierList();
      this.scanner.expect('COLON');
      const type = this.parseType();
      const end = this.scanner.current().range.end;
      parameters.push(new ParameterDeclaration({ start, end }, names, type, isVar));
    } while (this.scanner.skip('SEMICOLON'));
    
    return parameters;
  }

  private parseStatements(): CompoundStatement {
    const start = this.scanner.current().range.start;
    const statements = this.parseStatementList();
    const end = statements.length > 0 ? statements[statements.length - 1].end : start;
    
    return new CompoundStatement({ start, end }, statements);
  }

  private parseStatementList(): any[] {
    const statements: any[] = [];
    
    if (this.scanner.matchKeyword('BEGIN')) {
      this.scanner.next();
      
      while (!this.scanner.matchKeyword('END') && !this.scanner.match('EOF')) {
        statements.push(this.parseStatement());
        this.scanner.skip('SEMICOLON');
      }
      
      this.scanner.expectKeyword('END');
    } else {
      while (!this.scanner.matchKeyword('END') && 
             !this.scanner.matchKeyword('UNTIL') && 
             !this.scanner.match('EOF')) {
        statements.push(this.parseStatement());
        if (this.scanner.match('SEMICOLON')) {
          this.scanner.next();
        } else {
          break;
        }
      }
    }
    
    return statements;
  }

