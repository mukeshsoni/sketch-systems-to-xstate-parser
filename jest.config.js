module.exports = {
  roots: ['<rootDir>/'],
  moduleFileExtensions: ['ts', 'ts', 'js', 'json'],
  testMatch: ['**/__tests__/**/*.+(ts|js)'],
  moduleDirectories: ['node_modules', '.'],
  transform: {
    '^.+\\.(js|ts)$': 'ts-jest',
  },
};

