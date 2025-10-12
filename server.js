const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.CLIENT_URL || 'http://localhost:3000'
      : 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
})

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    instance: process.env.HOSTNAME
  });
});

app.use('/', express.static('public'))

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })

  socket.on('join', (roomId) => {
    const selectedRoom = io.sockets.adapter.rooms.get(roomId)
    const numberOfClients = selectedRoom ? selectedRoom.size : 0

    if (numberOfClients === 0) {
      console.log(`Creating room ${roomId} and emitting room_created socket event`)
      socket.join(roomId)
      socket.emit('room_created', roomId)
    } else if (numberOfClients === 1) {
      console.log(`Joining room ${roomId} and emitting room_joined socket event`)
      socket.join(roomId)
      socket.emit('room_joined', roomId)
    } else {
      console.log(`Can't join room ${roomId}, emitting full_room socket event`)
      socket.emit('full_room', roomId)
    }
  })

  socket.on('leave', (roomId) => {
    console.log(`User leaving room ${roomId}`)
    socket.leave(roomId)
    socket.to(roomId).emit('user_left')
  })

  socket.on('disconnect', () => {
    console.log('User disconnected')
  })

  socket.on('start_call', (roomId) => {
    console.log(`Broadcasting start_call event to peers in room ${roomId}`)
    socket.to(roomId).emit('start_call')
  })

  socket.on('webrtc_offer', (event) => {
    console.log(`Broadcasting webrtc_offer event to peers in room ${event.roomId}`)
    socket.to(event.roomId).emit('webrtc_offer', event.sdp)
  })

  socket.on('webrtc_answer', (event) => {
    console.log(`Broadcasting webrtc_answer event to peers in room ${event.roomId}`)
    socket.to(event.roomId).emit('webrtc_answer', event.sdp)
  })

  socket.on('webrtc_ice_candidate', (event) => {
    console.log(`Broadcasting webrtc_ice_candidate event to peers in room ${event.roomId}`)
    socket.to(event.roomId).emit('webrtc_ice_candidate', event)
  })
})

const port = process.env.PORT || 3000
server.listen(port, '0.0.0.0', () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode`)
  console.log(`Express server listening on port ${port}`)
  console.log(`Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`)
})
module.exports = app; 