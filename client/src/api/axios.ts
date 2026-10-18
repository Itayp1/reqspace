import axios from 'axios';
import { useToastStore } from '../store/toastStore';
import { pathOnly, reportClientError } from '../utils/errorReporter';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Once the user has asked to sign out, nothing may hit the API any more: the session cookie is about to be
// cleared and a late call (workspace tree, environments...) would answer 401 for no reason. The page is
// navigating away, so such a call simply never settles.
let signingOut = false;
export function beginSignOut() { signingOut = true; }

api.interceptors.request.use((config) => {
  if (signingOut && !String(config.url).startsWith('/auth/')) config.adapter = () => new Promise(() => {});
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = pathOnly(error.config ? api.getUri(error.config) : '');
    // 401 from the session probe / login attempt is normal for a signed-out visitor; every other
    // 401/403 means the session or a permission is wrong and is worth a record.
    if ((status === 401 || status === 403) && !/^\/api\/(auth\/(me|login|logout)|errors)$/.test(url)) {
      reportClientError({ kind: 'api', message: error.message || `Request failed with status code ${status}`, method: error.config?.method?.toUpperCase(), status, route: url });
    }
    if (error.response?.status === 401) {
      // Handle unauthorized
      window.dispatchEvent(new CustomEvent('unauthorized'));
    } else if (error.response?.status === 403) {
      // Handle forbidden
      const message = error.response.data?.message || 'You do not have permission to perform this action.';
      useToastStore.getState().addToast('error', message);
    } else if (
      !axios.isCancel(error)
      // The browser aborts in-flight calls when the page navigates or reloads;
      // that is not a fault worth recording.
      && error.code !== 'ECONNABORTED'
      && error.code !== 'ERR_CANCELED'
      && (!error.response || error.response.status >= 500)
    ) {
      reportClientError({
        kind: 'api',
        message: error.message || 'Request failed',
        method: error.config?.method?.toUpperCase(),
        status: error.response?.status,
        route: pathOnly(error.config ? api.getUri(error.config) : ''),
      });
    }
    return Promise.reject(error);
  }
);

export default api;
