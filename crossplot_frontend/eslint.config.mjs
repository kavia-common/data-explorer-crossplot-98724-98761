import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";

export default [
  { files: ["**/*.{js,mjs,cjs,jsx}"] },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      },
      // Define globals commonly available in CRA/browser+jest contexts to avoid no-undef false positives
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        // Node/CRA env injection
        process: "readonly",
        // Jest globals (tests)
        test: "readonly",
        expect: "readonly",
        describe: "readonly",
        it: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly"
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: true
    },
    settings: {
      react: { version: "detect" }
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "React|App" }],
      "eqeqeq": "error",
      "no-console": "warn"
    }
  },
  pluginJs.configs.recommended,
  {
    plugins: { react: pluginReact },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/jsx-uses-vars": "error"
    }
  }
];
