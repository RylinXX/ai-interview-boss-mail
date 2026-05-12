import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd'
import router from './router'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider, useThemeMode } from './contexts/ThemeContext'
import zhCN from 'antd/locale/zh_CN'

const ThemedApplication = () => {
  const { isDark } = useThemeMode();

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#60A5FA' : '#2563EB',
          colorInfo: isDark ? '#60A5FA' : '#2563EB',
          colorSuccess: isDark ? '#34D399' : '#059669',
          colorWarning: isDark ? '#FBBF24' : '#D97706',
          colorError: isDark ? '#F87171' : '#DC2626',
          colorText: isDark ? '#E5E7EB' : '#111827',
          colorTextSecondary: isDark ? '#94A3B8' : '#667085',
          colorBorder: isDark ? '#263244' : '#D0D5DD',
          colorBgLayout: isDark ? '#0B1020' : '#F6F8FB',
          colorBgContainer: isDark ? '#111827' : '#FFFFFF',
          colorBgElevated: isDark ? '#162033' : '#FFFFFF',
          borderRadius: 8,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 36,
          },
          Card: {
            borderRadiusLG: 8,
            paddingLG: 20,
          },
          Table: {
            headerBg: isDark ? '#121B2D' : '#F8FAFC',
            headerColor: isDark ? '#CBD5E1' : '#475467',
            rowHoverBg: isDark ? '#162033' : '#F9FAFB',
          },
          Menu: {
            itemBorderRadius: 8,
            itemSelectedBg: isDark ? 'rgba(96, 165, 250, 0.14)' : '#EEF4FF',
            itemSelectedColor: isDark ? '#93C5FD' : '#2563EB',
          },
        },
      }}
    >
      <AntApp>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ThemedApplication />
    </ThemeProvider>
  </StrictMode>,
)
