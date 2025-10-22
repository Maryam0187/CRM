import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function Footer() {
  const [deploymentInfo, setDeploymentInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDeploymentInfo = async () => {
      try {
        const response = await fetch('/api/deployment-info');
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setDeploymentInfo(data.data);
          }
        }
      } catch (error) {
        console.error('Error fetching deployment info:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDeploymentInfo();
  }, []);

  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Deployment Info */}
        {!isLoading && deploymentInfo && (
          <div className="mb-4 pb-4 border-b border-gray-700">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                <span className="text-gray-400 text-xs">
                  Deploy: <span className="text-green-400 font-mono">{deploymentInfo.shortDeploymentId}</span>
                </span>
                <span className="text-gray-400 text-xs">
                  Env: <span className="text-blue-400">{deploymentInfo.railwayEnvironment}</span>
                </span>
                <span className="text-gray-400 text-xs">
                  Region: <span className="text-yellow-400">{deploymentInfo.railwayRegion}</span>
                </span>
              </div>
              <div className="text-gray-500 text-xs">
                {new Date(deploymentInfo.deployedAt).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © 2024 Agent Portal. All rights reserved.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a
              href="#"
              className="text-gray-400 hover:text-white text-sm transition-colors duration-200"
            >
              Privacy
            </a>
            <a
              href="#"
              className="text-gray-400 hover:text-white text-sm transition-colors duration-200"
            >
              Terms
            </a>
            <a
              href="#"
              className="text-gray-400 hover:text-white text-sm transition-colors duration-200"
            >
              Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
