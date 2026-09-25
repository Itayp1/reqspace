import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';
import { Shield } from 'lucide-react';

export default function ForcePasswordChangeModal() {
  const { user, setUser } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If the user doesn't need to change password, don't render anything
  if (!user?.mustChangePassword) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 5) {
      setError('Password must be at least 5 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post('/auth/change-password', { newPassword: password });
      setUser({ ...user, mustChangePassword: false });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to change password. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-lg shadow-2xl p-8 max-w-md w-full">
        <div className="flex justify-center mb-6 text-orange-500">
          <Shield className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold text-center mb-2">Change Required</h2>
        <p className="text-text-muted text-center text-sm mb-6">
          For security reasons, you must change your default password before you can continue using the application.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">New Password</label>
            <input
              data-testid="new-password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2.5 bg-background border border-border rounded focus:border-primary outline-none"
              required
              minLength={5}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirm Password</label>
            <input
              data-testid="confirm-password-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-2.5 bg-background border border-border rounded focus:border-primary outline-none"
              required
              minLength={5}
            />
          </div>
          
          {error && <div className="text-red-500 text-sm text-center p-2 bg-red-500/10 rounded border border-red-500/20">{error}</div>}

          <button
            data-testid="change-password-submit"
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white p-2.5 rounded font-bold hover:bg-orange-600 transition disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
