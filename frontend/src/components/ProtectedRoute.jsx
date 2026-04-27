import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

export default function ProtectedRoute({ role }) {
  const location = useLocation();
  const { accessToken, user } = useSelector((state) => state.auth);

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (role && user?.role !== role) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
