const { execSync } = require('child_process');
const path = require('path');

console.log("Starting PM2 deployment script...");

try {
  console.log("Building Client...");
  execSync('npm run build', { cwd: path.join(__dirname, 'client'), stdio: 'inherit' });

  console.log("Building Server...");
  execSync('npm run build', { cwd: path.join(__dirname, 'server'), stdio: 'inherit' });

  console.log("Starting Server...");
  process.chdir(path.join(__dirname, 'server'));
  require('./server/dist/index.js');
} catch (error) {
  console.error("Deployment failed:", error);
  process.exit(1);
}
