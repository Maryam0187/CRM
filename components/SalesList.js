'use client';

import { useState, useEffect } from 'react';
import Table from './Table';
import DateFilter from './DateFilter';

export default function SalesList({ onClose }) {
  const [status, setStatus] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('');

  // Sample sales data
  const sampleSalesData = [
    {
      id: 1,
      status: 'Active',
      name: 'John Smith',
      landline: '555-0123',
      cell: '555-0124',
      date: '2024-01-20'
    },
    {
      id: 2,
      status: 'Pending',
      name: 'Sarah Johnson',
      landline: '555-0125',
      cell: '555-0126',
      date: '2024-01-19'
    },
    {
      id: 3,
      status: 'Completed',
      name: 'Mike Chen',
      landline: '555-0127',
      cell: '555-0128',
      date: '2024-01-18'
    },
    {
      id: 4,
      status: 'Active',
      name: 'Emily Davis',
      landline: '555-0129',
      cell: '555-0130',
      date: '2024-01-17'
    },
    {
      id: 5,
      status: 'Cancelled',
      name: 'David Wilson',
      landline: '555-0131',
      cell: '555-0132',
      date: '2024-01-16'
    },
    {
      id: 6,
      status: 'Active',
      name: 'Lisa Brown',
      landline: '555-0133',
      cell: '555-0134',
      date: '2024-01-15'
    },
    {
      id: 7,
      status: 'Pending',
      name: 'Robert Taylor',
      landline: '555-0135',
      cell: '555-0136',
      date: '2024-01-14'
    },
    {
      id: 8,
      status: 'Completed',
      name: 'Jennifer Lee',
      landline: '555-0137',
      cell: '555-0138',
      date: '2024-01-13'
    }
  ];

  useEffect(() => {
    loadSalesData();
  }, [currentPage, itemsPerPage, sortBy, sortOrder, status]);

  const loadSalesData = async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Filter data based on status
      let filteredData = sampleSalesData;
      if (status) {
        filteredData = sampleSalesData.filter(sale => 
          sale.status.toLowerCase() === status.toLowerCase()
        );
      }

      // Sort data
      if (sortBy && sortOrder) {
        filteredData.sort((a, b) => {
          const aVal = a[sortBy];
          const bVal = b[sortBy];
          if (sortOrder === 'ASC') {
            return aVal > bVal ? 1 : -1;
          } else {
            return aVal < bVal ? 1 : -1;
          }
        });
      }

      setSalesData(filteredData);
      setTotalRecords(filteredData.length);
    } catch (error) {
      console.error('Error loading sales data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (e) => {
    setStatus(e.target.value);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const clearStatus = () => {
    setStatus('');
    setCurrentPage(1);
  };

  const handleFilterChange = (filterValue) => {
    console.log('Date filter changed:', filterValue);
    // You can implement date filtering logic here
    setCurrentPage(1);
  };

  const handleRowClick = (row, index) => {
    console.log('Sale clicked:', row, 'Index:', index);
    // You can add navigation to edit sale or show details
  };

  const handleEdit = (saleId) => {
    console.log('Edit sale:', saleId);
    // Navigate to edit page or open edit modal
  };

  const handleAddCard = (saleId) => {
    console.log('Add card for sale:', saleId);
    // Open add card modal or navigate to add card page
  };

  const formatDate = (date) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString(undefined, options);
  };

  const columns = [
    {
      header: 'ID',
      key: 'id',
      className: 'font-medium text-gray-900'
    },
    {
      header: 'Status',
      key: 'status',
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          value === 'Active' ? 'bg-green-100 text-green-800' :
          value === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
          value === 'Completed' ? 'bg-blue-100 text-blue-800' :
          'bg-red-100 text-red-800'
        }`}>
          {value}
        </span>
      )
    },
    {
      header: 'Name',
      key: 'name',
      className: 'font-medium text-gray-900'
    },
    {
      header: 'Landline No',
      key: 'landline',
      className: 'text-gray-500'
    },
    {
      header: 'Cell No',
      key: 'cell',
      className: 'text-gray-500'
    },
    {
      header: 'Date',
      key: 'date',
      className: 'text-gray-500'
    },
    {
      header: 'Actions',
      key: 'actions',
      render: (value, row) => (
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(row.id);
            }}
            className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors duration-200"
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAddCard(row.id);
            }}
            className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-md transition-colors duration-200 ${
              row.id === 1 
                ? 'text-green-600 bg-green-50 cursor-not-allowed opacity-50' 
                : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
            }`}
            disabled={row.id === 1}
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={row.id === 1 ? "M5 13l4 4L19 7" : "M12 6v6m0 0v6m0-6h6m-6 0H6"} />
            </svg>
            {row.id === 1 ? 'Card Added' : 'Add Card'}
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Sales Management</h2>
            <p className="text-sm text-gray-600 mt-1">
              Showing results for: {formatDate(currentDate)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Filters */}
          <div className="flex justify-end mb-6">
            <div className="min-w-[250px] flex gap-2">
              <select
                id="status"
                value={status}
                onChange={handleStatusChange}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
              >
                <option value="">Select Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button
                onClick={clearStatus}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 hover:bg-gray-100 transition-colors duration-200"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Date Filter */}
          <div className="mb-6 flex justify-center">
            <DateFilter onFilterChange={handleFilterChange} />
          </div>

          {/* Table */}
          <div className="mb-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Loading sales data...</span>
              </div>
            ) : (
              <Table
                data={salesData}
                columns={columns}
                itemsPerPage={itemsPerPage}
                onRowClick={handleRowClick}
                emptyMessage="No sales found for the selected criteria"
                showPagination={true}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            Total Records: {totalRecords}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors duration-200"
            >
              Close
            </button>
            <button
              onClick={() => console.log('Add new sale')}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors duration-200"
            >
              Add New Sale
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
