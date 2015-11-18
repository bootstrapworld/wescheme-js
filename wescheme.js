import lex from './src/lex'

export default function compile(code) {
  lex(code, 'foo', true)
  return code.slice(0, Math.floor(code.length/2))
}