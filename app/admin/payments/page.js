'use client';

import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';
import { isAdmin, canProcessPayments, canViewAllSales, isAgent, isSupervisor, isProcessor, isVerification } from '../../../lib/roleUtils';
import PaymentView from '../../../components/PaymentView';

export default function PaymentsPage() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const saleId = searchParams.get('saleId');

  // Show loading while user is being fetched
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading authentication...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if user has permission to view payments (all authenticated users can view with appropriate masking)
  const hasPermission = user && user.role;

  if (!hasPermission) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <h3 className="mt-2 text-lg font-medium text-gray-900">Access Denied</h3>
              <p className="mt-1 text-sm text-gray-500">
                Please sign in to view payment information.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Require saleId parameter
  if (!saleId) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <h3 className="mt-2 text-lg font-medium text-gray-900">Sale ID Required</h3>
              <p className="mt-1 text-sm text-gray-500">
                Please select a sale to view its payment information.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PaymentView />
      </div>
    </div>
  );
}