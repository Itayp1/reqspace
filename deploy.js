const { execSync, spawn } = require('child_process');
const path = require('path');

console.log("Starting PM2 deployment script...");

try {
  console.log("Building Client...");
  execSync('npm run build', { cwd: path.join(__dirname, 'client'), stdio: 'inherit' });

  console.log("Building Server...");
  execSync('npm run build', { cwd: path.join(__dirname, 'server'), stdio: 'inherit' });

  console.log("Starting Server...");
  process.chdir(path.join(__dirname, 'server'));
  
  const child = spawn('node', ['dist/index.js'], { stdio: 'inherit' });

  child.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    process.exit(code || 0);
  });

  const cleanup = () => {
    console.log("Received kill signal. Shutting down server...");
    child.kill('SIGKILL');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
} catch (error) {
  console.error("Deployment failed:", error);
  process.exit(1);
}
