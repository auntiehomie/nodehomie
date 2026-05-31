import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import App from './App.jsx'
import SetupGuide from './SetupGuide.jsx'
import About from './About.jsx'
import './index.css'

function NavBar() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-tab nav-active' : 'nav-tab'}>
        <span className="nav-icon">◉</span>
        <span className="nav-label">Monitor</span>
      </NavLink>
      <NavLink to="/guide" className={({ isActive }) => isActive ? 'nav-tab nav-active' : 'nav-tab'}>
        <span className="nav-icon">☰</span>
        <span className="nav-label">Setup Guide</span>
      </NavLink>
      <NavLink to="/about" className={({ isActive }) => isActive ? 'nav-tab nav-active' : 'nav-tab'}>
        <span className="nav-icon">◎</span>
        <span className="nav-label">About</span>
      </NavLink>
    </nav>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/guide" element={<SetupGuide />} />
        <Route path="/about" element={<About />} />
      </Routes>
      <NavBar />
    </BrowserRouter>
  </React.StrictMode>
)
