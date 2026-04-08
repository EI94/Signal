import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@signal/ui', '@signal/contracts'],
};

export default nextConfig;
