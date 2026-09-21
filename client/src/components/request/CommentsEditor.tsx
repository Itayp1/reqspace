import React, { useState } from 'react';
import { useRequestStore } from '../../store/requestStore';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';
import { MessageSquare, Trash2, Send } from 'lucide-react';

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
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!activeRequest._id) return;
    try {
      const res = await api.delete(`/requests/${activeRequest._id}/comments/${commentId}`);
      updateActiveRequest({ comments: res.data.comments });
    } catch (err) {
      console.error('Failed to delete comment', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <MessageSquare size={32} className="mb-2 opacity-50" />
            <p>No comments yet. Start the conversation!</p>
          </div>
        ) : (
          comments.map((comment: any) => (
            <div key={comment._id} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 relative group">
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
                  {comment.userId === user?.id ? 'You' : 'User'}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{comment.text}</p>
              
              {comment.userId === user?.id && (
                <button 
                  onClick={() => handleDelete(comment._id)}
                  className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete comment"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
            disabled={isSubmitting}
          />
          <button
            type="submit"
            disabled={isSubmitting || !newComment.trim()}
            className="p-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
