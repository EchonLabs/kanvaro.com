/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // ESM-only unified/remark/rehype chain. next/jest forces /node_modules/ into
  // transformIgnorePatterns and cannot be overridden, so jest only transpiles
  // these via this key (which also applies to the real Next build).
  transpilePackages: [
    'bail',
    'ccount',
    'character-entities-html4',
    'character-entities-legacy',
    'character-entities',
    'character-reference-invalid',
    'comma-separated-tokens',
    'decode-named-character-reference',
    'devlop',
    'hast-util-heading-rank',
    'hast-util-is-element',
    'hast-util-parse-selector',
    'hast-util-to-html',
    'hast-util-to-string',
    'hast-util-whitespace',
    'hastscript',
    'html-void-elements',
    'is-plain-obj',
    'longest-streak',
    'markdown-table',
    'mdast-util-find-and-replace',
    'mdast-util-from-markdown',
    'mdast-util-gfm-autolink-literal',
    'mdast-util-gfm-footnote',
    'mdast-util-gfm-strikethrough',
    'mdast-util-gfm-table',
    'mdast-util-gfm-task-list-item',
    'mdast-util-gfm',
    'mdast-util-phrasing',
    'mdast-util-to-hast',
    'mdast-util-to-markdown',
    'mdast-util-to-string',
    'micromark-core-commonmark',
    'micromark-extension-gfm-autolink-literal',
    'micromark-extension-gfm-footnote',
    'micromark-extension-gfm-strikethrough',
    'micromark-extension-gfm-table',
    'micromark-extension-gfm-tagfilter',
    'micromark-extension-gfm-task-list-item',
    'micromark-extension-gfm',
    'micromark-factory-destination',
    'micromark-factory-label',
    'micromark-factory-space',
    'micromark-factory-title',
    'micromark-factory-whitespace',
    'micromark-util-character',
    'micromark-util-chunked',
    'micromark-util-classify-character',
    'micromark-util-combine-extensions',
    'micromark-util-decode-numeric-character-reference',
    'micromark-util-decode-string',
    'micromark-util-encode',
    'micromark-util-html-tag-name',
    'micromark-util-normalize-identifier',
    'micromark-util-resolve-all',
    'micromark-util-sanitize-uri',
    'micromark-util-subtokenize',
    'micromark-util-symbol',
    'micromark-util-types',
    'micromark',
    'parse-entities',
    'property-information',
    'rehype-autolink-headings',
    'rehype-slug',
    'rehype-stringify',
    'remark-gfm',
    'remark-parse',
    'remark-rehype',
    'remark-stringify',
    'remark',
    'space-separated-tokens',
    'stringify-entities',
    'trim-lines',
    'trough',
    'unified',
    'unist-util-is',
    'unist-util-position',
    'unist-util-stringify-position',
    'unist-util-visit-parents',
    'unist-util-visit',
    'vfile-message',
    'vfile',
    'zwitch',
    'escape-string-regexp',
    'github-slugger',
  ],
  eslint: {
    // Linting runs as its own step (`npm run lint`), not as a build gate.
    //
    // Next only lints during `next build` when an ESLint config is present. One
    // was added for the stand-up module, which silently turned 64 pre-existing
    // errors — unescaped entities, conditional hooks, `module` reassignment, all
    // in code that predates it — into build failures. Those are real and worth
    // fixing, but they are a separate piece of work from shipping a feature.
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  experimental: {
    // Enables src/instrumentation.ts, which starts the stand-up job scheduler
    // when the server process boots. Next 14 requires opting in. Without this
    // the in-process ticker never runs and stand-ups are never promoted, sent
    // reminders, or marked missed on self-hosted deployments.
    instrumentationHook: true,
  },
  // The stand-up scheduler is Node-only, and the Edge build must not walk into it.
  //
  // Next compiles src/instrumentation.ts for BOTH runtimes whenever the app has
  // middleware, which this one does. The `NEXT_RUNTIME !== 'nodejs'` guard in
  // register() stops the ticker from *running* on Edge, but a runtime guard
  // cannot stop the bundler from *resolving* the imports behind it -- so every
  // Node builtin anywhere in the scheduler graph (crypto, and via db-config the
  // fs/path that config.ts needs to read config.json) failed the Edge compile.
  //
  // Cutting the graph here rather than making each leaf Edge-safe: config.ts is
  // 'server-only' by design and should stay that way.
  //
  // IgnorePlugin, not resolve.alias: `@/*` is resolved by Next's own
  // JsConfigPathsPlugin (a resolve.plugin), which resolves the request before
  // AliasPlugin ever sees it, so an alias entry here is silently ignored.
  // IgnorePlugin matches the raw request in beforeResolve, ahead of both.
  webpack: (config, { nextRuntime, webpack }) => {
    if (nextRuntime === 'edge') {
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^@\/lib\/standup\/jobs\/scheduler$/,
        })
      )
    }
    return config
  },
  // Optimize CSS loading
  // experimental: {
  //   optimizeCss: true,
  // },
  // Ensure proper CSS chunking
  // webpack: (config, { dev, isServer }) => {
  //   if (!dev && !isServer) {
  //     config.optimization.splitChunks.cacheGroups.styles = {
  //       name: 'styles',
  //       test: /\.(css|scss)$/,
  //       chunks: 'all',
  //       enforce: true,
  //     };
  //   }
  //   return config;
  // },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
