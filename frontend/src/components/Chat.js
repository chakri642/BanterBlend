import React, { useState, useEffect, useRef, Component, useCallback, useLayoutEffect } from 'react';
import { useLocation, useBlocker  } from 'react-router-dom';
import './chat.css';
import banterblend_name from '../images/BanterBlend_name.png';
import banterblend_spects from '../images/BanterBlend_spects.png';
import { useNavigate, Link,  unstable_usePrompt, useParams, UNSAFE_NavigationContext } from 'react-router-dom';

const Chat = () => {

    const navigate = useNavigate();
    const location = useLocation();
    const navigateContext = React.useContext(UNSAFE_NavigationContext);

    const params = useParams();

    const [clientId, setClientId] = useState(sessionStorage.getItem('clientId') || "");
    const [partnerId, setPartnerId] = useState("");
    const [socket, setSocket] = useState(null);
    const [messageInput, setMessageInput] = useState("");
    const [imageInput, setImageInput] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [imageRequested, setImageRequested] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [stage, setStage] = useState("New");
    const [name, setName] = useState("Stranger");
    const [partnerName, setPartnerName] = useState("Stranger");
    const [newButtonClicked, setNewButtonClicked] = useState(false);
    const [matchedInterest, setMatchedInterest] = useState("Null");
    const [showImagePopup, setShowImagePopup] = useState(false);
    const chatEndRef = useRef(null);

    const isLocal = process.env.NODE_ENV === 'development';
    const websocketBaseUrl = isLocal ? 'ws://localhost:8080/ws' : 'wss://banterblend.koyeb.app/ws';

    useEffect(() => {
        if (!location.state) {
            navigate('/');
        } else {
            const ourName = location.state.name;
            const interests = location.state.interests;
            setName(ourName);
            logForDev("isLocal", isLocal);
            logForDev("name in useeffect ", name);
            connectNew();
        }
        
    }, [location]);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({});
        // chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatMessages]);

    const logForDev = (...args) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(...args);
        }
    };


    const [shouldBlockNavigation, setShouldBlockNavigation] = useState(false);
    useEffect(() => {
        setShouldBlockNavigation(true);
        return () => {
            setShouldBlockNavigation(false);
        };
    }, []);

    const blocker = useBlocker((tx) => {
        if (shouldBlockNavigation && tx.currentLocation.pathname !== tx.nextLocation.pathname) {
        //   const confirmation = window.confirm('Are you sure you want to leave this page?');
        //   if (!confirmation) {
        //     logForDev("tx", tx);
        //     logForDev("blocker", blocker);
        //     blocker.reset();
        //     // Retry the navigation to prevent it from happening
        //     // navigateContext.navigator.abort();
        //     // tx.reset();
        //   } else {
            if (socket !== null && partnerId !== '' && partnerId !== 'Null') {
              logForDev(socket);
              logForDev('partnerId', partnerId);
              logForDev('Disconnecting from WebSocket server... from onpopstate', clientId);
              disconnect();
            }
            setShouldBlockNavigation(false);
          }
        // }
      }, [shouldBlockNavigation, socket, partnerId, clientId]);

    useEffect(() => {
        logForDev('useEffect called before leaving')
        const handleBeforeUnload = (event) => {
          if (location.pathname === '/chat') {
            event.preventDefault();
            event.returnValue = 'Are you sure you want to leave the chat?';
          }
        };
    
        if (location.pathname === '/chat') {
          window.addEventListener('beforeunload', handleBeforeUnload);
        }
    
        return () => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [location.pathname]);

    
    const sendImage = () => {
        if (!imageInput) {
            setShowImagePopup(true);
            return;
        }

        const reader = new FileReader();
        reader.onload = function(event) {
            const imageBase64 = event.target.result;
            // delete the messages type are imageReq
            setImageRequested(false);
            socket.send(JSON.stringify({ type: "image", imageBase64: imageBase64, name: name, sender: clientId, timestamp: new Date().toISOString()}));
            setChatMessages(prevMessages => prevMessages.filter(message => message.type !== "imageReq"));
            setChatMessages(prevMessages => [...prevMessages, { type: "image", imageBase64: imageBase64, sender: clientId, timestamp: new Date().toISOString(), name: name }]);
            setStage("New");
        };
        reader.readAsDataURL(imageInput);
        setImageInput(null);
    };

    const sendMessage = () => {
        if (!messageInput.trim()) return;
        socket.send(JSON.stringify({ type: "notTyping" }));
        socket.send(JSON.stringify({ type: "message", text: messageInput, name: name, sender: clientId, timestamp: new Date().toISOString()}));
        setChatMessages(prevMessages => [...prevMessages, { type: "message", text: messageInput, sender: clientId, timestamp: new Date().toISOString(), name: name }]);
        setMessageInput("");
        setStage("New");
    };

    const handleImageChange = (e) => {
        setImageInput(e.target.files[0]);
    };

    const handleTyping = () => {
        socket.send(JSON.stringify({ type: "typing" }));
        setTimeout(() => {
            socket.send(JSON.stringify({ type: "notTyping" }));
        }, 2000);
    };

    const imageReq = () => {
        socket.send(JSON.stringify({ type: "imageReq", name: name, sender: clientId, timestamp: new Date().toISOString() }));
        setChatMessages(prevMessages => [...prevMessages, { type: "sentImageReq", sender: clientId, timestamp: new Date().toISOString(), name: name }]);
        setStage("New");
    };

    const disconnect = () => {
        setStage("Disconnected");
        socket.send(JSON.stringify({ type: "disconnect" }));
        socket.close();
        setSocket(null);
        logForDev("1");
        logForDev("Disconnected from WebSocket server.");
    };

    const connectNew = () => {
        if (socket !== null) {
            logForDev("Disconnecting from WebSocket server... from connectNew", clientId);
            disconnect();
        }
        setNewButtonClicked(true);
        logForDev("Connecting to new WebSocket server...", clientId);
        setPartnerId("");
        setMatchedInterest("Null");
        const newSocket = new WebSocket(`${websocketBaseUrl}?id=${clientId}&name=${location.state.name}&interests=${JSON.stringify(location.state.interests)}`);
        setSocket(newSocket);
        setChatMessages([]);

        newSocket.onclose = function(event) {
            // disconnect();
            setStage("Disconnected");
            setNewButtonClicked(false);
            logForDev("2");
            logForDev("Disconnected from WebSocket server.");
        }

        newSocket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            logForDev("Received Data:", data);
            if (data.id !== undefined) {
                setClientId(data.id);
                sessionStorage.setItem('clientId', data.id);
                logForDev("Received ID:", data.id);
            }
            if (data.partnerId !== undefined) {
                setPartnerId(data.partnerId);
                setStage("New");
                setMessageInput("");
                logForDev("Received Partner ID:", data.partnerId);
                logForDev("sending name: ", location.state.name);
                newSocket.send(JSON.stringify({ type: "partnerName", name: location.state.name }));

                // setChatMessages(prevMessages => [...prevMessages, { type: "inital-msg", text: "", sender: clientId, timestamp: new Date().toISOString(), name: "System" }]);
            }
            if (data.matchedInterest !== undefined) {
                setMatchedInterest(data.matchedInterest);
            }


            if (data.partnerId === "Null") {
                setStage("Disconnected");
            }

            if (data.type === "partnerName"){
                setPartnerName(data.name);
            }
            else if (data.type === "message" || data.type === "image" || data.type === "imageReq") {
                if (data.type === "imageReq") {
                    setImageRequested(true);
                }
                setChatMessages(prevMessages => [...prevMessages, data]);
                setStage("New");
            } else if (data.type === "imageReq") {
                setImageRequested(true);
            }
            else if (data.type === "typing") {
                setIsTyping(true);
            }
            else if (data.type === "notTyping") {
                setIsTyping(false);
            }
            else if (data.type === "disconnect") {
                setStage("Disconnected");
                setNewButtonClicked(false);
                newSocket.close();
                logForDev("3");
                logForDev("Disconnected from WebSocket server.");
            }
        };

        newSocket.onopen = function(event) {
            newSocket.send(JSON.stringify({ type: "getId" }));
        };
    };


    return (
    <div className="chat-container flex flex-col font-Lato">
        <div className="chat-header flex items-center justify-start py-4 px-4 border-b border-grey">
            <div className={`w-20 items-start ${stage === "Disconnected" && newButtonClicked && "animate-bounce"}`}>
                <img src={banterblend_spects} alt="Logo" />
            </div>
            <Link to="/" className='flex flex-col items-center w-full' >
                <img className="w-60" src={banterblend_name} alt="BanterBlend" />
            </Link>
        </div>
        
        {/* add loading till it go connected */}
        {stage === "Disconnected" && (partnerId === "" || partnerId === "Null") &&
            <div className="flex items-end justify-center h-full mb-2 mx-2">
                <p className="text-center text-gray-500 text-sm">Connecting...</p>
            </div>
        }

        <div className="flex-grow flex flex-col overflow-y-auto bottom-0 justify-start ml-1 mr-2 w-auto">
            <div className='mt-auto'>

                {matchedInterest !== "Null" && (stage === "New" || stage === "Disconnect") && <div className="text-sm mt-auto text-center text-gray-500 mb-2 ">You both like {matchedInterest}.</div>}
                {(stage === "New" || stage === "Disconnect") && <div className="text-sm mt-auto text-center text-gray-500 mb-2 ">Connected to {partnerName}. Say Hi!</div>}

                {chatMessages.map((message, index) => (
                    <div key={index} className={`flex flex-col text-left ml-2 mb-2 min-w-16 w-fit first:mt-auto rounded-lg bg-white px-2 py-2 border border-gray-100 items-start`}>
                        {/* {message.type === "inital-msg" && <p className={`w-full text-wrap text-black`}>Connected to {name}. Say Hi!</p>} */}
                        <span className={`text-xxs leading-3 text-wrap font-bold ${message.sender === clientId ? " text-red-500" : " text-sky-500"}`}>
                            {message.sender === clientId ? "ME" : message.name.toUpperCase()}
                        </span>
                        {message.type === "message" && <p className={`text-wrap text-black`}>{message.text}</p>}
                        {message.type === "image" && <img src={message.imageBase64} alt="Received Image" className="max-w-xs" />}
                        {message.type === "imageReq" && imageRequested &&
                            <div className="flex items-cente max-w-64 max-h-12 py-2">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    className="image-input w-fit"
                                />
                                <button onClick={sendImage} className="send-image-button bg-blue-500 text-white px-2 rounded-lg hover:bg-blue-600 focus:outline-none focus:bg-blue-600">Send</button>
                            </div>
                        }
                        {message.type === "sentImageReq" && <p className="text-wrap text-gray-500">Image Requested</p>}
                        {/* <span className="text-xs text-gray-500">{message.timestamp}</span> */}
                    </div>
                ))}
            </div>
            {isTyping ? <div className="ml-4 mb-2 text-xs text-left text-gray-500">{name} is typing...</div> : <div className="ml-4 mb-5
             text-xs text-left text-gray-500"></div>}
            {/* <div className="ml-4 mb-2 text-xs text-left text-gray-500">{name} is typing...</div> */}
            <div ref={chatEndRef} />
        </div>


        {stage === "Disconnected"&& partnerId !== "" && partnerId !== "Null" && <div className="mb-2 mx-2 text-center text-red-500 text-sm">{partnerName} has disconnected. Please click "New" to connect again.</div>}
        

        {(stage === "New" || stage === "Disconnect") && 
            <div className='relative'>
                <button onClick={imageReq} className="absolute -top-16 right-0  bg-yellow-300 bg-transparent text-white py-2 px-2 mr-2 mt-2 rounded-full">Req</button> 
            </div>
        }

        <div className="chat-inputs flex items-center justify-between py-4 px-4 border-t border-grey">
            {stage === "New" && <button onClick={() => {setStage("Disconnect"); setNewButtonClicked(false);}} className=" min-w-18 bg-yellow-500 text-white py-2 px-4 rounded-lg">Stop</button>}
            {stage === "Disconnect" &&  <button onClick={disconnect} className="min-w-18 bg-red-500 text-white py-2 px-3 rounded-lg ">Sure?</button>}
            {stage === "Disconnected" && <button onClick={() => {if(!newButtonClicked) {connectNew();}}} className={`min-w-18 text-white py-2 px-4 rounded-lg ${!newButtonClicked ? "bg-green-500" : "bg-green-300"} `}>New</button>}

            <textarea
                type="text"
                rows={1}
                value={messageInput}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        sendMessage();
                    }
                }}
                onChange={(e) => {
                    setMessageInput(e.target.value);
                    handleTyping();
                }}
                placeholder="Type your message..."
                disabled = {stage === "Disconnected"}
                className={`text-base flex-1 mx-1 py-2 px-2 min-w-0 rounded-lg caret-red-600 bg-gray-100 focus:outline-none focus:bg-white border border-gray-300 ${stage === "Disconnected" ? "bg-gray-200" : ""}`}
            > </textarea>
        
            <button onClick={sendMessage} className={` text-white py-2 px-4 rounded-lg ${stage === "Disconnected" ? "bg-gray-300" : "bg-yellow-500"}`}>Send</button>
            {/* <div ref={chatEndRef} /> */}
        </div>

        {showImagePopup && (
                <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50">
                    <div className="bg-white p-4 rounded-lg max-w-xs sm:max-w-md">
                        {/* <h2 className="text-lg font-bold mb-4">Please select an image to send</h2> */}
                        <p className="mb-4 font-semibold">Please select an image to send.</p>
                        <div className="flex justify-center">
                            <button
                                onClick={() => setShowImagePopup(false)}
                                className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded min-w-48"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}
        
    </div>

    );
};

export default Chat;
