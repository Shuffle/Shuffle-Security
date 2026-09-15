import { defineConfig } from 'tsup';
import path from 'node:path';

/**
 * Build config for publishing @shuffleio/shuffle-core to npm.
 *
 * Mirrors the Shuffle-MCPs config: host-provided UI peers are marked external,
 * while markdown utilities are bundled to avoid downstream webpack ESM and
 * source-map-loader issues in consuming apps.
 */
export default defineConfig({
  entry: ['index.tsx'],
  format: ['esm', 'cjs'],
  tsconfig: 'tsconfig.build.json',
  dts: {
    resolve: true,
    tsconfig: 'tsconfig.build.json',
  },
  sourcemap: false,
  clean: true,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    // Keep MUI as barrel externals so the emitted ESM does not reference
    // extensionless directory subpaths that webpack 5 rejects as fully specified.
    '@mui/material',
    '@mui/material/utils',
    '@mui/system',
    '@mui/system/RtlProvider',
    '@mui/system/createTheme',
    '@mui/system/styled',
    '@mui/icons-material',
    '@mui/x-data-grid',
    '@mui/x-date-pickers',
    '@mui/x-date-pickers/AdapterDayjs/index.js',
    /^@mui\/x-date-pickers/,
    '@emotion/react',
    '@emotion/styled',
    '@emotion/cache',
    'lucide-react',
    // '@/lib/router-compat' is rewritten to an external 'react-router-dom'
    // import at build time (see routerCompatExternal plugin below), so the
    // published bundle depends on a real peer instead of the unresolvable
    // source-only alias path. Keep both router packages external.
    'react-router-dom',
    'react-router',
    'react-ga4',
    'react-device-detect',
    'mui-chips-input',
    'react-toastify',
    'dayjs',
    /^dayjs\//,
    /^@shuffleio\//,
    /^@tanstack\//,
    /^@capacitor\//,
    /^firebase\//,
    'tailwind-merge',
    'clsx',
    'recharts',
    'date-fns',
    /^date-fns\//,
    'framer-motion',
    'html2canvas-pro',
    'jspdf',
  ],
  loader: {
    '.css': 'copy',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.svg': 'dataurl',
  },
  injectStyle: false,
  esbuildPlugins: [
    // Redirect the host-specific router shim to react-router-dom and keep it
    // external, so dist emits a plain `from "react-router-dom"` (no inlining,
    // no reliance on react-router dedup). The host app that consumes this
    // package provides react-router-dom (>=6) as a peer dependency.
    {
      name: 'router-compat-external',
      setup(build) {
        build.onResolve({ filter: /^@\/lib\/router-compat$/ }, () => ({
          path: 'react-router-dom',
          external: true,
        }));
      },
    },
    // Generic resolver for all `@/*` path aliases:
    // Resolves any `@/<path>` import (except `@/lib/router-compat` which is rewritten to react-router-dom)
    // to `<repo-root>/src/<path>`, matching Vite and tsconfig path alias behavior.
    {
      name: 'resolve-at-alias',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => {
          if (args.path === '@/lib/router-compat') {
            return undefined;
          }
          const subpath = args.path.replace(/^@\//, '');
          const srcDir = path.resolve(__dirname, '..');
          const target = path.resolve(srcDir, subpath);
          return build.resolve(target, {
            resolveDir: args.resolveDir,
            kind: args.kind,
          });
        });
      },
    },
    // Rewrite extensionless `@mui/x-date-pickers/Adapter*` imports to append `/index.js`
    // so downstream Webpack 5 consumers under strict ESM (fullySpecified) can resolve them.
    {
      name: 'mui-x-date-pickers-esm-rewrite',
      setup(build) {
        build.onResolve({ filter: /^@mui\/x-date-pickers\/Adapter[A-Za-z0-9]+$/ }, (args) => ({
          path: `${args.path}/index.js`,
          external: true,
        }));
      },
    },
  ],
  esbuildOptions(options) {
    options.alias = {
      ...(options.alias || {}),
      '@/Shuffle-Core': path.resolve(__dirname, '.'),
      '@/assets': path.resolve(__dirname, '../assets'),
      '@/Shuffle-MCPs': path.resolve(__dirname, '../Shuffle-MCPs'),
      '@': path.resolve(__dirname, '..'),
    };
  },
});
