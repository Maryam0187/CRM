'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { isAdmin } from '../lib/auth';
import NotificationBell from './NotificationBell';
import { useSocket } from '../contexts/SocketContext';
import { useCall } from '../contexts/CallContext';
import IVRDialer, { openIVRDialer } from './IVRDialer';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isAdminMobileOpen, setIsAdminMobileOpen] = useState(false);
  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();
  const { socket } = useSocket();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleUserMenu = () => {
    setIsUserMenuOpen(!isUserMenuOpen);
  };

  const toggleAdminMenu = () => {
    setIsAdminMenuOpen(!isAdminMenuOpen);
  };

  const handleLogout = () => {
    logout();
    router.push('/signin');
    setIsUserMenuOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white shadow-lg border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold text-gray-800 leading-tight">SalesCRM</span>
                <span className="text-xs text-gray-500 font-medium">
                  {user?.role === 'admin' ? 'Admin Portal' : 
                   user?.role === 'supervisor' ? 'Supervisor Portal' : 'Agent Portal'}
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              <Link
                href="/"
                className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                My Dashboard
              </Link>
              {isAuthenticated &&  isAdmin(user) &&(
                <Link
                  href="/call-logs"
                  className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  Dialing
                </Link>
              )}
              {isAuthenticated  && (
                <>
                  <Link
                    href="/customers"
                    className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                  >
                    Customers
                  </Link>
                  <Link
                    href="/ivr-calls"
                    className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                  >
                    IVR Calls
                  </Link>
                </>
              )}
              {isAuthenticated && isAdmin(user) && (
                <div className="relative inline-block">
                  <button
                    onClick={toggleAdminMenu}
                    className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 inline-flex items-center"
                  >
                    Admin
                    <svg className={`ml-1 w-4 h-4 transition-transform ${isAdminMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isAdminMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsAdminMenuOpen(false)} aria-hidden="true" />
                      <div className="origin-top-left absolute left-0 mt-1 w-56 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 z-20">
                        <Link
                          href="/admin/users"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setIsAdminMenuOpen(false)}
                        >
                          User Management
                        </Link>
                        <Link
                          href="/admin/customers"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setIsAdminMenuOpen(false)}
                        >
                          Customer Management
                        </Link>
                        <Link
                          href="/admin/carriers"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setIsAdminMenuOpen(false)}
                        >
                          Carrier Management
                        </Link>
                        <Link
                          href="/admin/receivers"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => setIsAdminMenuOpen(false)}
                        >
                          Receiver Management
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* User Menu / Sign In */}
          <div className="hidden md:block">
            <div className="ml-4 flex items-center md:ml-6 space-x-4">
              {!isAuthenticated ? (
                <Link
                  href="/signin"
                  className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  Sign In
                </Link>
              ) : (
                <>
                  {/* IVR Dialer Button */}
                  <button
                    onClick={() => openIVRDialer()}
                    className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center"
                    title="Open IVR Dialer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </button>
                  
                  {/* Notification Bell */}
                  <NotificationBell />
                  
                  <div className="relative">
                  <button 
                    onClick={toggleUserMenu}
                    className="bg-gray-800 flex text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
                  >
                    <span className="sr-only">Open user menu</span>
                    <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {user ? user.first_name.charAt(0).toUpperCase() : 'U'}
                      </span>
                    </div>
                  </button>
                  
                  {/* User Dropdown Menu */}
                  {isUserMenuOpen && (
                    <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <div className="px-4 py-2 border-b border-gray-200">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {user ? `${user.first_name} ${user.last_name}` : 'User'}
                        </p>
                        <p className="text-sm text-gray-500 truncate" title={user?.email}>
                          {user?.email}
                        </p>
                        <p className="text-xs text-blue-600 capitalize">{user?.role}</p>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              className="bg-gray-800 inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
            >
              <span className="sr-only">Open main menu</span>
              {!isMenuOpen ? (
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              ) : (
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-gray-50 border-t border-gray-200">
            <Link
              href="/"
              className="text-gray-700 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
              onClick={() => setIsMenuOpen(false)}
            >
              My Dashboard
            </Link>
            {isAuthenticated && (
              <Link
                href="/call-logs"
                className="text-gray-700 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
                onClick={() => setIsMenuOpen(false)}
              >
                Dialing
              </Link>
            )}
            {isAuthenticated  && (
              <>
                <Link
                  href="/customers"
                  className="text-gray-700 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Customers
                </Link>
                <Link
                  href="/ivr-calls"
                  className="text-gray-700 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
                  onClick={() => setIsMenuOpen(false)}
                >
                  IVR Calls
                </Link>
              </>
            )}
            {/* IVR Dialer Button - Mobile */}
            {isAuthenticated && (
              <button
                onClick={() => {
                  openIVRDialer();
                  setIsMenuOpen(false);
                }}
                className="text-gray-700 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200 flex items-center justify-center w-full"
                title="Open IVR Dialer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
            )}
            {isAuthenticated && isAdmin(user) && (
              <div className="space-y-1">
                <button
                  onClick={() => setIsAdminMobileOpen(!isAdminMobileOpen)}
                  className="text-gray-700 hover:text-blue-600 flex items-center justify-between w-full px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
                >
                  Admin
                  <svg className={`w-4 h-4 transition-transform ${isAdminMobileOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isAdminMobileOpen && (
                  <div className="pl-4 space-y-1">
                    <Link
                      href="/admin/users"
                      className="text-gray-600 hover:text-blue-600 block px-3 py-2 rounded-md text-sm font-medium"
                      onClick={() => { setIsMenuOpen(false); setIsAdminMobileOpen(false); }}
                    >
                      User Management
                    </Link>
                    <Link
                      href="/admin/customers"
                      className="text-gray-600 hover:text-blue-600 block px-3 py-2 rounded-md text-sm font-medium"
                      onClick={() => { setIsMenuOpen(false); setIsAdminMobileOpen(false); }}
                    >
                      Customer Management
                    </Link>
                    <Link
                      href="/admin/carriers"
                      className="text-gray-600 hover:text-blue-600 block px-3 py-2 rounded-md text-sm font-medium"
                      onClick={() => { setIsMenuOpen(false); setIsAdminMobileOpen(false); }}
                    >
                      Carrier Management
                    </Link>
                    <Link
                      href="/admin/receivers"
                      className="text-gray-600 hover:text-blue-600 block px-3 py-2 rounded-md text-sm font-medium"
                      onClick={() => { setIsMenuOpen(false); setIsAdminMobileOpen(false); }}
                    >
                      Receiver Management
                    </Link>
                  </div>
                )}
              </div>
            )}
            <div className="border-t border-gray-200 pt-4 pb-3">
              {!isAuthenticated ? (
                <div className="px-3 mb-3">
                  <Link
                    href="/signin"
                    className="block w-full text-center bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors duration-200"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                </div>
              ) : (
                <div className="px-3">
                  <div className="flex items-center mb-3">
                    <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {user ? user.first_name.charAt(0).toUpperCase() : 'U'}
                      </span>
                    </div>
                    <div className="ml-3">
                      <div className="text-base font-medium text-gray-800">
                        {user ? `${user.first_name} ${user.last_name}` : 'User'}
                      </div>
                      <div className="text-sm font-medium text-gray-500">{user?.email}</div>
                      <div className="text-xs text-blue-600 capitalize">{user?.role}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      handleLogout();
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-center bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors duration-200"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IVR Dialer - Self-contained component */}
      {isAuthenticated && <IVRDialer />}
    </nav>
  );
}
