import React from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from '../components/Layout';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import ResumesList from '../pages/Resumes/List';
import ResumeUpload from '../pages/Resumes/Upload';
import ResumeDetail from '../pages/Resumes/Detail';
import UsersList from '../pages/Settings/Users';
import ProfileSettings from '../pages/Settings/Profile';
import SystemSettingsPage from '../pages/Settings/System';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: '/',
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <Dashboard />,
      },
      {
        path: 'resumes',
        element: <ResumesList />,
      },
      {
        path: 'resumes/upload',
        element: <ResumeUpload />,
      },
      {
        path: 'resumes/:id',
        element: <ResumeDetail />,
      },
      {
        path: 'settings/users',
        element: <UsersList />,
      },
      {
        path: 'settings/profile',
        element: <ProfileSettings />,
      },
      {
        path: 'settings/system',
        element: <SystemSettingsPage />,
      },
    ],
  },
]);

export default router;
