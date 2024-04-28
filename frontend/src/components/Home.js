import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import banterblend_name from '../images/BanterBlend_name.png';
import banterblend_spects from '../images/BanterBlend_spects.png';
import './chat.css';

const Home = () => {
  const [name, setName] = useState(sessionStorage.getItem('name') || 'Stranger');
  const [interests, setInterests] = useState(JSON.parse(sessionStorage.getItem('interests')) || []);
  const [newInterest, setNewInterest] = useState('');
  const [showAgePopup, setShowAgePopup] = useState(false);
  const [showNamePopup, setShowNamePopup] = useState(false);
  const navigate = useNavigate();

  // Update local storage when name or interests change
  useEffect(() => {
    sessionStorage.setItem('name', name);
  }, [name]);

  useEffect(() => {
    sessionStorage.setItem('interests', JSON.stringify(interests));
  }, [interests]);

  const handleStartChat = () => {
    if (name.trim() === '') {
      setShowNamePopup(true);
      return;
    }
    setShowAgePopup(true);
  };

  const handleAgeConfirmation = (isOver18) => {
    if (isOver18) {
      navigate('/chat', { state: { name, interests } });
    }
    setShowAgePopup(false);
  };

  const addInterest = () => {
    if (newInterest.trim() !== '') {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const removeInterest = (index) => {
    const updatedInterests = [...interests];
    updatedInterests.splice(index, 1);
    setInterests(updatedInterests);
  };

  return (
    <div className="home-container flex flex-col justify-center min-h-screen font-Lato">
      <div className="header flex items-center justify-start py-4 px-4 border-b border-grey">
        <div className="w-20 items-start">
          <img src={banterblend_spects} alt="Logo" />
        </div>
        <div className="flex flex-col items-center w-full">
          <img className="w-60" src={banterblend_name} alt="BanterBlend" />
        </div>
      </div>

      <div className="content flex-grow flex flex-col items-center justify-center">
        <div className="form-group mb-4 min-w-64">
          <label htmlFor="name" className="block text-gray-700 font-bold mb-2">
            Enter your name:
          </label>
          <input
            type="text"
            id="name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          />
        </div>

        <div className="form-group mb-6 max-w-xs min-w-64">
          <label htmlFor="interests" className="block text-gray-700 font-bold mb-2">
            Enter your interests (optional):
          </label>
          <div className="flex items-center">
            <input
              type="text"
              id="interests"
              value={newInterest}
              onChange={(e) => setNewInterest(e.target.value.toLowerCase())}
              className="shadow appearance-none border rounded-l w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addInterest();
                }
              }}
            />
            <button
              onClick={addInterest}
              className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-r focus:outline-none focus:shadow-outline"
            >
              Add
            </button>
          </div>
          <div className="mt-2 flex flex-wrap">
            {interests.map((interest, index) => (
              <div
                key={index}
                className="bg-gray-200 rounded-full px-3 py-1 mr-2 mb-2 flex items-center"
              >
                <span className="text-gray-700">{interest}</span>
                <button
                  onClick={() => removeInterest(index)}
                  className="ml-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleStartChat}
          className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Start Chat
        </button>
      </div>

      {showAgePopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50">
          <div className="bg-white p-4 rounded-lg max-w-xs sm:max-w-md">
            <h2 className="text-lg font-bold mb-4">Age Verification</h2>
            <p className="mb-4">This site is only allowed for users who are 18 or older.</p>
            <div className="flex flex-col sm:flex-row justify-center">
              <button
                onClick={() => handleAgeConfirmation(true)}
                className="mb-2 sm:mb-0 sm:mr-2 bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
              >
                Yes, I'm 18 or older
              </button>
              <button
                onClick={() => handleAgeConfirmation(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded"
              >
                No, I'm under 18
              </button>
            </div>
          </div>
        </div>
      )}

      {showNamePopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50">
          <div className="bg-white p-4 rounded-lg max-w-xs sm:max-w-md">
            <p className="mb-4 font-semibold">Please enter your name to continue.</p>
            <div className="flex justify-center">
              <button
                onClick={() => setShowNamePopup(false)}
                className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded min-w-48"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="bg-white text-gray-500 py-4 mt-auto border-t border-grey w-full">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
          <div>&copy; 2024 BanterBlend</div>
          <div className="mt-2 md:mt-0">Contact: banterblend007@gmail.com</div>
        </div>
      </footer>
    </div>
  );
};

export default Home;