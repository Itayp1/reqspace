const { io } = require('socket.io-client');

async function run() {
  console.log('Booting 10k mock socket clients...');
  const sockets = [];
  
  // Try authenticating to get a cookie to pass to sockets?
  // We can just use no auth if we allow anonymous connections for perf testing, 
  // or we need a real cookie. 
  // For the sake of the test script, we will just connect.
  const URL = 'http://localhost:3005';
  
  const MAX = 10000;
  let connected = 0;

  for (let i = 0; i < MAX; i++) {
    const socket = io(URL, { path: '/ws', transports: ['websocket'] });
    socket.on('connect', () => {
      connected++;
      if (connected % 1000 === 0) {
        console.log(`Connected ${connected} sockets...`);
      }
      if (connected === MAX) {
        console.log('All 10k sockets connected.');
        process.exit(0);
      }
    });
    socket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
    });
    sockets.push(socket);
    
    // Slight delay to avoid overwhelming the server port
    if (i % 100 === 0) {
      await new Promise(r => setTimeout(r, 50));
    }
  }
}

run();
