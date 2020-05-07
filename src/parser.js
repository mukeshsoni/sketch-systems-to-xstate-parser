import { tokenize } from './tokenizer';
import omit from './omit';
import arrayOfObjToObj from './array_of_obj_to_obj';

/**
 * TODO: Let's try writing type for the AST
 * AST stands for tree. What does a tree have? Nodes and each node has children.
 * So we define the type of a NODE and we are good.
 * interface ParseNode {
 *   entry: NodeItem;
 *   children: Array<ParseNode>;
 * }
 *
 * Now we need to define the NodeItem type. It's definitely an enum or union
 * type. We need to figure out the various node item types.
 * P. S. - If we go with above structure for ParseNode, we will have to change
 * our current one.
 *
 * type StateType = 'parallel' | 'initial' | 'final';
 * interface State {
 *   type: StateType;
 *   initial?: string;
 *   isInitial?: boolean;
 *   states?: {
 *     [stateName: string]: State;
 *   };
 *   on: {
 *     [transitionName: string]: Transition;
 *   }
 * }
 *
 * interface Transition {
 *   target: 'string';
 *   cond?: string;
 *   action?: string;
 * }
 */

function withInitialState(stateInfo) {
  const stateName = Object.keys(stateInfo)[0];
  const nestedStates = stateInfo[stateName].states;
  const nestedStateNames = Object.keys(nestedStates || {});

  if (nestedStateNames && nestedStateNames.length > 0) {
    const initialStateName = Object.entries(nestedStates).reduce(
      (acc, [k, v]) => {
        if (v.isInitial) {
          return k;
        } else {
          return acc;
        }
      },
      nestedStateNames[0],
    );

    return {
      ...stateInfo,
      [stateName]: {
        ...stateInfo[stateName],
        initial: initialStateName,
      },
    };
  } else {
    return stateInfo;
  }
}

// the main function. Just call this with the tokens
export function parse(inputStr) {
  // 1. filter the comment tokens. Not useful for the parsing
  // 2. We can also treat newlines as useless. They were only useful during
  // the tokenizing phase because the INDENT and DEDENT tokens have be to be
  // preceded by a NEWLINE. In the final grammar, newlines only complicate things
  const tokens = tokenize(inputStr).filter(
    (t) => t.type !== 'COMMENT' && t.type !== 'NEWLINE',
  );
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
        .map((fn) => fn.name)
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

  function identifier() {
    if (tokens[index].type === 'IDENTIFIER') {
      return consume().text;
    }

    throw new Error('Could not find IDENTIFIER. Instead found', tokens[index]);
  }

  function condition() {
    if (tokens[index].type === 'CONDITION') {
      return consume().text;
    }

    throw new Error(
      'Could not find CONDITION identifier. Instead found',
      tokens[index],
    );
  }

  function parallelState() {
    if (consume().type === 'PARALLEL_STATE') {
      return true;
    }

    throw new Error('Expected PARALLEL_STATE');
  }

  function finalState() {
    if (consume().type === 'FINAL_STATE') {
      return true;
    }

    throw new Error('Expected PARALLEL_STATE');
  }

  function initialState() {
    if (consume().type === 'INITIAL_STATE') {
      return true;
    }

    throw new Error('Expected PARALLEL_STATE');
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

  function arrow() {
    if (consume().type === 'TRANSITION_ARROW') {
      return true;
    }

    throw new Error('expected transition arrow');
  }

  function transition() {
    const eventName = identifier();
    arrow();
    const stateName = identifier();
    const conditionName = zeroOrOne(condition);

    return {
      type: 'transition',
      [eventName]:
        conditionName.length > 0
          ? { target: stateName, cond: conditionName[0] }
          : stateName,
    };
  }

  function stateWithNameOnly() {
    const stateName = identifier();
    const parallel = zeroOrOne(parallelState);
    const isFinal = zeroOrOne(finalState);
    const isInitial = zeroOrOne(initialState);

    return {
      [stateName]: {
        type:
          parallel.length > 0
            ? 'parallel'
            : isFinal.length > 0
            ? 'final'
            : undefined,
        isInitial: isInitial.length > 0 ? true : undefined,
      },
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
    const isFinal = zeroOrOne(finalState);
    const isInitial = zeroOrOne(initialState);
    indent();
    const transitionsAndStates = zeroOrMore(() => {
      return oneOrAnother(transition, stateParser);
    });
    zeroOrMore(dedent);

    const transitions = transitionsAndStates.filter(
      (ts) => ts.type === 'transition',
    );
    const nestedStates = transitionsAndStates.filter(
      (ts) => ts.type !== 'transition',
    );

    return {
      [stateName]: {
        type:
          parallel.length > 0
            ? 'parallel'
            : isFinal.length > 0
            ? 'final'
            : undefined,
        isInitial: isInitial.length > 0 ? true : undefined,
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

      return withInitialState(stateInfo);
    } catch (e) {
      throw new Error(e);
    }
  }

  function stateMachine() {
    try {
      const parserOutput = stateParser();

      const id = Object.keys(parserOutput)[0];
      const initial = Object.keys(parserOutput[id].states)[0];

      return {
        id,
        initial,
        ...parserOutput[id],
      };
    } catch (e) {
      return { error: e };
    }
  }

  return stateMachine();
}
