import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';

const Login = lazy(() => import('../pages/Login'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const CustomerProjectsList = lazy(() => import('../pages/CustomerProjects/List'));
const CustomerProjectDetail = lazy(() => import('../pages/CustomerProjects/Detail'));
const AIEmployeesList = lazy(() => import('../pages/AIEmployees/List'));
const KnowledgeAssets = lazy(() => import('../pages/KnowledgeAssets'));
const KnowledgeAssetIntake = lazy(() => import('../pages/KnowledgeAssets/Intake'));
const KnowledgeAssetDetail = lazy(() => import('../pages/KnowledgeAssets/Detail'));
const ResumesList = lazy(() => import('../pages/Resumes/List'));
const ResumeUpload = lazy(() => import('../pages/Resumes/Upload'));
const ResumeDetail = lazy(() => import('../pages/Resumes/Detail'));
const UsersList = lazy(() => import('../pages/Settings/Users'));
const ProfileSettings = lazy(() => import('../pages/Settings/Profile'));
const SystemSettingsPage = lazy(() => import('../pages/Settings/System'));

const PageFallback = () => (
  <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
    <Spin size="large" />
  </div>
);

const lazyPage = (page: React.ReactNode) => (
  <Suspense fallback={<PageFallback />}>
    {page}
  </Suspense>
);

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
    element: lazyPage(<Login />),
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
        element: lazyPage(<Dashboard />),
      },
      {
        path: 'industry-agent',
        element: <Navigate to="/ai-solution-assistant" replace />,
      },
      {
        path: 'customer-projects',
        element: lazyPage(<CustomerProjectsList />),
      },
      {
        path: 'customer-projects/:id',
        element: lazyPage(<CustomerProjectDetail />),
      },
      {
        path: 'ai-solution-assistant',
        element: lazyPage(<AIEmployeesList />),
      },
      {
        path: 'ai-employees',
        element: <Navigate to="/ai-solution-assistant" replace />,
      },
      {
        path: 'ai-product-manager',
        element: <Navigate to="/ai-solution-assistant" replace />,
      },
      {
        path: 'knowledge-assets',
        element: lazyPage(<KnowledgeAssets />),
      },
      {
        path: 'knowledge-assets/intake',
        element: lazyPage(<KnowledgeAssetIntake />),
      },
      {
        path: 'knowledge-assets/:id',
        element: lazyPage(<KnowledgeAssetDetail />),
      },
      {
        path: 'resumes',
        element: lazyPage(<ResumesList />),
      },
      {
        path: 'resumes/upload',
        element: lazyPage(<ResumeUpload />),
      },
      {
        path: 'resumes/:id',
        element: lazyPage(<ResumeDetail />),
      },
      {
        path: 'settings/users',
        element: lazyPage(<UsersList />),
      },
      {
        path: 'settings/profile',
        element: lazyPage(<ProfileSettings />),
      },
      {
        path: 'settings/system',
        element: lazyPage(<SystemSettingsPage />),
      },
    ],
  },
]);

export default router;
