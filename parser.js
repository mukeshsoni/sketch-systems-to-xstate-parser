import { tokenize } from './tokenizer';

// omit certain properties from an Object
// the keys arguments contains array of strings which are
// the array of property names to be omitted
function omit(keys, obj) {
  return Object.entries(obj)
    .filter(([k, _]) => !keys.includes(k))
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
}

// merges array of objects into a single object
function arrayOfObjToObj(arr) {
  return arr.reduce((acc, item) => ({ ...acc, ...item }), {});
}

// the main function. Just call this with the tokens
export function parse(inputStr) {
  const tokens = tokenize(inputStr);
  let index = 0;

  const consume = () => tokens[index++];

  // implements grammar rule with possibilities
  // using backtracking
  // e.g. operator -> '+' | '-' | '*' | '/'
  function oneOrAnother(...args) {
    const savedIndex = index;

    for (let i = 0; i < args.length; i++) {
      const parser = args[i];
      try {
        const parserResult = parser();
        return parserResult;
      } catch (e) {
        // else reset index
        index = savedIndex;
      }
    }

    // if none of the parsers worked
    throw new Error(
      `oneOrAnother parser: matched none of the rules: ${args
        .map(fn => fn.name)
        .join(' | ')}`,
    );
  }

  function zeroOrOne(fn) {
    const savedIndex = index;

    try {
      const parserResult = fn();

      return [parserResult];
    } catch (e) {
      index = savedIndex;
      return [];
    }
  }

  // to implement things like statements = transitions * states*
  function zeroOrMore(fn) {
    const parserResults = [];

    while (true) {
      const savedIndex = index;

      try {
        const parserResult = fn();

        parserResults.push(parserResult);
      } catch (e) {
        index = savedIndex;
        return parserResults;
      }
    }
  }

  // for cases like A -> B+
  // where B can appear one or more times
  function oneOrMore(fn) {
    try {
      const parserResult = fn();

      return [parserResult].concat(zeroOrMore(fn));
    } catch (e) {
      return e;
    }
  }

  function newline() {
    if (consume().type === 'NEWLINE') {
      return true;
    }

    throw new Error('Expected a NEWLINE');
  }

  function identifier() {
    if (tokens[index].type === 'IDENTIFIER') {
      return consume().text;
    }

    throw new Error('Could not find IDENTIFIER. Instead found', tokens[index]);
  }

  function parallelState() {
    if (consume().type === 'PARALLEL_STATE') {
      return true;
    }

    throw new Error('Expected PARALLEL_STATE');
  }

  function stateWithNameOnly() {
    const stateName = identifier();
    const parallel = zeroOrOne(parallelState);

    return {
      [stateName]: {
        type: parallel.length > 0 ? 'parallel' : 'sequential',
      },
    };
  }

  function indent() {
    if (consume().type === 'INDENT') {
      return true;
    }

    throw new Error('Expected indent');
  }

  function dedent() {
    if (consume().type === 'DEDENT') {
      return true;
    }

    throw new Error('Expected dedent');
  }

  function whitespace() {
    if (consume().type === 'WS') {
      return true;
    }

    throw new Error('expected whitespace');
  }

  function arrow() {
    if (consume().type === 'TRANSITION_ARROW') {
      return true;
    }

    throw new Error('expected whitespace');
  }

  function transition() {
    const eventName = identifier();
    zeroOrMore(whitespace);
    arrow();
    zeroOrMore(whitespace);
    const stateName = identifier();
    zeroOrMore(newline);

    return {
      type: 'transition',
      [eventName]: stateName,
    };
  }
  // like transitions, nested states etc.
  // e.g.
  // active
  //  click_checkbox -> active
  //  uncheck -> inactive
  function stateWithMoreDetails() {
    const stateName = identifier();
    const parallel = zeroOrOne(parallelState);
    oneOrMore(newline);
    indent();
    const transitionsAndStates = zeroOrMore(() => {
      return oneOrAnother(transition, stateParser);
    });
    zeroOrOne(() => {
      return oneOrMore(newline());
    });
    zeroOrMore(newline);

    const transitions = transitionsAndStates.filter(
      ts => ts.type === 'transition',
    );
    const nestedStates = transitionsAndStates.filter(
      ts => ts.type !== 'transition',
    );

    return {
      [stateName]: {
        type: parallel.length > 0 ? 'parallel' : 'sequential',
        on:
          transitions.length > 0
            ? omit(['type'], arrayOfObjToObj(transitions))
            : undefined,
        states:
          nestedStates.length > 0 ? arrayOfObjToObj(nestedStates) : undefined,
      },
    };
  }

  function stateParser() {
    try {
      const stateInfo = oneOrAnother(stateWithMoreDetails, stateWithNameOnly);
      zeroOrMore(dedent);
      // const stateInfo = stateWithMoreDetails();
      return stateInfo;
    } catch (e) {
      console.error(
        `Failed to parse: for token ${index}: \n`,
        tokens[index],
        '\nError: ',
        e.message,
      );
      throw new Error(e);
    }
  }

  function stateMachine() {
    try {
      return stateParser();
    } catch (e) {
      return { error: e };
    }
  }

  return stateMachine();
}

