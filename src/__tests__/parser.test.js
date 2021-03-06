import { tokenize } from '../tokenizer';
import { parse } from '../parser';

const inputStr = `abc
% some comment
  def -> lmn
  pasta -> noodles %more comment
  ast&*
    opq -> rst; ifyes
    uvw -> #abc.lastState
    nestedstate1
    nestedstate2*
  tried -> that > andDoThis
  lastState
    % trying out transient state
    -> ast; ifyes
    -> lastState; ifno`;

const expectedXstateJSON = {
  id: 'abc',
  initial: 'ast',
  type: 'compound',
  on: {
    def: { target: 'lmn' },
    pasta: { target: 'noodles' },
    tried: {
      target: 'that',
      actions: ['andDoThis'],
    },
  },
  states: {
    ast: {
      id: 'ast',
      type: 'parallel',
      initial: 'nestedstate2',
      isInitial: true,
      on: {
        opq: { target: 'rst', cond: 'ifyes' },
        uvw: { target: '#abc.lastState' },
      },
      states: {
        nestedstate1: { id: 'nestedstate1', type: 'atomic' },
        nestedstate2: { id: 'nestedstate2', isInitial: true, type: 'atomic' },
      },
    },
    lastState: {
      id: 'lastState',
      type: 'atomic',
      on: {
        '': [
          {
            target: 'ast',
            cond: 'ifyes',
          },
          {
            target: 'lastState',
            cond: 'ifno',
          },
        ],
      },
    },
  },
};

const invalidInputStr = `abc
  def -> lmn
      pqr
    stm`;

const fetchInputStr = `fetch
  idle
      FETCH -> loading
  loading
      RESOLVE -> success
      REJECT -> failure
  success$
  failure
      RETRY -> loading`;

const expectedXstateJSONFetch = {
  id: 'fetch',
  type: 'compound',
  initial: 'idle',
  states: {
    idle: {
      id: 'idle',
      type: 'atomic',
      on: {
        FETCH: { target: 'loading' },
      },
    },
    loading: {
      id: 'loading',
      type: 'atomic',
      on: {
        RESOLVE: { target: 'success' },
        REJECT: { target: 'failure' },
      },
    },
    success: {
      id: 'success',
      type: 'final',
    },
    failure: {
      id: 'failure',
      type: 'atomic',
      on: {
        RETRY: { target: 'loading' },
      },
    },
  },
};

describe('tokenizer', () => {
  it('should give the correct number of tokens', () => {
    const tokens = tokenize(inputStr);

    expect(tokens).toHaveLength(53);
    expect(tokens).toMatchSnapshot();
  });

  it('gives correct indent and dedent tokens', () => {
    const tokens = tokenize(inputStr);

    expect(tokens[2].type).toEqual('COMMENT');
    expect(tokens[4].type).toEqual('INDENT');
    expect(tokens[18].type).toEqual('INDENT');
    expect(tokens[33].type).toEqual('DEDENT');
  });

  it('catches incorrect indentation errors', () => {
    expect(() => tokenize(invalidInputStr)).toThrowError('Invalid indentation');
  });

  it('should have line and column number for tokens', () => {
    const tokens = tokenize(inputStr);

    const secondIdentifier = tokens[5];

    expect(secondIdentifier.type).toEqual('IDENTIFIER');
    expect(secondIdentifier.line).toEqual(3);
    expect(secondIdentifier.col).toEqual(3);

    const lastToken = tokens[tokens.length - 1];
    expect(lastToken.type).toEqual('DEDENT');

    const thirdLastToken = tokens[tokens.length - 4];

    expect(thirdLastToken.type).toEqual('IDENTIFIER');
    expect(thirdLastToken.line).toEqual(14);
    expect(thirdLastToken.col).toEqual(6);

    const uvwToken = tokens.find((token) => token.text === 'uvw');

    expect(uvwToken.type).toEqual('IDENTIFIER');
    expect(uvwToken.line).toEqual(7);
    expect(uvwToken.col).toEqual(5);
  });

  it('should have dedent after nestedstate2', () => {
    const tokens = tokenize(inputStr);

    const nestedstate2TokenIndex = tokens.findIndex(
      (t) => t.type === 'IDENTIFIER' && t.text === 'nestedstate2',
    );

    expect(tokens[nestedstate2TokenIndex + 3].type).toEqual('DEDENT');
  });
});

describe('parser', () => {
  it('should generate xstate representation of the input string', () => {
    const ast = parse(inputStr);

    expect(ast).toEqual(expectedXstateJSON);
  });

  it('should generate xstate representation for the fetch statechart', () => {
    const ast = parse(fetchInputStr);

    // console.log(JSON.stringify(ast, null, 2));
    expect(ast).toEqual(expectedXstateJSONFetch);
  });
});
