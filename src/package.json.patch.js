/**
 * PATCH para o package.json existente — Etapa 5
 *
 * NÃO substitua o arquivo inteiro. Mescle as seções abaixo no seu package.json.
 *
 * 1. Acrescente ao bloco "scripts":
 *
 *   "lint":        "eslint src --ext .js,.jsx --max-warnings 0",
 *   "lint:fix":    "eslint src --ext .js,.jsx --fix",
 *   "format":      "prettier --write \"src/**\/*.{js,jsx,css}\"",
 *   "format:check":"prettier --check \"src/**\/*.{js,jsx,css}\"",
 *   "test":        "vitest run",
 *   "test:watch":  "vitest",
 *   "test:coverage":"vitest run --coverage"
 *
 * 2. Acrescente ao bloco "devDependencies":
 *
 *   "@eslint/js":              "^9.0.0",
 *   "eslint":                  "^9.0.0",
 *   "eslint-plugin-react":     "^7.37.0",
 *   "eslint-plugin-react-hooks":"^5.0.0",
 *   "eslint-plugin-react-refresh":"^0.4.0",
 *   "globals":                 "^15.0.0",
 *   "prettier":                "^3.3.0",
 *   "vitest":                  "^2.0.0",
 *   "@vitest/coverage-v8":     "^2.0.0",
 *   "jsdom":                   "^25.0.0",
 *   "@vitejs/plugin-react":    "^4.3.0"   (já deve existir)
 *
 * 3. Acrescente o bloco "engines" (top-level, ao lado de "name"):
 *
 *   "engines": {
 *     "node": ">=20"
 *   }
 *
 * ---
 * Exemplo de como o resultado final fica:
 */

// package.json (resultado mesclado — adapte à sua versão):
{
  "name": "veloso-2026",
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext .js,.jsx --max-warnings 0",
    "lint:fix": "eslint src --ext .js,.jsx --fix",
    "format": "prettier --write \"src/**/*.{js,jsx,css}\"",
    "format:check": "prettier --check \"src/**/*.{js,jsx,css}\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "firebase": "^10.x.x",
    "date-fns": "^3.x.x",
    "lucide-react": "^0.x.x",
    "react": "^18.x.x",
    "react-dom": "^18.x.x"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@vitest/coverage-v8": "^2.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-react": "^7.37.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.0",
    "globals": "^15.0.0",
    "jsdom": "^25.0.0",
    "prettier": "^3.3.0",
    "vite": "^6.x.x",
    "vitest": "^2.0.0"
  }
}
