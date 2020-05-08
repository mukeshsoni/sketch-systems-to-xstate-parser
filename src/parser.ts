import { tokenize } from './tokenizer';
import omit from './omit';
import arrayOfObjToObj from './array_of_obj_to_obj';

type StateType = 'atomic' | 'compound' | 'parallel' | 'final';

// The StateNode is our whole parse tree or AST. Everything else flows from there
interface StateNode {
  id?: string;
  name: string;
  type: StateType;
  initial?: string;
  isInitial?: boolean;
  states?: {
    [stateName: string]: StateNode;
  };
  on: {
    [transitionName: string]: TransitionNode;
  };
}

interface TransitionNode {
  type: 'transition';
  target: 'string';
  cond?: string;
  action?: string;
}

function withInitialState(stateInfo: StateNode) {
  const nestedStates = stateInfo.states;
  const nestedStateNames = Object.keys(nestedStates || {});

  if (nestedStateNames && nestedStateNames.length > 0) {
    const initialStateName = Object.entries(
      nestedStates as { [stateName: string]: StateNode },
    ).reduce((acc: string, [k, v]: [string, StateNode]) => {
      if (v.isInitial) {
        return k;
      } else {
        return acc;
      }
    }, nestedStateNames[0]);

    return {
      ...stateInfo,
      initial: initialStateName,
    };
  } else {
    return stateInfo;
  }
}

// the main function. Just call this with the tokens
export function parse(inputStr: string) {
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
  function oneOrAnother(...args: any) {
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
        .map((fn: any) => fn.name)
        .join(' | ')}`,
    );
  }

  function zeroOrOne(fn: any) {
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
  function zeroOrMore(fn: any) {
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

  function identifier(): string {
    if (tokens[index].type === 'IDENTIFIER') {
      return consume().text || 'id';
    }

    throw new Error(
      `Could not find IDENTIFIER. Instead found ${JSON.stringify(
        tokens[index],
      )}`,
    );
  }

  function condition() {
    if (tokens[index].type === 'CONDITION') {
      return consume().text;
    }

    throw new Error(
      `Could not find CONDITION identifier. Instead found ${JSON.stringify(
        tokens[index],
      )}`,
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
      name: stateName,
      type:
        parallel.length > 0
          ? 'parallel'
          : isFinal.length > 0
          ? 'final'
          : 'atomic',
      isInitial: isInitial.length > 0 ? true : undefined,
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
      name: stateName,
      type:
        parallel.length > 0
          ? 'parallel'
          : isFinal.length > 0
          ? 'final'
          : nestedStates.length > 0
          ? 'compound'
          : 'atomic',
      isInitial: isInitial.length > 0 ? true : undefined,
      on:
        transitions.length > 0
          ? omit(['type'], arrayOfObjToObj(transitions))
          : undefined,
      states:
        // TODO: Why is `states` an object and not an Array<StateNode>?
        nestedStates.length > 0
          ? nestedStates.reduce(
              (acc, nestedState) => ({
                ...acc,
                [nestedState.name]: nestedState,
              }),
              {},
            )
          : undefined,
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

      const id = parserOutput.name;
      let initial: string | undefined;

      if (parserOutput.states) {
        initial = Object.keys(parserOutput.states)[0];
      }

      return {
        id,
        initial,
        ...parserOutput,
      };
    } catch (e) {
      return { error: e };
    }
  }

  return stateMachine();
}
