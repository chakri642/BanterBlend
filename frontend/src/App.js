import React from "react";
// import { BrowserRouter } from 'react-router-dom'
// import { Routes,Route } from 'react-router-dom'
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
  Router,
  Routes,
  Link,
  Outlet,
} from "react-router-dom";
import Chat from "./components/Chat";
import VideoChat from "./components/VideoChat";
import Home from "./components/Home";
import './App.css';

const App = () => {
  const router = createBrowserRouter(
    createRoutesFromElements(
      <Route path="/" element={<Root />}>
        <Route index element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/video-chat" element={<VideoChat />} />
      </Route>
    )
  );
  return (
    <div>
      <RouterProvider router={router} />
    </div>
  );
}

const Root = () => {
  return (
    <>
      <div>
        <Outlet />
      </div>
    </>
  );
};

export default App;
  