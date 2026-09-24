import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('unauthorized'));
    } else if (error.response?.status === 403) {
      window.dispatchEvent(new CustomEvent('forbidden', { detail: error.response?.data?.message || 'Forbidden' }));
    }
    return Promise.reject(error);
  }
);

export default api;
