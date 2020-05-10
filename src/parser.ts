import { tokenize, Token } from './tokenizer';
import omit from './omit';
import arrayOfObjToObj from './array_of_obj_to_obj';

type StateType = 'atomic' | 'compound' | 'parallel' | 'final';

// Tip: When trying to produce output which confirms to some standard, it's
// always better to produce the most verbose version of a particular thing. E.g.
// For transitions in xstate have can be represented by
// { [transition] :stateName}, but also with a more verbose version where instead
// of just specifying the stateName, we give an object. Writing the verbose
// version makes it easier to add other variations and also doesn't make us add
// if/else conditions for specific cases. Also makes consuming it simpler since
// now the consuming parser only have to worry about one format.

// The StateNode is our whole parse tree or AST. Everything else flows from there
interface StateNode {
  id: string;
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

function withInitialState(stateInfo: StateNode): StateNode {
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

class ParserError extends Error {
  token: Token;
  constructor(token: Token, ...params: any) {
    super(...params);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ParserError);
    }

    this.token = token;
  }
}

// the main function. Just call this with the tokens
export function parse(inputStr: string) {
  // 1. filter the comment tokens. Not useful for the parsing
  // 2. We can also treat newlines as useless. They were only useful during
  // the tokenizing phase because the INDENT and DEDENT tokens have be to be
  // preceded by a NEWLINE. In the final grammar, newlines only complicate things
  const tokens: Array<Token> = tokenize(inputStr).filter(
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

  // for cases like A -> B+
  // where B can appear one or more times
  // function oneOrMore(fn: any) {
  // try {
  // const parserResult = fn();

  // return [parserResult].concat(zeroOrMore(fn));
  // } catch (e) {
  // return e;
  // }
  // }

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

  function actions() {
    if (tokens[index].type === 'ACTION') {
      return consume().text;
    }

    throw new ParserError(
      tokens[index],
      `Could not find ACTIONS identifier. Instead found ${tokens[index]}`,
    );
  }

  function transition() {
    const eventNames = zeroOrOne(identifier);
    let eventName: string = '';

    if (eventNames.length > 0) {
      eventName = eventNames[0];
    }
    arrow();
    const stateName = identifier();
    let conditionName = [];
    let actionNames;

    if (eventName) {
      conditionName = zeroOrOne(condition);
      actionNames = zeroOrMore(actions);
    } else {
      // if the first event name was absent, the condition is mandatory
      conditionName = [condition()];
      actionNames = zeroOrMore(actions);
    }

    return {
      type: 'transition',
      // TODO: What if we used the more verbose definition of each transition
      // from the parser. { x: { target: 'y', cond: 'abc' }}. If we want to do
      // any optimizations, like convert transitions without any conditions to
      // shorter form, like { x: 'y' }, it can be done later on in one fell
      // swoop
      [eventName]:
        conditionName.length > 0 || actionNames.length > 0
          ? {
              target: stateName,
              cond: conditionName.length > 0 ? conditionName[0] : undefined,
              actions: actionNames.length > 0 ? actionNames : undefined,
            }
          : { target: stateName },
    };
  }

  function stateWithNameOnly() {
    const stateName = identifier();
    const parallel = zeroOrOne(parallelState);
    const isFinal = zeroOrOne(finalState);
    const isInitial = zeroOrOne(initialState);

    return {
      id: stateName,
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
    const isIndentThere = zeroOrOne(indent);
    let transitionsAndStates = [];

    // if there is an indent after state name, it has to be state with
    // extra info
    if (isIndentThere.length > 0) {
      // transitionsAndStates = oneOrMore(() => {
      // return oneOrAnother(transition, stateParser);
      // });
      transitionsAndStates = zeroOrMore(() => {
        return oneOrAnother(transition, stateParser);
      });

      // any rule which has an indent should be always accompanied by a closing
      // dedent. The indent and dedent have to match up, just like parentheses
      // in other languages.
      zeroOrMore(dedent);
    }

    const transitions = transitionsAndStates.filter(
      (ts: any) => ts.type === 'transition',
    );
    const nestedStates = transitionsAndStates.filter(
      (ts: any) => ts.type !== 'transition',
    );

    return {
      id: stateName,
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
              (acc: { [key: string]: StateNode }, nestedState: StateNode) => ({
                ...acc,
                [nestedState.id]: nestedState,
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

      const id = parserOutput.id;
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
