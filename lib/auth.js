// Simple session management utility
// In production, you should use proper session management like NextAuth.js

export const setUserSession = (userData) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(userData));
  }
};

export const getUserSession = () => {
  if (typeof window !== 'undefined') {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  }
  return null;
};

export const clearUserSession = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('user');
  }
};

export const isAuthenticated = () => {
  const user = getUserSession();
  return user && user.is_active;
};

export const getUserRole = () => {
  const user = getUserSession();
  return user ? user.role : null;
};

export const isAdmin = (user) => {
  if (!user) {
    const userSession = getUserSession();
    return userSession && userSession.role === 'admin';
  }
  return user.role === 'admin';
};
