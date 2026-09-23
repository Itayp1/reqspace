const fs = require('fs');

const path = 'c:/projects/reqspace/client/src/components/environment/EnvironmentTabEditor.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "const res = await api.put(`/environments/global`, { variables: localVars });",
  "const res = await api.put(`/environments/${env._id}`, { variables: localVars });"
);

fs.writeFileSync(path, code, 'utf8');
