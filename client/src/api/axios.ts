import axios from 'axios';
import { useToastStore } from '../store/toastStore';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized
      window.dispatchEvent(new CustomEvent('unauthorized'));
    } else if (error.response?.status === 403) {
      // Handle forbidden
      const message = error.response.data?.message || 'You do not have permission to perform this action.';
      useToastStore.getState().addToast('error', message);
    }
    return Promise.reject(error);
  }
);

export default api;
