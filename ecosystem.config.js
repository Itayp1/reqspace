module.exports = {
  apps: [
    {
      name: "postman-clone",
      script: "deploy.js",
      watch: ["client/src", "client/public", "server/src", "client/package.json", "server/package.json", "deploy.js"],
      ignore_watch: ["node_modules", "client/node_modules", "server/node_modules", "client/dist", "server/dist", ".git"],
      watch_delay: 2000,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
