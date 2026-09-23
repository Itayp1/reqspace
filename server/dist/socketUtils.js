"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitToWorkspace = emitToWorkspace;
const index_1 = require("./index");
/**
 * Broadcasts a workspace-scoped event, but only when at least one other
 * client is actually in that workspace's room. A solo user's own tabs
 * already reflect their changes optimistically, so emitting to an empty
 * or single-occupant room is pure overhead (socket.io still serializes
 * and dispatches the payload with nobody to receive it).
 */
function emitToWorkspace(workspaceId, event, data) {
    if (!workspaceId)
        return;
    const room = 'workspace:' + workspaceId;
    const size = index_1.io.sockets.adapter.rooms.get(room)?.size ?? 0;
    if (size > 1) {
        index_1.io.to(room).emit(event, data);
    }
}
//# sourceMappingURL=socketUtils.js.map