import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Camera, MessageCircle, PhoneOff, PhoneIncoming, X } from 'lucide-react';

const VideoChat = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // WebSocket and connection states
    const [socket, setSocket] = useState(null);
    const [clientId, setClientId] = useState(sessionStorage.getItem('clientId') || "");
    const [partnerId, setPartnerId] = useState("");
    const [stage, setStage] = useState("Connecting");
    const [matchedInterest, setMatchedInterest] = useState("");


    // Video and audio states
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);

    // Chat states
    const [chatMessages, setChatMessages] = useState([]);
    const [messageInput, setMessageInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);

    // Configuration
    const isLocal = process.env.NODE_ENV === 'development';
    const websocketBaseUrl = isLocal
        ? 'ws://localhost:8080/ws'
        : 'wss://banterblend.koyeb.app/ws';

    // WebRTC Configuration
    const configuration = {
        iceServers: [{ urls: ["stun:bn-turn2.xirsys.com"] }, { username: "wXfGz7EoMQr9bgiV1Dive-8IV0CoU0cZLSgUvy9URBgMUoXh2NyFwTkhM1prVHRxAAAAAGdF3m1jaGFrcmkwMDc=", credential: "b80cc75e-ac04-11ef-b31a-0242ac140004", urls: ["turn:bn-turn2.xirsys.com:80?transport=udp", "turn:bn-turn2.xirsys.com:3478?transport=udp", "turn:bn-turn2.xirsys.com:80?transport=tcp", "turn:bn-turn2.xirsys.com:3478?transport=tcp", "turns:bn-turn2.xirsys.com:443?transport=tcp", "turns:bn-turn2.xirsys.com:5349?transport=tcp"] }]
    };

    // Initialize WebSocket and WebRTC Connection
    useEffect(() => {
        if (!location.state) {
            navigate('/');
            return;
        }

        // Initialize local media stream
        const initializeMediaStream = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });
                setLocalStream(stream);
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                }
            } catch (error) {
                console.error("Error accessing media devices:", error);
            }
        };

        // Initialize WebSocket connection
        const initializeWebSocket = () => {
            const newSocket = new WebSocket(
                `${websocketBaseUrl}?id=${clientId}&name=${location.state.name}&interests=${JSON.stringify(location.state.interests)}`
            );

            newSocket.onopen = () => {
                setSocket(newSocket);
                setStage("Connected");
            };

            newSocket.onmessage = handleWebSocketMessage;
            newSocket.onclose = () => setStage("Disconnected");

            setSocket(newSocket);
        };

        initializeMediaStream();
        initializeWebSocket();

        return () => {
            // Cleanup resources
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
            if (socket) {
                socket.close();
            }
        };
    }, []);

    // WebRTC Peer Connection Setup
    const createPeerConnection = useCallback(() => {
        console.log("Creating peer connection...");
        const peerConnection = new RTCPeerConnection(configuration);
        console.log("Peer connection created.");

        // Add local stream tracks to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
                setRemoteStream(event.streams[0]);
            }
        };

        // ICE candidate handling
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    sender: clientId
                }));
            }
        };

        peerConnectionRef.current = peerConnection;
        return peerConnection;
    }, [localStream, socket, clientId]);

    // WebSocket Message Handler
    const handleWebSocketMessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.partnerId) {
            setPartnerId(data.partnerId);
            setMatchedInterest(data.matchedInterest || "");
            
            // If this client should initiate the call (first alphabetically)
            if (clientId < data.partnerId) {
                await initiateCall();
            }
        }

        switch (data.type) {
            case 'offer':
                await handleOffer(data);
                break;
            case 'answer':
                await handleAnswer(data);
                break;
            case 'ice-candidate':
                await handleIceCandidate(data);
                break;
            case 'message':
                handleChatMessage(data);
                break;
        }
    };

    const initiateCall = async () => {
        try {
            const peerConnection = createPeerConnection();
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            // sendSocketMessage({
            //     type: 'offer',
            //     offer: offer,
            //     sender: clientId,
            //     receiver: partnerId
            // });
            socket.send(JSON.stringify({
                type: 'offer',
                offer: offer,
                sender: clientId,
                receiver: partnerId
            }));

        } catch (error) {
            console.error("Error initiating call:", error);
        }
    };

    // WebRTC Signaling Methods
    const handleOffer = async (data) => {
        const peerConnection = peerConnectionRef.current || createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.send(JSON.stringify({
            type: 'answer',
            answer: answer,
            sender: clientId
        }));
    };

    const handleAnswer = async (data) => {
        const peerConnection = peerConnectionRef.current;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    };

    const handleIceCandidate = async (data) => {
        const peerConnection = peerConnectionRef.current;
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    };

    // Chat Methods
    const sendMessage = () => {
        if (!messageInput.trim()) return;

        socket.send(JSON.stringify({
            type: 'message',
            text: messageInput,
            sender: clientId
        }));

        setChatMessages(prev => [...prev, {
            type: 'message',
            text: messageInput,
            sender: clientId
        }]);

        setMessageInput("");
    };

    const handleChatMessage = (data) => {
        setChatMessages(prev => [...prev, data]);
    };

    // Disconnect Handler
    const handleDisconnect = () => {
        // Close WebRTC connection
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }

        // Close WebSocket
        if (socket) {
            socket.close();
        }

        // Stop media tracks
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        setStage("Disconnected");
    };

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Video Section */}
            <div className="flex-grow flex">
                {/* Local Video */}
                <div className="w-1/2 p-4 bg-black relative">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        className="w-full h-full object-cover rounded-lg"
                    />
                    <div className="absolute bottom-4 right-4 bg-white/30 rounded-full p-2">
                        <Camera color="white" size={24} />
                    </div>
                </div>

                {/* Remote Video */}
                <div className="w-1/2 p-4 bg-black relative">
                    {remoteStream ? (
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            className="w-full h-full object-cover rounded-lg"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white">
                            Waiting for partner...
                        </div>
                    )}
                    <div className="absolute bottom-4 right-4 bg-white/30 rounded-full p-2">
                        <MessageCircle color="white" size={24} />
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center space-x-4 p-4 bg-white shadow-md">
                {stage === "Connected" ? (
                    <>
                        <button
                            onClick={handleDisconnect}
                            className="bg-red-500 text-white p-3 rounded-full hover:bg-red-600 transition"
                        >
                            <PhoneOff size={24} />
                        </button>
                    </>
                ) : (
                    <div className="text-gray-600">
                        {stage === "Connecting" ? "Connecting..." : "Disconnected"}
                    </div>
                )}
            </div>

            {/* Chat Section */}
            <div className="h-1/3 bg-white border-t border-gray-200 flex">
                {/* Chat Messages */}
                <div className="w-3/4 p-4 overflow-y-auto">
                    {chatMessages.map((msg, index) => (
                        <div
                            key={index}
                            className={`mb-2 p-2 rounded-lg max-w-xs ${msg.sender === clientId
                                    ? 'bg-blue-500 text-white self-end ml-auto'
                                    : 'bg-gray-200 text-black self-start mr-auto'
                                }`}
                        >
                            {msg.text}
                        </div>
                    ))}
                </div>

                {/* Chat Input */}
                <div className="w-1/4 p-4 border-l border-gray-200 flex flex-col">
                    <input
                        type="text"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Type a message..."
                        className="w-full p-2 border rounded-lg mb-2"
                    />
                    <button
                        onClick={sendMessage}
                        className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VideoChat;