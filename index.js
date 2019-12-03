// tokenizer for indent based language
// name = n:[a-zA-Z0-9_]+ { return n.join("") }
// state_name = name
// transition_name = name
// newlines = [\n]+
// Whitespace = [" "\t]*
// arrow = Whitespace"->"Whitespace
// parallel_state = "&" 

const tokenize = require('./tokenizer');
const { parse } = require('./parser');

const inputStr = `abc
  def -> lmn
  pasta -> noodles
  ast&
    opq -> rst
    uvw -> xyz
  try -> this`;

console.log(inputStr);

const tokens = tokenize(inputStr);

// console.log(tokens.filter(token => token.type !== 'WS'))

const ast = parse(tokens);

console.log('ast', JSON.stringify(ast, null, 2));