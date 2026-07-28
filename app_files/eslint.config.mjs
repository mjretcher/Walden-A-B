import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url))
});

const eslintConfig = [
  { ignores: ["next-env.d.ts", ".next/**", "node_modules/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // Underscore prefix is the codebase's existing signal for a parameter
      // that is deliberately unused -- e.g. rosters' attendanceColumnsFor(_period),
      // which kept its signature when the calendar-derived column count was
      // dropped in favour of a fixed default plus manual override. Flagging
      // those as errors would push toward deleting a signature that callers
      // still rely on, so allow the convention explicitly.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],
      "@typescript-eslint/ban-ts-comment": "off",
      "@next/next/no-img-element": "off"
    }
  }
];

export default eslintConfig;
