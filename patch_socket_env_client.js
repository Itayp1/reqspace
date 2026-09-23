const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/common/SocketSync.tsx';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes("useEnvironmentStore")) {
  code = code.replace(
    "import { useRequestStore } from '../../store/requestStore';",
    "import { useRequestStore } from '../../store/requestStore';\nimport { useEnvironmentStore } from '../../store/environmentStore';"
  );
}

code = code.replace(
  "socket.on('workspace:reordered', handleUpdate);",
  "socket.on('workspace:reordered', handleUpdate);\n\n    const handleEnvUpdate = () => {\n      useEnvironmentStore.getState().fetchEnvironments(activeWorkspace._id);\n    };\n    socket.on('environment:created', handleEnvUpdate);\n    socket.on('environment:deleted', handleEnvUpdate);\n\n    socket.on('environment:updated', (updatedEnv: any) => {\n      handleEnvUpdate();\n      const requestStore = useRequestStore.getState();\n      const tabExists = requestStore.tabs.some(t => t.tabId === updatedEnv._id);\n      if (tabExists) {\n         const tab = requestStore.tabs.find(t => t.tabId === updatedEnv._id);\n         if (tab && updatedEnv.updatedAt && tab.updatedAt) {\n           const remoteTime = new Date(updatedEnv.updatedAt).getTime();\n           const localTime = new Date(tab.updatedAt).getTime();\n           if (remoteTime > localTime) {\n              requestStore.updateTab(updatedEnv._id, { isConflicted: true });\n              if (requestStore.activeRequest && requestStore.activeRequest._id === updatedEnv._id) {\n                 requestStore.updateActiveRequest({ isConflicted: true });\n              }\n           }\n         }\n      }\n    });"
);

fs.writeFileSync(path, code, 'utf8');
