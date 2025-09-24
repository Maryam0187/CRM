'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient.js';

export default function ReceiverManagement() {
  const { user } = useAuth();
  const [receivers, setReceivers] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingReceiver, setEditingReceiver] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    carrierId: '',
    status: 'active'
  });
  
  // Ref to prevent duplicate API calls
  const isFetchingRef = useRef(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [paginationInfo, setPaginationInfo] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 10,
    hasNextPage: false,
    hasPrevPage: false
  });

  // Fetch carriers for dropdown
  const fetchCarriers = async () => {
    try {
      const response = await apiClient.get('/api/carriers?limit=100');
      const result = await response.json();
      if (result.success) {
        setCarriers(result.data);
      }
    } catch (err) {
      console.error('Error fetching carriers:', err);
    }
  };

  // Fetch receivers data
  const fetchReceivers = async (page = currentPage, limit = itemsPerPage) => {
    // Prevent duplicate API calls
    if (isFetchingRef.current) {
      return;
    }
    
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.get(`/api/receivers?page=${page}&limit=${limit}`);
      const result = await response.json();
      
      if (result.success) {
        setReceivers(result.data);
        if (result.pagination) {
          setPaginationInfo(result.pagination);
        }
      } else {
        setError(result.message || 'Failed to fetch receivers');
      }
    } catch (err) {
      setError('Network error: Unable to fetch receivers');
      console.error('Error fetching receivers:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchReceivers();
    fetchCarriers();
  }, []);

  // Pagination handlers
  const handlePageChange = (page) => {
    setCurrentPage(page);
    fetchReceivers(page, itemsPerPage);
  };

  const handleItemsPerPageChange = (newLimit) => {
    setItemsPerPage(newLimit);
    setCurrentPage(1);
    fetchReceivers(1, newLimit);
  };

  const handlePreviousPage = () => {
    if (paginationInfo.hasPrevPage) {
      handlePageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (paginationInfo.hasNextPage) {
      handlePageChange(currentPage + 1);
    }
  };

  // Modal handlers
  const openModal = (receiver = null) => {
    setEditingReceiver(receiver);
    setFormData({
      name: receiver?.name || '',
      carrierId: receiver?.carrierId || '',
      status: receiver?.status || 'active'
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingReceiver(null);
    setFormData({
      name: '',
      carrierId: '',
      status: 'active'
    });
  };

  // Form handlers
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = editingReceiver 
        ? `/api/receivers/${editingReceiver.id}`
        : '/api/receivers';
      
      const method = editingReceiver ? 'PUT' : 'POST';
      
      const response = await apiClient[method.toLowerCase()](url, formData);
      const result = await response.json();
      
      if (result.success) {
        closeModal();
        fetchReceivers(currentPage, itemsPerPage);
      } else {
        setError(result.message || 'Failed to save receiver');
      }
    } catch (err) {
      setError('Network error: Unable to save receiver');
      console.error('Error saving receiver:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (receiverId) => {
    if (!confirm('Are you sure you want to delete this receiver?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.delete(`/api/receivers/${receiverId}`);
      const result = await response.json();
      
      if (result.success) {
        fetchReceivers(currentPage, itemsPerPage);
      } else {
        setError(result.message || 'Failed to delete receiver');
      }
    } catch (err) {
      setError('Network error: Unable to delete receiver');
      console.error('Error deleting receiver:', err);
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Receiver Management</h1>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                Total Receivers: {paginationInfo.totalItems}
              </div>
              <button
                onClick={() => openModal()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Add New Receiver
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Receivers Table */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Receiver Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Carrier
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created By
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {receivers.map((receiver) => (
                      <tr key={receiver.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                                <span className="text-sm font-medium text-green-600">
                                  {receiver.name?.charAt(0) || 'R'}
                                </span>
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {receiver.name}
                              </div>
                              <div className="text-sm text-gray-500">
                                ID: {receiver.id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {receiver.carrier?.name || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-500">
                            Carrier ID: {receiver.carrierId}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            receiver.status === 'active' 
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {receiver.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {receiver.creator ? `${receiver.creator.firstName} ${receiver.creator.lastName}` : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(receiver.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => openModal(receiver)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(receiver.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {paginationInfo.totalPages > 1 && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Items per page selector */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Show:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}
                    disabled={loading}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span className="text-sm text-gray-700">per page</span>
                </div>

                {/* Pagination info */}
                <div className="text-sm text-gray-700">
                  Showing {((paginationInfo.currentPage - 1) * paginationInfo.itemsPerPage) + 1} to{' '}
                  {Math.min(paginationInfo.currentPage * paginationInfo.itemsPerPage, paginationInfo.totalItems)} of{' '}
                  {paginationInfo.totalItems} results
                </div>

                {/* Pagination buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePreviousPage}
                    disabled={!paginationInfo.hasPrevPage || loading}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  {/* Page numbers */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, paginationInfo.totalPages) }, (_, i) => {
                      let pageNum;
                      if (paginationInfo.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (paginationInfo.currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (paginationInfo.currentPage >= paginationInfo.totalPages - 2) {
                        pageNum = paginationInfo.totalPages - 4 + i;
                      } else {
                        pageNum = paginationInfo.currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          disabled={loading}
                          className={`px-3 py-2 text-sm font-medium rounded-md ${
                            pageNum === paginationInfo.currentPage
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={handleNextPage}
                    disabled={!paginationInfo.hasNextPage || loading}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingReceiver ? 'Edit Receiver' : 'Add New Receiver'}
              </h3>
              
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Receiver Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter receiver name"
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="carrierId" className="block text-sm font-medium text-gray-700 mb-2">
                    Carrier
                  </label>
                  <select
                    id="carrierId"
                    name="carrierId"
                    value={formData.carrierId}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a Carrier</option>
                    {carriers.map((carrier) => (
                      <option key={carrier.id} value={carrier.id}>
                        {carrier.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : (editingReceiver ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
