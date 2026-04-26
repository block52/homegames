import tseslint from "typescript-eslint";

export default [
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: "module",
                project: "./tsconfig.json"
            }
        },
        plugins: {
            "@typescript-eslint": tseslint.plugin
        },
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_"
                }
            ],
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/no-non-null-assertion": "warn",
            "no-console": "off"
        }
    },
    {
        ignores: ["node_modules/", "dist/", "*.js", "*.mjs"]
    }
];
