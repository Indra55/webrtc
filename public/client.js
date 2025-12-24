const roomSelectionContainer = document.getElementById('room-selection-container')
const roomInput = document.getElementById('room-input')
const connectButton = document.getElementById('connect-button')

const videoChatContainer = document.getElementById('video-chat-container')
const localVideoComponent = document.getElementById('local-video')
const remoteVideoComponent = document.getElementById('remote-video')

const socket = io({
  withCredentials: true,
  transports: ['websocket', 'polling']
})
const mediaConstraints = {
  audio: true,
  video: {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
    aspectRatio: 16 / 9
  }
}

let localStream
let remoteStream
let isRoomCreator
let rtcPeerConnection 
let roomId

const iceServers = {
  iceServers: [

    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    

    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    

    {
      urls: 'turn:relay.metered.ca:80',
      username: 'e46a40d3c7c4f0b3c9f1f7be',
      credential: 'WN4UCxP3D1k2fP9g',
    },
    {
      urls: 'turn:relay.metered.ca:443',
      username: 'e46a40d3c7c4f0b3c9f1f7be',
      credential: 'WN4UCxP3D1k2fP9g',
    },
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

  alert('The room is full, please try another one')
})

socket.on('start_call', async () => {
  console.log('Socket event callback: start_call')

  if (isRoomCreator) {
    rtcPeerConnection = new RTCPeerConnection(iceServers)
    addLocalTracks(rtcPeerConnection)
    rtcPeerConnection.ontrack = setRemoteStream
    logConnectionType(rtcPeerConnection)
    await createOffer(rtcPeerConnection)
  }
})

socket.on('webrtc_offer', async (event) => {
  console.log('Socket event callback: webrtc_offer')

  if (!isRoomCreator) {
    rtcPeerConnection = new RTCPeerConnection(iceServers)
    addLocalTracks(rtcPeerConnection)
    rtcPeerConnection.ontrack = setRemoteStream
    rtcPeerConnection.onicecandidate = sendIceCandidate
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event))
    await createAnswer(rtcPeerConnection)
  }
})

socket.on('webrtc_answer', (event) => {
  console.log('Socket event callback: webrtc_answer')

  rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event))
})

socket.on('webrtc_ice_candidate', (event) => {
  console.log('Socket event callback: webrtc_ice_candidate')

  const candidate = new RTCIceCandidate({
    sdpMLineIndex: event.label,
    candidate: event.candidate,
  })
  rtcPeerConnection.addIceCandidate(candidate)
})

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

// Add this function to check connection type
function logConnectionType(pc) {
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('ICE Candidate Type:', event.candidate.type);
      console.log('ICE Candidate:', event.candidate.candidate);
      
      // Send the candidate (existing code)
      sendIceCandidate(event);
    }
  };

  // Check stats after connection
  setTimeout(() => {
    pc.getStats().then(stats => {
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          console.log('✅ Connection established!');
          console.log('Local candidate:', report.localCandidateId);
          console.log('Remote candidate:', report.remoteCandidateId);
          
          // Find the actual candidates
          stats.forEach(r => {
            if (r.id === report.localCandidateId) {
              console.log('Connection type:', r.candidateType);
              // Types: 'host' (direct), 'srflx' (STUN), 'relay' (TURN)
              if (r.candidateType === 'relay') {
                console.log('🎉 Using TURN relay!');
              }
            }
          });
        }
      });
    });
  }, 5000);
}
async function setLocalStream(mediaConstraints) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints)
    localVideoComponent.srcObject = localStream

    const track = localStream.getVideoTracks()[0]
    const capabilities = track.getCapabilities?.()

    if (capabilities?.zoom) {
      await track.applyConstraints({
        advanced: [{ zoom: capabilities.zoom.min }]
      })
    }
  } catch (error) {
    console.error('Could not get user media', error)
  }
}


function addLocalTracks(rtcPeerConnection) {
  localStream.getTracks().forEach((track) => {
    rtcPeerConnection.addTrack(track, localStream)
  })
}

async function createOffer(rtcPeerConnection) {
  try {
    const sessionDescription = await rtcPeerConnection.createOffer()
    rtcPeerConnection.setLocalDescription(sessionDescription)
    
    socket.emit('webrtc_offer', {
      type: 'webrtc_offer',
      sdp: sessionDescription,
      roomId,
    })
  } catch (error) {
    console.error(error)
  }
}

async function createAnswer(rtcPeerConnection) {
  try {
    const sessionDescription = await rtcPeerConnection.createAnswer()
    rtcPeerConnection.setLocalDescription(sessionDescription)
    
    socket.emit('webrtc_answer', {
      type: 'webrtc_answer',
      sdp: sessionDescription,
      roomId,
    })
  } catch (error) {
    console.error(error)
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
