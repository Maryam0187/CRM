'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../lib/apiClient.js';
import { formatAppointmentWithTimezones } from '../../components/StateSelector';

export default function AppointmentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [filteredAppointments, setFilteredAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming'); // 'all', 'today', 'upcoming', 'past', 'custom'
  const [customDateRange, setCustomDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    if (user) {
      fetchAgents();
      fetchAppointments();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      if (selectedAgent) {
        fetchAppointments(selectedAgent.id);
      } else {
        fetchAppointments();
      }
    }
  }, [selectedAgent, user]);

  useEffect(() => {
    applyFilters();
  }, [appointments, filter, customDateRange]);

  const fetchAgents = async () => {
    if (!user) {
      console.log('User not available yet, skipping fetchAgents');
      return;
    }
    
    if (user.role === 'supervisor' || user.role === 'admin') {
      try {
        console.log('Fetching agents for user role:', user.role);
        console.log('User ID:', user.id);
        
        if (user?.role === 'supervisor') {
          // For supervisor, get their supervised agents
          console.log('Fetching supervised agents...');
          try {
            const response = await apiClient.get(`/api/supervisor-agents?supervisorId=${user.id}`);
            const data = await response.json();
            
            console.log('Supervised agents response:', data);
            
            if (data.success && data.data && data.data.length > 0) {
              setAgents(data.data);
              console.log('Set agents for supervisor:', data.data);
            } else {
              // Fallback: get all users and filter by role
              console.log('No supervised agents found, falling back to all users...');
              const fallbackResponse = await apiClient.get('/api/users');
              const fallbackData = await fallbackResponse.json();
              
              if (fallbackData.success) {
                const agentUsers = fallbackData.data.filter(u => u.role === 'agent');
                setAgents(agentUsers);
                console.log('Set fallback agents for supervisor:', agentUsers);
              }
            }
          } catch (error) {
            console.error('Error fetching supervised agents, using fallback:', error);
            // Fallback: get all users and filter by role
            const fallbackResponse = await apiClient.get('/api/users');
            const fallbackData = await fallbackResponse.json();
            
            if (fallbackData.success) {
              const agentUsers = fallbackData.data.filter(u => u.role === 'agent');
              setAgents(agentUsers);
              console.log('Set fallback agents for supervisor:', agentUsers);
            }
          }
        } else if (user?.role === 'admin') {
          // For admin, get all agents
          console.log('Fetching all agents for admin...');
          const response = await apiClient.get('/api/users');
          const data = await response.json();
          
          console.log('All agents response:', data);
          
          if (data.success) {
            setAgents(data.data || []);
            console.log('Set agents for admin:', data.data);
          }
        }
      } catch (error) {
        console.error('Error fetching agents:', error);
      }
    }
  };

  const fetchAppointments = async (agentId = null) => {
    try {
      setLoading(true);
      
      // Build API URL based on user role
      let apiUrl = '/api/sales';
      const params = new URLSearchParams();
      
      if (user?.role === 'agent') {
        // Agent sees only their own appointments
        params.append('userId', user.id);
        params.append('userRole', 'agent');
      } else if (user?.role === 'supervisor') {
        // Supervisor sees their agents' appointments
        if (agentId) {
          params.append('userId', agentId);
          params.append('userRole', 'agent');
        } else {
          // Show supervisor's own appointments if no agent selected
          params.append('userId', user.id);
          params.append('userRole', 'supervisor_own');
        }
      } else if (user?.role === 'admin') {
        // Admin sees all appointments
        if (agentId) {
          params.append('userId', agentId);
          params.append('userRole', 'agent');
        }
        // If no agentId, show all appointments (default behavior)
      }
      
      if (params.toString()) {
        apiUrl += `?${params.toString()}`;
      }
      
      const response = await apiClient.get(apiUrl);
      const data = await response.json();
      
      if (data.success) {
        const sales = data.data || [];
        const appointmentsWithDates = sales.filter(sale => sale.appointmentDateTime);
        
        
        // Sort by appointment date
        const sortedAppointments = appointmentsWithDates.sort((a, b) => 
          new Date(a.appointmentDateTime) - new Date(b.appointmentDateTime)
        );
        
        setAppointments(sortedAppointments);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...appointments];

    if (filter === 'today') {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      filtered = appointments.filter(appointment => {
        const appointmentDate = new Date(appointment.appointmentDateTime);
        return appointmentDate >= todayStart && appointmentDate < todayEnd;
      });
    } else if (filter === 'upcoming') {
      const now = new Date();
      filtered = appointments.filter(appointment => {
        const appointmentDate = new Date(appointment.appointmentDateTime);
        return appointmentDate > now;
      });
    } else if (filter === 'past') {
      const now = new Date();
      filtered = appointments.filter(appointment => {
        const appointmentDate = new Date(appointment.appointmentDateTime);
        return appointmentDate < now;
      });
    } else if (filter === 'custom' && customDateRange.startDate && customDateRange.endDate) {
      const startDate = new Date(customDateRange.startDate);
      const endDate = new Date(customDateRange.endDate);
      endDate.setHours(23, 59, 59, 999); // Include entire end date
      
      filtered = appointments.filter(appointment => {
        const appointmentDate = new Date(appointment.appointmentDateTime);
        return appointmentDate >= startDate && appointmentDate <= endDate;
      });
    }


    setFilteredAppointments(filtered);
  };

  const formatAppointmentTime = (dateTime, customerState) => {
    const timezones = formatAppointmentWithTimezones(dateTime, customerState);
    if (!timezones) {
      const date = new Date(dateTime);
      return date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
    
    return (
      <div className="space-y-2">
        {timezones.customerTime && (
          <div>
            <span className="text-sm font-semibold text-gray-700">Customer Time ({timezones.customerTimezone}):</span>
            <div className="text-base text-gray-900">{timezones.customerTime}</div>
          </div>
        )}
        <div>
          <span className="text-sm font-semibold text-gray-700">Your Time ({timezones.pakistanTimezone}):</span>
          <div className="text-base text-gray-900">{timezones.pakistanTime}</div>
        </div>
      </div>
    );
  };

  const getAppointmentStatus = (dateTime) => {
    const now = new Date();
    const appointmentDate = new Date(dateTime);
    
    if (appointmentDate < now) {
      return { status: 'past', color: 'text-gray-500', bg: 'bg-gray-50' };
    } else if (appointmentDate.toDateString() === now.toDateString()) {
      return { status: 'today', color: 'text-blue-600', bg: 'bg-blue-50' };
    } else {
      return { status: 'upcoming', color: 'text-green-600', bg: 'bg-green-50' };
    }
  };

  const handleBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">📅 All Appointments</h1>
          <p className="text-gray-600 mt-2">
            Manage and view all customer appointments
          </p>
        </div>

        {/* Agent Selection for Supervisor and Admin */}
        {(user?.role === 'supervisor' || user?.role === 'admin') && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">
                {user?.role === 'supervisor' ? 'View Agent:' : 'View Agent:'}
              </label>
              <select
                value={selectedAgent?.id || ''}
                onChange={(e) => {
                  const agentId = e.target.value;
                  const agent = agents.find(a => a.id === parseInt(agentId));
                  setSelectedAgent(agent || null);
                }}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Agents</option>
                {agents.length > 0 ? (
                  agents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.first_name} {agent.last_name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>No agents found</option>
                )}
              </select>
              {/* Debug info */}
              <div className="text-xs text-gray-500">
                Agents loaded: {agents.length}
              </div>
              {selectedAgent && (
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="text-gray-500 hover:text-gray-700 text-sm px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Clear
                </button>
              )}
            </div>
            {selectedAgent && (
              <p className="text-sm text-gray-600 mt-2">
                Showing appointments for: <span className="font-medium">{selectedAgent.firstName} {selectedAgent.lastName}</span>
              </p>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Filter:</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="upcoming">Upcoming Appointments</option>
                <option value="all">All Appointments</option>
                <option value="today">Today Only</option>
                <option value="past">Past Appointments</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>


            {filter === 'custom' && (
              <div className="flex items-center space-x-4">
                <div>
                  <label className="text-sm text-gray-600">From:</label>
                  <input
                    type="date"
                    value={customDateRange.startDate}
                    onChange={(e) => setCustomDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                    className="ml-2 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">To:</label>
                  <input
                    type="date"
                    value={customDateRange.endDate}
                    onChange={(e) => setCustomDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                    className="ml-2 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            <div className="text-sm text-gray-600">
              Showing {filteredAppointments.length} appointment{filteredAppointments.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Appointments List */}
        <div className="space-y-4">
          {filteredAppointments.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Appointments Found</h3>
              <p className="text-gray-600">
                {filter === 'today' 
                  ? "No appointments scheduled for today."
                  : filter === 'custom'
                  ? "No appointments found in the selected date range."
                  : "No appointments have been scheduled yet."
                }
              </p>
            </div>
          ) : (
            filteredAppointments.map((appointment) => {
              const status = getAppointmentStatus(appointment.appointmentDateTime);
              return (
                <div
                  key={appointment.id}
                  className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${status.bg}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {appointment.customer?.firstName || 'Customer'} {appointment.customer?.lastName || ''}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color} ${status.bg}`}>
                          {status.status === 'past' ? 'Past' : status.status === 'today' ? 'Today' : 'Upcoming'}
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-4">
                        <div className="flex items-start space-x-2">
                          <svg className="w-5 h-5 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <div className="flex-1">{formatAppointmentTime(appointment.appointmentDateTime, appointment.customer?.state)}</div>
                        </div>
                      </div>

                      <div className="text-sm text-gray-600">
                        <div className="flex items-center space-x-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span>Agent: {
                            appointment.agent?.firstName && appointment.agent?.lastName 
                              ? `${appointment.agent.firstName} ${appointment.agent.lastName}`
                              : appointment.agent?.firstName || appointment.agentId || 'Unknown Agent'
                          }</span>
                        </div>
                      </div>

                      {appointment.customer?.phone && (
                        <div className="text-sm text-gray-600 mt-1">
                          <div className="flex items-center space-x-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <span>{appointment.customer.phone}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => router.push(`/add-sale?id=${appointment.id}`)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-1 border border-blue-300 rounded hover:bg-blue-50"
                      >
                        View Sale
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
