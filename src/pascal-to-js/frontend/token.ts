export interface Position {
  line: number
  column: number
  offset: number
}

export interface Token {
  type: string
  content: string
  start: Position
  end: Position
}
