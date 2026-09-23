const fs = require('fs');
const path = 'c:/projects/reqspace/client/src/components/environment/EnvironmentSidebar.tsx';
let code = fs.readFileSync(path, 'utf8');

const importSearch = `import { CopyToWorkspaceModal } from '../collection/CopyToWorkspaceModal';`;
const importReplace = `import { CopyToWorkspaceModal } from '../collection/CopyToWorkspaceModal';
import React, { useRef } from 'react';`;
code = code.replace(importSearch, importReplace);

const mainSearch = `export default function EnvironmentSidebar() {
  const { environments, globalEnvironment, setEnvironments } = useEnvironmentStore();`;
const mainReplace = `export default function EnvironmentSidebar() {
  const { environments, globalEnvironment, setEnvironments, reorderEnvironments } = useEnvironmentStore();
  const dragItem = useRef<any>(null);
  const dragOverItem = useRef<any>(null);`;
code = code.replace(mainSearch, mainReplace);

const mapSearch = `          {environments.map(env => {
            const menuOptions = [`;
const mapReplace = `          {environments.map((env, index) => {
            const menuOptions = [`;
code = code.replace(mapSearch, mapReplace);

const itemSearch = `            return (
              <div
                key={env._id}
                className="group p-2 text-sm rounded cursor-pointer hover:bg-border transition flex justify-between items-center"
                onClick={() => openEnvironmentTab(env._id, env.name)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions });
                }}
              >
                <span className="truncate flex-1">{env.name}</span>
                <div className="hidden group-hover:flex items-center gap-1 shrink-0">`;
const itemReplace = `            return (
              <div
                key={env._id}
                draggable
                onDragStart={(e) => {
                  dragItem.current = index;
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnter={(e) => {
                  dragOverItem.current = index;
                }}
                onDragEnd={async () => {
                  if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
                    const newEnvs = [...environments];
                    const dragged = newEnvs[dragItem.current];
                    newEnvs.splice(dragItem.current, 1);
                    newEnvs.splice(dragOverItem.current, 0, dragged);
                    
                    // Optimistic update
                    setEnvironments(newEnvs);
                    
                    if (reorderEnvironments) {
                      await reorderEnvironments(newEnvs.map((e, i) => ({ id: e._id, order: i })));
                    }
                  }
                  dragItem.current = null;
                  dragOverItem.current = null;
                }}
                onDragOver={(e) => e.preventDefault()}
                className="group p-2 text-sm rounded cursor-pointer hover:bg-border transition flex justify-between items-center"
                onClick={() => openEnvironmentTab(env._id, env.name)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  showContextMenu({ x: e.clientX, y: e.clientY, items: menuOptions });
                }}
              >
                <span className="truncate flex-1">{env.name}</span>
                <div className="flex items-center gap-1 shrink-0 opacity-50 hover:opacity-100">`;
code = code.replace(itemSearch, itemReplace);

fs.writeFileSync(path, code, 'utf8');
