import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';

const safeLazy = (importFn: () => Promise<any>) =>
  lazy(async () => {
    try {
      return await importFn();
    } catch (error: any) {
      const isChunkError =
        error?.name === 'ChunkLoadError' ||
        /failed to fetch dynamically imported module/i.test(error?.message || '') ||
        /importing a module script failed/i.test(error?.message || '');

      if (isChunkError) {
        const reloadKey = 'chunk_reload_timestamp';
        const lastReload = sessionStorage.getItem(reloadKey);
        const now = Date.now();
        if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
          sessionStorage.setItem(reloadKey, String(now));
          window.location.reload();
          return new Promise(() => {});
        }
      }
      throw error;
    }
  });

const Login = safeLazy(() => import('../pages/Login'));
const Dashboard = safeLazy(() => import('../pages/Dashboard'));
const CustomerProjectsList = safeLazy(() => import('../pages/CustomerProjects/List'));
const CustomerProjectDetail = safeLazy(() => import('../pages/CustomerProjects/Detail'));
const AISolutionAssistant = safeLazy(() => import('../pages/AIEmployees/List'));
const KnowledgeAssets = safeLazy(() => import('../pages/KnowledgeAssets'));
const KnowledgeAssetIntake = safeLazy(() => import('../pages/KnowledgeAssets/Intake'));
const KnowledgeAssetDetail = safeLazy(() => import('../pages/KnowledgeAssets/Detail'));
const ResumesList = safeLazy(() => import('../pages/Resumes/List'));
const ResumeUpload = safeLazy(() => import('../pages/Resumes/Upload'));
const ResumeDetail = safeLazy(() => import('../pages/Resumes/Detail'));
const UsersList = safeLazy(() => import('../pages/Settings/Users'));
const ProfileSettings = safeLazy(() => import('../pages/Settings/Profile'));
const SystemSettingsPage = safeLazy(() => import('../pages/Settings/System'));
const IndustryAgentPage = safeLazy(() => import('../pages/IndustryAgent'));
const AIProductManager = safeLazy(() => import('../pages/AIProductManager'));

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

const RouteErrorBoundary = () => {
  const handleReload = () => {
    sessionStorage.removeItem('chunk_reload_timestamp');
    window.location.reload();
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '70vh', padding: '24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>
          ⚡ 系统代码已更新为最新版本
        </h2>
        <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, marginBottom: 20 }}>
          新版本资源文件已部署生效，点击下方按钮即可刷新同步载入最新功能。
        </p>
        <button
          type="button"
          onClick={handleReload}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          一键刷新载入最新版本
        </button>
      </div>
    </div>
  );
};

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
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: lazyPage(<Dashboard />),
      },
      {
        path: 'workbench',
        element: lazyPage(<AISolutionAssistant />),
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
        path: 'ai-solution-assistant',
        element: lazyPage(<AISolutionAssistant />),
      },
      {
        path: 'ai-product-manager',
        element: lazyPage(<AIProductManager />),
      },
      {
        path: 'industry-agent',
        element: lazyPage(<AISolutionAssistant />),
      },
      {
        path: 'settings',
        element: <Navigate to="/settings/system" replace />,
      },
      {
        path: 'settings/users',
        element: <Navigate to="/settings/system?tab=users" replace />,
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
