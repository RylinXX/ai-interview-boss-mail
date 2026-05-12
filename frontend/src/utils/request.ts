import axios from 'axios';
import { message } from 'antd';

const request: any = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
});

export const getApiErrorMessage = (error: any, fallback = '操作失败') => {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || String(item)).join('；') || fallback;
  }
  if (error?.code === 'ECONNABORTED' || String(error?.message || '').includes('timeout')) {
    return '请求处理时间较长，请稍后刷新查看结果';
  }
  return detail || error?.message || fallback;
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
