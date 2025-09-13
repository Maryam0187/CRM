/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Exclude PostgreSQL-specific files from Sequelize to avoid pg-hstore dependency
    config.resolve.alias = {
      ...config.resolve.alias,
      'pg-hstore': false,
    };
    
    return config;
  },
  serverExternalPackages: ['mysql2', 'sequelize'],
};

export default nextConfig;
