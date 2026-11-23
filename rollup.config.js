import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import license from "rollup-plugin-license";

export default {
  input: "src/index.js",
  output: {
    esModule: true,
    file: "dist/index.js",
    format: "es",
  },
  plugins: [
    commonjs(),
    nodeResolve({ preferBuiltins: true }),
    license({
      thirdParty: {
        allow: {
          test: "(MIT OR Apache-2.0 OR ISC OR BSD-2-Clause OR BSD-3-Clause OR 0BSD)",
          failOnUnlicensed: true,
          failOnViolation: true,
        },
        output: { file: "dist/licenses.txt" },
      },
    }),
  ],
};
