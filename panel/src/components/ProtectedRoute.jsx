import { Navigate, Outlet } from "react-router-dom"
import { getJwt } from "../lib/auth"

export default function ProtectedRoute({ redirectTo = "/login" }) {
  const token = getJwt()
  if (!token) return <Navigate to={redirectTo} replace />
  return <Outlet />
}

