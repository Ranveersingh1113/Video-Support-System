import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.tsx'
import Dashboard from './pages/Dashboard.tsx'
import SessionRoom from './pages/SessionRoom.tsx'
import CustomerJoin from './pages/CustomerJoin.tsx'
import HistoryPage from './pages/HistoryPage.tsx'
import AdminPage from './pages/AdminPage.tsx'
import '@livekit/components-styles'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/session/:id" element={<SessionRoom />} />
        <Route path="/history/:id" element={<HistoryPage />} />
        <Route path="/join/:token" element={<CustomerJoin />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
