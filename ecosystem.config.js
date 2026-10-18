const fs = require("fs");
const path = require("path");

// Production refuses to boot without a real JWT_SECRET. Reuse the secret the
// server generated on first run (server/.jwt-secret.local, gitignored) so
// restarts keep existing sessions valid and the value never lands in git.
// An explicit JWT_SECRET in the environment wins.
function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    return fs.readFileSync(path.join(__dirname, "server", ".jwt-secret.local"), "utf8").trim();
  } catch {
    return undefined;
  }
}

module.exports = {
  apps: [
    {
      name: "reqspace",
      script: "deploy.js",
      watch: ["client/src", "client/public", "server/src", "client/package.json", "server/package.json", "deploy.js"],
      ignore_watch: ["node_modules", "client/node_modules", "server/node_modules", "client/dist", "server/dist", ".git"],
      watch_delay: 2000,
      // Without these, a build error in deploy.js becomes an unbounded restart
      // loop: the build fails, the process exits 1, PM2 restarts it instantly,
      // and the restart counter climbs into the hundreds. This has taken the
      // deployment down twice. Stop after 10 failures in a row and back off
      // between attempts so the logs stay readable.
      max_restarts: 10,
      restart_delay: 5000,
      min_uptime: 30000,
      env: {
        NODE_ENV: "production",
        JWT_SECRET: loadJwtSecret(),
        // This file is the local PM2 deployment only. Skip request throttling
        // here so local use and tests are not blocked by login/mutation limits.
        DISABLE_RATE_LIMIT: "true"
      }
    }
  ]
};
