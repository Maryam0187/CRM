'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient.js';
import { formatAppointmentWithTimezones } from './StateSelector';

export default function AppointmentSummary() {
  const router = useRouter();
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [todayCount, setTodayCount] = useState(0);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [nextAppointment, setNextAppointment] = useState(null);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      
      // Use lightweight dashboard appointments API - optimized for counts only
      const params = new URLSearchParams();
      
      // Filter by appointmentDateTime from today onwards (greater than today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      
      // Use "greater than today" filter for future appointments
      params.append('dateFilter', `>${todayStr}`);
      params.append('dateField', 'appointmentDateTime');
      
      const apiUrl = `/api/appointments/dashboard?${params.toString()}`;
      console.log('Fetching appointment summary for dashboard:', user.first_name, 'role:', user.role);
      
      const response = await apiClient.get(apiUrl);
      const data = await response.json();
      
      if (data.success) {
        const dashboardData = data.data;
        
        // Set counts and next appointment directly from API
        setTodayCount(dashboardData.todayCount);
        setUpcomingCount(dashboardData.upcomingCount);
        setNextAppointment(dashboardData.nextAppointment);
        
        // For display purposes, create a minimal appointments array
        // This is only used for the appointments state, not for heavy processing
        setAppointments(dashboardData.nextAppointment ? [dashboardData.nextAppointment] : []);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAppointmentTime = (dateTime, customerState) => {
    const timezones = formatAppointmentWithTimezones(dateTime, customerState);
    if (!timezones) {
      const date = new Date(dateTime);
      return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
    
    return (
      <div className="space-y-1">
        {timezones.customerTime && (
          <div className="text-xs">
            <span className="font-semibold">Customer ({timezones.customerTimezone}):</span> {timezones.customerTime}
          </div>
        )}
        <div className="text-xs">
          <span className="font-semibold">Pakistan ({timezones.pakistanTimezone}):</span> {timezones.pakistanTime}
        </div>
      </div>
    );
  };

  const handleViewAllAppointments = () => {
    router.push('/appointments');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">📅 Appointments</h3>
        <button
          onClick={handleViewAllAppointments}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          View All →
        </button>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Today's Appointments */}
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Today's Appointments</p>
              <p className="text-2xl font-bold text-blue-800">{todayCount}</p>
            </div>
            <div className="text-blue-500">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="bg-green-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Upcoming</p>
              <p className="text-2xl font-bold text-green-800">{upcomingCount}</p>
            </div>
            <div className="text-green-500">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        {/* Next Appointment */}
        <div className="bg-yellow-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-medium">Next Appointment</p>
              {nextAppointment ? (
                <div>
                  <p className="text-sm font-semibold text-yellow-800">
                    {nextAppointment.customer?.firstName || 'Customer'}
                  </p>
                  <div className="text-xs text-yellow-600">
                    {formatAppointmentTime(nextAppointment.appointmentDateTime, nextAppointment.customer?.state)}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-yellow-600">None</p>
              )}
            </div>
            <div className="text-yellow-500">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>
      </div>



      {/* Quick Stats */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Current Date: {new Date().toLocaleDateString()}</span>
          <span>Appointments Today: {todayCount}</span>
        </div>
      </div>
    </div>
  );
}

