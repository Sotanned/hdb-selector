import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config. Next 16 dropped `next lint`, and ESLint 10 dropped `.eslintrc`,
 * so linting now runs through `eslint` directly (see the `lint` script).
 */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "data/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default config;
