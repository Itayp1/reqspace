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
        NODE_ENV: "production"
      }
    }
  ]
};
