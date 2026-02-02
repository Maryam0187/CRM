'use client';

import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import IVRCallHistory from '../../components/IVRCallHistory';

export default function IVRCallsPage() {
  const { user } = useAuth();

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header Section */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">IVR Call History</h1>
                <p className="mt-1 text-sm text-gray-600">
                  View all manual dial calls made through the IVR Dialer
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <IVRCallHistory limit={50} className="mb-6" />
        </div>
      </div>
    </ProtectedRoute>
  );
}
