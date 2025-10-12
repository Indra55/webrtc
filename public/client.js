const roomSelectionContainer = document.getElementById('room-selection-container')
const roomInput = document.getElementById('room-input')
const connectButton = document.getElementById('connect-button')

const videoChatContainer = document.getElementById('video-chat-container')
const localVideoComponent = document.getElementById('local-video')
const remoteVideoComponent = document.getElementById('remote-video')

// Initialize Socket.IO connection
let socket;

function initializeSocket() {
  console.log('Initializing Socket.IO connection...');
  
  socket = io({
    withCredentials: true,
    transports: ['websocket', 'polling'],
    path: '/socket.io/',
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
  });

  socket.on('connect', () => {
    console.log('Connected to WebSocket server');
  });

  socket.on('connect_error', (error) => {
    console.error('Connection Error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
  });
}

// Initialize the socket when the page loads
window.addEventListener('DOMContentLoaded', () => {
  initializeSocket();
});
const mediaConstraints = {
  audio: true,
  video: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 60 },
    facingMode: "user"
  }
};
let localStream = null;
let remoteStream = new MediaStream();
let isRoomCreator = false;
let rtcPeerConnection = null;
let roomId = null;

// Set up remote stream for the remote video element
remoteVideoComponent.srcObject = remoteStream;

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
}

connectButton.addEventListener('click', () => {
  joinRoom(roomInput.value)
})

socket.on('room_created', async () => {
  console.log('Socket event callback: room_created')

  await setLocalStream(mediaConstraints)
  isRoomCreator = true
})

socket.on('room_joined', async () => {
  console.log('Socket event callback: room_joined')

  await setLocalStream(mediaConstraints)
  socket.emit('start_call', roomId)
})

socket.on('full_room', () => {
  console.log('Socket event callback: full_room')

})

socket.on('start_call', async () => {
  console.log('Socket event callback: start_call')

  if (await createPeerConnection()) {
    await createAnswer(rtcPeerConnection)
  }
})

async function createPeerConnection() {
  try {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };

    console.log('Creating RTCPeerConnection with config:', configuration);
    rtcPeerConnection = new RTCPeerConnection(configuration);

    // Set up ICE candidate handling
    rtcPeerConnection.onicecandidate = (event) => {
      console.log('ICE candidate:', event.candidate);
      if (event.candidate) {
        console.log('Sending ICE candidate to peer');
        socket.emit('webrtc_ice_candidate', {
          candidate: event.candidate,
          roomId: roomId
        });
      } else {
        console.log('End of ICE candidates');
      }
    };

    // Set up remote stream handling
    rtcPeerConnection.ontrack = (event) => {
      console.log('Received remote track', event);
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach(track => {
          console.log('Adding track to remote stream:', track.kind);
          if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideoComponent.srcObject = remoteStream;
          }
          remoteStream.addTrack(track);
        });
        
        // Ensure the remote video is playing
        remoteVideoComponent.play().catch(e => console.error('Error playing remote video:', e));
      }
    };

    // Add connection state change handlers
    rtcPeerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', rtcPeerConnection.connectionState);
    };

    rtcPeerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', rtcPeerConnection.iceConnectionState);
    };

    // Add local tracks to the connection
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('Adding local track:', track.kind);
        rtcPeerConnection.addTrack(track, localStream);
      });
    } else {
      console.error('No local stream available when creating peer connection');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error creating peer connection:', error);
    return false;
  }
}

// Set up WebSocket event handlers
socket.on('webrtc_answer', async (event) => {
  console.log('Socket event callback: webrtc_answer');
  try {
    await rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event));
  } catch (error) {
    console.error('Error setting remote description:', error);
  }
});

socket.on('webrtc_ice_candidate', async (event) => {
  console.log('Socket event callback: webrtc_ice_candidate');
  try {
    if (event.candidate) {
      await rtcPeerConnection.addIceCandidate(new RTCIceCandidate(event.candidate));
    }
  } catch (error) {
    console.error('Error adding ICE candidate:', error);
  }
});

function joinRoom(room) {
  if (room === '') {
    alert('Please type a room ID')
  } else {
    roomId = room
    socket.emit('join', room)
    showVideoConference()
  }
}

function showVideoConference() {
  roomSelectionContainer.style.display = 'none'
  videoChatContainer.style.display = 'block'
}

async function setLocalStream(mediaConstraints) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    localVideoComponent.srcObject = localStream;
    
    // Mute local video to avoid echo
    localVideoComponent.muted = true;
    
    console.log('Local stream obtained');
    return true;
  } catch (error) {
    console.error('Error accessing media devices:', error);
    alert(`Could not access media devices: ${error.message}`);
    return false;
  }
}

function addLocalTracks(rtcPeerConnection) {
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      console.log('Adding local track:', track.kind);
      rtcPeerConnection.addTrack(track, localStream);
    });
  } else {
    console.error('No local stream available to add tracks');
  }
}

async function createOffer(rtcPeerConnection) {
  try {
    console.log('Creating offer...');
    const offer = await rtcPeerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    
    console.log('Setting local description with offer');
    await rtcPeerConnection.setLocalDescription(offer);
    
    console.log('Sending offer to peer:', offer);
    socket.emit('webrtc_offer', {
      type: 'offer',
      sdp: offer,
      roomId: roomId
    });
    
    return true;
  } catch (error) {
    console.error('Error creating offer:', error);
    return false;
  }
}

async function createAnswer(rtcPeerConnection) {
  try {
    console.log('Creating answer...');
    const answer = await rtcPeerConnection.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    
    console.log('Setting local description with answer');
    await rtcPeerConnection.setLocalDescription(answer);
    
    console.log('Sending answer to peer:', answer);
    socket.emit('webrtc_answer', {
      type: 'answer',
      sdp: answer,
      roomId: roomId
    });
    
    return true;
  } catch (error) {
    console.error('Error creating answer:', error);
    return false;
  }
}

function setRemoteStream(event) {
  remoteVideoComponent.srcObject = event.streams[0]
  remoteStream = event.stream
}

function sendIceCandidate(event) {
  if (event.candidate) {
    socket.emit('webrtc_ice_candidate', {
      roomId,
      label: event.candidate.sdpMLineIndex,
      candidate: event.candidate.candidate,
    })
  }
}
