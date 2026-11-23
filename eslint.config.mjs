import js from "@eslint/js";
import jest from "eslint-plugin-jest";
import globals from "globals";

export default [
  { ignores: ["coverage/", "dist/", "node_modules/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["__tests__/**/*.js", "__fixtures__/**/*.js"],
    ...jest.configs["flat/recommended"],
  },
];
