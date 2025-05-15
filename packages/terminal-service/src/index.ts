import WebSocket, { WebSocketServer } from 'ws';
// import { spawn, IPty } from 'node-pty'; // Would be used for actual terminal interaction
// import os from 'os';

const PORT = process.env.TERMINAL_SERVICE_PORT || 8083;

const wss = new WebSocketServer({ port: parseInt(PORT as string, 10) });

console.log(`Terminal service WebSocket server started on port ${PORT}`);

// const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected to terminal service');

  // Placeholder: In a real implementation, you would spawn a pty here
  // const ptyProcess: IPty = spawn(shell, [], {
  //   name: 'xterm-color',
  //   cols: 80,
  //   rows: 30,
  //   cwd: process.env.HOME,
  //   env: process.env
  // });

  // // Pipe PTY output to WebSocket
  // ptyProcess.onData((data: string) => {
  //   ws.send(data);
  // });

  // // Pipe WebSocket input to PTY
  // ws.on('message', (message: WebSocket.RawData) => {
  //   ptyProcess.write(message.toString());
  // });

  // ws.on('close', () => {
  //   console.log('Client disconnected from terminal service, killing pty.');
  //   ptyProcess.kill();
  // });

  // ws.on('error', (error: Error) => {
  //   console.error('Terminal service WebSocket error:', error);
  //   ptyProcess.kill();
  // });

  // Send a welcome message or initial prompt
  ws.send('Welcome to the Terminal Service! (Placeholder - PTY not implemented)\r\n$ ');

  // Simple echo for placeholder functionality
  ws.on('message', (message: WebSocket.RawData) => {
    const input = message.toString();
    console.log('Terminal service received:', input);
    ws.send(`\r\nEcho: ${input}\r\n$ `); // Echo back with a new prompt line
  });

   ws.on('close', () => {
    console.log('Client disconnected from terminal service');
  });

  ws.on('error', (error: Error) => {
    console.error('Terminal service WebSocket error:', error);
  });

});

wss.on('error', (error: Error) => {
  console.error('Terminal service WebSocketServer error:', error);
});

export default wss;