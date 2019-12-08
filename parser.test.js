const { tokenize } = require("./tokenizer");
const { parse } = require("./parser");

const inputStr = `abc
  def -> lmn
  pasta -> noodles
  ast&
    opq -> rst
    uvw -> xyz
  tried -> that
  lastState`;

const expectedXstateJSON = {
  abc: {
    type: "sequential",
    on: {
      def: "lmn",
      pasta: "noodles",
      tried: "that"
    },
    states: {
      ast: {
        type: "parallel",
        on: {
          opq: "rst",
          uvw: "xyz"
        }
      },
      lastState: {
        type: "sequential"
      }
    }
  }
};

const invalidInputStr = `abc
  def -> lmn
      pqr
    stm`;

describe("tokenizer", () => {
  it("should give the correct number of tokens", () => {
    const tokens = tokenize(inputStr);

    expect(tokens).toHaveLength(30);
  });

  it("gives correct indent and dedent tokens", () => {
    const tokens = tokenize(inputStr);

    expect(tokens[2].type).toEqual("INDENT");
    expect(tokens[14].type).toEqual("INDENT");
    expect(tokens[23].type).toEqual("DEDENT");
    expect(tokens[28].type).toEqual("DEDENT");
  });

  it("catches incorrect indentation errors", () => {
    expect(() => tokenize(invalidInputStr)).toThrowError("Invalid indentation");
  });

  it("should have line and column number for tokens", () => {
    const tokens = tokenize(inputStr);

    const secondIdentifier = tokens[3];

    expect(secondIdentifier.type).toEqual("IDENTIFIER");
    expect(secondIdentifier.line).toEqual(2);
    expect(secondIdentifier.col).toEqual(3);

    const lastToken = tokens[29];

    expect(lastToken.type).toEqual("IDENTIFIER");
    expect(lastToken.line).toEqual(8);
    expect(lastToken.col).toEqual(1);

    const uvwToken = tokens.find(token => token.text === "uvw");

    expect(uvwToken.type).toEqual("IDENTIFIER");
    expect(uvwToken.line).toEqual(6);
    expect(uvwToken.col).toEqual(5);
  });
});

describe.only("parser", () => {
  const tokens = tokenize(inputStr);

  // console.log(tokens.filter(token => token.type !== 'WS'))

  const ast = parse(tokens);

  console.log(JSON.stringify(ast, null, 2));
  expect(ast).toEqual(expectedXstateJSON);
  // console.log("AST:\n", JSON.stringify(ast, null, 2));
  expect(true).toBe(true);
});
