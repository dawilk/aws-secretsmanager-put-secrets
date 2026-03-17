// See: https://rollupjs.org/introduction/
// Matches actions/typescript-action: ESM output for node24 runner (package.json "type": "module").

import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const config = {
  input: "src/index.ts",
  output: {
    esModule: true,
    file: "dist/index.js",
    format: "es",
    sourcemap: true,
    inlineDynamicImports: true,
  },
  plugins: [
    json(),
    typescript(),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
  ],
};

export default config;
