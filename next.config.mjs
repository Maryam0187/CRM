/** @type {import('next').NextConfig} */
const nextConfig = {
  // Production optimizations
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
  
  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Exclude PostgreSQL-specific files from Sequelize to avoid pg-hstore dependency
    config.resolve.alias = {
      ...config.resolve.alias,
      'pg-hstore': false,
    };
    
    // Production optimizations
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    return config;
  },
  
  // External packages for server
  serverExternalPackages: ['mysql2', 'sequelize', 'ws'],
  experimental: {
    // Keep lib/*.js as real Node modules so API routes share state with server.js
    serverComponentsExternalPackages: ['ws']
  },
  
  // Headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
