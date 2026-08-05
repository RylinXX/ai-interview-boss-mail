import axios from 'axios';

const request: any = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 120000,
});

export const getApiErrorMessage = (error: any, fallback = '操作失败') => {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || String(item)).join('；') || fallback;
  }
  if (error?.code === 'ECONNABORTED' || String(error?.message || '').includes('timeout')) {
    return '请求处理时间较长，请稍后刷新查看结果';
  }
  const candidate = String(detail || error?.message || '');
  const containsInternalDetail = candidate.includes(String.fromCharCode(0))
    || /(sqlalchemy|traceback|psycopg|pendingrollback|operationalerror|programmingerror|\bnul\b|internal server error|database error)/i.test(candidate);
  return containsInternalDetail ? fallback : candidate || fallback;
};

export const getResumeParseErrorMessage = (error?: string | null) => {
  if (!error) return '等待模型分析';
  const value = String(error);
  if (value.includes(String.fromCharCode(0)) || /(nul|control character|控制字符)/i.test(value)) {
    return '文件包含不支持的控制字符，请清理文件后重新导入';
  }
  if (/(timeout|timed out|超时)/i.test(value)) {
    return '分析超时，请稍后重新提交';
  }
  if (/(decode|encoding|pdf|docx|unsupported|无法读取|格式)/i.test(value)) {
    return '文件内容无法读取，请确认文件完整且格式受支持';
  }
  if (/(sqlalchemy|traceback|psycopg|pendingrollback|operationalerror|programmingerror|database)/i.test(value)) {
    return '样本分析失败，请重新提交';
  }
  return value.length > 120 ? '样本分析失败，请重新提交' : value;
};

request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

request.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        localStorage.removeItem('token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      } else if (error.response.status === 403) {
        const detail = error.response.data.detail || '';
        if (detail.includes('禁用')) {
          localStorage.removeItem('token');
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default request;
