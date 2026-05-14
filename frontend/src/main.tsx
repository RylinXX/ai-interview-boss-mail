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
          colorPrimary: isDark ? '#D6A85B' : '#142136',
          colorInfo: isDark ? '#88A4C3' : '#57708F',
          colorSuccess: isDark ? '#34D399' : '#059669',
          colorWarning: isDark ? '#D6A85B' : '#B88A3B',
          colorError: isDark ? '#F87171' : '#DC2626',
          colorText: isDark ? '#F3F0E8' : '#142136',
          colorTextSecondary: isDark ? '#B8C2CF' : '#6D7480',
          colorBorder: isDark ? '#344158' : '#E5DDCF',
          colorBgLayout: isDark ? '#0E1624' : '#F7F4EE',
          colorBgContainer: isDark ? '#151F2E' : '#FFFDF8',
          colorBgElevated: isDark ? '#1C2838' : '#FFFDF8',
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
            headerBg: isDark ? '#1C2838' : '#F3ECE0',
            headerColor: isDark ? '#D8C6A8' : '#5B4630',
            rowHoverBg: isDark ? '#1D2B3E' : '#FAF6EE',
          },
          Menu: {
            itemBorderRadius: 8,
            itemSelectedBg: isDark ? 'rgba(214, 168, 91, 0.18)' : '#F3E6CE',
            itemSelectedColor: isDark ? '#F0CA82' : '#142136',
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
