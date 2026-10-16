import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import AdminPortal from "./features/admin/AdminPortal.jsx";
import './styles/App.css';
import './styles/AlumniDesignSystem.css';
import './styles/Responsive.css';
const isAdminRoute = window.location.pathname.replace(/\/+$/, '') === '/admin';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdminRoute ? <AdminPortal /> : <App />}
  </React.StrictMode>
);
