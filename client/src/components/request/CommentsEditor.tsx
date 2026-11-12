import React, { useState } from 'react';
import { useRequestStore } from '../../store/requestStore';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';
import { MessageSquare, Trash2, Send } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';

export function CommentsEditor() {
  const { activeRequest, updateActiveRequest } = useRequestStore();
  const { user } = useAuthStore();
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!activeRequest) return null;

  const comments = activeRequest.comments || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !activeRequest._id || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const res = await api.post(`/requests/${activeRequest._id}/comments`, { text: newComment });
      updateActiveRequest({ comments: res.data.comments });
      setNewComment('');
    } catch (err) {
      console.error('Failed to post comment', err);
      useToastStore.getState().addToast('error', 'Could not post the comment. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!activeRequest._id || !commentId) return;
    try {
      const res = await api.delete(`/requests/${activeRequest._id}/comments/${commentId}`);
      updateActiveRequest({ comments: res.data.comments });
    } catch (err) {
      console.error('Failed to delete comment', err);
      useToastStore.getState().addToast('error', 'Could not delete the comment. Try again.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted">
            <MessageSquare size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No comments yet. Start the conversation!</p>
          </div>
        ) : (
          comments.map((comment: any) => {
            // The server stores comments under `id`; this read `_id`, so every
            // row had an undefined React key and Delete sent
            // /comments/undefined, which 404'd and silently did nothing.
            const commentId = comment.id ?? comment._id;
            const isMine = String(comment.userId) === String(user?.id);
            return (
            <div key={commentId} data-testid="comment-item" className="bg-surface rounded-lg p-3 relative group">
              <div className="flex justify-between items-start mb-1">
                <span data-testid="comment-author" className="font-medium text-sm text-text">
                  {isMine ? 'You' : (comment.authorName || 'Unknown user')}
                </span>
                <span className="text-xs text-text-muted tabular-nums mr-6">
                  {new Date(comment.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
              <p data-testid="comment-text" className="text-sm text-text-muted whitespace-pre-wrap break-words">{comment.text}</p>
              
              {isMine && (
                <button 
                  data-testid="comment-delete-btn"
                  onClick={() => handleDelete(commentId)}
                  className="absolute top-2 right-2 p-1 rounded text-text-muted hover:text-delete opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  title="Delete comment"
                  aria-label="Delete comment"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              )}
            </div>
            );
          })
        )}
      </div>

      <div className="p-4 border-t border-border">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            data-testid="comment-input"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            aria-label="Add a comment"
            autoComplete="off"
            placeholder="Add a comment…"
            className="flex-1 p-2 bg-surface text-text border border-border rounded-md focus-visible:ring-1 focus-visible:ring-primary text-sm"
            disabled={isSubmitting}
          />
          <button
            type="submit"
            data-testid="comment-submit-btn"
            disabled={isSubmitting || !newComment.trim()}
            aria-label="Post comment"
            title="Post comment"
            className="p-2 bg-primary-strong text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
