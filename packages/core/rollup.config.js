import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";
import dts from "rollup-plugin-dts";
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("./package.json", "utf8"));

export default [
    {
        input: "src/index.ts",
        output: [
            {
                file: "dist/index.cjs",
                format: "cjs",
                sourcemap: true
            },
            {
                file: "dist/index.js",
                format: "esm",
                sourcemap: true
            }
        ],
        plugins: [
            json(),
            resolve({
                preferBuiltins: true
            }),
            commonjs(),
            typescript({
                tsconfig: "./tsconfig.json",
                declaration: true,
                declarationDir: "./dist"
            })
        ],
        external: [
            "openpgp",
            "better-sqlite3",
            "path",
            "os",
            "fs",
            "crypto"
        ]
    },
    {
        input: "src/index.ts",
        output: [{ file: "dist/index.d.ts", format: "esm" }],
        plugins: [dts()],
        external: [/\.css$/, /better-sqlite3/]
    }
];
