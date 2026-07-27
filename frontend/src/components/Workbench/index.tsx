import React from 'react';
import { Alert, Button, Empty, Skeleton, Typography } from 'antd';
import { EyeInvisibleOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

type HeaderMetric = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
};

type ModulePageHeaderProps = {
  eyebrow: React.ReactNode;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
  metrics?: HeaderMetric[];
  steps?: string[];
  compact?: boolean;
};

export const ModulePageHeader: React.FC<ModulePageHeaderProps> = ({
  eyebrow,
  title,
  description,
  actions,
  metrics,
  compact = false,
}) => (
  <section className={`module-page-header${compact ? ' module-page-header-compact' : ''}${metrics?.length ? ' has-metrics' : ''}`}>
    <div className="module-page-header-copy">
      <span className="module-page-eyebrow">{eyebrow}</span>
      <Title level={2}>{title}</Title>
      <Text type="secondary">{description}</Text>
    </div>
    <div className="module-page-header-right">
      {metrics && metrics.length > 0 && (
        <div className="module-page-header-metrics">
          {metrics.map((item, idx) => (
            <div key={idx} className="header-metric-card">
              <div className="header-metric-head">
                {item.icon && <span className="header-metric-icon">{item.icon}</span>}
                <span className="header-metric-label">{item.label}</span>
              </div>
              <div className="header-metric-value">{item.value}</div>
              {item.hint && <div className="header-metric-hint">{item.hint}</div>}
            </div>
          ))}
        </div>
      )}
      {actions ? <div className="module-page-header-actions">{actions}</div> : null}
    </div>
  </section>
);

type AsyncStateProps = {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyDescription?: React.ReactNode;
  onRetry?: () => void;
  children: React.ReactNode;
};

export const AsyncState: React.FC<AsyncStateProps> = ({
  loading,
  error,
  empty,
  emptyDescription = '暂无数据',
  onRetry,
  children,
}) => {
  if (loading) {
    return (
      <div className="async-state async-state-loading" aria-live="polite" aria-busy="true">
        <Skeleton active paragraph={{ rows: 5 }} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="async-state" role="alert">
        <Alert
          type="error"
          showIcon
          title="数据加载失败"
          description={error}
          action={onRetry ? <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>重新加载</Button> : undefined}
        />
      </div>
    );
  }
  if (empty) {
    return <Empty className="async-state" image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />;
  }
  return <>{children}</>;
};

export const ResponsiveDataView: React.FC<{ desktop: React.ReactNode; mobile: React.ReactNode }> = ({ desktop, mobile }) => (
  <>
    <div className="responsive-data-desktop">{desktop}</div>
    <div className="responsive-data-mobile">{mobile}</div>
  </>
);

const maskEmail = (value: string) => {
  const [name, domain] = value.split('@');
  if (!domain) return value.length > 2 ? `${value.slice(0, 1)}***${value.slice(-1)}` : '***';
  const visible = name.length > 1 ? name.slice(0, 1) : '';
  return `${visible}***@${domain}`;
};

const maskSensitiveValue = (value?: string | null, kind: 'name' | 'email' | 'phone' = 'name') => {
  if (!value) return '';
  if (kind === 'email') return maskEmail(value);
  if (kind === 'phone') return value.replace(/(\d{3})\d+(\d{4})/, '$1****$2');
  if (value.length <= 1) return '*';
  return `${value.slice(0, 1)}${'*'.repeat(Math.min(3, value.length - 1))}`;
};

type SensitiveFieldProps = {
  value?: string | null;
  kind?: 'name' | 'email' | 'phone';
  fallback?: string;
  revealable?: boolean;
};

export const SensitiveField: React.FC<SensitiveFieldProps> = ({
  value,
  fallback = '未识别',
}) => {
  if (!value) return <>{fallback}</>;
  return <>{value}</>;
};
