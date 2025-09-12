'use client';

import { useAuth } from '../contexts/AuthContext';
import { 
  isAdmin, 
  isSupervisor, 
  isAgent, 
  isProcessor, 
  isVerification,
  canManageUsers,
  canProcessPayments,
  canVerifyData,
  getRoleDisplayName 
} from '../lib/roleUtils';

export default function RoleBasedNav() {
  const { user } = useAuth();

  if (!user) return null;

  const userRole = user.role;
  const roleDisplayName = getRoleDisplayName(userRole);

  return (
    <div className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Role Badge */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Logged in as:</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                userRole === 'admin' ? 'bg-red-100 text-red-800' :
                userRole === 'supervisor' ? 'bg-blue-100 text-blue-800' :
                userRole === 'agent' ? 'bg-green-100 text-green-800' :
                userRole === 'processor' ? 'bg-yellow-100 text-yellow-800' :
                userRole === 'verification' ? 'bg-purple-100 text-purple-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {roleDisplayName}
              </span>
            </div>
          </div>

          {/* Role-specific Actions */}
          <div className="flex items-center space-x-4">
            {canManageUsers(user) && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Management:</span>
                <button className="text-sm text-blue-600 hover:text-blue-800">
                  Manage Users
                </button>
                {isSupervisor(user) && (
                  <button className="text-sm text-blue-600 hover:text-blue-800">
                    Manage Agents
                  </button>
                )}
              </div>
            )}

            {canProcessPayments(user) && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Processing:</span>
                <button className="text-sm text-green-600 hover:text-green-800">
                  Process Payments
                </button>
              </div>
            )}

            {canVerifyData(user) && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Verification:</span>
                <button className="text-sm text-purple-600 hover:text-purple-800">
                  Verify Data
                </button>
              </div>
            )}

            {isAgent(user) && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Actions:</span>
                <button className="text-sm text-green-600 hover:text-green-800">
                  Make Calls
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Role-specific Quick Stats */}
        <div className="pb-4">
          {isAdmin(user) && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Admin Access:</span> Full system control and user management
            </div>
          )}
          
          {isSupervisor(user) && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Supervisor Access:</span> Manage agents and view team performance
            </div>
          )}
          
          {isAgent(user) && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Agent Access:</span> Manage your customers and sales
            </div>
          )}
          
          {isProcessor(user) && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Processor Access:</span> Process payments and financial transactions
            </div>
          )}
          
          {isVerification(user) && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Verification Access:</span> Verify customer data and documentation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
