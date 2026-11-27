import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';

interface Invite { workspaceId: string; workspaceName: string; role: string; invitedByName: string; expiresAt: string; alreadyMember: boolean }
type Err = { title: string; body: string; retry?: boolean };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ASK = 'Ask the workspace owner for a new invite link.';

function toError(e: any): Err {
  const status = e?.response?.status;
  const msg: string = e?.response?.data?.message || '';
  if (status === 410) {
    if (/revoked/i.test(msg)) return { title: 'This invite was revoked', body: ASK };
    if (/used/i.test(msg)) return { title: 'This invite was already used', body: 'One-time links work once. Ask the workspace owner for a new link.' };
    if (/expired/i.test(msg)) return { title: 'This invite has expired', body: ASK };
    return { title: 'This invite is no longer valid', body: ASK };
  }
  if (status === 404) return { title: 'Invite not found', body: 'Check that you copied the whole link, or ask the owner to send it again.' };
  if (status === 429) return { title: 'Too many attempts', body: 'Wait a minute and try again.' };
  return { title: 'Could not load the invite', body: 'Check your connection and try again.', retry: true };
}

const btnPrimary = 'w-full bg-primary text-white px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2';
const btnSecondary = 'w-full border border-border px-4 py-2 rounded hover:bg-border focus-visible:ring-2 focus-visible:ring-primary';

export default function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<Err | null>(null);
  const [joining, setJoining] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setInvite(null);
    setError(null);
    api.get(`/invite-links/${encodeURIComponent(token)}`)
      .then(r => setInvite(r.data))
      .catch(e => setError(toError(e)));
  }, [token, attempt]);

  // Refresh the workspace list, make the joined workspace active, go to the app.
  const open = async (inv: Invite, toast: boolean) => {
    const { data } = await api.get('/workspaces');
    const auth = useAuthStore.getState();
    auth.setWorkspaces(data);
    auth.setActiveWorkspace(data.find((w: any) => w._id === inv.workspaceId) || auth.activeWorkspace);
    if (toast) useToastStore.getState().addToast('success', `You joined ${inv.workspaceName}`);
    navigate('/');
  };

  const join = async () => {
    if (joining || !invite) return;
    setJoining(true);
    try {
      await api.post(`/invite-links/${encodeURIComponent(token)}/accept`);
      await open(invite, true);
    } catch (e) {
      setError(toError(e));
      setJoining(false);
    }
  };

  const state = error ? 'error' : !invite ? 'loading' : invite.alreadyMember ? 'member' : 'ready';

  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <div data-testid="invite-page" data-state={state} className="bg-background p-8 rounded-lg shadow-md w-96 max-w-[calc(100vw-2rem)] border border-border">
        <div className="flex flex-col items-center mb-6">
          <img src="/reqspace-logo.jpg" alt="Reqspace Logo" className="h-16 w-16 rounded-xl object-cover border border-border shadow-sm" />
        </div>
        {state === 'loading' && (
          <div role="status" className="flex flex-col items-center gap-3 text-text-muted">
            <div className="animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
            <span>Loading invite…</span>
          </div>
        )}
        {state === 'error' && error && (
          <div role="alert" data-testid="invite-error" className="flex flex-col gap-3 text-center">
            <h1 className="text-xl font-bold text-text">{error.title}</h1>
            <p className="text-sm text-text-muted">{error.body}</p>
            {error.retry && <button data-testid="invite-retry-btn" onClick={() => setAttempt(a => a + 1)} className={btnSecondary}>Try Again</button>}
            <button data-testid="invite-home-btn" onClick={() => navigate('/')} className={btnPrimary}>Go to Reqspace</button>
          </div>
        )}
        {state === 'member' && invite && (
          <div className="flex flex-col gap-3 text-center">
            <h1 data-testid="invite-title" className="text-xl font-bold text-balance break-words">You are already a member of {invite.workspaceName}</h1>
            <p className="text-sm text-text-muted">Your role stays {cap(invite.role)}.</p>
            <button data-testid="invite-open-btn" autoFocus onClick={() => open(invite, false).catch(e => setError(toError(e)))} className={btnPrimary}>Open Workspace</button>
          </div>
        )}
        {state === 'ready' && invite && (
          <form onSubmit={e => { e.preventDefault(); join(); }} className="flex flex-col gap-3">
            <h1 data-testid="invite-title" className="text-xl font-bold text-center text-balance break-words">
              {invite.invitedByName} invited you to join {invite.workspaceName} as {cap(invite.role)}
            </h1>
            <p className="text-sm text-text-muted text-center">
              This invite expires {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(invite.expiresAt))}.
            </p>
            <button data-testid="invite-join-btn" type="submit" autoFocus disabled={joining} className={btnPrimary}>{joining ? 'Joining…' : 'Join Workspace'}</button>
            <button data-testid="invite-decline-btn" type="button" onClick={() => navigate('/')} className={btnSecondary}>Not Now</button>
          </form>
        )}
      </div>
    </div>
  );
}
