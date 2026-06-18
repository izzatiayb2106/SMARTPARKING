import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', { reconnectionAttempts: 5 });

socket.on('connect', () => {
  console.log('connected as', socket.id);
  // request a reservation in zone L1 (server will pick a bay)
  socket.emit('reserve', { zone: 'L1' });
});

socket.on('reservation:reserved', (data) => {
  console.log('reservation:reserved', data);
  // optionally simulate sensor occupancy after 2s
  setTimeout(() => {
    socket.emit('simulateSensor', { token: data.token });
  }, 2000);
});

socket.on('reservation:occupied', (data) => console.log('reservation:occupied', data));
socket.on('reservation:expired', (data) => console.log('reservation:expired', data));
socket.on('reservation:reset', (data) => console.log('reservation:reset', data));

socket.on('connect_error', (err) => console.error('connect_error', err.message));
socket.on('disconnect', () => console.log('disconnected'));
