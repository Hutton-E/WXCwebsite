# Repository Digest

Generated: 2026-09-12T15:50:14.483Z
Root: `WXC_Website`

## Directory Structure

```
WXC_Website/
├── public/
├── src/
│   ├── assets/
│   │   ├── fonts/
│   │   │   └── Acme-Regular.ttf
│   │   └── still_pictures/
│   │       ├── wartburg_drone_1.png
│   │       ├── wartburg_knights_logo_main.png
│   │       ├── wartburg_knights_logo.png
│   │       └── wartburg_logo.png
│   ├── components/
│   │   └── background.tsx
│   ├── pages/
│   │   ├── about.tsx
│   │   ├── error.tsx
│   │   ├── home.tsx
│   │   └── name_lookup.tsx
│   ├── App.css
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── .gitignore
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── README.md
├── repo-digest.md
├── repo-digest.mjs
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## File Contents

### `src/assets/fonts/Acme-Regular.ttf`

_(binary or excluded — contents not inlined)_

### `src/assets/still_pictures/wartburg_drone_1.png`

_(binary or excluded — contents not inlined)_

### `src/assets/still_pictures/wartburg_knights_logo_main.png`

_(binary or excluded — contents not inlined)_

### `src/assets/still_pictures/wartburg_knights_logo.png`

_(binary or excluded — contents not inlined)_

### `src/assets/still_pictures/wartburg_logo.png`

_(binary or excluded — contents not inlined)_

### `src/components/background.tsx`

```tsx
interface BackgroundProps {
  imageUrl: string;
  opacity: number;
}

function Background({ imageUrl, opacity }: BackgroundProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: -1,
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        opacity: opacity,
      }}
    />
  );
}

export default Background;

```

### `src/pages/about.tsx`

```tsx
function AboutInfo() {
  return (
    <div>
      <h1>More info here</h1>
    </div>
  );
}
export default AboutInfo;

```

### `src/pages/error.tsx`

```tsx
function ErrorPage() {
  return (
    <div>
      <h1>Error</h1>
    </div>
  );
}
export default ErrorPage;

```

### `src/pages/home.tsx`

```tsx
import wartburgLogo from "../assets/still_pictures/wartburg_knights_logo_main.png";

function Home() {
  return (
    <div className="hero">
      <img src={wartburgLogo} className="framework" alt="Wartburg Logo" />
      <h1 className="welcome-text">Welcome, what do you want to do today?</h1>
    </div>
  );
}

export default Home;

```

### `src/pages/name_lookup.tsx`

```tsx
function Lookup() {
  return (
    <div>
      <h1>Look up your name</h1>
    </div>
  );
}
export default Lookup;

```

### `src/App.css`

```css
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.framework {
  max-width: 200px;
  height: auto;
}

.acme-regular {
  font-family: "Acme", sans-serif;
  font-weight: 300px;
  font-style: normal;
}

```

### `src/App.tsx`

```tsx
import wartburgDroneShot from "./assets/still_pictures/wartburg_drone_1.png";
import Background from "./components/background";
import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/home";
import Lookup from "./pages/name_lookup";
import ErrorPage from "./pages/error";
import AboutInfo from "./pages/about";

function App() {
  return (
    <BrowserRouter>
      <Background imageUrl={wartburgDroneShot} opacity={0.7} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lookup" element={<Lookup />} />
        <Route path="*" element={<ErrorPage />} />
        <Route path="/about" element={<AboutInfo />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

```

### `src/index.css`

```css
:root {
  --text: #6b6375;
  --text-h: #08060d;
  --bg: #fff;
  --border: #e5e4e7;
  --code-bg: #f4f3ec;
  --accent: #aa3bff;
  --accent-bg: rgba(170, 59, 255, 0.1);
  --accent-border: rgba(170, 59, 255, 0.5);
  --social-bg: rgba(244, 243, 236, 0.5);
  --shadow:
    rgba(0, 0, 0, 0.1) 0 10px 15px -3px, rgba(0, 0, 0, 0.05) 0 4px 6px -2px;

  --sans: system-ui, "Segoe UI", Roboto, sans-serif;
  --heading: system-ui, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, Consolas, monospace;

  font: 18px/145% var(--sans);
  letter-spacing: 0.18px;
  color-scheme: light dark;
  color: var(--text);
  background: var(--bg);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  @media (max-width: 1024px) {
    font-size: 16px;
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    --text: #9ca3af;
    --text-h: #f3f4f6;
    --bg: #16171d;
    --border: #2e303a;
    --code-bg: #1f2028;
    --accent: #c084fc;
    --accent-bg: rgba(192, 132, 252, 0.15);
    --accent-border: rgba(192, 132, 252, 0.5);
    --social-bg: rgba(47, 48, 58, 0.5);
    --shadow:
      rgba(0, 0, 0, 0.4) 0 10px 15px -3px, rgba(0, 0, 0, 0.25) 0 4px 6px -2px;
  }

  #social .button-icon {
    filter: invert(1) brightness(2);
  }
}

#root {
  width: 100%;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

body {
  margin: 0;
}

h1,
h2 {
  font-family: var(--heading);
  font-weight: 500;
  color: var(--text-h);
}

h1 {
  font-size: 56px;
  letter-spacing: -1.68px;
  margin: 32px 0;
  @media (max-width: 1024px) {
    font-size: 36px;
    margin: 20px 0;
  }
}
h2 {
  font-size: 24px;
  line-height: 118%;
  letter-spacing: -0.24px;
  margin: 0 0 8px;
  @media (max-width: 1024px) {
    font-size: 20px;
  }
}
p {
  margin: 0;
}

code,
.counter {
  font-family: var(--mono);
  display: inline-flex;
  border-radius: 4px;
  color: var(--text-h);
}

code {
  font-size: 15px;
  line-height: 135%;
  padding: 4px 8px;
  background: var(--code-bg);
}

```

### `src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

```

### `.gitignore`

```
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

```

### `eslint.config.js`

```javascript
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])

```

### `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Acme&display=swap"
      rel="stylesheet"
    />
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>my-lookup-app</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

```

### `package-lock.json`

_(binary or excluded — contents not inlined)_

### `package.json`

```json
{
  "name": "my-lookup-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "digest": "node repo-digest.mjs"
  },
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router-dom": "^7.18.3"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "eslint": "^10.10.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.6",
    "globals": "^17.12.0",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.69.0",
    "vite": "^8.3.0"
  }
}

```

### `README.md`

```markdown
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

```

### `repo-digest.md`

```markdown
# Repository Digest

Generated: 2026-09-12T15:43:51.813Z
Root: `WXC_Website`

## Directory Structure

```
WXC_Website/
├── public/
├── src/
│   ├── assets/
│   │   └── still_pictures/
│   │       ├── wartburg_drone_1.png
│   │       ├── wartburg_knights_logo_main.png
│   │       ├── wartburg_knights_logo.png
│   │       └── wartburg_logo.png
│   ├── components/
│   │   └── background.tsx
│   ├── pages/
│   │   ├── about.tsx
│   │   ├── error.tsx
│   │   ├── home.tsx
│   │   └── name_lookup.tsx
│   ├── App.css
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── .gitignore
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── README.md
├── repo-digest.mjs
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## File Contents

### `src/assets/still_pictures/wartburg_drone_1.png`

_(binary or excluded — contents not inlined)_

### `src/assets/still_pictures/wartburg_knights_logo_main.png`

_(binary or excluded — contents not inlined)_

### `src/assets/still_pictures/wartburg_knights_logo.png`

_(binary or excluded — contents not inlined)_

### `src/assets/still_pictures/wartburg_logo.png`

_(binary or excluded — contents not inlined)_

### `src/components/background.tsx`

```tsx
interface BackgroundProps {
  imageUrl: string;
  opacity: number;
}

function Background({ imageUrl, opacity }: BackgroundProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: -1,
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        opacity: opacity,
      }}
    />
  );
}

export default Background;

```

### `src/pages/about.tsx`

```tsx
// src/pages/Lookup.tsx
function aboutInfo() {
  return (
    <div>
      <h1>More info here</h1>
    </div>
  );
}
export default aboutInfo;

```

### `src/pages/error.tsx`

```tsx
// src/pages/Lookup.tsx
function errorPage() {
  return (
    <div>
      <h1>Error</h1>
    </div>
  );
}
export default errorPage;

```

### `src/pages/home.tsx`

```tsx
import wartburgLogo from "../assets/still_pictures/wartburg_logo.png";

function Home() {
  return (
    <div className="hero">
      <img src={wartburgLogo} className="framework" alt="Wartburg Logo" />
      <h1 className="welcome-text">Welcome, what do you want to do today?</h1>
    </div>
  );
}

export default Home;

```

### `src/pages/name_lookup.tsx`

```tsx
// src/pages/Lookup.tsx
function Lookup() {
  return (
    <div>
      <h1>Look up your name</h1>
    </div>
  );
}
export default Lookup;

```

### `src/App.css`

```css
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.framework {
  max-width: 200px;
  height: auto;
}

.acme-regular {
  font-family: "Acme", sans-serif;
  font-weight: 300px;
  font-style: normal;
}

```

### `src/App.tsx`

```tsx
import wartburgDroneShot from "./assets/still_pictures/wartburg_drone_1.png";
import Background from "./components/background";
import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/home";
import Lookup from "./pages/name_lookup";
import { errorPage } from "./pages/error";

function App() {
  return (
    <BrowserRouter>
    <Background imageUrl={wartburgDroneShot} opacity = {0.7} />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lookup" element={<Lookup />} />
      <Route path="/error" element={<errorPage />} />
      <Route path="/about" element={<aboutInfo />} />
    </Routes>
    </BrowserRouter>
  )
}

export default App;

```

### `src/index.css`

```css
:root {
  --text: #6b6375;
  --text-h: #08060d;
  --bg: #fff;
  --border: #e5e4e7;
  --code-bg: #f4f3ec;
  --accent: #aa3bff;
  --accent-bg: rgba(170, 59, 255, 0.1);
  --accent-border: rgba(170, 59, 255, 0.5);
  --social-bg: rgba(244, 243, 236, 0.5);
  --shadow:
    rgba(0, 0, 0, 0.1) 0 10px 15px -3px, rgba(0, 0, 0, 0.05) 0 4px 6px -2px;

  --sans: system-ui, "Segoe UI", Roboto, sans-serif;
  --heading: system-ui, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, Consolas, monospace;

  font: 18px/145% var(--sans);
  letter-spacing: 0.18px;
  color-scheme: light dark;
  color: var(--text);
  background: var(--bg);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  @media (max-width: 1024px) {
    font-size: 16px;
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    --text: #9ca3af;
    --text-h: #f3f4f6;
    --bg: #16171d;
    --border: #2e303a;
    --code-bg: #1f2028;
    --accent: #c084fc;
    --accent-bg: rgba(192, 132, 252, 0.15);
    --accent-border: rgba(192, 132, 252, 0.5);
    --social-bg: rgba(47, 48, 58, 0.5);
    --shadow:
      rgba(0, 0, 0, 0.4) 0 10px 15px -3px, rgba(0, 0, 0, 0.25) 0 4px 6px -2px;
  }

  #social .button-icon {
    filter: invert(1) brightness(2);
  }
}

#root {
  width: 100%;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

body {
  margin: 0;
}

h1,
h2 {
  font-family: var(--heading);
  font-weight: 500;
  color: var(--text-h);
}

h1 {
  font-size: 56px;
  letter-spacing: -1.68px;
  margin: 32px 0;
  @media (max-width: 1024px) {
    font-size: 36px;
    margin: 20px 0;
  }
}
h2 {
  font-size: 24px;
  line-height: 118%;
  letter-spacing: -0.24px;
  margin: 0 0 8px;
  @media (max-width: 1024px) {
    font-size: 20px;
  }
}
p {
  margin: 0;
}

code,
.counter {
  font-family: var(--mono);
  display: inline-flex;
  border-radius: 4px;
  color: var(--text-h);
}

code {
  font-size: 15px;
  line-height: 135%;
  padding: 4px 8px;
  background: var(--code-bg);
}

```

### `src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

```

### `.gitignore`

```
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

```

### `eslint.config.js`

```javascript
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])

```

### `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Acme&display=swap"
      rel="stylesheet"
    />
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>my-lookup-app</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

```

### `package-lock.json`

_(binary or excluded — contents not inlined)_

### `package.json`

```json
{
  "name": "my-lookup-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router-dom": "^7.18.3"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "eslint": "^10.10.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.6",
    "globals": "^17.12.0",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.69.0",
    "vite": "^8.3.0"
  }
}

```

### `README.md`

```markdown
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

```

### `repo-digest.mjs`

```javascript
#!/usr/bin/env node
/**
 * repo-digest.mjs
 *
 * Walks the current repo and writes a single markdown file (repo-digest.md)
 * containing:
 *   1. A directory tree
 *   2. The full contents of every text/source file, clearly delimited
 *
 * This format is designed to be pasted into or fed to an LLM/agent so it can
 * understand the whole project structure and code in one shot.
 *
 * Usage:
 *   node repo-digest.mjs
 *   node repo-digest.mjs --root ./my-project --out ./digest.md
 */

import fs from "node:fs";
import path from "node:path";

// ---------- CONFIG ----------

// Directories to skip entirely (build artifacts, deps, vcs internals, etc.)
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".vite",
  "coverage",
  ".turbo",
  ".vscode",
  ".idea",
]);

// File extensions considered "binary" / not useful to dump as text.
// Their presence is still noted in the tree, just not inlined.
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".mp3",
  ".wav",
  ".ogg",
  ".mp4",
  ".mov",
  ".webm",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".pdf",
  ".zip",
  ".gz",
  ".lock", // package-lock.json is text but huge/noisy; still skip contents
]);

// Specific filenames to skip contents for (still shown in tree)
const SKIP_CONTENT_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

// Max file size (bytes) to inline before truncating
const MAX_FILE_BYTES = 100_000;

// ---------- ARG PARSING ----------

function parseArgs(argv) {
  const args = { root: ".", out: "repo-digest.md" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") args.root = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

const { root, out } = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(root);
const OUT_PATH = path.resolve(out);

// ---------- .gitignore (basic support) ----------

function loadGitignorePatterns(rootDir) {
  const gitignorePath = path.join(rootDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return [];
  return fs
    .readFileSync(gitignorePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/\/$/, "")); // strip trailing slash
}

const gitignorePatterns = loadGitignorePatterns(ROOT);

function isGitignored(relativePath) {
  const base = path.basename(relativePath);
  return gitignorePatterns.some((pattern) => {
    // very basic matching: exact name, or simple * wildcard
    if (pattern === base || pattern === relativePath) return true;
    if (pattern.includes("*")) {
      const regex = new RegExp(
        "^" +
          pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") +
          "$",
      );
      return regex.test(base) || regex.test(relativePath);
    }
    return false;
  });
}

// ---------- WALK ----------

function walk(dir, relativeTo) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
    // directories first, then alphabetical
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const nodes = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path
      .relative(relativeTo, fullPath)
      .split(path.sep)
      .join("/");

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      if (isGitignored(relPath)) continue;
      const children = walk(fullPath, relativeTo);
      nodes.push({ type: "dir", name: entry.name, relPath, children });
    } else {
      if (isGitignored(relPath)) continue;
      nodes.push({ type: "file", name: entry.name, relPath, fullPath });
    }
  }
  return nodes;
}

// ---------- RENDER TREE ----------

function renderTree(nodes, prefix = "") {
  let output = "";
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    output +=
      prefix + connector + node.name + (node.type === "dir" ? "/" : "") + "\n";
    if (node.type === "dir") {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      output += renderTree(node.children, childPrefix);
    }
  });
  return output;
}

// ---------- COLLECT FILES (flat list, in tree order) ----------

function collectFiles(nodes, list = []) {
  for (const node of nodes) {
    if (node.type === "file") list.push(node);
    else collectFiles(node.children, list);
  }
  return list;
}

function langFromExt(ext) {
  const map = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".json": "json",
    ".md": "markdown",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".py": "python",
    ".sh": "bash",
    ".ps1": "powershell",
  };
  return map[ext] || "";
}

// ---------- MAIN ----------

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`Root path does not exist: ${ROOT}`);
    process.exit(1);
  }

  const tree = walk(ROOT, ROOT);
  const treeText = renderTree(tree);
  const files = collectFiles(tree);

  const sections = [];
  sections.push(`# Repository Digest\n`);
  sections.push(`Generated: ${new Date().toISOString()}`);
  sections.push(`Root: \`${path.basename(ROOT)}\`\n`);
  sections.push(`## Directory Structure\n`);
  sections.push("```\n" + path.basename(ROOT) + "/\n" + treeText + "```\n");
  sections.push(`## File Contents\n`);

  let includedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();

    if (BINARY_EXTENSIONS.has(ext) || SKIP_CONTENT_FILES.has(file.name)) {
      sections.push(
        `### \`${file.relPath}\`\n\n_(binary or excluded — contents not inlined)_\n`,
      );
      skippedCount++;
      continue;
    }

    let content;
    try {
      const stat = fs.statSync(file.fullPath);
      if (stat.size > MAX_FILE_BYTES) {
        content = fs
          .readFileSync(file.fullPath, "utf8")
          .slice(0, MAX_FILE_BYTES);
        content += `\n\n... [truncated, file is ${stat.size} bytes, showing first ${MAX_FILE_BYTES}] ...`;
      } else {
        content = fs.readFileSync(file.fullPath, "utf8");
      }
    } catch (err) {
      sections.push(
        `### \`${file.relPath}\`\n\n_(could not read file: ${err.message})_\n`,
      );
      skippedCount++;
      continue;
    }

    const lang = langFromExt(ext);
    sections.push(
      `### \`${file.relPath}\`\n\n\`\`\`${lang}\n${content}\n\`\`\`\n`,
    );
    includedCount++;
  }

  sections.push(
    `\n---\n_Digest complete: ${includedCount} files inlined, ${skippedCount} skipped (binary/excluded)._`,
  );

  fs.writeFileSync(OUT_PATH, sections.join("\n"), "utf8");
  console.log(`✅ Wrote digest to ${OUT_PATH}`);
  console.log(`   Files inlined: ${includedCount}`);
  console.log(`   Files skipped: ${skippedCount}`);
}

main();

```

### `tsconfig.app.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}

```

### `tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}

```

### `tsconfig.node.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,

    /* Bundler mode */
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}

```

### `vite.config.ts`

```typescript
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})

```


---
_Digest complete: 19 files inlined, 5 skipped (binary/excluded)._
```

### `repo-digest.mjs`

```javascript
#!/usr/bin/env node
/**
 * repo-digest.mjs
 *
 * Walks the current repo and writes a single markdown file (repo-digest.md)
 * containing:
 *   1. A directory tree
 *   2. The full contents of every text/source file, clearly delimited
 *
 * This format is designed to be pasted into or fed to an LLM/agent so it can
 * understand the whole project structure and code in one shot.
 *
 * Usage:
 *   node repo-digest.mjs
 *   node repo-digest.mjs --root ./my-project --out ./digest.md
 */

import fs from "node:fs";
import path from "node:path";

// ---------- CONFIG ----------

// Directories to skip entirely (build artifacts, deps, vcs internals, etc.)
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".vite",
  "coverage",
  ".turbo",
  ".vscode",
  ".idea",
]);

// File extensions considered "binary" / not useful to dump as text.
// Their presence is still noted in the tree, just not inlined.
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".mp3",
  ".wav",
  ".ogg",
  ".mp4",
  ".mov",
  ".webm",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".pdf",
  ".zip",
  ".gz",
  ".lock", // package-lock.json is text but huge/noisy; still skip contents
]);

// Specific filenames to skip contents for (still shown in tree)
const SKIP_CONTENT_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

// Max file size (bytes) to inline before truncating
const MAX_FILE_BYTES = 100_000;

// ---------- ARG PARSING ----------

function parseArgs(argv) {
  const args = { root: ".", out: "repo-digest.md" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") args.root = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

const { root, out } = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(root);
const OUT_PATH = path.resolve(out);

// ---------- .gitignore (basic support) ----------

function loadGitignorePatterns(rootDir) {
  const gitignorePath = path.join(rootDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return [];
  return fs
    .readFileSync(gitignorePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/\/$/, "")); // strip trailing slash
}

const gitignorePatterns = loadGitignorePatterns(ROOT);

function isGitignored(relativePath) {
  const base = path.basename(relativePath);
  return gitignorePatterns.some((pattern) => {
    // very basic matching: exact name, or simple * wildcard
    if (pattern === base || pattern === relativePath) return true;
    if (pattern.includes("*")) {
      const regex = new RegExp(
        "^" +
          pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") +
          "$",
      );
      return regex.test(base) || regex.test(relativePath);
    }
    return false;
  });
}

// ---------- WALK ----------

function walk(dir, relativeTo) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
    // directories first, then alphabetical
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const nodes = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path
      .relative(relativeTo, fullPath)
      .split(path.sep)
      .join("/");

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      if (isGitignored(relPath)) continue;
      const children = walk(fullPath, relativeTo);
      nodes.push({ type: "dir", name: entry.name, relPath, children });
    } else {
      if (isGitignored(relPath)) continue;
      nodes.push({ type: "file", name: entry.name, relPath, fullPath });
    }
  }
  return nodes;
}

// ---------- RENDER TREE ----------

function renderTree(nodes, prefix = "") {
  let output = "";
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    output +=
      prefix + connector + node.name + (node.type === "dir" ? "/" : "") + "\n";
    if (node.type === "dir") {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      output += renderTree(node.children, childPrefix);
    }
  });
  return output;
}

// ---------- COLLECT FILES (flat list, in tree order) ----------

function collectFiles(nodes, list = []) {
  for (const node of nodes) {
    if (node.type === "file") list.push(node);
    else collectFiles(node.children, list);
  }
  return list;
}

function langFromExt(ext) {
  const map = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".json": "json",
    ".md": "markdown",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".py": "python",
    ".sh": "bash",
    ".ps1": "powershell",
  };
  return map[ext] || "";
}

// ---------- MAIN ----------

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`Root path does not exist: ${ROOT}`);
    process.exit(1);
  }

  const tree = walk(ROOT, ROOT);
  const treeText = renderTree(tree);
  const files = collectFiles(tree);

  const sections = [];
  sections.push(`# Repository Digest\n`);
  sections.push(`Generated: ${new Date().toISOString()}`);
  sections.push(`Root: \`${path.basename(ROOT)}\`\n`);
  sections.push(`## Directory Structure\n`);
  sections.push("```\n" + path.basename(ROOT) + "/\n" + treeText + "```\n");
  sections.push(`## File Contents\n`);

  let includedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();

    if (BINARY_EXTENSIONS.has(ext) || SKIP_CONTENT_FILES.has(file.name)) {
      sections.push(
        `### \`${file.relPath}\`\n\n_(binary or excluded — contents not inlined)_\n`,
      );
      skippedCount++;
      continue;
    }

    let content;
    try {
      const stat = fs.statSync(file.fullPath);
      if (stat.size > MAX_FILE_BYTES) {
        content = fs
          .readFileSync(file.fullPath, "utf8")
          .slice(0, MAX_FILE_BYTES);
        content += `\n\n... [truncated, file is ${stat.size} bytes, showing first ${MAX_FILE_BYTES}] ...`;
      } else {
        content = fs.readFileSync(file.fullPath, "utf8");
      }
    } catch (err) {
      sections.push(
        `### \`${file.relPath}\`\n\n_(could not read file: ${err.message})_\n`,
      );
      skippedCount++;
      continue;
    }

    const lang = langFromExt(ext);
    sections.push(
      `### \`${file.relPath}\`\n\n\`\`\`${lang}\n${content}\n\`\`\`\n`,
    );
    includedCount++;
  }

  sections.push(
    `\n---\n_Digest complete: ${includedCount} files inlined, ${skippedCount} skipped (binary/excluded)._`,
  );

  fs.writeFileSync(OUT_PATH, sections.join("\n"), "utf8");
  console.log(`✅ Wrote digest to ${OUT_PATH}`);
  console.log(`   Files inlined: ${includedCount}`);
  console.log(`   Files skipped: ${skippedCount}`);
}

main();

```

### `tsconfig.app.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}

```

### `tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}

```

### `tsconfig.node.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,

    /* Bundler mode */
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}

```

### `vite.config.ts`

```typescript
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})

```


---
_Digest complete: 20 files inlined, 6 skipped (binary/excluded)._