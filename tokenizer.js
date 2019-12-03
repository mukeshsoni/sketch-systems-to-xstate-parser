function last(arr) {
  return arr[arr.length - 1];
}

function prevTokenTypeCheck(tokens, type) {
  return tokens.length > 0 && tokens[tokens.length - 1].type === type
}

function tokenize(str) {
  let index = 0;
  let tokens = [];
  let indentStack = [0];

  function identifierToken() {
    let char = next();
    let idStr = '';

    while (char !== undefined && /[a-zA-Z0-9_]/.test(char)) {
      idStr += char;
      index += 1;
      char = next();
    }

    return idStr
  }

  // this is the main function 
  // It takes care of creating the right INDENT and DETENT tokens
  // the algorithm is taken from here - https://docs.python.org/3/reference/lexical_analysis.html
  // the implementation is mostly copied from the chevrotain example here - https://github.com/SAP/chevrotain/blob/master/examples/lexer/python_indentation/python_indentation.js
  function whitespaceTokenizer() {
    // the y ensures that this regex only matches the beginning of the string
    const regex = / +/y;
    let char = next();
    let wsCount = 0;

    // only checking for previous token as NEWLINE does not take
    // care of the first line
    if(prevTokenTypeCheck(tokens, 'NEWLINE')) {
      const match = regex.exec(str.slice(index));
      let currentIndentLevel;
      if(match === null) {
        // this means that the new line does not have
        // any indentation. It's either empty or starts with a 
        // non whitespace
        currentIndentLevel = 0;
      } else {
        currentIndentLevel = match[0].length;
      }

      const prevIndentLevel = last(indentStack);
      index += currentIndentLevel;

      if(currentIndentLevel > prevIndentLevel) {
        indentStack.push(currentIndentLevel);
        return [{
          type: 'INDENT'
        }]
      } else if(currentIndentLevel < prevIndentLevel) {
        const dedentLevelInStack = indentStack.find(n => n === currentIndentLevel);
        
        // any dedent/outdent must match some previous indentation level.
        // otherwise it's a syntax error
        if(dedentLevelInStack === undefined) {
          console.error('invalid indendation', indentStack, currentIndentLevel)
          throw new Error('Invalid indendation');
        }

        // keep popping indentation levels from indent dedentLevelInStack
        // until we reach the current indent level
        // push those many dedent tokens to tokenizer
        let indentLevelFromStack = last(indentStack);
        let dedentTokens = [];
        
        while(currentIndentLevel !== indentLevelFromStack && indentStack.length > 0) {

        indentStack.pop();
          dedentTokens.push({
            type: 'DEDENT'
          })

          indentLevelFromStack = last(indentStack);
        }
        
        return dedentTokens
      } else {
        // same indentation level. do nothing. just consume it.
        return [];
      }
    } else {
      // TODO - should we separate this out into a whitespace tokenizer
      // and call this one indentDedentTokenizer?
      while(next() && /\t| /.test(next())) {
        index += 1;
      }

      return [];
    }
  }

  // return the next character in the stream
  function next() {
    return str[index];
  }

  function peek() {
    return str[index+1];
  }

  while (index < str.length) {
    // after every round, let's just check if we need to
    // insert indent/dedent tokens
    tokens = tokens.concat(whitespaceTokenizer());
    const char = next();
    if (char === '\n') {
      tokens.push({ type: 'NEWLINE' });
      index += 1;
    } else if(char === '&') {
      tokens.push({
        type: "PARALLEL_STATE"
      })
      index += 1
    } else if (/[a-zA-Z0-9_]/.test(char)) {
      const id = identifierToken()
      tokens.push({
        type: 'IDENTIFIER',
        value: id
      })
      // TODO: this check will not work when a dedent removes all
      // whitespace from a line. i.e. a line starts from the beginning
      // of the line
    } else if (char === ' ' || char === '\t') {
        const wsTokens = whitespaceTokenizer();
        tokens = tokens.concat(wsTokens)
    } else if (char === '-' && peek() === '>') {
      tokens.push({
        type: 'TRANSITION_ARROW'
      })

      index += 2;
    } else {
      tokens.push({
        type: 'UNKNOWN',
        value: char
      })
      index += 1;
    }
  }

// TODO - at the end of the tokenizing we need to pop out all remaining 
// indents from stack and push DEDENT tokens to our tokens list
  while(indentStack.length > 1 && indentStack.pop() > 0) {
    tokens.push({ type: 'DEDENT' })
  }
  return tokens;
}

module.exports = tokenize;