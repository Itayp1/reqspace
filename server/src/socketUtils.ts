import { io } from './index';

/**
 * Broadcasts a workspace-scoped event to everyone in that workspace's room.
 *
 * The previous implementation guarded the emit behind
 * `io.sockets.adapter.rooms.get(room)?.size > 1`. That count reflects only
 * sockets connected to the *local* node, so under a Redis adapter with two
 * replicas each holding one member, both nodes see `size === 1` and nothing
 * is broadcast — precisely the case horizontal scaling is meant to solve.
 *
 * `io.to(room).emit()` is already a no-op when the room is empty and is
 * adapter-aware (it fans out across nodes with the Redis adapter), so no
 * local size check is needed. Suppressing redundant self-echo for a solo
 * user is handled client-side via optimistic updates / delta application
 * (see SocketSync), not here.
 */
export function emitToWorkspace(workspaceId: string | string[] | undefined, event: string, data: unknown) {
  if (!workspaceId) return;
  const room = 'workspace:' + workspaceId;
  io.to(room).emit(event, data);
}
