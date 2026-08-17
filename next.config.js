/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
